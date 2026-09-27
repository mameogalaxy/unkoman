// 液晶に描くキャラクター・アイテム・背景。すべてオリジナル（コードで描画）。
import type { EnemyKind, SlotSymbol } from '../game/rules.ts';
import { canvas, type Ctx } from './canvasKit.ts';

export const LATIN = 'Cinzel, Georgia, serif';
export const JP = '"Zen Antique", "Hiragino Mincho ProN", serif';

export function goldGrad(ctx: Ctx, y0: number, y1: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#fff6c8');
  g.addColorStop(0.45, '#f1c14e');
  g.addColorStop(0.55, '#b87a18');
  g.addColorStop(1, '#ffe08a');
  return g;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function goldFrame(ctx: Ctx, x: number, y: number, w: number, h: number, fill = 'rgba(40,18,4,0.82)') {
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = goldGrad(ctx, y, y + h);
  ctx.stroke();
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,230,160,0.6)';
  ctx.stroke();
}

/** 縁取りつきの大きな文字 */
export function bigText(ctx: Ctx, text: string, x: number, y: number, size: number, font = LATIN, weight = 900, fill?: string | CanvasGradient) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#2a0e02';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill ?? goldGrad(ctx, y - size / 2, y + size / 2);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function shadow(ctx: Ctx, x: number, y: number, w: number) {
  ellipse(ctx, x, y, w, w * 0.22, 'rgba(0,0,0,0.35)');
}

