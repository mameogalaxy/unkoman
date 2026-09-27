// 奥壁の液晶画面。ゲームの状態（src/game/game.ts）を読んで毎フレーム（最大30fps）描き直す。
import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { DUNGEON_NAMES, ELEM_NAME, ENEMY, ORBS_FOR_WHEEL, MAX_STOCK, SLOT_SYMBOLS, WEAKNESS, type Loot, type StepCell } from '../game/rules.ts';
import { LANES } from '../physics/layout.ts';
import {
  JP, LATIN, bigText, drawDragonMark, drawElemIcon, drawHero, drawMedalIcon, drawOrb, drawSlotSymbol,
  goldFrame, goldGrad, roundRect,
} from './art.ts';
import { canvas, type Ctx } from './canvasKit.ts';

const W = 1024;
const H = 768;
const TOP = 124; // HUD の下
const BOTTOM = H - 86; // レーンのマークの上

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** ルーレットの光が今どのマスにあるか（最後は target で止まる） */
function rouletteIndex(n: number, target: number, t: number, dur: number, laps = 3) {
  const total = target + n * laps;
  return Math.floor(ease(t / dur) * total + 1e-6) % n;
}

export class LcdScreen {
  readonly texture: THREE.CanvasTexture;
  private out: { cv: HTMLCanvasElement; ctx: Ctx };
  private hitUntil = 0;
  private hitLane = -1;
  private lastDraw = 0;
  private lastTickIdx = -1;
  /** ルーレットの光が1マス動くたびに呼ばれる（効果音用） */
  onTick: (() => void) | null = null;

