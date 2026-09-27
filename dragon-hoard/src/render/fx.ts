// 演出: 金の火花（パーティクル）と、筐体のランプ（フードの電球列・ランプ管）の点灯パターン。
import * as THREE from 'three';
import { BACK_WALL, FIELD, SCREEN } from '../physics/layout.ts';
import { canvas, tex } from './canvasKit.ts';

// ---- 火花 -----------------------------------------------------------------------
export class Sparkles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private base: Float32Array;
  private next = 0;

  constructor(n = 500) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const { cv, ctx } = canvas(64);
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,240,200,0.8)');
    gr.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    // 十字の光条
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(30, 4, 4, 56);
    ctx.fillRect(4, 30, 56, 4);
    const mat = new THREE.PointsMaterial({
      size: 1.1, map: tex(cv, true), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  /** 位置 p から count 個はじけさせる */
  burst(p: THREE.Vector3, count: number, color: THREE.Color, speed = 25, up = 10) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, s = speed * (0.3 + Math.random() * 0.7);
      const r = Math.sqrt(1 - e * e);
      this.vel.set([Math.cos(a) * r * s, e * s + up, Math.sin(a) * r * s], i * 3);
      this.life[i] = 0.7 + Math.random() * 0.8;
      const c = color.clone().offsetHSL((Math.random() - 0.5) * 0.08, 0, 0).multiplyScalar(1.5 + Math.random() * 1.5);
      this.base.set([c.r, c.g, c.b], i * 3);
    }
  }

  update(dt: number) {
    const { pos, vel, life, col, base } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      life[i] -= dt;
      vel[i * 3 + 1] -= 60 * dt;
      const drag = Math.exp(-dt * 1.5);
      vel[i * 3] *= drag; vel[i * 3 + 1] *= drag; vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // きらめき（ちらつき）+ フェードアウト
      const k = Math.min(1, life[i] * 2) * (0.6 + 0.4 * Math.sin(life[i] * 40 + i));
      col[i * 3] = base[i * 3] * k;
      col[i * 3 + 1] = base[i * 3 + 1] * k;
      col[i * 3 + 2] = base[i * 3 + 2] * k;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

// ---- ランプ ------------------------------------------------------------------------
export type LampMode = 'idle' | 'battle' | 'boss' | 'fever';

export class Lamps {
  readonly bulbs: THREE.InstancedMesh;
  private count: number;
  private color = new THREE.Color();
  private flashT = 99;
  private flashColor = new THREE.Color(3, 1.2, 0.2);

  constructor(private tubes: THREE.MeshBasicMaterial) {
    // フードの外周に沿って電球を並べる（左の脚 → 上のアーチ → 右の脚）
    const W = FIELD.innerHalfWidth + 6 - 1.1;
    const top = SCREEN.bottomY + SCREEN.height;
    const pts: THREE.Vector3[] = [];
    const z = BACK_WALL.frontZ - 0.1;
    for (let y = 1; y < top + 3; y += 2.3) pts.push(new THREE.Vector3(-W, y, z));
    const arch = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-W, top + 3, z), new THREE.Vector3(0, top + 13.2, z), new THREE.Vector3(W, top + 3, z));
    for (let i = 0; i <= 18; i++) pts.push(arch.getPoint(i / 18));
    for (let y = top + 3 - 2.3; y > 0; y -= 2.3) pts.push(new THREE.Vector3(W, y, z));
    this.count = pts.length;
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), this.count);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, this.color.set(0xffffff));
    });
  }

  /** 一瞬全部を光らせる（チェッカー当たりなど） */
  flash(color: THREE.Color) {
    this.flashT = 0;
    this.flashColor.copy(color);
  }

  update(t: number, dt: number, mode: LampMode) {
    this.flashT += dt;
    const n = this.count;
    const c = this.color;
    for (let i = 0; i < n; i++) {
      if (this.flashT < 0.7) {
        const on = Math.floor(this.flashT * 14) % 2 === 0;
        c.copy(this.flashColor).multiplyScalar(on ? 1 : 0.2);
      } else if (mode === 'fever') {
        // 虹色の速い流れ
        c.setHSL(((i / n) * 2 - t * 1.5) % 1 + (((i / n) * 2 - t * 1.5) % 1 < 0 ? 1 : 0), 1, 0.55).multiplyScalar(3);
      } else if (mode === 'boss') {
        const on = Math.floor(t * 6) % 2 === i % 2;
        c.setRGB(on ? 2.6 : 0.4, on ? 0.2 : 0.05, on ? 1.2 : 0.3);
      } else if (mode === 'battle') {
        const k = 0.5 + 0.5 * Math.sin(t * 5 + i * 0.5);
        c.setRGB(0.6 + 2.2 * k, 0.15 + 0.4 * k, 0.1);
      } else {
        // 待機: 暖色の電球がゆっくり流れる
        const on = (Math.floor(t * 5) - i) % 5 === 0;
        c.setRGB(on ? 2.6 : 0.8, on ? 2.0 : 0.55, on ? 1.0 : 0.25);
      }
      this.bulbs.setColorAt(i, c);
    }
    this.bulbs.instanceColor!.needsUpdate = true;
    // ランプ管
    if (this.flashT < 0.7) this.tubes.color.copy(this.flashColor);
    else if (mode === 'fever') this.tubes.color.setHSL((t * 0.6) % 1, 1, 0.5).multiplyScalar(2.2);
    else if (mode === 'boss') this.tubes.color.setRGB(1.8, 0.1, 0.9).multiplyScalar(0.6 + 0.4 * Math.sin(t * 10));
    else if (mode === 'battle') this.tubes.color.setRGB(2.2, 0.35, 0.1).multiplyScalar(0.7 + 0.3 * Math.sin(t * 5));
    else this.tubes.color.setRGB(1.8, 0.7, 0.12).multiplyScalar(0.75 + 0.25 * Math.sin(t * 3));
  }
}