// ---- 主人公: 赤い羽根飾りの兜をかぶった小さな剣士（ちびキャラ） ---------------
export function drawHero(ctx: Ctx, x: number, y: number, s: number, t: number, pose: 'idle' | 'walk' | 'attack' = 'idle') {
  ctx.save();
  ctx.translate(x, y);
  const bob = pose === 'walk' ? Math.abs(Math.sin(t * 12)) * -s * 0.12 : Math.sin(t * 3) * s * 0.02;
  shadow(ctx, 0, 0, s * 0.42);
  ctx.translate(0, bob);
  // マント
  ctx.fillStyle = '#b3202a';
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, -s * 0.72);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.2, -s * 0.36, -s * 0.02);
  ctx.lineTo(s * 0.3, -s * 0.02);
  ctx.quadraticCurveTo(s * 0.4, -s * 0.4, s * 0.26, -s * 0.72);
  ctx.fill();
  // 足
  const step = pose === 'walk' ? Math.sin(t * 12) * s * 0.08 : 0;
  ctx.fillStyle = '#4a3326';
  ctx.fillRect(-s * 0.18 + step, -s * 0.16, s * 0.14, s * 0.16);
  ctx.fillRect(s * 0.04 - step, -s * 0.16, s * 0.14, s * 0.16);
  // 胴（鎧）
  const armor = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
  armor.addColorStop(0, '#8e9bb0');
  armor.addColorStop(0.5, '#eef2f8');
  armor.addColorStop(1, '#7a879c');
  ctx.fillStyle = armor;
  roundRect(ctx, -s * 0.26, -s * 0.62, s * 0.52, s * 0.48, s * 0.12);
  ctx.fill();
  ctx.fillStyle = '#e2b24a';
  ctx.fillRect(-s * 0.26, -s * 0.28, s * 0.52, s * 0.06);
  // 剣
  ctx.save();
  ctx.translate(s * 0.3, -s * 0.4);
  ctx.rotate(pose === 'attack' ? -2.2 + Math.min(1, t * 8) * 2.6 : -0.5);
  ctx.fillStyle = '#e8eef6';
  ctx.fillRect(-s * 0.03, -s * 0.62, s * 0.06, s * 0.58);
  ctx.fillStyle = '#e2b24a';
  ctx.fillRect(-s * 0.1, -s * 0.06, s * 0.2, s * 0.05);
  ctx.fillStyle = '#6b3a1a';
  ctx.fillRect(-s * 0.025, -s * 0.01, s * 0.05, s * 0.12);
  ctx.restore();
  // 盾
  const sh = ctx.createLinearGradient(-s * 0.5, 0, -s * 0.2, 0);
  sh.addColorStop(0, '#2a4f9a');
  sh.addColorStop(1, '#5a8ae0');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.56);
  ctx.lineTo(-s * 0.18, -s * 0.56);
  ctx.lineTo(-s * 0.2, -s * 0.3);
  ctx.quadraticCurveTo(-s * 0.32, -s * 0.16, -s * 0.44, -s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e2b24a';
  ctx.lineWidth = s * 0.025;
  ctx.stroke();
  // 顔
  ellipse(ctx, 0, -s * 0.84, s * 0.25, s * 0.24, '#f3c9a0');
  ctx.fillStyle = '#2a1a10';
  ellipse(ctx, -s * 0.08, -s * 0.82, s * 0.03, s * 0.05, '#2a1a10');
  ellipse(ctx, s * 0.1, -s * 0.82, s * 0.03, s * 0.05, '#2a1a10');
  // 兜
  const helm = ctx.createLinearGradient(0, -s * 1.15, 0, -s * 0.8);
  helm.addColorStop(0, '#ffffff');
  helm.addColorStop(1, '#8e9bb0');
  ctx.fillStyle = helm;
  ctx.beginPath();
  ctx.arc(0, -s * 0.9, s * 0.29, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineTo(s * 0.3, -s * 0.8);
  ctx.lineTo(s * 0.18, -s * 0.9);
  ctx.lineTo(-s * 0.18, -s * 0.9);
  ctx.lineTo(-s * 0.3, -s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e2b24a';
  ctx.fillRect(-s * 0.03, -s * 1.2, s * 0.06, s * 0.3);
  // 羽根飾り（揺れる）
  ctx.save();
  ctx.translate(0, -s * 1.16);
  ctx.rotate(Math.sin(t * 4) * 0.12);
  ctx.fillStyle = '#e0352c';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.3, -s * 0.5, -s * 0.12);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.06, 0, s * 0.04);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---- 敵 ----------------------------------------------------------------------
function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number, color = '#fff', angry = true) {
  for (const sx of [-1, 1]) {
    ellipse(ctx, x + sx * gap, y, r, r * 1.2, color);
    ellipse(ctx, x + sx * gap + r * 0.2, y + r * 0.2, r * 0.5, r * 0.65, '#1a0a14');
    if (angry) {
      ctx.strokeStyle = '#1a0a14';
      ctx.lineWidth = r * 0.35;
      ctx.beginPath();
      ctx.moveTo(x + sx * (gap + r * 1.1), y - r * 1.6);
      ctx.lineTo(x + sx * (gap - r * 0.9), y - r * 1.0);
      ctx.stroke();
    }
  }
}

/** 弱: 宝石を飲み込んだスライム */
function slime(ctx: Ctx, s: number, t: number) {
  const w = 1 + Math.sin(t * 5) * 0.06;
  const g = ctx.createRadialGradient(-s * 0.15, -s * 0.5, s * 0.05, 0, -s * 0.3, s * 0.6);
  g.addColorStop(0, '#d8ffb0');
  g.addColorStop(0.5, '#4cc94a');
  g.addColorStop(1, '#1d6a2c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.55 * w, 0);
  ctx.bezierCurveTo(-s * 0.6 * w, -s * 0.5 / w, -s * 0.2, -s * 0.8 / w, 0, -s * 0.82 / w);
  ctx.bezierCurveTo(s * 0.2, -s * 0.8 / w, s * 0.6 * w, -s * 0.5 / w, s * 0.55 * w, 0);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 0, -s * 0.25, s * 0.1, s * 0.12, '#ff4a7a', 0.6);
  ellipse(ctx, -s * 0.2, -s * 0.6, s * 0.1, s * 0.05, 'rgba(255,255,255,0.7)', -0.5);
  eyes(ctx, 0, -s * 0.45, s * 0.16, s * 0.07, '#fff', false);
}

