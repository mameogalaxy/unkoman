// Worker とインラインの両方から使う、MedalWorld をコマンドで動かす薄い層
import type { Command, FieldLayout, Snapshot } from './protocol.ts';
import { seedField, settle } from './seed.ts';
import { MedalWorld, type DropResult, type PhysicsOptions } from './world.ts';

export class Engine {
  w: MedalWorld;
  private drops: Snapshot['drops'] = [];

  constructor(capacity: number, opts: Partial<PhysicsOptions>, count: number, seed: number, field?: FieldLayout | null) {
    this.w = this.create(capacity, opts, count, seed, field);
  }

  private create(capacity: number, opts: Partial<PhysicsOptions>, count: number, seed: number, field?: FieldLayout | null) {
    const w = new MedalWorld(capacity, opts);
    w.onDrop = (r: DropResult, x: number, z: number) => this.drops.push({ r, x, z });
    if (field && field.pos.length >= 3) {
      // 保存された配置を復元（少しだけ浮かせて落ち着かせる）
      const n = Math.min(capacity, Math.floor(field.pos.length / 3));
      for (let i = 0; i < n; i++) {
        const p = field.pos, q = field.quat;
        w.addMedal(p[i * 3], p[i * 3 + 1] + 0.01, p[i * 3 + 2], { x: q[i * 4], y: q[i * 4 + 1], z: q[i * 4 + 2], w: q[i * 4 + 3] });
      }
      settle(w, 0.3);
    } else {
      seedField(w, count, seed);
      settle(w, 1.2);
    }
    this.drops.length = 0;
    w.laneHits.length = 0;
    return w;
  }

  run(steps: number, cmds: Command[]): Snapshot {
    for (const c of cmds) {
      if (c.t === 'add') {
        const m = c.m;
        this.w.addMedal(m.x, m.y, m.z, undefined, { x: m.vx, y: m.vy, z: m.vz }, { x: m.wx, y: m.wy, z: m.wz });
      } else if (c.t === 'feed') {
        this.w.feedMedal(c.x, c.spin);
      } else if (c.t === 'payout') {
        this.w.payoutQueue += c.count;
      } else if (c.t === 'reset') {
        const { capacity, opts } = this.w;
        this.w.world.free();
        this.w = this.create(capacity, opts, c.count, c.seed);
      }
    }
    let total = 0;
    for (let i = 0; i < steps; i++) {
      this.w.step();
      total += this.w.stats.lastStepMs;
    }
    if (steps > 0) this.w.sync();
    return this.snapshot(steps, steps > 0 ? total / steps : 0);
  }

  snapshot(steps: number, stepMs: number): Snapshot {
    const w = this.w;
    const n = w.count;
    const snap: Snapshot = {
      count: n,
      pos: w.pos.slice(0, n * 3),
      quat: w.quat.slice(0, n * 4),
      prevPos: w.prevPos.slice(0, n * 3),
      prevQuat: w.prevQuat.slice(0, n * 4),
      pusherZ: w.pusherZ,
      prevPusherZ: w.pusherRenderZ(0),
      steps,
      stepMs,
      awakeCount: w.stats.awakeCount,
      wins: w.stats.wins,
      losses: w.stats.losses,
      drops: this.drops,
      impacts: w.impacts.slice(),
      laneHits: w.laneHits.slice(),
      payoutQueue: w.payoutQueue,
    };
    w.laneHits.length = 0;
    this.drops = [];
    w.impacts.length = 0;
    return snap;
  }
}
