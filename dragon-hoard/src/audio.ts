// 効果音はステージ1では WebAudio で合成する（素材の差し替えはステージ4）。
// メダルの「チン」: 非整数倍の部分音の減衰和 + 短いノイズのアタック。

export class Sfx {
  private ctx: AudioContext | null = null;
  private clinks: AudioBuffer[] = [];
  private thud: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private lastAt = 0;
  private playingThisFrame = 0;
  enabled = true;

  /** ユーザー操作の中で呼ぶ（iOS の制約） */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    const partialSets = [
      [3150, 4730, 6890, 8410],
      [2780, 4410, 6120, 7980],
      [3480, 5020, 7350, 9120],
    ];
    this.clinks = partialSets.map((ps) => this.synth(0.35, (t) => {
      let v = 0;
      ps.forEach((f, k) => {
        v += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (18 + k * 9)) / (k + 1.3);
      });
      return v * 0.6;
    }, 0.004));
    this.thud = this.synth(0.2, (t) => Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 30) * 0.8, 0.02);
    // 無音を鳴らして iOS のロックを外す
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start();
  }

  private synth(dur: number, f: (t: number) => number, noiseDur: number) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(dur * sr), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const noise = t < noiseDur ? (Math.random() * 2 - 1) * (1 - t / noiseDur) * 0.5 : 0;
      d[i] = f(t) + noise;
    }
    return buf;
  }

  beginFrame() {
    this.playingThisFrame = 0;
  }

  private play(buf: AudioBuffer, gain: number, rate: number, pan: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master!);
    src.start();
  }

  /** メダル同士・床とのぶつかり。dv は速度変化（cm/s） */
  impact(dv: number, x: number) {
    if (this.playingThisFrame >= 4 || !this.clinks.length) return;
    const now = performance.now();
    if (now - this.lastAt < 12) return;
    this.lastAt = now;
    this.playingThisFrame++;
    const gain = Math.min(1, (dv - 20) / 180) * 0.8 + 0.05;
    const buf = this.clinks[(Math.random() * this.clinks.length) | 0];
    this.play(buf, gain, 0.9 + Math.random() * 0.25, Math.max(-1, Math.min(1, x / 16)));
  }

  /** 手前から落ちて獲得 */
  win(x: number) {
    if (!this.clinks.length) return;
    for (let k = 0; k < 2; k++) {
      setTimeout(() => this.play(this.clinks[k % 3], 0.5, 0.75 + k * 0.05, x / 16), k * 70);
    }
  }

  lose(x: number) {
    if (this.thud) this.play(this.thud, 0.35, 1, x / 16);
  }
}
