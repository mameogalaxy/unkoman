// 発射の命中率: node --experimental-strip-types scripts/shoot-test.ts
// 各レーンの中央を狙って撃ち、狙ったレーンのセンサーを通った割合を見る
import { LANES, laneCenterX } from '../src/physics/layout.ts';
import { initRapier, MedalWorld } from '../src/physics/world.ts';
import { seedField, settle } from '../src/physics/seed.ts';

await initRapier();
for (const jitter of [0, 0.4, 0.8]) {
  const w = new MedalWorld(800, {});
  seedField(w, 250, 3);
  settle(w, 1);
  let hit = 0, other = 0, shots = 0;
  for (let round = 0; round < 5; round++) {
    for (let lane = 0; lane < LANES.count; lane++) {
      w.shootMedal(laneCenterX(lane), jitter);
      shots++;
      for (let i = 0; i < 30; i++) w.step();
      w.sync();
      for (const l of w.laneHits) (l === lane ? hit++ : other++);
      w.laneHits.length = 0;
    }
  }
  console.log(`jitter ${jitter}: 狙ったレーン ${hit}/${shots}  他のレーン ${other}  medals ${w.count}`);
}
