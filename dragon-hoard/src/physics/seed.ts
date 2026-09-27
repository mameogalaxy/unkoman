import { BACK_WALL, FIELD, MEDAL, PUSHER } from './layout.ts';
import type { MedalWorld } from './world.ts';

/** 決定的な乱数（検証を再現できるように） */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tilt(rand: () => number, maxRad: number) {
  // 小さくランダムに傾けた姿勢
  const ax = (rand() - 0.5) * 2 * maxRad;
  const az = (rand() - 0.5) * 2 * maxRad;
  const sx = Math.sin(ax / 2), cx = Math.cos(ax / 2);
  const sz = Math.sin(az / 2), cz = Math.cos(az / 2);
  return { x: sx * cz, y: -sx * sz, z: cx * sz, w: cx * cz };
}

/**
 * 下段と上段にメダルを敷き詰める。下段は手前ほど低い山、奥ほど高く積む。
 * 置いた後に settle() で落ち着かせること。
 */
export function seedField(w: MedalWorld, n: number, seed = 1) {
  const rand = mulberry32(seed);
  const r = MEDAL.radius;
  const sp = r * 2 + 0.08;
  const half = FIELD.innerHalfWidth - FIELD.gutterWidth - r;
  const spots: { x: number; y: number; z: number }[] = [];
  const pusherFront = w.pusherZ;
  // 下段: 層ごとに六方格子
  for (let layer = 0; layer < 8; layer++) {
    const y0 = FIELD.floorY + MEDAL.halfThickness + 0.05 + layer * 0.6;
    const zFront = FIELD.frontZ - r - 0.5 - layer * 1.4; // 上の層ほど奥にずらして山型に
    let row = 0;
    for (let z = zFront; z > pusherFront + r + 0.2; z -= sp * 0.866, row++) {
      const off = (row % 2) * sp * 0.5 + (layer % 2) * r;
      for (let x = -half + off; x <= half; x += sp) {
        spots.push({ x, y: y0 + (rand() - 0.5) * 0.1, z });
      }
    }
  }
  // 上段
  for (let layer = 0; layer < 3; layer++) {
    const y0 = PUSHER.height + MEDAL.halfThickness + 0.05 + layer * 0.6;
    let row = 0;
    for (let z = pusherFront - r - 0.3; z > BACK_WALL.frontZ + r + 0.2; z -= sp * 0.866, row++) {
      const off = (row % 2) * sp * 0.5 + (layer % 2) * r;
      for (let x = -FIELD.innerHalfWidth + r + 0.2 + off; x <= FIELD.innerHalfWidth - r - 0.2; x += sp) {
        spots.push({ x, y: y0, z });
      }
    }
  }
  // 下の層から優先、同じ層の中はランダムに間引く
  let placed = 0;
  for (let i = 0; i < spots.length && placed < n; i++) {
    const s = spots[i];
    if (rand() < 0.1) continue;
    w.addMedal(s.x + (rand() - 0.5) * 0.3, s.y, s.z + (rand() - 0.5) * 0.3, tilt(rand, 0.15));
    placed++;
  }
  return placed;
}

/** プッシャーを止めたまま数秒ぶん回して落ち着かせる */
export function settle(w: MedalWorld, seconds: number) {
  const steps = Math.round(seconds / w.opts.dt);
  const t = w.time;
  for (let i = 0; i < steps; i++) {
    w.time = t - w.opts.dt; // step() 内で +dt されるので時間を止める
    w.step();
  }
  w.time = t;
  w.sync();
  w.impacts.length = 0;
}