  constructor() {
    this.out = canvas(W, H);
    this.texture = new THREE.CanvasTexture(this.out.cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** フォント読み込み後に呼ぶ（今は毎フレーム描き直すので何もしない） */
  refreshBase() {}

  flashHit(lane: number, now: number) {
    this.hitLane = lane;
    this.hitUntil = now + 1000;
  }

  /** 3D の上に重ねる文字・パネルを描く。描いたら true（30fps に間引く） */
  update(now: number, g: Game): boolean {
    if (now - this.lastDraw < 32) return false;
    this.lastDraw = now;
    const ctx = this.out.ctx;
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    this.drawWorld(ctx, g, t);
    this.drawOverlay(ctx, g, t);
    this.drawHud(ctx, g, t);
    this.drawLanes(ctx, now, g);
    this.texture.needsUpdate = true;
    return true;
  }

  /** HUD の顔（3D の主人公を描いたもの） */
  portrait: HTMLCanvasElement | null = null;

  // ---- 背景の世界（通路 or 戦闘） --------------------------------------------
  private drawWorld(ctx: Ctx, g: Game, t: number) {
    const md = g.mode;
    if (md.m === 'battle') return this.drawBattle(ctx, g, t);
    if (md.m === 'victory' || md.m === 'retreat' || md.m === 'loot') return;
    const b = g.s.board;
    // 階層の見出しと進み具合
    const name = `${DUNGEON_NAMES[g.s.dungeon % 4]}  ${g.isBossFloor ? 'ボスの間' : `地下${g.s.floor + 1}階`}`;
    ctx.fillStyle = 'rgba(30,10,0,0.6)';
    roundRect(ctx, 20, TOP + 14, 440, 52, 24);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `400 32px ${JP}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 40, TOP + 41);
    const prog = g.s.pos / (b.length - 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 480, TOP + 30, 300, 20, 10);
    ctx.fill();
    ctx.fillStyle = goldGrad(ctx, TOP + 30, TOP + 50);
    roundRect(ctx, 480, TOP + 30, Math.max(20, 300 * prog), 20, 10);
    ctx.fill();
    ctx.textBaseline = 'alphabetic';
  }

  private drawBattle(ctx: Ctx, g: Game, t: number) {
    const md = g.mode;
    if (md.m !== 'battle') return;
    const kind = md.kind;
    const weak = WEAKNESS[md.element];
    // 敵パーティの HP（1体ずつ）
    const n = md.hps.length;
    const bw = n === 1 ? 420 : n === 2 ? 250 : 190;
    const gap = 16;
    const x0 = W / 2 - (bw * n + gap * (n - 1)) / 2;
    ctx.fillStyle = 'rgba(20,0,10,0.72)';
    roundRect(ctx, x0 - 14, TOP + 12, bw * n + gap * (n - 1) + 28, 86, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `400 26px ${JP}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${ENEMY[kind].name}${n > 1 ? ` ×${n}` : ''}`, W / 2, TOP + 42);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (bw + gap);
      ctx.fillStyle = '#300';
      ctx.fillRect(x, TOP + 58, bw, 22);
      const hg = ctx.createLinearGradient(0, TOP + 58, 0, TOP + 80);
      hg.addColorStop(0, md.hps[i] > 0 ? '#ff8a6a' : '#555');
      hg.addColorStop(1, md.hps[i] > 0 ? '#b01010' : '#333');
      ctx.fillStyle = hg;
      ctx.fillRect(x, TOP + 58, (bw * md.hps[i]) / md.max, 22);
      ctx.strokeStyle = i === md.target && md.hitT < 0.4 ? '#fff' : '#f1c14e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, TOP + 58, bw, 22);
    }
    // 弱点と吸収
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, 24, TOP + 112, 250, 112, 14);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = `400 26px ${JP}`;
    ctx.fillStyle = '#ffb0a0';
    ctx.fillText('弱点', 40, TOP + 152);
    drawElemIcon(ctx, weak, 130, TOP + 143, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(ELEM_NAME[weak], 158, TOP + 152);
    ctx.fillStyle = '#9ad8ff';
    ctx.fillText('吸収', 40, TOP + 202);
    drawElemIcon(ctx, md.element, 130, TOP + 193, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(ELEM_NAME[md.element], 158, TOP + 202);
    // 必殺技ゲージ
    const gx = W - 300, gy = TOP + 118;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, gx - 16, gy - 6, 290, 60, 14);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `400 22px ${JP}`;
    ctx.fillText('必殺技', gx, gy + 20);
    ctx.fillStyle = '#221';
    roundRect(ctx, gx, gy + 28, 250, 16, 8);
    ctx.fill();
    const full = md.gauge >= 100;
    ctx.fillStyle = full ? (Math.floor(t * 8) % 2 ? '#fff6a0' : '#ff9a20') : goldGrad(ctx, gy + 28, gy + 44);
    roundRect(ctx, gx, gy + 28, Math.max(10, 250 * md.gauge / 100), 16, 8);
    ctx.fill();
    if (full) bigText(ctx, '必殺技OK！', gx + 190, gy + 12, 28, JP, 400, '#fff');
    // 攻撃の結果
    if (md.hitT < 0.9) {
      const k = md.hitT / 0.9;
      ctx.globalAlpha = 1 - k * k;
      const y = 300 - k * 50;
      if (md.lastType === 'miss') bigText(ctx, 'MISS', W / 2, y, 80, LATIN, 900, '#c8d0e0');
      else if (md.lastType === 'absorb') bigText(ctx, `吸収 +${md.lastDmg}`, W / 2, y, 70, JP, 400, '#8ad8ff');
      else if (md.lastType === 'weak') {
        bigText(ctx, `${md.lastDmg}`, W / 2, y, 110, LATIN, 900, '#ffef6a');
        bigText(ctx, '弱点！', W / 2, y + 90, 60, JP, 400, '#ff7a4a');
      } else if (md.lastType === 'special') {
        bigText(ctx, '必殺・竜牙斬！', W / 2, y, 80, JP, 400, '#ffd23a');
        bigText(ctx, `全体 ${md.lastDmg}`, W / 2, y + 90, 60, LATIN, 900, '#fff');
      } else bigText(ctx, `${md.lastDmg}`, W / 2, y, 72, LATIN, 900, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // 被弾
    if (md.heroHitT < 0.6) {
      ctx.fillStyle = `rgba(255,0,0,${0.35 * (1 - md.heroHitT / 0.6)})`;
      ctx.fillRect(0, TOP, W, BOTTOM - TOP);
      bigText(ctx, `-${md.lastAtk}`, 250, 470 - md.heroHitT * 40, 72, LATIN, 900, '#ff6a5a');
      bigText(ctx, `${ENEMY[kind].name}の攻撃！`, W / 2, 250, 52, JP, 400, '#ffb0a0');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, 232, BOTTOM - 54, 560, 44, 20);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `400 26px ${JP}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${ELEM_NAME[weak]}の穴を狙え！ ${ELEM_NAME[md.element]}は吸収される`, W / 2, BOTTOM - 22);
    ctx.textAlign = 'left';
    if (md.shuffleT < 0.5) {
      ctx.globalAlpha = 1 - md.shuffleT / 0.5;
      bigText(ctx, 'シャッフル！', W / 2, BOTTOM - 90, 44, JP, 400, '#fff');
      ctx.globalAlpha = 1;
    }
  }

  // ---- 手前に重ねる演出 --------------------------------------------------------
  private drawOverlay(ctx: Ctx, g: Game, t: number) {
    const md = g.mode;
    switch (md.m) {
      case 'map':
        if (g.s.stock === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          roundRect(ctx, 312, BOTTOM - 58, 400, 46, 22);
          ctx.fill();
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
          ctx.fillStyle = '#fff3c4';
          ctx.font = `400 28px ${JP}`;
          ctx.textAlign = 'center';
          ctx.fillText('光るレーンを狙え！', W / 2, BOTTOM - 25);
          ctx.textAlign = 'left';
          ctx.globalAlpha = 1;
        }
        break;
      case 'roulette': {
        const gold = md.kind === 'gold';
        this.rouletteRow(ctx, gold ? 'GOLD ROULETTE' : 'SILVER ROULETTE', md.cells, md.target, md.t, md.dur, gold,
          (c) => (c === 'gold' ? 'GOLD' : `${c}歩`));
        break;
      }
      case 'move':
        bigText(ctx, `あと ${md.left} 歩`, W / 2 + 120, TOP + 130, 54, JP, 400);
        break;
      case 'floor': {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.75, md.t)})`;
        ctx.fillRect(0, TOP, W, BOTTOM - TOP);
        const next = md.boss ? 'ボスの間へ！' : g.s.floor < 0 ? `${DUNGEON_NAMES[(g.s.dungeon) % 4]}へ` : `地下${g.s.floor + 2}階へ`;
        bigText(ctx, md.boss ? 'WARNING' : 'FLOOR CLEAR', W / 2, 320, 90, LATIN, 900, md.boss ? '#ff4a3a' : undefined);
        bigText(ctx, next, W / 2, 440, 56, JP, 400);
        break;
      }
      case 'chest': {
        const open = clamp01((md.t - 0.6) / 0.5);
        if (open > 0) {
          const y = 420 - ease(open) * 140;
          if (md.item === 'orb') drawOrb(ctx, W / 2, y, 60, (g.s.orbs * 45) % 360);
          else if (md.item === 'slot') drawDragonMark(ctx, W / 2, y, 64);
          else drawMedalIcon(ctx, W / 2, y, 64, md.item.slice(1));
        }
        bigText(ctx, '宝箱を見つけた！', W / 2, TOP + 70, 52, JP, 400);
        break;
      }
      case 'victory':
        bigText(ctx, 'VICTORY!', W / 2, 330, 120);
        bigText(ctx, `EXP +${ENEMY[md.kind].exp * md.party}`, W / 2, 450, 48, LATIN, 700, '#fff');
        break;
      case 'retreat':
        ctx.fillStyle = 'rgba(40,0,0,0.6)';
        ctx.fillRect(0, TOP, W, BOTTOM - TOP);
        bigText(ctx, 'HPが尽きた…', W / 2, 330, 64, JP, 400, '#ffb0a0');
        bigText(ctx, '一歩下がって出直しだ', W / 2, 430, 44, JP, 400, '#fff');
        break;
      case 'loot':
        this.rouletteRow(ctx, '戦利品ルーレット', md.cells, md.target, md.t, md.dur, md.kind >= 2, (c) => c);
        break;
      case 'slot':
        this.drawSlot(ctx, md, t);
        break;
      case 'orb': {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, TOP, W, BOTTOM - TOP);
        const k = ease(md.t / 0.6);
        const glow = ctx.createRadialGradient(W / 2, 380, 0, W / 2, 380, 220);
        glow.addColorStop(0, 'rgba(255,255,220,0.8)');
        glow.addColorStop(1, 'rgba(255,255,220,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(W / 2 - 240, 140, 480, 480);
        drawOrb(ctx, W / 2, 380, 90 * k, ((g.s.orbs - 1) * 45) % 360);
        bigText(ctx, `宝玉 +${md.gained}  (${g.s.orbs} / ${ORBS_FOR_WHEEL})`, W / 2, 560, 56, JP, 400);
        break;
      }
      case 'wheelIntro': {
        const on = Math.floor(md.t * 8) % 2 === 0;
        ctx.fillStyle = on ? 'rgba(255,40,20,0.35)' : 'rgba(255,200,40,0.3)';
        ctx.fillRect(0, TOP, W, BOTTOM - TOP);
        drawDragonMark(ctx, W / 2, 300, 110 + Math.sin(md.t * 10) * 6);
        bigText(ctx, md.reason === 'chain' ? '連チャン！' : 'BIG ROULETTE', W / 2, 470, md.reason === 'chain' ? 90 : 96,
          md.reason === 'chain' ? JP : LATIN, md.reason === 'chain' ? 400 : 900);
        bigText(ctx, md.reason === 'orb' ? '宝玉が8つ揃った！' : md.reason === 'slot' ? '竜が3つ揃った！' : `${md.spins + 1}回目の大ルーレット`,
          W / 2, 570, 44, JP, 400, '#fff');
        break;
      }
      case 'wheel':
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, TOP, W, BOTTOM - TOP);
        bigText(ctx, '大ルーレット回転中！', W / 2, 330, 64, JP, 400);
        bigText(ctx, '竜マークで連チャン', W / 2, 440, 44, JP, 400, '#ffd0a0');
        break;
      case 'get':
        this.drawGet(ctx, md.amount, md.label, md.t);
        break;
      case 'battle':
        break;
    }
    // チェッカー当たり（戦闘以外は保留が増える）
    if (performance.now() < this.hitUntil && md.m !== 'battle') {
      const k = 1 - (this.hitUntil - performance.now()) / 1000;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      bigText(ctx, 'CHECKER!', W / 2, TOP + 150 - k * 30, 80);
      ctx.restore();
    }
  }

  private rouletteRow<T extends StepCell | Loot>(ctx: Ctx, title: string, cells: T[], target: number, t: number, dur: number, gold: boolean, label: (c: T) => string | number) {
    const n = cells.length;
    const idx = t < 0 ? -1 : rouletteIndex(n, target, t, dur);
    if (idx !== this.lastTickIdx && t < dur) this.onTick?.();
    this.lastTickIdx = idx;
    const stopped = t >= dur;
    const cw = Math.min(118, 900 / n);
    const x0 = W / 2 - (cw * n) / 2;
    goldFrame(ctx, x0 - 30, 250, cw * n + 60, 250, gold ? 'rgba(90,60,0,0.9)' : 'rgba(30,30,50,0.9)');
    bigText(ctx, title, W / 2, 222, 58, /[A-Z]/.test(title) ? LATIN : JP, /[A-Z]/.test(title) ? 900 : 400,
      gold ? undefined : '#e8eef8');
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cw;
      const on = i === idx;
      const blink = stopped && on && Math.floor(t * 10) % 2 === 0;
      const cg = ctx.createLinearGradient(0, 290, 0, 460);
      if (on) {
        cg.addColorStop(0, blink ? '#ffffff' : '#fff2a0');
        cg.addColorStop(1, '#ff9a20');
      } else {
        cg.addColorStop(0, gold ? '#7a5a10' : '#4a5470');
        cg.addColorStop(1, gold ? '#3a2400' : '#1a2034');
      }
      ctx.fillStyle = cg;
      roundRect(ctx, x + 6, 290, cw - 12, 170, 12);
      ctx.fill();
      ctx.strokeStyle = on ? '#fff' : '#b89a50';
      ctx.lineWidth = on ? 5 : 2;
      ctx.stroke();
      const c = cells[i];
      const cx = x + cw / 2;
      if (c === 'orb') drawOrb(ctx, cx, 375, cw * 0.3, 280);
      else if (c === 'slot') drawDragonMark(ctx, cx, 375, cw * 0.32);
      else if (typeof c === 'number' && title.includes('戦利品')) drawMedalIcon(ctx, cx, 375, cw * 0.34, String(c));
      else {
        const s = String(label(c));
        bigText(ctx, s, cx, 375, s === 'GOLD' ? cw * 0.3 : cw * 0.38, s === 'GOLD' ? LATIN : JP, s === 'GOLD' ? 900 : 400,
          s === 'GOLD' ? undefined : on ? '#5a1a00' : '#fff');
      }
    }
  }

  private drawSlot(ctx: Ctx, md: Extract<Game['mode'], { m: 'slot' }>, t: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, TOP, W, BOTTOM - TOP);
    bigText(ctx, md.jackpot ? 'JACKPOT SLOT' : 'TREASURE SLOT', W / 2, TOP + 66, 64);
    const stops = [1.4, 2.0, 2.9];
    const rw = 210, rh = 250, gap = 24;
    const x0 = W / 2 - (rw * 3 + gap * 2) / 2;
    goldFrame(ctx, x0 - 24, 230, rw * 3 + gap * 2 + 48, rh + 48, 'rgba(40,10,0,0.95)');
    for (let r = 0; r < 3; r++) {
      const x = x0 + r * (rw + gap);
      ctx.save();
      roundRect(ctx, x, 254, rw, rh, 10);
      const bg = ctx.createLinearGradient(0, 254, 0, 254 + rh);
      bg.addColorStop(0, '#9a9aa8');
      bg.addColorStop(0.5, '#ffffff');
      bg.addColorStop(1, '#9a9aa8');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.clip();
      const stopped = md.t >= stops[r];
      if (stopped) {
        const bounce = Math.max(0, 1 - (md.t - stops[r]) * 6) * Math.sin((md.t - stops[r]) * 40) * 12;
        drawSlotSymbol(ctx, md.reels[r], x + rw / 2, 254 + rh / 2 + bounce, 78);
      } else {
        const off = (md.t * 14 + r * 1.7) % SLOT_SYMBOLS.length;
        for (let k = -1; k <= 1; k++) {
          const i = (Math.floor(off) + k + SLOT_SYMBOLS.length * 4) % SLOT_SYMBOLS.length;
          const y = 254 + rh / 2 + (k - (off % 1)) * 170;
          drawSlotSymbol(ctx, SLOT_SYMBOLS[i], x + rw / 2, y, 70);
        }
      }
      ctx.restore();
    }
    const reach = md.t >= stops[1] && md.t < stops[2] && md.reels[0] === md.reels[1];
    if (reach && Math.floor(t * 8) % 2 === 0) bigText(ctx, 'リーチ！', W / 2, 590, 64, JP, 400, '#ff5a3a');
    if (md.t >= stops[2]) {
      const o = md.outcome;
      const text = o.k === 'dragon' ? '竜が揃った！！' : o.k === 'orb' ? `宝玉 ×${o.n}` : `${o.n}枚！`;
      bigText(ctx, text, W / 2, 590, 64, JP, 400);
    }
    if (md.spins > 1) {
      bigText(ctx, `${md.spin + 1} / ${md.spins}回目`, W / 2, TOP + 132, 36, JP, 400, '#fff');
    }
  }

  /** 獲得枚数の大きな表示（数字が回って止まる） */
  private drawGet(ctx: Ctx, amount: number, label: string, t: number) {
    const bg = ctx.createLinearGradient(0, TOP, 0, BOTTOM);
    bg.addColorStop(0, 'rgba(40,90,200,0.85)');
    bg.addColorStop(1, 'rgba(220,240,255,0.85)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, TOP, W, BOTTOM - TOP);
    ctx.save();
    ctx.translate(W / 2, 380);
    for (let i = 0; i < 20; i++) {
      ctx.rotate((Math.PI * 2) / 20 + t * 0.02);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-40, 700);
      ctx.lineTo(40, 700);
      ctx.fill();
    }
    ctx.restore();
    const shown = Math.round(amount * ease(t / 0.9));
    const digits = String(shown).padStart(Math.max(3, String(amount).length), '0');
    bigText(ctx, label, W / 2, 230, 48, JP, 400, '#fff');
    bigText(ctx, 'GET', 150, 390, 64);
    bigText(ctx, digits, W / 2 + 10, 390, 170);
    bigText(ctx, 'MEDALS', 880, 420, 40);
    // 降ってくるメダル
    for (let i = 0; i < 14; i++) {
      const x = ((i * 137) % 1000) + 12;
      const y = TOP + ((t * 300 + i * 91) % (BOTTOM - TOP));
      drawMedalIcon(ctx, x, y, 16, '');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 262, 540, 500, 56, 26);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.font = `400 30px ${JP}`;
    ctx.textAlign = 'center';
    ctx.fillText('竜の口から払い出し！', W / 2, 579);
    ctx.textAlign = 'left';
  }

  // ---- 上部の HUD ------------------------------------------------------------
  private drawHud(ctx: Ctx, g: Game, t: number) {
    goldFrame(ctx, 12, 8, 430, 110);
    if (this.portrait) ctx.drawImage(this.portrait, 24, 18, 88, 90);
    else drawHero(ctx, 68, 108, 70, t, 'idle');
    ctx.strokeStyle = '#f1c14e';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 18, 88, 90);
    ctx.fillStyle = '#fff';
    ctx.font = `700 30px ${LATIN}`;
    ctx.fillText(`Lv ${g.s.lv}`, 128, 50);
    ctx.font = `400 22px ${JP}`;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(g.s.loop > 0 ? `${g.s.loop + 1}周目の勇者` : '見習い剣士', 240, 50);
    ctx.fillStyle = '#123';
    roundRect(ctx, 128, 68, 300, 30, 6);
    ctx.fill();
    const hpk = g.s.hp / g.maxHp;
    const hp = ctx.createLinearGradient(0, 68, 0, 98);
    hp.addColorStop(0, hpk > 0.3 ? '#9dff7a' : '#ff9a7a');
    hp.addColorStop(1, hpk > 0.3 ? '#1f9a2c' : '#b01010');
    ctx.fillStyle = hp;
    roundRect(ctx, 131, 71, Math.max(8, 294 * hpk), 24, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 20px ${LATIN}`;
    ctx.fillText(`HP ${g.s.hp} / ${g.maxHp}`, 140, 90);

    goldFrame(ctx, 582, 8, 430, 110);
    ctx.font = `400 22px ${JP}`;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('宝玉', 598, 46);
    for (let i = 0; i < ORBS_FOR_WHEEL; i++) drawOrb(ctx, 672 + i * 41, 38, 15, (i * 45) % 360, i < g.s.orbs);
    ctx.fillText('保留', 598, 96);
    for (let i = 0; i < MAX_STOCK; i++) {
      const on = i < g.s.stock;
      ctx.beginPath();
      ctx.arc(684 + i * 44, 88, 14, 0, Math.PI * 2);
      const sg = ctx.createRadialGradient(684 + i * 44, 84, 2, 684 + i * 44, 88, 14);
      sg.addColorStop(0, on ? '#fff' : '#444');
      sg.addColorStop(1, on ? '#ff6a20' : '#1a1010');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.strokeStyle = '#f1c14e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `700 22px ${LATIN}`;
    ctx.fillText(`${DUNGEON_NAMES.length > 0 ? `D${(g.s.dungeon % 4) + 1}` : ''}`, 880, 96);
    // 中央のアーチ
    ctx.strokeStyle = goldGrad(ctx, 0, 140);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(442, 60);
    ctx.quadraticCurveTo(512, 150, 582, 60);
    ctx.stroke();
  }

  // ---- 下端: レーンのマーク（チェッカー / 戦闘中は属性） ------------------------
  private drawLanes(ctx: Ctx, now: number, g: Game) {
    const hitting = now < this.hitUntil;
    const lw = W / LANES.count;
    const b = g.battle;
    ctx.fillStyle = 'rgba(30,10,0,0.85)';
    ctx.fillRect(0, BOTTOM, W, H - BOTTOM);
    for (let i = 0; i < LANES.count; i++) {
      const x = lw * (i + 0.5), y = H - 43;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      if (b) {
        const icon = b.lanes[i];
        const weak = icon !== 'miss' && icon === WEAKNESS[b.element];
        const absorb = icon === b.element;
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 36);
        gg.addColorStop(0, weak ? '#ffe0a0' : absorb ? '#20304a' : icon === 'miss' ? '#2a2030' : '#4a4a60');
        gg.addColorStop(1, weak ? '#c02008' : absorb ? '#0a1020' : '#15101c');
        ctx.fillStyle = gg;
        ctx.fill();
        ctx.lineWidth = weak ? 6 : 3;
        ctx.strokeStyle = weak ? (Math.floor(now / 150) % 2 ? '#fff' : '#ffd23a') : '#b89a50';
        ctx.stroke();
        if (icon === 'miss') {
          ctx.strokeStyle = 'rgba(220,210,255,0.6)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(x - 13, y - 13); ctx.lineTo(x + 13, y + 13);
          ctx.moveTo(x + 13, y - 13); ctx.lineTo(x - 13, y + 13);
          ctx.stroke();
        } else {
          ctx.globalAlpha = absorb ? 0.45 : 1;
          drawElemIcon(ctx, icon, x, y, 22);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const on = i === g.checkerLane || (hitting && i === this.hitLane);
      if (on) {
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 34);
        gg.addColorStop(0, '#fff');
        gg.addColorStop(0.4, '#ff5a3a');
        gg.addColorStop(1, '#8a0a00');
        ctx.fillStyle = gg;
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
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.moveTo(x - 26, y); ctx.lineTo(x + 26, y);
        ctx.moveTo(x, y - 26); ctx.lineTo(x, y + 26);
      } else {
        ctx.moveTo(x - 13, y - 13); ctx.lineTo(x + 13, y + 13);
        ctx.moveTo(x + 13, y - 13); ctx.lineTo(x - 13, y + 13);
      }
      ctx.stroke();
    }
  }
}
