// 奥壁の液晶画面。静的な層（空・HUD・ロゴ）はキャッシュし、変化する部分だけ描き直す。
// ステージ3でダンジョン・戦闘・スロットの画面に置き換える。
import * as THREE from 'three';
import { LANES } from '../physics/layout.ts';
import { canvas, type Ctx } from './canvasKit.ts';

const W = 1024;
const H = 768;
const JP = '"Zen Antique", "Hiragino Mincho ProN", serif';
const LATIN = 'Cinzel, Georgia, serif';

function goldGrad(ctx: Ctx, y0: number, y1: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#fff6c8');
  g.addColorStop(0.45, '#f1c14e');
  g.addColorStop(0.55, '#b87a18');
  g.addColorStop(1, '#ffe08a');
  return g;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function goldFrame(ctx: Ctx, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = 'rgba(40,18,4,0.82)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = goldGrad(ctx, y, y + h);
  ctx.stroke();
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,230,160,0.6)';
  ctx.stroke();
}

/** オリジナルの主人公（羽根飾りの兜の剣士）の肖像 */
function portrait(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, '#5b8fd8');
  bg.addColorStop(1, '#1d3570');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);
  // 肩
  ctx.fillStyle = '#9aa7b8';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 1.02, s * 0.46, s * 0.3, 0, Math.PI, 0);
  ctx.fill();
  // 顔
  ctx.fillStyle = '#f0c49a';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.58, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  // 兜
  ctx.fillStyle = '#c9d2de';
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.5, s * 0.25, Math.PI, 0);
  ctx.lineTo(s * 0.75, s * 0.58);
  ctx.lineTo(s * 0.64, s * 0.5);
  ctx.lineTo(s * 0.36, s * 0.5);
  ctx.lineTo(s * 0.25, s * 0.58);
  ctx.fill();
  ctx.fillStyle = '#e2b24a';
  ctx.fillRect(s * 0.47, s * 0.24, s * 0.06, s * 0.28);
  // 羽根飾り
  ctx.fillStyle = '#d8342c';
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.26);
  ctx.quadraticCurveTo(s * 0.9, s * 0.02, s * 0.95, s * 0.3);
  ctx.quadraticCurveTo(s * 0.75, s * 0.2, s * 0.5, s * 0.3);
  ctx.fill();
  // 目
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(s * 0.4, s * 0.58, s * 0.06, s * 0.03);
  ctx.fillRect(s * 0.54, s * 0.58, s * 0.06, s * 0.03);
  ctx.restore();
}

function gem(ctx: Ctx, x: number, y: number, r: number, filled: boolean, hue: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.8, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.8, 0);
  ctx.closePath();
  if (filled) {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, `hsl(${hue},100%,85%)`);
    g.addColorStop(1, `hsl(${hue},90%,40%)`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
  }
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#f1c14e';
  ctx.stroke();
  ctx.restore();
}

export class LcdScreen {
  readonly texture: THREE.CanvasTexture;
  private base: HTMLCanvasElement;
  private out: { cv: HTMLCanvasElement; ctx: Ctx };
  private lit = -1;
  private hitUntil = 0;
  private hitLane = -1;
  private dirty = true;
  hits = 0;

