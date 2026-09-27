// 筐体上部の巨大ルーレット（14マス）。盤面はコードで描き、縁の電球は InstancedMesh で光らせる。
import * as THREE from 'three';
import { canvas, tex } from './canvasKit.ts';
import { drawDragon } from './medalTexture.ts';

export interface WheelCell {
  medals: number;
  /** 竜マーク付き = 止まると連チャン */
  dragon: boolean;
}

// 500/300/200 が各2マス（竜マーク）、100 が6マス、50 が2マス
export const WHEEL_CELLS: WheelCell[] = [
  500, 100, 50, 300, 100, 200, 100, 500, 100, 50, 300, 100, 200, 100,
].map((m) => ({ medals: m, dragon: m >= 200 }));

const CELL_STYLE: Record<number, [string, string]> = {
  500: ['#c0182a', '#5a0710'],
  300: ['#7b2bb8', '#2c0a4a'],
  200: ['#d8671a', '#5e2505'],
  100: ['#1d5fc0', '#08214d'],
  50: ['#2c8a4a', '#0b3016'],
};

function faceTexture() {
  const S = 1024;
  const { cv, ctx } = canvas(S);
  const c = S / 2;
  const n = WHEEL_CELLS.length;
  const step = (Math.PI * 2) / n;
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 2 - step / 2); // 0番のマスが真上
  WHEEL_CELLS.forEach((cell, i) => {
    const [a, b] = CELL_STYLE[cell.medals];
    const g = ctx.createRadialGradient(0, 0, c * 0.2, 0, 0, c);
    g.addColorStop(0, b);
    g.addColorStop(0.75, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, c * 0.98, i * step, (i + 1) * step);
    ctx.closePath();
    ctx.fill();
    // 仕切りの金線
    ctx.strokeStyle = '#f3cf72';
    ctx.lineWidth = 7;
    ctx.stroke();
  });
  // 数字と竜マーク
  WHEEL_CELLS.forEach((cell, i) => {
    ctx.save();
    ctx.rotate((i + 0.5) * step);
    ctx.translate(c * 0.7, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#ffe9a8';
    ctx.strokeStyle = '#3a1a00';
    ctx.lineWidth = 7;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${cell.medals >= 100 ? 62 : 74}px Cinzel, Georgia, serif`;
    ctx.strokeText(String(cell.medals), 0, 0);
    ctx.fillText(String(cell.medals), 0, 0);
    ctx.font = '700 22px Cinzel, Georgia, serif';
    ctx.fillText('MEDALS', 0, 44);
    if (cell.dragon) {
      // 竜マーク（メダルの刻印を流用）
      ctx.save();
      ctx.translate(-42, -140);
      const k = 84 / 256;
      ctx.scale(k, k);
      ctx.globalAlpha = 0.95;
      drawDragon(ctx, 256);
      ctx.restore();
    }
    ctx.restore();
  });
  // 内側の輪
  ctx.beginPath();
  ctx.arc(0, 0, c * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#1b0d05';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#f3cf72';
  ctx.stroke();
  return tex(cv, true);
}

export class GiantWheel {
  readonly group = new THREE.Group();
  /** 回転する盤面 */
  readonly disc = new THREE.Group();
  private bulbs: THREE.InstancedMesh;
  private bulbCount = 28;
  private color = new THREE.Color();
  angle = 0;

  constructor(readonly radius: number, envMap: THREE.Texture | null) {
    const R = radius;
    const gold = new THREE.MeshStandardMaterial({ color: '#e7b650', metalness: 1, roughness: 0.18, envMap });
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 64),
      new THREE.MeshStandardMaterial({ map: faceTexture(), metalness: 0.25, roughness: 0.3, envMap, emissive: '#ffffff', emissiveIntensity: 0.18 }),
    );
    (face.material as THREE.MeshStandardMaterial).emissiveMap = (face.material as THREE.MeshStandardMaterial).map;
    this.disc.add(face);
    // 中心の金のドームと宝玉
    const hub = new THREE.Mesh(new THREE.SphereGeometry(R * 0.28, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    hub.rotation.x = Math.PI / 2;
    hub.scale.set(1, 0.35, 1);
    this.disc.add(hub);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.09, 1),
      new THREE.MeshStandardMaterial({ color: '#ff2a4a', metalness: 0.2, roughness: 0.05, emissive: '#ff1030', emissiveIntensity: 1.5, envMap }));
    gem.position.z = R * 0.1;
    gem.scale.z = 0.6;
    this.disc.add(gem);
    this.group.add(this.disc);

    // 外周の金の縁（回らない）
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, R * 0.055, 12, 96), gold);
    this.group.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R * 1.16, R * 0.035, 10, 96), gold);
    rim2.position.z = -R * 0.03;
    this.group.add(rim2);
    // 電球
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(R * 0.032, 10, 8),
      new THREE.MeshBasicMaterial({ toneMapped: false }), this.bulbCount);
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.bulbCount; i++) {
      const a = (i / this.bulbCount) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * R * 1.09, Math.sin(a) * R * 1.09, R * 0.02);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, this.color.set(0xffffff));
    }
    this.group.add(this.bulbs);
    // 暗い背板（放射状の飾り）
    const back = new THREE.Mesh(new THREE.CircleGeometry(R * 1.3, 64),
      new THREE.MeshStandardMaterial({ color: '#2a1206', metalness: 0.4, roughness: 0.5, envMap }));
    back.position.z = -R * 0.06;
    this.group.add(back);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.ConeGeometry(R * 0.09, R * 0.45, 4), gold);
      ray.position.set(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35, -R * 0.05);
      ray.rotation.z = a - Math.PI / 2;
      ray.scale.z = 0.3;
      this.group.add(ray);
    }
    // 上の指針
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(R * 0.08, R * 0.22, 3), gold);
    ptr.position.set(0, R * 1.07, R * 0.08);
    ptr.rotation.z = Math.PI;
    this.group.add(ptr);
    const ptrGem = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.05), (gem.material as THREE.Material));
    ptrGem.position.set(0, R * 1.18, R * 0.1);
    this.group.add(ptrGem);
  }

  /** 電球の点滅（ステージ4で演出ごとにパターンを増やす） */
  update(t: number) {
    const n = this.bulbCount;
    for (let i = 0; i < n; i++) {
      const on = (Math.floor(t * 8) + i) % 4 === 0;
      const k = on ? 2.2 : 0.45;
      this.bulbs.setColorAt(i, this.color.setRGB(1.0 * k, 0.78 * k, 0.4 * k));
    }
    this.bulbs.instanceColor!.needsUpdate = true;
    this.disc.rotation.z = this.angle;
  }
}
