// ゲーム進行のヘッドレス検証: node --experimental-strip-types scripts/sim-game.ts [分]
// 投入 3枚/秒、チェッカー当たり確率 1/8 として、止まる状態が無いか・配当の内訳を見る
import { Game } from '../src/game/game.ts';

const minutes = Number(process.argv[2] ?? 60);
const g = new Game(null);
g.s.credits = 1e9;
const dt = 1 / 30;
let stuck = 0, lastMode = '', modeT = 0;
const byMode: Record<string, number> = {};
const payouts: Record<string, number> = {};
let wheelAt = -1;
for (let t = 0; t < minutes * 60; t += dt) {
  if (Math.random() < 3 * dt) {
    g.fed();
    if (Math.random() < 1 / 8) g.checker();
  }
  g.update(dt);
  for (const e of g.events) {
    if (e.t === 'payout') {
      const label = g.mode.m === 'get' ? g.mode.label.replace(/[0-9]+回目へ/, '') : g.mode.m;
      payouts[label] = (payouts[label] ?? 0) + e.n;
    }
    if (e.t === 'wheelSpin') wheelAt = t + 6;
  }
  g.events.length = 0;
  if (wheelAt > 0 && t > wheelAt) {
    wheelAt = -1;
    g.wheelStopped();
  }
  const m = g.mode.m;
  byMode[m] = (byMode[m] ?? 0) + dt;
  if (m === lastMode && m !== 'map' && m !== 'battle') {
    modeT += dt;
    if (modeT > 30) { stuck++; console.log('STUCK in', m, JSON.stringify(g.mode)); modeT = -1e9; }
  } else { lastMode = m; modeT = 0; }
}
const s = g.s;
console.log(`${minutes}分: 投入 ${s.totals.fed}, チェッカー ${s.totals.checker}, 払い出し ${s.totals.paid} (${(s.totals.paid / s.totals.fed * 100).toFixed(1)}%), 大ルーレット ${s.totals.wheel}回`);
console.log(`到達: 迷宮${s.dungeon + 1} ${s.floor + 1}F 周回${s.loop}  Lv${s.lv}  宝玉${s.orbs}  stuck=${stuck}`);
console.log('払い出し内訳', payouts);
console.log('時間配分(秒)', Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, Math.round(v)])));
