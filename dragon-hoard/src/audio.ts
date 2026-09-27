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

  /** チェッカー当たり（仮の合成音: 上昇する3音） */
  checker() {
    if (!this.clinks.length) return;
    [0, 90, 180].forEach((ms, k) => setTimeout(() => this.play(this.clinks[k % 3], 0.7, 1.0 + k * 0.26, 0), ms));
  }

  /** 短い電子音を並べて鳴らす。notes = [周波数Hz, 開始秒, 長さ秒] */
  private tone(notes: [number, number, number][], wave: OscillatorType = 'square', gain = 0.12) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (const [f, at, dur] of notes) {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(gain, t0 + at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(this.master!);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  }

  /** ノイズの「シュッ」（斬撃・宝箱のきしみ） */
  private noise(dur: number, from: number, to: number, gain = 0.3) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(from, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
  }

  /** ゲーム進行の効果音（仮の合成音。ステージ4で差し替え） */
  game(name: string) {
    const C = 523.25, E = 659.25, G = 783.99, C6 = 1046.5;
    switch (name) {
      case 'tick': this.tone([[1800, 0, 0.03]], 'square', 0.05); break;
      case 'stop': this.tone([[C6, 0, 0.12], [C6 * 1.5, 0.08, 0.3]], 'triangle', 0.18); break;
      case 'gold': this.tone([[C, 0, 0.1], [E, 0.07, 0.1], [G, 0.14, 0.1], [C6, 0.21, 0.4]], 'triangle', 0.2); break;
      case 'step': this.tone([[220, 0, 0.08]], 'sine', 0.2); break;
      case 'chest': this.noise(0.5, 400, 1600, 0.25); break;
      case 'hit': this.noise(0.12, 3000, 800, 0.4); break;
      case 'crit': this.noise(0.25, 5000, 400, 0.6); this.tone([[C6, 0, 0.1], [C6 * 1.5, 0.05, 0.25]], 'sawtooth', 0.08); break;
      case 'weak': this.noise(0.3, 6000, 500, 0.6); this.tone([[C6, 0, 0.08], [C6 * 1.25, 0.06, 0.08], [C6 * 1.5, 0.12, 0.3]], 'square', 0.1); break;
      case 'absorb': this.tone([[600, 0, 0.25], [400, 0.08, 0.3]], 'sine', 0.18); break;
      case 'miss': this.noise(0.1, 800, 400, 0.15); break;
      case 'special': this.noise(0.8, 200, 6000, 0.5); this.tone([C, E, G, C6, E * 2, G * 2].map((f, i) => [f, i * 0.05, 0.4] as [number, number, number]), 'sawtooth', 0.08); break;
      case 'shuffle': this.tone([[900, 0, 0.04], [1100, 0.05, 0.04], [1300, 0.1, 0.04]], 'square', 0.06); break;
      case 'defeat': this.tone([[G, 0, 0.1], [C6, 0.08, 0.2]], 'square', 0.1); break;
      case 'enemyHit': this.tone([[110, 0, 0.3], [82, 0.05, 0.3]], 'sawtooth', 0.15); break;
      case 'fanfare': this.tone([[C, 0, 0.12], [C, 0.12, 0.12], [C, 0.24, 0.12], [E, 0.4, 0.2], [G, 0.62, 0.5]], 'square', 0.1); break;
      case 'win': this.tone([[G, 0, 0.1], [C6, 0.1, 0.3]], 'triangle', 0.18); break;
      case 'bigwin': this.tone([C, E, G, C6, G, C6, E * 2, C6 * 2].map((f, i) => [f, i * 0.09, 0.3] as [number, number, number]), 'square', 0.1); break;
      case 'reel': this.tone([[300, 0, 0.06]], 'square', 0.15); break;
      case 'reach': this.tone([[880, 0, 0.1], [660, 0.12, 0.1], [880, 0.24, 0.1], [660, 0.36, 0.1]], 'square', 0.1); break;
      case 'orb': this.tone([[G * 2, 0, 0.5], [C6 * 2, 0.1, 0.8]], 'sine', 0.2); break;
      case 'stock': this.tone([[1400, 0, 0.06], [1800, 0.06, 0.08]], 'square', 0.08); break;
    }
  }

  lose(x: number) {
    if (this.thud) this.play(this.thud, 0.35, 1, x / 16);
  }
}
