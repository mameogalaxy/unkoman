// メダル表面の刻印をコードで生成する（外部素材なし）。
// 高さマップを描いてから、法線マップ・色(AO)・粗さを導出する。
import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;

function drawDragon(ctx: Ctx, S: number) {
  const c = S / 2;
  const R = S * 0.5;
  const P = (r: number, a: number): [number, number] => [c + Math.cos(a) * r * R, c + Math.sin(a) * r * R];

  // 胴体: 中心に向かって巻く螺旋を、太さを変えた円の連なりで描く（尾に向かって細くなる）
  const a0 = -Math.PI * 0.62;
  const turns = 1.25;
  const N = 220;
  const body: { x: number; y: number; w: number; a: number; r: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + t * turns * Math.PI * 2;
    const r = 0.5 - 0.3 * t;
    const [x, y] = P(r, a);
    const w = (0.095 * (1 - t) ** 0.8 + 0.012) * R;
    body.push({ x, y, w, a, r });
  }
  // 翼（胴の1/3あたりから外側へ張り出す）
  const wb = body[Math.floor(N * 0.3)];
  const wa = wb.a;
  ctx.fillStyle = '#b0b0b0';
  ctx.beginPath();
  const [w0x, w0y] = P(wb.r - 0.05, wa - 0.35);
  ctx.moveTo(w0x, w0y);
  const tipA = wa + 0.15;
  const [tx, ty] = P(0.66, tipA - 0.25);
  ctx.lineTo(tx, ty);
  // 皮膜のスカラップ
  const ribs = 4;
  for (let k = 1; k <= ribs; k++) {
    const ang = tipA - 0.25 + (k / ribs) * 0.95;
    const [bx, by] = P(0.52 - k * 0.025, ang);
    const [mx, my] = P(0.5 + 0.02, ang - 0.12);
    ctx.quadraticCurveTo(mx - (mx - c) * 0.12, my - (my - c) * 0.12, bx, by);
  }
  ctx.closePath();
  ctx.fill();
  // 翼の骨
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = S * 0.012;
  ctx.lineCap = 'round';
  for (let k = 0; k <= ribs; k++) {
    const ang = tipA - 0.25 + (k / ribs) * 0.95;
    const [bx, by] = P(0.52 - k * 0.025, ang);
    ctx.beginPath();
    ctx.moveTo(w0x, w0y);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // 背びれ（胴の外側に三角）
  ctx.fillStyle = '#e0e0e0';
  for (let i = 12; i < N * 0.8; i += 11) {
    const b = body[i];
    const nx = (b.x - c) / (b.r * R), ny = (b.y - c) / (b.r * R);
    const tx2 = -ny, ty2 = nx;
    const base = b.w * 0.9;
    const h = b.w * 0.9;
    ctx.beginPath();
    ctx.moveTo(b.x + nx * base - tx2 * b.w * 0.5, b.y + ny * base - ty2 * b.w * 0.5);
    ctx.lineTo(b.x + nx * (base + h) - tx2 * b.w * 0.2, b.y + ny * (base + h) - ty2 * b.w * 0.2);
    ctx.lineTo(b.x + nx * base + tx2 * b.w * 0.5, b.y + ny * base + ty2 * b.w * 0.5);
    ctx.fill();
  }
  // 胴（外側が暗く中央が明るい = 丸みのある盛り上がり）
  for (const pass of [0, 1, 2]) {
    ctx.fillStyle = ['#9a9a9a', '#d4d4d4', '#ffffff'][pass];
    const k = [1, 0.75, 0.4][pass];
    for (const b of body) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.w * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 鱗（胴に沿った小さな弧の溝）
  ctx.strokeStyle = '#8a8a8a';
  ctx.lineWidth = S * 0.005;
  for (let i = 6; i < N * 0.85; i += 5) {
    const b = body[i];
    const dir = Math.atan2(b.y - c, b.x - c);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.w * 0.55, dir + Math.PI * 0.5 - 1.0, dir + Math.PI * 0.5 + 1.0);
    ctx.stroke();
  }

  // 頭（胴の始点、接線方向を向く）
  const h0 = body[0];
  const h1 = body[4];
  const ang = Math.atan2(h0.y - h1.y, h0.x - h1.x);
  ctx.save();
  ctx.translate(h0.x, h0.y);
  ctx.rotate(ang);
  const u = R * 0.1;
  // 角
  ctx.fillStyle = '#d0d0d0';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.2 * u, s * 0.55 * u);
    ctx.quadraticCurveTo(-1.4 * u, s * 1.3 * u, -2.3 * u, s * 1.1 * u);
    ctx.quadraticCurveTo(-1.2 * u, s * 0.9 * u, -0.5 * u, s * 0.2 * u);
    ctx.fill();
  }
  // 頭部と鼻先
  const grd = ctx.createLinearGradient(0, -u, 0, u);
  grd.addColorStop(0, '#a8a8a8');
  grd.addColorStop(0.5, '#ffffff');
  grd.addColorStop(1, '#a8a8a8');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(-0.9 * u, -0.9 * u);
  ctx.quadraticCurveTo(0.4 * u, -1.15 * u, 1.1 * u, -0.6 * u);
  ctx.lineTo(2.3 * u, -0.45 * u);
  ctx.quadraticCurveTo(2.6 * u, -0.1 * u, 2.25 * u, 0.1 * u);
  // 開いた顎
  ctx.lineTo(1.2 * u, 0.15 * u);
  ctx.lineTo(2.0 * u, 0.7 * u);
  ctx.quadraticCurveTo(1.0 * u, 0.95 * u, -0.9 * u, 0.9 * u);
  ctx.closePath();
  ctx.fill();
  // 目（くぼみ）とたてがみ
  ctx.fillStyle = '#606060';
  ctx.beginPath();
  ctx.ellipse(0.5 * u, -0.45 * u, 0.28 * u, 0.16 * u, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0.55 * u, -0.45 * u, 0.08 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#707070';
  ctx.lineWidth = S * 0.006;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(-0.3 * u - k * 0.25 * u, -0.7 * u);
    ctx.quadraticCurveTo(-0.9 * u - k * 0.3 * u, 0, -0.4 * u - k * 0.25 * u, 0.7 * u);
    ctx.stroke();
  }
  // 鼻孔
  ctx.fillStyle = '#707070';
  ctx.beginPath();
  ctx.arc(2.05 * u, -0.3 * u, 0.09 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 中央の宝玉
  const [gx, gy] = [c + R * 0.02, c + R * 0.03];
  const g2 = ctx.createRadialGradient(gx - R * 0.02, gy - R * 0.02, 0, gx, gy, R * 0.09);
  g2.addColorStop(0, '#ffffff');
  g2.addColorStop(1, '#8c8c8c');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(gx, gy, R * 0.085, 0, Math.PI * 2);
  ctx.fill();
}

