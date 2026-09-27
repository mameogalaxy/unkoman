// コードで描くテクスチャの共通部品（木目・金の唐草・法線マップ化）
import * as THREE from 'three';
import { mulberry32 } from '../physics/seed.ts';

export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h = w) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d')! };
}

export function tex(cv: HTMLCanvasElement, srgb: boolean, repeat = false) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 高さ（赤チャンネル 0..255）から法線マップを作る */
export function normalFromHeight(src: HTMLCanvasElement, strength: number) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const { cv, ctx } = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const H = (x: number, y: number) => d[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      let ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(nx, ny, 1);
      nx /= l; ny /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (0.5 / l + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** 赤チャンネルを箱型ぼかしした白黒キャンバスを返す */
export function boxBlur(src: HTMLCanvasElement, radius: number) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4];
  const b = new Float32Array(w * h);
  const n = radius * 2 + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) acc += a[y * w + Math.min(w - 1, Math.max(0, x + k))];
        b[y * w + x] = acc / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) acc += b[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        a[y * w + x] = acc / n;
      }
    }
  }
  const { cv, ctx } = canvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = a[i];
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** 焦げ茶の漆塗りの木目 */
export function drawWood(ctx: Ctx, w: number, h: number, seed = 3, base = '#3b1d0d') {
  const r = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const y = r() * h;
    const amp = 2 + r() * 8;
    const freq = 0.004 + r() * 0.01;
    const ph = r() * 10;
    ctx.strokeStyle = r() < 0.5 ? `rgba(20,8,2,${0.15 + r() * 0.25})` : `rgba(120,60,25,${0.08 + r() * 0.12})`;
    ctx.lineWidth = 0.6 + r() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // 漆の艶ムラ
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,200,150,0.06)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** 唐草の渦巻き1つ（左右対称にするときは呼ぶ側で反転） */
export function scroll(ctx: Ctx, x: number, y: number, s: number, rot: number, depth = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  // 外に開く対数らせん
  for (let t = 0; t <= 1; t += 0.02) {
    const a = t * Math.PI * 2.4;
    const rr = s * (1 - t * 0.82);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // 葉
  for (let k = 0; k < 3; k++) {
    const a = 0.5 + k * 0.9;
    const rr = s * (1 - (a / (Math.PI * 2.4)) * 0.82);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + 0.9);
    ctx.beginPath();
    ctx.ellipse(s * 0.28, 0, s * 0.28, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (depth < 1) scroll(ctx, s * 0.95, s * 0.3, s * 0.5, 2.4, depth + 1);
  ctx.restore();
}

/** 左右対称の唐草パネルを描く（color は線の色、高さマップ用なら白） */
export function drawFiligree(ctx: Ctx, w: number, h: number, color: string, lw: number, seed = 7) {
  const r = mulberry32(seed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  // 縁取り（二重線）
  const m = lw * 3;
  ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  ctx.lineWidth = lw * 0.5;
  ctx.strokeRect(m * 2.2, m * 2.2, w - m * 4.4, h - m * 4.4);
  ctx.lineWidth = lw;
  const n = Math.max(1, Math.round((w / h) * 1.5));
  for (const side of [1, -1]) {
    ctx.save();
    if (side < 0) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    for (let i = 0; i < n; i++) {
      const cx = (w / 2) * ((i + 0.5) / n);
      const s = Math.min(h * 0.28, (w / n) * 0.22) * (0.9 + r() * 0.2);
      scroll(ctx, cx, h * 0.38, s, -0.4 + r() * 0.3);
      scroll(ctx, cx + s * 0.8, h * 0.64, s * 0.8, 2.6 + r() * 0.3);
      // 蔓でつなぐ
      ctx.beginPath();
      ctx.moveTo(cx - s, h / 2);
      ctx.bezierCurveTo(cx - s * 0.3, h * 0.2, cx + s * 0.4, h * 0.8, cx + s * 1.4, h / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

export interface PanelMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** G = roughness, B = metalness */
  orm: THREE.Texture;
}

/**
 * 木目の上に金の唐草が浮き彫りになったパネル。
 * draw を渡すと、唐草の代わりに好きな模様（紋章・文字）を金で描ける。
 */
export function goldOnWood(w: number, h: number, opts: { seed?: number; draw?: (ctx: Ctx, color: string) => void; base?: string } = {}): PanelMaps {
  const lw = Math.max(2, w / 160);
  const draw = opts.draw ?? ((ctx: Ctx, color: string) => drawFiligree(ctx, w, h, color, lw, opts.seed ?? 7));
  // 金の模様のマスク（透明背景）と、高さ（黒背景に白 = 金の部分だけ盛り上がる）
  const M = canvas(w, h);
  draw(M.ctx, '#fff');
  const H = canvas(w, h);
  H.ctx.fillStyle = '#000';
  H.ctx.fillRect(0, 0, w, h);
  H.ctx.drawImage(M.cv, 0, 0);
  const mask = H.ctx.getImageData(0, 0, w, h).data;
  // 少しぼかして丸みを出す（ctx.filter は古い Safari で効かないので自前）
  const normal = normalFromHeight(boxBlur(H.cv, 1), 2.5);

  const C = canvas(w, h);
  drawWood(C.ctx, w, h, opts.seed ?? 3, opts.base);
  const G = canvas(w, h);
  const gg = G.ctx.createLinearGradient(0, 0, w * 0.3, h);
  gg.addColorStop(0, '#f7d98a');
  gg.addColorStop(0.5, '#c8913a');
  gg.addColorStop(1, '#f0c870');
  G.ctx.fillStyle = gg;
  G.ctx.fillRect(0, 0, w, h);
  G.ctx.globalCompositeOperation = 'destination-in';
  G.ctx.drawImage(M.cv, 0, 0);
  C.ctx.drawImage(G.cv, 0, 0);

  const O = canvas(w, h);
  const img = O.ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const g = mask[i * 4] / 255;
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = (0.42 - 0.2 * g) * 255; // 木は艶あり、金はさらに艶
    img.data[i * 4 + 2] = g * 255;
    img.data[i * 4 + 3] = 255;
  }
  O.ctx.putImageData(img, 0, 0);
  return { map: tex(C.cv, true), normalMap: tex(normal, false), orm: tex(O.cv, false) };
}

export function panelMaterial(maps: PanelMaps, envMap: THREE.Texture | null) {
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    roughness: 1,
    metalness: 1,
    envMap,
  });
}
