// ゲーム進行のヘッドレス検証: node --experimental-strip-types scripts/sim-game.ts [分]
// 発射 3枚/秒。穴に入るのは7割。戦闘中は半分の確率で弱点レーンを狙い、それ以外は光る穴を狙って3割で当てる。
// 止まる状態が無いか・配当の内訳を見る
import { Game } from '../src/game/game.ts';

const minutes = Number(process.argv[2] ?? 60);
const g = new Game(null);
g.s.credits = 1e9;
const dt = 1 / 30;
let stuck = 0, lastMode = '', modeT = 0;
const byMode: Record<string, number> = {};
const payouts: Record<string, number> = {};
let wheelAt = -1;
let retreats = 0, minHp = 999;
for (let t = 0; t < minutes * 60; t += dt) {
  if (Math.random() < 3 * dt) {
    g.fed();
    if (Math.random() < 0.7) {
      const b = g.battle;
      let lane = Math.floor(Math.random() * 8);
      if (b && Math.random() < 0.5) lane = Math.max(0, b.lanes.findIndex((l) => l !== 'miss' && l !== b.element && l === ({ fire: 'ice', ice: 'thunder', thunder: 'fire' } as const)[b.element]));
      else if (!b && Math.random() < 0.3) lane = g.checkerLane;
      g.lane(lane);
    }
    if (g.canSpecial) g.special();
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
  if (m === 'retreat' && lastMode !== 'retreat') retreats++;
  minHp = Math.min(minHp, g.s.hp);
  byMode[m] = (byMode[m] ?? 0) + dt;
  if (m === lastMode && m !== 'map' && m !== 'battle') {
    modeT += dt;
    if (modeT > 30) { stuck++; console.log('STUCK in', m, JSON.stringify(g.mode)); modeT = -1e9; }
  } else { lastMode = m; modeT = 0; }
}
const s = g.s;
console.log(`${minutes}分: 投入 ${s.totals.fed}, チェッカー ${s.totals.checker}, 払い出し ${s.totals.paid} (${(s.totals.paid / s.totals.fed * 100).toFixed(1)}%), 大ルーレット ${s.totals.wheel}回`);
console.log(`到達: 迷宮${s.dungeon + 1} ${s.floor + 1}F 周回${s.loop}  Lv${s.lv}  宝玉${s.orbs}  stuck=${stuck}`);
console.log(`撤退 ${retreats}回, 最低HP ${minHp}`);
console.log('払い出し内訳', payouts);
console.log('時間配分(秒)', Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, Math.round(v)])));