/** 高さマップ（0..1）を描く */
function heightCanvas(S: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  const c = S / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  // 縁（最も高い）
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  // 縁の内側の斜面
  const g = ctx.createRadialGradient(c, c, c * 0.8, c, c, c * 0.9);
  g.addColorStop(0, '#5a5a5a');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.9, 0, Math.PI * 2);
  ctx.fill();
  // くぼんだ地
  ctx.fillStyle = '#585858';
  ctx.beginPath();
  ctx.arc(c, c, c * 0.8, 0, Math.PI * 2);
  ctx.fill();
  // 粒の輪
  ctx.fillStyle = '#c8c8c8';
  const beads = 48;
  for (let i = 0; i < beads; i++) {
    const a = (i / beads) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * c * 0.845, c + Math.sin(a) * c * 0.845, c * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(0.78, 0.78);
  ctx.translate(-c, -c);
  drawDragon(ctx, S);
  ctx.restore();
  return cv;
}

function blur(src: Float32Array, S: number, radius: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const w = radius * 2 + 1;
  for (let y = 0; y < S; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * S + Math.min(S - 1, Math.max(0, x))];
    for (let x = 0; x < S; x++) {
      tmp[y * S + x] = acc / w;
      acc += src[y * S + Math.min(S - 1, x + radius + 1)] - src[y * S + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < S; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(S - 1, Math.max(0, y)) * S + x];
    for (let y = 0; y < S; y++) {
      out[y * S + x] = acc / w;
      acc += tmp[Math.min(S - 1, y + radius + 1) * S + x] - tmp[Math.max(0, y - radius) * S + x];
    }
  }
  return out;
}

export interface MedalMaps {
  face: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
  rim: { normalMap: THREE.Texture };
}

export function createMedalMaps(S = 256): MedalMaps {
  const hc = heightCanvas(S);
  const src = hc.getContext('2d')!.getImageData(0, 0, S, S).data;
  const raw = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) raw[i] = src[i * 4] / 255;
  const h = blur(raw, S, 1);
  const soft = blur(raw, S, 4); // AO 用のぼかし

  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    return { cv, ctx, img: ctx.createImageData(S, S) };
  };
  const N = mk(), C = mk(), Rg = mk();
  const strength = 3.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const hl = h[y * S + Math.max(0, x - 1)], hr = h[y * S + Math.min(S - 1, x + 1)];
      const hu = h[Math.max(0, y - 1) * S + x], hd = h[Math.min(S - 1, y + 1) * S + x];
      let nx = (hl - hr) * strength, ny = (hd - hu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      N.img.data.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], i * 4);
      // 凹みほど暗く（汚れ・影）、凸ほど明るく
      const ao = Math.min(1, 0.55 + 0.45 * h[i] + 0.25 * (h[i] - soft[i]));
      const v = Math.max(0, ao) * 255;
      C.img.data.set([v, v, v, 255], i * 4);
      // 凸部は磨かれてツルツル、地はつや消し
      const rough = (0.5 - 0.38 * h[i]) * 255;
      Rg.img.data.set([rough, rough, rough, 255], i * 4);
    }
  }
  for (const t of [N, C, Rg]) t.ctx.putImageData(t.img, 0, 0);

  // 側面のギザ（縦溝）
  const rimCv = document.createElement('canvas');
  rimCv.width = 256;
  rimCv.height = 4;
  const rctx = rimCv.getContext('2d')!;
  const rimg = rctx.createImageData(256, 4);
  const ridges = 64;
  for (let x = 0; x < 256; x++) {
    const nx = Math.cos((x / 256) * ridges * Math.PI * 2) * 0.55;
    const nz = Math.sqrt(1 - nx * nx);
    for (let y = 0; y < 4; y++) rimg.data.set([(nx * 0.5 + 0.5) * 255, 128, (nz * 0.5 + 0.5) * 255, 255], (y * 256 + x) * 4);
  }
  rctx.putImageData(rimg, 0, 0);

  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const rimN = tex(rimCv, false);
  rimN.wrapS = THREE.RepeatWrapping;
  return {
    face: { map: tex(C.cv, true), normalMap: tex(N.cv, false), roughnessMap: tex(Rg.cv, false) },
    rim: { normalMap: rimN },
  };
}
