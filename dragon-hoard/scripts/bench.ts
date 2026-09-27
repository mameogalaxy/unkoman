// ヘッドレスで物理のコストを測る: node --experimental-strip-types scripts/bench.ts [medals] [hz]
import { initRapier, MedalWorld } from '../src/physics/world.ts';
import { seedField, settle } from '../src/physics/seed.ts';

const n = Number(process.argv[2] ?? 300);
const hz = Number(process.argv[3] ?? 60);
await initRapier();
const w = new MedalWorld(600, { dt: 1 / hz, solverIterations: Number(process.env.IT ?? 4) });
const placed = seedField(w, n);
let t0 = performance.now();
settle(w, 1.5);
console.log(`placed ${placed}, settle 1.5s: ${(performance.now() - t0).toFixed(0)}ms, left ${w.count}`);
let drop = 0;
let tunneled = 0;
w.onDrop = (r, x, z) => { if (r === 'lose' && Math.abs(x) < 11.5 && z < -1) tunneled++; };
const seconds = 30;
const steps = seconds * hz;
const times: number[] = [];
let x = 0;
for (let i = 0; i < steps; i++) {
  // 0.4 秒ごとに1枚投入
  if (i % Math.round(hz * 0.4) === 0) {
    x = ((drop++ * 7.3) % 24) - 12;
    w.addMedal(x, 8, -23, undefined, { x: 0, y: -30, z: 10 });
  }
  const s = performance.now();
  w.step();
  if (i % (hz / 60) === 0) w.sync();
  times.push(performance.now() - s);
  if (i % (hz * 5) === 0) {
    console.log(`t=${(i / hz).toFixed(0)}s medals=${w.count} awake=${w.stats.awakeCount} win=${w.stats.wins} lose=${w.stats.losses} impacts=${w.impacts.length}`);
  }
  w.impacts.length = 0;
}
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`hz=${hz} step avg ${avg.toFixed(2)}ms p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)}ms max ${times[times.length - 1].toFixed(2)}ms => per 60fps frame ${(avg * hz / 60).toFixed(2)}ms`);
console.log(`tunneled ${tunneled}`);
console.log(`dropped ${drop}, win ${w.stats.wins}, lose ${w.stats.losses}, payout ${(w.stats.wins / drop * 100).toFixed(0)}%`);