/** 中: コウモリの翼を持つ小悪魔の騎士 */
function batKnight(ctx: Ctx, s: number, t: number) {
  const f = Math.sin(t * 10) * 0.25;
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.scale(sx, 1);
    ctx.rotate(f);
    ctx.fillStyle = '#4a1f6a';
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.6);
    ctx.lineTo(s * 0.8, -s * 0.95);
    ctx.lineTo(s * 0.7, -s * 0.6);
    ctx.lineTo(s * 0.62, -s * 0.72);
    ctx.lineTo(s * 0.52, -s * 0.45);
    ctx.lineTo(s * 0.4, -s * 0.58);
    ctx.lineTo(s * 0.18, -s * 0.35);
    ctx.fill();
    ctx.restore();
  }
  // 槍
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(s * 0.32, -s * 1.0, s * 0.05, s * 1.0);
  ctx.fillStyle = '#dfe6f0';
  ctx.beginPath();
  ctx.moveTo(s * 0.345, -s * 1.22);
  ctx.lineTo(s * 0.42, -s * 1.0);
  ctx.lineTo(s * 0.27, -s * 1.0);
  ctx.fill();
  const g = ctx.createLinearGradient(0, -s * 0.9, 0, 0);
  g.addColorStop(0, '#9a5ad0');
  g.addColorStop(1, '#3a1458');
  ctx.fillStyle = g;
  roundRect(ctx, -s * 0.24, -s * 0.72, s * 0.48, s * 0.62, s * 0.18);
  ctx.fill();
  // 角
  ctx.fillStyle = '#f0e0c0';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.12, -s * 0.7);
    ctx.quadraticCurveTo(sx * s * 0.3, -s * 0.95, sx * s * 0.26, -s * 1.02);
    ctx.lineTo(sx * s * 0.2, -s * 0.72);
    ctx.fill();
  }
  eyes(ctx, 0, -s * 0.5, s * 0.1, s * 0.055, '#ffe23a');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, -s * 0.34);
  ctx.lineTo(-s * 0.04, -s * 0.28);
  ctx.lineTo(0, -s * 0.34);
  ctx.lineTo(s * 0.04, -s * 0.28);
  ctx.lineTo(s * 0.08, -s * 0.34);
  ctx.fill();
}

/** 強: ルーンが光る岩の番人 */
function golem(ctx: Ctx, s: number, t: number) {
  const rock = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#a89a8a');
    g.addColorStop(1, '#4a3e36');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.25);
    ctx.fill();
  };
  const sway = Math.sin(t * 2) * s * 0.02;
  rock(-s * 0.62, -s * 0.9 + sway, s * 0.28, s * 0.62);
  rock(s * 0.34, -s * 0.9 - sway, s * 0.28, s * 0.62);
  rock(-s * 0.36, -s * 1.0, s * 0.72, s * 0.8);
  rock(-s * 0.3, -s * 0.22, s * 0.22, s * 0.22);
  rock(s * 0.08, -s * 0.22, s * 0.22, s * 0.22);
  rock(-s * 0.2, -s * 1.25, s * 0.4, s * 0.3);
  const glow = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.strokeStyle = `rgba(80,220,255,${glow})`;
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.8); ctx.lineTo(0, -s * 0.6); ctx.lineTo(s * 0.2, -s * 0.8);
  ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, -s * 0.35);
  ctx.stroke();
  ellipse(ctx, -s * 0.08, -s * 1.1, s * 0.05, s * 0.03, `rgba(120,240,255,${glow})`);
  ellipse(ctx, s * 0.08, -s * 1.1, s * 0.05, s * 0.03, `rgba(120,240,255,${glow})`);
}