  constructor() {
    this.base = this.drawBase();
    this.out = canvas(W, H);
    this.texture = new THREE.CanvasTexture(this.out.cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** フォント読み込み後に静的な層を描き直す */
  refreshBase() {
    this.base = this.drawBase();
    this.dirty = true;
  }

  private drawBase() {
    const { cv, ctx } = canvas(W, H);
    // 空と光の筋
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a62c4');
    sky.addColorStop(0.55, '#8cc2f2');
    sky.addColorStop(1, '#eaf5ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, 250);
    for (let i = 0; i < 24; i++) {
      ctx.rotate((Math.PI * 2) / 24);
      ctx.fillStyle = `rgba(255,255,255,${i % 2 ? 0.1 : 0.2})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-60, 900);
      ctx.lineTo(60, 900);
      ctx.fill();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(W / 2, 250, 0, W / 2, 250, 300);
    glow.addColorStop(0, 'rgba(255,255,240,0.9)');
    glow.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // 雲
    for (let i = 0; i < 14; i++) {
      const x = (i / 13) * W, y = 600 + Math.sin(i * 2.1) * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 120);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 130, y - 130, 260, 260);
    }

    // 上部 HUD: 左に主人公、右に宝玉と予告
    goldFrame(ctx, 12, 10, 430, 108);
    portrait(ctx, 24, 20, 88);
    ctx.strokeStyle = '#f1c14e';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 20, 88, 88);
    ctx.fillStyle = '#fff';
    ctx.font = `700 30px ${LATIN}`;
    ctx.fillText('Lv 1', 128, 52);
    ctx.font = `400 24px ${JP}`;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('見習い剣士', 220, 52);
    ctx.fillStyle = '#123';
    roundRect(ctx, 128, 70, 300, 30, 6);
    ctx.fill();
    const hp = ctx.createLinearGradient(0, 70, 0, 100);
    hp.addColorStop(0, '#9dff7a');
    hp.addColorStop(1, '#1f9a2c');
    ctx.fillStyle = hp;
    roundRect(ctx, 131, 73, 294, 24, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 20px ${LATIN}`;
    ctx.fillText('HP 120 / 120', 140, 92);

    goldFrame(ctx, 582, 10, 430, 108);
    ctx.font = `400 22px ${JP}`;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('宝玉', 600, 48);
    for (let i = 0; i < 8; i++) gem(ctx, 680 + i * 40, 42, 15, false, i * 45);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 600, 66, 396, 40, 6);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `400 22px ${JP}`;
    ctx.fillText('予告 ─ 迷宮の奥で何かが目覚める…', 612, 94);

    // 中央の飾り枠（上辺のアーチ）
    ctx.strokeStyle = goldGrad(ctx, 0, 140);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(442, 60);
    ctx.quadraticCurveTo(512, 150, 582, 60);
    ctx.stroke();

    // ロゴ
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 118px ${LATIN}`;
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#2a1204';
    ctx.strokeText('DRAGON', W / 2, 250);
    ctx.fillStyle = goldGrad(ctx, 190, 310);
    ctx.fillText('DRAGON', W / 2, 250);
    ctx.font = `900 96px ${LATIN}`;
    ctx.strokeText('HOARD', W / 2, 360);
    ctx.fillStyle = goldGrad(ctx, 310, 410);
    ctx.fillText('HOARD', W / 2, 360);
    // 翼の飾り
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(W / 2 + s * 330, 300);
      ctx.scale(s, 1);
      ctx.fillStyle = goldGrad(ctx, -80, 80);
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(k * 26, -30 + k * 16, 70 - k * 8, 14, -0.5 + k * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // 帯
    ctx.fillStyle = 'rgba(90,40,0,0.75)';
    roundRect(ctx, 232, 428, 560, 62, 30);
    ctx.fill();
    ctx.strokeStyle = '#f1c14e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.font = `400 36px ${JP}`;
    ctx.fillText('第一の迷宮  地下一階', W / 2, 460);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return cv;
  }

  setChecker(lane: number) {
    if (lane !== this.lit) {
      this.lit = lane;
      this.dirty = true;
    }
  }

  flashHit(lane: number, now: number) {
    this.hits++;
    this.hitLane = lane;
    this.hitUntil = now + 1400;
    this.dirty = true;
  }

  update(now: number) {
    const hitting = now < this.hitUntil;
    if (!this.dirty && !hitting) return;
    this.dirty = false;
    const { ctx } = this.out;
    ctx.drawImage(this.base, 0, 0);
    // チェッカー当たり
    if (hitting) {
      const k = 1 - (this.hitUntil - now) / 1400;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255,240,180,${0.5 * (1 - k)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, 560);
      ctx.scale(1 + (1 - k) * 0.3, 1 + (1 - k) * 0.3);
      ctx.font = `900 84px ${LATIN}`;
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#6a0a00';
      ctx.strokeText('CHECKER!', 0, 0);
      ctx.fillStyle = goldGrad(ctx, -40, 40);
      ctx.fillText('CHECKER!', 0, 0);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7a2a00';
      ctx.font = `400 34px ${JP}`;
      ctx.fillText(`光るレーンを狙え！  当たり ${this.hits}`, W / 2, 575);
      ctx.restore();
    }
    // 下端: レーンのマーク（レーンの真上に並ぶ）
    const lw = W / LANES.count;
    ctx.fillStyle = 'rgba(30,10,0,0.55)';
    ctx.fillRect(0, H - 86, W, 86);
    for (let i = 0; i < LANES.count; i++) {
      const x = lw * (i + 0.5), y = H - 43;
      const on = i === this.lit || (hitting && i === this.hitLane);
      ctx.beginPath();
      ctx.arc(x, y, 32, 0, Math.PI * 2);
      if (on) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 34);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.4, '#ff5a3a');
        g.addColorStop(1, '#8a0a00');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = '#3a2a4a';
      }
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f1c14e';
      ctx.stroke();
      ctx.strokeStyle = on ? '#fff' : 'rgba(220,210,255,0.8)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (on) {
        // 的
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.moveTo(x - 26, y); ctx.lineTo(x + 26, y);
        ctx.moveTo(x, y - 26); ctx.lineTo(x, y + 26);
      } else {
        ctx.moveTo(x - 13, y - 13); ctx.lineTo(x + 13, y + 13);
        ctx.moveTo(x + 13, y - 13); ctx.lineTo(x - 13, y + 13);
      }
      ctx.stroke();
    }
    this.texture.needsUpdate = true;
  }
}
