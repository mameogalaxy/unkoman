// BGM: WebAudio の小さなシーケンサー。曲はすべてオリジナル（このファイルの楽譜データ）。
// 場面（探索・戦闘・ボス・大当たり）ごとに曲を切り替え、0.8秒でクロスフェードする。

type Inst = 'lead' | 'bass' | 'pad' | 'arp' | 'kick' | 'snare' | 'hat';

interface Track {
  inst: Inst;
  /** 8分音符ごとの音。'.' は休符、'-' は前の音を伸ばす。和音は 'C4+E4+G4' */
  notes: string;
  gain: number;
}

export interface Song {
  bpm: number;
  tracks: Track[];
}

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function freq(n: string) {
  const m = /^([A-G][#b]?)(\d)$/.exec(n);
  if (!m) return 0;
  return 440 * Math.pow(2, (NOTE[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
}

// 1小節 = 8分音符 8個。空白区切り
const rep = (s: string, n: number) => Array(n).fill(s).join(' ');

export const SONGS: Record<string, Song> = {
  // 探索: ドリアン風の少し不思議な冒険曲
  dungeon: {
    bpm: 104,
    tracks: [
      { inst: 'lead', gain: 0.07, notes:
        'D5 - - E5 F5 - E5 D5  C5 - A4 - - - . .  D5 - - E5 F5 - G5 A5  G5 - - - . . . .  ' +
        'A5 - G5 F5 E5 - D5 E5  F5 - - - E5 D5 C5 -  D5 - A4 - C5 - B4 C5  D5 - - - - - . .' },
      { inst: 'bass', gain: 0.12, notes:
        'D3 . D3 . A2 . D3 .  C3 . C3 . G2 . C3 .  Bb2 . Bb2 . F2 . Bb2 .  C3 . C3 . G2 . E3 .  ' +
        'D3 . D3 . A2 . D3 .  F3 . F3 . C3 . F3 .  G2 . G2 . A2 . A2 .  D3 . A2 . D3 . . .' },
      { inst: 'pad', gain: 0.035, notes:
        'D4+F4+A4 - - - - - - -  C4+E4+G4 - - - - - - -  Bb3+D4+F4 - - - - - - -  C4+E4+G4 - - - - - - -  ' +
        'D4+F4+A4 - - - - - - -  F4+A4+C5 - - - - - - -  G3+B3+D4 - - - A3+C#4+E4 - - -  D4+F4+A4 - - - - - - -' },
      { inst: 'arp', gain: 0.025, notes: rep('D5 A4 F4 A4 D5 A4 F4 A4', 1) + ' ' + rep('C5 G4 E4 G4 C5 G4 E4 G4', 1) + ' ' + rep('Bb4 F4 D4 F4 Bb4 F4 D4 F4', 1) + ' ' + rep('C5 G4 E4 G4 C5 G4 E4 G4', 1) + ' ' +
        rep('D5 A4 F4 A4 D5 A4 F4 A4', 1) + ' ' + rep('C5 A4 F4 A4 C5 A4 F4 A4', 1) + ' ' + 'B4 G4 D4 G4 C#5 A4 E4 A4 ' + rep('D5 A4 F4 A4 D5 A4 F4 A4', 1) },
      { inst: 'kick', gain: 0.25, notes: rep('x . . . x . . .', 8) },
      { inst: 'hat', gain: 0.04, notes: rep('. . x . . . x .', 8) },
    ],
  },
  // 戦闘: 速いマイナーのリフ
  battle: {
    bpm: 152,
    tracks: [
      { inst: 'lead', gain: 0.07, notes:
        'A5 - E5 - A5 B5 C6 -  B5 - G5 - E5 - . .  F5 - A5 - C6 - B5 A5  G#5 - - - E5 - . .  ' +
        'A5 - E5 - A5 B5 C6 D6  E6 - D6 C6 B5 - G5 -  A5 - F5 - D5 - E5 -  A5 - - - - - . .' },
      { inst: 'bass', gain: 0.13, notes:
        'A2 A2 A3 A2 A2 A2 A3 A2  G2 G2 G3 G2 G2 G2 G3 G2  F2 F2 F3 F2 F2 F2 F3 F2  E2 E2 E3 E2 E2 E2 G#2 B2  ' +
        'A2 A2 A3 A2 A2 A2 A3 A2  G2 G2 G3 G2 G2 G2 G3 G2  D3 D3 D3 D3 E3 E3 E3 E3  A2 A2 A3 A2 A2 E2 A2 .' },
      { inst: 'pad', gain: 0.03, notes:
        'A3+C4+E4 - - - - - - -  G3+B3+D4 - - - - - - -  F3+A3+C4 - - - - - - -  E3+G#3+B3 - - - - - - -  ' +
        'A3+C4+E4 - - - - - - -  G3+B3+E4 - - - - - - -  D4+F4+A4 - - - E3+G#3+B3 - - -  A3+C4+E4 - - - - - - -' },
      { inst: 'kick', gain: 0.3, notes: rep('x . . x x . . .', 8) },
      { inst: 'snare', gain: 0.12, notes: rep('. . x . . . x .', 8) },
      { inst: 'hat', gain: 0.035, notes: rep('x x x x x x x x', 8) },
    ],
  },
  // ボス: 重い半音進行
  boss: {
    bpm: 132,
    tracks: [
      { inst: 'lead', gain: 0.075, notes:
        'E5 - - F5 E5 - D#5 E5  G5 - - - F5 - E5 -  C5 - - D5 C5 - B4 C5  E5 - - - D#5 - . .  ' +
        'E5 - - F5 E5 - D#5 E5  A5 - - - G5 - F5 -  E5 - D5 - C5 - B4 -  E5 - - - - - . .' },
      { inst: 'bass', gain: 0.14, notes:
        rep('E2 . E2 E2 F2 . E2 .', 2) + ' ' + rep('C2 . C2 C2 D2 . C2 .', 1) + ' B1 . B1 B1 C2 . B1 . ' +
        rep('E2 . E2 E2 F2 . E2 .', 1) + ' ' + 'A1 . A1 A1 A#1 . A1 . ' + 'C2 . C2 . B1 . B1 . ' + 'E2 . E2 E2 F2 . E2 .' },
      { inst: 'pad', gain: 0.035, notes:
        'E3+G3+B3 - - - - - - -  E3+G3+C4 - - - - - - -  C3+E3+G3 - - - - - - -  B2+D#3+F#3 - - - - - - -  ' +
        'E3+G3+B3 - - - - - - -  A2+C3+E3 - - - - - - -  C3+E3+G3 - - - B2+D#3+F#3 - - -  E3+G3+B3 - - - - - - -' },
      { inst: 'kick', gain: 0.32, notes: rep('x . x . x . x .', 8) },
      { inst: 'snare', gain: 0.13, notes: rep('. . . . x . . .', 8) },
      { inst: 'hat', gain: 0.03, notes: rep('. x . x . x . x', 8) },
    ],
  },
  // 大当たり: 明るいファンファーレ
  chance: {
    bpm: 144,
    tracks: [
      { inst: 'lead', gain: 0.075, notes:
        'C5 - E5 - G5 - C6 -  B5 - G5 - E5 - G5 -  A5 - F5 - C6 - A5 -  G5 - - - - - . .  ' +
        'C5 - E5 - G5 - C6 -  D6 - C6 - B5 - A5 -  G5 - E5 - D5 - B4 -  C5 - - - - - . .' },
      { inst: 'bass', gain: 0.12, notes:
        'C3 . G2 . C3 . G2 .  E3 . B2 . E3 . B2 .  F3 . C3 . F3 . C3 .  G2 . D3 . G2 . D3 .  ' +
        'C3 . G2 . C3 . G2 .  D3 . A2 . D3 . A2 .  G2 . G2 . G2 . G2 .  C3 . G2 . C3 . . .' },
      { inst: 'arp', gain: 0.03, notes: rep('C5 E5 G5 C6 G5 E5 C5 E5', 2) + ' ' + rep('F4 A4 C5 F5 C5 A4 F4 A4', 1) + ' ' + rep('G4 B4 D5 G5 D5 B4 G4 B4', 1) + ' ' +
        rep('C5 E5 G5 C6 G5 E5 C5 E5', 1) + ' ' + rep('D5 F#5 A5 D6 A5 F#5 D5 F#5', 1) + ' ' + rep('G4 B4 D5 G5 D5 B4 G4 B4', 1) + ' ' + rep('C5 E5 G5 C6 G5 E5 C5 E5', 1) },
      { inst: 'kick', gain: 0.3, notes: rep('x . . . x . . .', 8) },
      { inst: 'snare', gain: 0.12, notes: rep('. . x . . . x x', 8) },
      { inst: 'hat', gain: 0.04, notes: rep('x x x x x x x x', 8) },
    ],
  },
};

interface Parsed {
  bpm: number;
  steps: number;
  tracks: { inst: Inst; gain: number; events: { step: number; len: number; freqs: number[] }[] }[];
}

function parse(song: Song): Parsed {
  let steps = 0;
  const tracks = song.tracks.map((tr) => {
    const toks = tr.notes.trim().split(/\s+/);
    steps = Math.max(steps, toks.length);
    const events: { step: number; len: number; freqs: number[] }[] = [];
    toks.forEach((tok, i) => {
      if (tok === '.' || tok === '-') {
        if (tok === '-' && events.length && events[events.length - 1].step + events[events.length - 1].len === i) events[events.length - 1].len++;
        return;
      }
      events.push({ step: i, len: 1, freqs: tok === 'x' ? [0] : tok.split('+').map(freq) });
    });
    return { inst: tr.inst, gain: tr.gain, events };
  });
  return { bpm: song.bpm, steps, tracks };
}

export class Music {
  private ctx: AudioContext;
  private out: GainNode;
  private noiseBuf: AudioBuffer;
  private current: { name: string; song: Parsed; bus: GainNode; nextStep: number; nextTime: number } | null = null;
  private timer = 0;
  volume = 0.6;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(dest);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  setEnabled(on: boolean) {
    this.out.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.2);
  }

  /** 曲を切り替える（同じ曲なら何もしない） */
  play(name: string) {
    if (this.current?.name === name) return;
    const t = this.ctx.currentTime;
    if (this.current) {
      const old = this.current.bus;
      old.gain.setTargetAtTime(0, t, 0.25);
      setTimeout(() => old.disconnect(), 2000);
    }
    const song = SONGS[name];
    if (!song) {
      this.current = null;
      return;
    }
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.setTargetAtTime(1, t + 0.05, 0.25);
    bus.connect(this.out);
    this.current = { name, song: parse(song), bus, nextStep: 0, nextTime: t + 0.08 };
  }

  private schedule() {
    const c = this.current;
    if (!c || this.ctx.state !== 'running') return;
    const stepDur = 60 / c.song.bpm / 2;
    const horizon = this.ctx.currentTime + 0.15;
    if (c.nextTime < this.ctx.currentTime - 0.5) c.nextTime = this.ctx.currentTime + 0.05; // タブ復帰などで遅れたら追いつかない
    while (c.nextTime < horizon) {
      const step = c.nextStep;
      for (const tr of c.song.tracks) {
        for (const ev of tr.events) if (ev.step === step) this.voice(tr.inst, ev.freqs, c.nextTime, ev.len * stepDur, tr.gain, c.bus);
      }
      c.nextStep = (step + 1) % c.song.steps;
      c.nextTime += stepDur;
    }
  }

  private voice(inst: Inst, freqs: number[], at: number, dur: number, gain: number, bus: AudioNode) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(bus);
    if (inst === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, at);
      o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      o.connect(g);
      o.start(at);
      o.stop(at + 0.22);
      return;
    }
    if (inst === 'snare' || inst === 'hat') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = inst === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = inst === 'hat' ? 7000 : 1800;
      const d = inst === 'hat' ? 0.04 : 0.14;
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      src.connect(f).connect(g);
      src.start(at, Math.random() * 0.5);
      src.stop(at + d + 0.02);
      return;
    }
    const wave: OscillatorType = inst === 'lead' ? 'square' : inst === 'bass' ? 'triangle' : inst === 'pad' ? 'sawtooth' : 'square';
    const attack = inst === 'pad' ? 0.25 : 0.008;
    const release = inst === 'pad' ? 0.4 : inst === 'arp' ? 0.05 : 0.08;
    const hold = inst === 'arp' ? Math.min(dur, 0.09) : dur * 0.92;
    let node: AudioNode = g;
    if (inst === 'pad' || inst === 'lead') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = inst === 'pad' ? 1400 : 3200;
      lp.connect(g);
      node = lp;
    }
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.setValueAtTime(gain * (inst === 'lead' ? 0.8 : 1), at + Math.max(attack, hold - release));
    g.gain.linearRampToValueAtTime(0, at + hold + release);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = f;
      if (inst === 'lead') {
        // ビブラート
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 5.5;
        lg.gain.value = f * 0.006;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(at + 0.15);
        lfo.stop(at + hold + release + 0.05);
      }
      if (inst === 'pad') o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(node);
      o.start(at);
      o.stop(at + hold + release + 0.05);
    }
  }

  dispose() {
    clearInterval(this.timer);
  }
}
