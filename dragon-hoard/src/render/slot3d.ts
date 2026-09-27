// 筐体の頭上にある3Dのジャックポットスロット。ボス撃破でカメラがここへ上がり、3本のリールが回る。
import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { SLOT_SYMBOLS, type SlotSymbol } from '../game/rules.ts';
import { bigText, drawSlotSymbol, goldFrame } from './art.ts';
import { canvas, tex } from './canvasKit.ts';

/** リールが止まる時刻（Game の slot と同じ） */
const STOPS = [1.4, 2.0, 2.9];
const N = SLOT_SYMBOLS.length;
const STEP = (Math.PI * 2) / N;

export const SLOT_POS = new THREE.Vector3(0, 50.5, -31);

function reelTexture() {
  // 周方向に N 個の図柄。円柱の軸を x に倒すので、図柄は 90° 回して描く。
  // 1コマは周方向 2πr/N、軸方向 6.4 なので、縦横比を合わせて丸が丸く見えるようにする
  const cell = 200;
  const cellV = Math.round((cell * 6.4) / ((2 * Math.PI * 3.4) / N));
  const { cv, ctx } = canvas(cell * N, cellV);
  const bg = ctx.createLinearGradient(0, 0, 0, cellV);
  bg.addColorStop(0, '#d8d8e0');
  bg.addColorStop(0.5, '#ffffff');
  bg.addColorStop(1, '#d8d8e0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cell * N, cellV);
  SLOT_SYMBOLS.forEach((sym, i) => {
    ctx.save();
    ctx.translate(cell * (i + 0.5), cellV / 2);
    // リールの正面で正しい向き（鏡文字にならない）になる変換
    ctx.rotate(Math.PI / 2);
    ctx.scale(1, -1);
    drawSlotSymbol(ctx, sym, 0, 0, cell * 0.38);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cell * i, 0, 3, cellV);
  });
  const t = tex(cv, true);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function signTexture() {
  const { cv, ctx } = canvas(1024, 256);
  goldFrame(ctx, 8, 8, 1008, 240, 'rgba(90,10,10,0.95)');
  bigText(ctx, 'JACKPOT', 512, 136, 150);
  return tex(cv, true);
}

export class Slot3D {
  readonly group = new THREE.Group();
  private reels: THREE.Mesh[] = [];
  private angles = [0, 0, 0];
  private speeds = [0, 0, 0];
  private lastSpin = -1;
  private bulbs: THREE.InstancedMesh;
  private bulbColor = new THREE.Color();

  constructor(envMap: THREE.Texture | null) {
    const gold = new THREE.MeshStandardMaterial({ color: '#e7b650', metalness: 1, roughness: 0.2, envMap });
    const red = new THREE.MeshStandardMaterial({ color: '#8a0a14', metalness: 0.5, roughness: 0.3, envMap });
    const dark = new THREE.MeshStandardMaterial({ color: '#0a0406', roughness: 0.8 });
    // 筐体（赤い箱と金の枠）
    const body = new THREE.Mesh(new THREE.BoxGeometry(26, 12, 5), red);
    body.position.z = -2.6;
    this.group.add(body);
    const window = new THREE.Mesh(new THREE.PlaneGeometry(22, 7.4), dark);
    window.position.z = -0.08;
    this.group.add(window);
    for (const [w, h, x, y] of [[26.6, 0.8, 0, 6.2], [26.6, 0.8, 0, -6.2], [0.8, 13.2, -13.3, 0], [0.8, 13.2, 13.3, 0], [22.4, 0.5, 0, 3.9], [22.4, 0.5, 0, -3.9]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.9), gold);
      b.position.set(x, y, 0);
      this.group.add(b);
    }
    // リール
    const rt = reelTexture();
    const reelMat = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.35, metalness: 0.05, envMap, envMapIntensity: 0.4, emissive: '#ffffff', emissiveMap: rt, emissiveIntensity: 0.35 });
    for (let r = 0; r < 3; r++) {
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 6.4, 42, 1, true), reelMat);
      reel.rotation.z = Math.PI / 2; // 軸を x に
      const holder = new THREE.Group();
      holder.position.set((r - 1) * 7.2, 0, -3.1);
      holder.add(reel);
      this.group.add(holder);
      this.reels.push(reel);
      if (r > 0) {
        const div = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.4, 0.6), gold);
        div.position.set((r - 1.5) * 7.2, 0, 0);
        this.group.add(div);
      }
    }
    // 当たりライン
    const line = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.3, 0.2), toneMapped: false }));
    line.position.z = 0.1;
    this.group.add(line);
    // 上の看板
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }));
    sign.position.set(0, 9.2, -0.4);
    this.group.add(sign);
    // 枠の電球
    const pts: THREE.Vector3[] = [];
    for (let x = -12.6; x <= 12.6; x += 1.8) pts.push(new THREE.Vector3(x, 6.2, 0.5), new THREE.Vector3(x, -6.2, 0.5));
    for (let y = -4.4; y <= 4.4; y += 1.8) pts.push(new THREE.Vector3(-13.3, y, 0.5), new THREE.Vector3(13.3, y, 0.5));
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, this.bulbColor.set('#fff'));
    });
    this.group.add(this.bulbs);
    this.group.position.copy(SLOT_POS);
  }

  /** 図柄 sym が正面（当たりライン）に来るリールの角度 */
  private targetAngle(sym: SlotSymbol, current: number) {
    const i = SLOT_SYMBOLS.indexOf(sym);
    // 図柄 i が当たりラインに来る角度（実機のスクリーンショットで合わせた）
    const base = (i - 1.5) * STEP + Math.PI / 2;
    let a = base;
    while (a < current + Math.PI * 2) a += Math.PI * 2;
    return a;
  }

  update(g: Game, t: number, dt: number) {
    const md = g.mode;
    const active = md.m === 'slot' && md.jackpot;
    for (let r = 0; r < 3; r++) {
      if (active) {
        if (md.spin !== this.lastSpin && r === 0) this.lastSpin = md.spin;
        if (md.t < STOPS[r]) {
          this.speeds[r] = Math.min(22, this.speeds[r] + dt * 40);
          this.angles[r] += this.speeds[r] * dt;
        } else {
          // 止まる: 目標の図柄へ減速して少し跳ね返る
          const target = this.targetAngle(md.reels[r], this.angles[r] - Math.PI * 2);
          const k = Math.min(1, (md.t - STOPS[r]) * 8);
          if (this.speeds[r] > 0) {
            this.speeds[r] = 0;
            this.angles[r] = target - STEP * 0.6;
          }
          const bounce = Math.sin(k * Math.PI) * 0.08 * (1 - k);
          this.angles[r] = this.angles[r] + (target - this.angles[r]) * Math.min(1, dt * 14) + bounce * 0;
        }
      } else {
        this.speeds[r] = 0;
        this.lastSpin = -1;
      }
      this.reels[r].rotation.x = this.angles[r];
    }
    // 電球
    const n = this.bulbs.count;
    for (let i = 0; i < n; i++) {
      const on = active ? (Math.floor(t * 14) + i) % 3 === 0 : (Math.floor(t * 3) + i) % 6 === 0;
      if (active && md.t > STOPS[2]) this.bulbColor.setHSL((t * 2 + i * 0.05) % 1, 1, 0.55).multiplyScalar(3);
      else this.bulbColor.setRGB(on ? 3 : 0.6, on ? 2.2 : 0.4, on ? 0.8 : 0.15);
      this.bulbs.setColorAt(i, this.bulbColor);
    }
    this.bulbs.instanceColor!.needsUpdate = true;
  }
}
