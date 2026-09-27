// メインスレッド側の物理クライアント。既定は Worker、?inline=1 で同じスレッドで動かす。
import type { Command, FromWorker, MedalSpawn, Snapshot, ToWorker } from './protocol.ts';
import type { PhysicsOptions } from './world.ts';

export interface ClientConfig {
  capacity: number;
  count: number;
  seed: number;
  opts: Partial<PhysicsOptions>;
  inline: boolean;
}

export class PhysicsClient {
  /** 最新のスナップショット */
  snap: Snapshot | null = null;
  /** snap を受け取った時刻（補間用） */
  receivedAt = 0;
  inFlight = false;
  readonly dt: number;
  mode: 'worker' | 'inline';
  onSnapshot: ((s: Snapshot) => void) | null = null;

  private cmds: Command[] = [];
  private worker: Worker | null = null;
  private engine: import('./engine.ts').Engine | null = null;
  private readyResolve!: () => void;
  readonly ready = new Promise<void>((r) => (this.readyResolve = r));

  constructor(private cfg: ClientConfig) {
    this.dt = cfg.opts.dt ?? 1 / 60;
    this.mode = cfg.inline ? 'inline' : 'worker';
    if (cfg.inline) {
      void this.startInline();
    } else {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data.snap, e.data.type === 'ready');
      // Worker が使えない環境ではメインスレッドにフォールバック
      this.worker.onerror = (e) => {
        console.warn('physics worker failed, falling back to inline', e.message);
        this.worker?.terminate();
        this.worker = null;
        this.mode = 'inline';
        this.inFlight = false;
        if (!this.snap) void this.startInline();
      };
      this.send({ type: 'init', capacity: cfg.capacity, opts: cfg.opts, count: cfg.count, seed: cfg.seed });
    }
  }

  private async startInline() {
    const [{ Engine }, { initRapier }] = await Promise.all([import('./engine.ts'), import('./world.ts')]);
    await initRapier();
    this.engine = new Engine(this.cfg.capacity, this.cfg.opts, this.cfg.count, this.cfg.seed);
    this.receive(this.engine.snapshot(0, 0), true);
  }

  private send(m: ToWorker) {
    this.worker!.postMessage(m);
  }

  private receive(s: Snapshot, ready: boolean) {
    this.snap = s;
    this.receivedAt = performance.now();
    this.inFlight = false;
    this.onSnapshot?.(s);
    if (ready) this.readyResolve();
  }

  addMedal(m: MedalSpawn) {
    this.cmds.push({ t: 'add', m });
  }

  feed(x: number, spin: number) {
    this.cmds.push({ t: 'feed', x, spin });
  }

  payout(count: number) {
    this.cmds.push({ t: 'payout', count });
  }

  reset(count: number, seed: number) {
    this.cmds.push({ t: 'reset', count, seed });
  }

  /** steps だけ進めるよう依頼する。前の依頼が返ってくるまでは false */
  request(steps: number): boolean {
    if (this.inFlight || !this.snap) return false;
    const cmds = this.cmds;
    this.cmds = [];
    this.inFlight = true;
    if (this.engine) {
      this.receive(this.engine.run(steps, cmds), false);
    } else {
      this.send({ type: 'step', steps, cmds });
    }
    return true;
  }
}