/** ボス: 金貨を抱えこむ紫の竜（オリジナル） */
function bossDragon(ctx: Ctx, s: number, t: number) {
  const breathe = Math.sin(t * 2) * s * 0.02;
  // 翼
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.scale(sx, 1);
    ctx.rotate(Math.sin(t * 1.5) * 0.05);
    const wg = ctx.createLinearGradient(s * 0.2, -s * 1.2, s * 1.1, -s * 0.3);
    wg.addColorStop(0, '#6a1a8a');
    wg.addColorStop(1, '#2a0a3a');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.8);
    ctx.lineTo(s * 0.7, -s * 1.35);
    ctx.lineTo(s * 1.15, -s * 1.2);
    ctx.quadraticCurveTo(s * 1.0, -s * 0.95, s * 1.12, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.9, -s * 0.62, s * 0.98, -s * 0.38);
    ctx.quadraticCurveTo(s * 0.7, -s * 0.4, s * 0.62, -s * 0.2);
    ctx.lineTo(s * 0.25, -s * 0.45);
    ctx.fill();
    ctx.strokeStyle = '#e2b24a';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(s * 0.7, -s * 1.35);
    for (const [x, y] of [[1.12, -0.72], [0.98, -0.38], [0.62, -0.2]]) {
      ctx.moveTo(s * 0.7, -s * 1.35);
      ctx.lineTo(s * x, s * y);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 金貨の山
  for (let i = 0; i < 26; i++) {
    const x = (Math.sin(i * 7.3) * 0.5) * s * 1.1, y = -Math.abs(Math.cos(i * 3.1)) * s * 0.18;
    ellipse(ctx, x, y, s * 0.09, s * 0.035, i % 3 ? '#f1c14e' : '#c88a20');
  }
  // 胴
  const bg = ctx.createLinearGradient(0, -s * 1.0, 0, 0);
  bg.addColorStop(0, '#9a3ac8');
  bg.addColorStop(1, '#3a0e58');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.45 + breathe, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0c870';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.36 + breathe, s * 0.22, s * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8801a';
  ctx.lineWidth = s * 0.012;
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.6 + k * s * 0.1 + breathe);
    ctx.quadraticCurveTo(0, -s * 0.56 + k * s * 0.1 + breathe, s * 0.2, -s * 0.6 + k * s * 0.1 + breathe);
    ctx.stroke();
  }
  // 首と頭
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.8);
  ctx.quadraticCurveTo(-s * 0.1, -s * 1.15, 0, -s * 1.2);
  ctx.quadraticCurveTo(s * 0.12, -s * 1.15, s * 0.16, -s * 0.8);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -s * 1.25 + breathe);
  const hg = ctx.createLinearGradient(0, -s * 0.2, 0, s * 0.25);
  hg.addColorStop(0, '#b04ae0');
  hg.addColorStop(1, '#4a1070');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-s * 0.22, -s * 0.05);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.22, 0, -s * 0.22);
  ctx.quadraticCurveTo(s * 0.2, -s * 0.22, s * 0.22, -s * 0.05);
  ctx.lineTo(s * 0.13, s * 0.25);
  ctx.quadraticCurveTo(0, s * 0.33, -s * 0.13, s * 0.25);
  ctx.closePath();
  ctx.fill();
  // 角と王冠
  ctx.fillStyle = '#f0e0c0';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.15, -s * 0.16);
    ctx.quadraticCurveTo(sx * s * 0.4, -s * 0.3, sx * s * 0.42, -s * 0.52);
    ctx.quadraticCurveTo(sx * s * 0.3, -s * 0.3, sx * s * 0.08, -s * 0.2);
    ctx.fill();
  }
  ctx.fillStyle = goldGrad(ctx, -s * 0.42, -s * 0.2);
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, -s * 0.2);
  ctx.lineTo(-s * 0.14, -s * 0.38);
  ctx.lineTo(-s * 0.06, -s * 0.28);
  ctx.lineTo(0, -s * 0.42);
  ctx.lineTo(s * 0.06, -s * 0.28);
  ctx.lineTo(s * 0.14, -s * 0.38);
  ctx.lineTo(s * 0.13, -s * 0.2);
  ctx.fill();
  ellipse(ctx, 0, -s * 0.3, s * 0.03, s * 0.03, '#ff2a4a');
  eyes(ctx, 0, -s * 0.04, s * 0.09, s * 0.045, '#ffde3a');
  // 鼻孔の煙
  ctx.fillStyle = `rgba(255,140,60,${0.4 + 0.3 * Math.sin(t * 6)})`;
  ellipse(ctx, -s * 0.05, s * 0.2, s * 0.02, s * 0.015, ctx.fillStyle);
  ellipse(ctx, s * 0.05, s * 0.2, s * 0.02, s * 0.015, ctx.fillStyle);
  ctx.restore();
}

export function drawEnemy(ctx: Ctx, kind: EnemyKind, x: number, y: number, s: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 0, 0, s * (kind === 3 ? 0.9 : 0.5));
  if (kind === 0) slime(ctx, s, t);
  else if (kind === 1) batKnight(ctx, s, t);
  else if (kind === 2) golem(ctx, s, t);
  else bossDragon(ctx, s, t);
  ctx.restore();
}

// ---- アイテム ------------------------------------------------------------------
export function drawChest(ctx: Ctx, x: number, y: number, s: number, open: number, gold = false) {
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 0, 0, s * 0.55);
  const wood = gold ? ['#f1c14e', '#9a6a10'] : ['#a0582a', '#5a2a10'];
  const g = ctx.createLinearGradient(0, -s * 0.5, 0, 0);
  g.addColorStop(0, wood[0]);
  g.addColorStop(1, wood[1]);
  ctx.fillStyle = g;
  ctx.fillRect(-s * 0.5, -s * 0.5, s, s * 0.5);
  // 中の光
  if (open > 0) {
    const lg = ctx.createRadialGradient(0, -s * 0.5, 0, 0, -s * 0.5, s * (0.4 + open));
    lg.addColorStop(0, `rgba(255,250,200,${open})`);
    lg.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-s * 2, -s * 2.5, s * 4, s * 2.5);
  }
  // ふた
  ctx.save();
  ctx.translate(0, -s * 0.5);
  ctx.scale(1, Math.cos(open * 2.2));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, 0);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.36, 0, -s * 0.36);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.36, s * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8c060';
  ctx.fillRect(-s * 0.06, -s * 0.36, s * 0.12, s * 0.36);
  ctx.restore();
  ctx.fillStyle = '#e8c060';
  ctx.fillRect(-s * 0.5, -s * 0.5, s, s * 0.05);
  ctx.fillRect(-s * 0.06, -s * 0.5, s * 0.12, s * 0.5);
  ctx.fillStyle = '#3a2008';
  ctx.fillRect(-s * 0.04, -s * 0.42, s * 0.08, s * 0.1);
  ctx.restore();
}

export function drawOrb(ctx: Ctx, x: number, y: number, r: number, hue: number, filled = true) {
  ctx.save();
  if (filled) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, `hsl(${hue},95%,70%)`);
    g.addColorStop(1, `hsl(${hue},90%,28%)`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.strokeStyle = '#f1c14e';
  ctx.stroke();
  ctx.restore();
}

/** 金のメダル（枚数の数字入り） */
export function drawMedalIcon(ctx: Ctx, x: number, y: number, r: number, label: string) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.6, '#e8b040');
  g.addColorStop(1, '#8a5a10');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = '#6a4008';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,240,180,0.7)';
  ctx.lineWidth = r * 0.05;
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = '#5a2a00';
  ctx.font = `900 ${r * (label.length > 2 ? 0.7 : 0.9)}px ${LATIN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + r * 0.05);
  ctx.restore();
}

/** 竜の紋章（スロットの図柄・大当たり） */
export function drawDragonMark(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ff6a4a');
  g.addColorStop(1, '#6a0a14');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = '#f1c14e';
  ctx.stroke();
  // 竜の頭のシルエット（横向き）
  ctx.fillStyle = goldGrad(ctx, -r, r);
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.45);
  ctx.quadraticCurveTo(-r * 0.6, -r * 0.1, -r * 0.2, -r * 0.35);
  ctx.lineTo(-r * 0.45, -r * 0.75);
  ctx.lineTo(-r * 0.05, -r * 0.42);
  ctx.quadraticCurveTo(r * 0.3, -r * 0.45, r * 0.62, -r * 0.1);
  ctx.lineTo(r * 0.3, 0);
  ctx.lineTo(r * 0.58, r * 0.18);
  ctx.quadraticCurveTo(r * 0.1, r * 0.2, -r * 0.1, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a0a14';
  ctx.beginPath();
  ctx.arc(r * 0.05, -r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawSlotSymbol(ctx: Ctx, sym: SlotSymbol, x: number, y: number, r: number) {
  if (sym === 'dragon') drawDragonMark(ctx, x, y, r);
  else if (sym === 'orb') drawOrb(ctx, x, y, r * 0.85, 190);
  else drawMedalIcon(ctx, x, y, r * 0.9, sym.slice(1));
}

// ---- 背景（迷宮ごとの色） ------------------------------------------------------
export const THEMES = [
  { sky: ['#0d2a1a', '#2f6a3a'], wall: '#3a5a32', brick: '#27402a', torch: '#ffd070', floor: '#4a3a24' },
  { sky: ['#0a1a3a', '#4a86c8'], wall: '#8ab4d8', brick: '#5a7ea8', torch: '#a0e0ff', floor: '#6a86a0' },
  { sky: ['#2a0804', '#c8401a'], wall: '#6a2a1a', brick: '#4a1a10', torch: '#ffb040', floor: '#3a1a10' },
  { sky: ['#12061e', '#5a2a7a'], wall: '#4a3a5a', brick: '#2e2240', torch: '#e080ff', floor: '#2a2030' },
];

/** 横スクロール用の迷宮の壁（幅 w の繰り返し可能な帯） */
export function dungeonStrip(theme: number, w: number, h: number) {
  const th = THEMES[theme];
  const { cv, ctx } = canvas(w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, th.sky[0]);
  sky.addColorStop(1, th.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 奥の壁のレンガ
  const bh = 34;
  for (let row = 0; row * bh < h * 0.72; row++) {
    for (let x = -(row % 2) * 40; x < w; x += 80) {
      ctx.fillStyle = row % 3 === 0 ? th.brick : th.wall;
      ctx.globalAlpha = 0.55 + ((x * 7 + row * 13) % 17) / 60;
      ctx.fillRect(x + 2, row * bh + 2, 76, bh - 4);
    }
  }
  ctx.globalAlpha = 1;
  // 柱
  for (let x = 0; x < w; x += 256) {
    const g = ctx.createLinearGradient(x, 0, x + 60, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 60, h * 0.72);
  }
  // 床
  const fg = ctx.createLinearGradient(0, h * 0.72, 0, h);
  fg.addColorStop(0, th.floor);
  fg.addColorStop(1, '#0a0604');
  ctx.fillStyle = fg;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  return cv;
}

/** 属性のアイコン（炎・氷・雷） */
export function drawElemIcon(ctx: Ctx, elem: 'fire' | 'ice' | 'thunder', x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  if (elem === 'fire') {
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fff2a0');
    g.addColorStop(0.5, '#ff8a20');
    g.addColorStop(1, '#c01a08');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.5, -r * 0.4, r * 0.9, 0, r * 0.7, r * 0.5);
    ctx.quadraticCurveTo(r * 0.4, r, 0, r);
    ctx.quadraticCurveTo(-r * 0.4, r, -r * 0.7, r * 0.5);
    ctx.bezierCurveTo(-r * 0.8, 0, -r * 0.2, -r * 0.2, 0, -r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,200,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.45, r * 0.25, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (elem === 'ice') {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#8ad8ff');
    g.addColorStop(1, '#1a5ac8');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.55, -r * 0.2);
    ctx.lineTo(r * 0.35, r);
    ctx.lineTo(-r * 0.35, r);
    ctx.lineTo(-r * 0.55, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fffbd0');
    g.addColorStop(1, '#f0b000');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(r * 0.25, -r);
    ctx.lineTo(-r * 0.5, r * 0.1);
    ctx.lineTo(-r * 0.05, r * 0.1);
    ctx.lineTo(-r * 0.3, r);
    ctx.lineTo(r * 0.55, -r * 0.2);
    ctx.lineTo(r * 0.05, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
