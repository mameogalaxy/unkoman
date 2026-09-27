// 筐体の上に乗る竜の像と、ホッパーの竜の頭。外部モデルが使えないのでプリミティブから組み立てる（仮置き）。
import * as THREE from 'three';
import { canvas, normalFromHeight, tex } from './canvasKit.ts';

type V = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 太さが変わるチューブ */
export function taperedTube(curve: THREE.Curve<V>, radius: (t: number) => number, seg = 40, radial = 12, flat = 1) {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, p);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a) * flat;
      n.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      pos.push(p.x + (frames.normals[i].x * c + frames.binormals[i].x * s) * r,
        p.y + (frames.normals[i].y * c + frames.binormals[i].y * s) * r,
        p.z + (frames.normals[i].z * c + frames.binormals[i].z * s) * r);
      nor.push(n.x, n.y, n.z);
      uv.push(t * 6, j / radial);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const curve = (...pts: V[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

let scaleNormal: THREE.Texture | null = null;
function scales() {
  if (scaleNormal) return scaleNormal;
  const S = 128;
  const { cv, ctx } = canvas(S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const r = S / 8;
  for (let row = -1; row < 9; row++) {
    for (let col = -1; col < 9; col++) {
      const x = col * r * 2 + (row % 2) * r, y = row * r * 1.4;
      const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r * 1.1);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.8, '#666');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.05, 0, Math.PI);
      ctx.fill();
    }
  }
  scaleNormal = tex(normalFromHeight(cv, 3), false, true);
  return scaleNormal;
}

export interface DragonColors {
  body: string;
  belly: string;
  wing: string;
  eye: string;
}

function materials(c: DragonColors, envMap: THREE.Texture | null) {
  const sn = scales();
  return {
    body: new THREE.MeshStandardMaterial({ color: c.body, metalness: 0.55, roughness: 0.38, normalMap: sn, normalScale: new THREE.Vector2(0.8, 0.8), envMap }),
    belly: new THREE.MeshStandardMaterial({ color: c.belly, metalness: 0.9, roughness: 0.25, envMap }),
    gold: new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.2, envMap }),
    wing: new THREE.MeshStandardMaterial({ color: c.wing, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide, envMap, envMapIntensity: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ color: '#000', emissive: c.eye, emissiveIntensity: 4 }),
  };
}

type Mats = ReturnType<typeof materials>;

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  return o;
}

/** 竜の頭（+z を向く）。jaw は口の開き（ラジアン） */
function head(m: Mats, jaw = 0.45) {
  const g = new THREE.Group();
  // 頭蓋
  const skull = mesh(new THREE.SphereGeometry(1, 16, 12), m.body);
  skull.scale.set(1.5, 1.25, 1.8);
  g.add(skull);
  // 上あご（鼻先へ細くなる）
  const snout = mesh(taperedTube(curve(v(0, 0.2, 0.8), v(0, 0.1, 2.4), v(0, -0.1, 3.8)), (t) => 1.05 - t * 0.55, 10, 12, 0.7), m.body);
  g.add(snout);
  // 下あご
  const jawG = new THREE.Group();
  jawG.position.set(0, -0.6, 0.4);
  jawG.rotation.x = jaw;
  jawG.add(mesh(taperedTube(curve(v(0, 0, 0), v(0, -0.2, 1.6), v(0, -0.2, 3.0)), (t) => 0.8 - t * 0.5, 8, 10, 0.55), m.body));
  // 牙
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.ConeGeometry(0.14, 0.7, 6), m.gold);
    f.position.set(s * 0.35, 0.35, 2.6);
    jawG.add(f);
    const f2 = mesh(new THREE.ConeGeometry(0.14, 0.7, 6), m.gold);
    f2.position.set(s * 0.4, -0.55, 3.2);
    f2.rotation.x = Math.PI;
    g.add(f2);
  }
  g.add(jawG);
  // 角（後ろへ反る）と頬のひれ
  for (const s of [-1, 1]) {
    g.add(mesh(taperedTube(curve(v(s * 0.7, 0.9, -0.3), v(s * 1.2, 1.9, -1.6), v(s * 1.3, 2.3, -3.4), v(s * 1.0, 3.2, -4.6)), (t) => 0.42 * (1 - t) + 0.03, 12, 8), m.gold));
    g.add(mesh(taperedTube(curve(v(s * 1.2, -0.2, -0.2), v(s * 2.0, 0.1, -1.1), v(s * 2.6, 0.6, -1.9)), (t) => 0.3 * (1 - t) + 0.02, 8, 6), m.gold));
    const eye = mesh(new THREE.SphereGeometry(0.22, 10, 8), m.eye, false);
    eye.position.set(s * 0.85, 0.45, 1.1);
    eye.scale.set(1, 0.6, 1.3);
    g.add(eye);
    // 眉の張り出し
    const brow = mesh(new THREE.ConeGeometry(0.3, 1.2, 6), m.gold);
    brow.position.set(s * 0.8, 0.85, 0.9);
    brow.rotation.set(-1.2, 0, s * 0.3);
    g.add(brow);
  }
  // 額の宝玉
  const gem = mesh(new THREE.OctahedronGeometry(0.35), m.eye, false);
  gem.position.set(0, 1.1, 0.8);
  g.add(gem);
  return g;
}

/** 翼。side = 1 で右翼 */
function wing(m: Mats, side: number) {
  const g = new THREE.Group();
  const s = side;
  const shoulder = v(s * 2.2, 16.5, -1.5);
  const elbow = v(s * 9, 24, -5);
  const wrist = v(s * 15, 27.5, -3.5);
  const tips = [v(s * 25, 25, -7), v(s * 24.5, 17, -9), v(s * 20, 10.5, -8), v(s * 13, 8.5, -5.5)];
  const hip = v(s * 2.4, 9.5, -3);
  // 骨
  g.add(mesh(taperedTube(curve(shoulder, v(s * 5, 21, -3.5), elbow), (t) => 0.9 - t * 0.3, 12, 8), m.body));
  g.add(mesh(taperedTube(curve(elbow, wrist), (t) => 0.6 - t * 0.2, 8, 8), m.body));
  const claw = mesh(new THREE.ConeGeometry(0.35, 1.8, 6), m.gold);
  claw.position.copy(wrist).add(v(s * 0.3, 1, 0));
  claw.rotation.z = -s * 0.4;
  g.add(claw);
  for (const tip of tips) {
    const mid = wrist.clone().lerp(tip, 0.5).add(v(0, 0.8, -0.8));
    g.add(mesh(taperedTube(curve(wrist, mid, tip), (t) => 0.38 * (1 - t) + 0.05, 10, 6), m.gold));
  }
  // 翼膜（手首からの扇 + 指の間のたるみ）
  const outline: V[] = [];
  outline.push(elbow);
  for (let i = 0; i < tips.length; i++) {
    outline.push(tips[i]);
    const next = i + 1 < tips.length ? tips[i + 1] : hip;
    const sag = tips[i].clone().lerp(next, 0.5).lerp(wrist, 0.22);
    outline.push(sag);
  }
  outline.push(hip);
  const pos: number[] = [];
  const fan = (a: V, b: V, c: V) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < outline.length - 1; i++) fan(wrist, outline[i], outline[i + 1]);
  fan(shoulder, elbow, wrist);
  fan(shoulder, wrist, hip);
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mg.computeVertexNormals();
  g.add(mesh(mg, m.wing));
  return g;
}

/** 後ろ足で立ち上がり、翼を広げた竜。高さ約32（cm）、+z を向く */
export function dragonStatue(colors: DragonColors, envMap: THREE.Texture | null) {
  const m = materials(colors, envMap);
  const g = new THREE.Group();
  // 背骨（尾の先 → 腰 → 胸 → 首 → 頭の付け根）
  const spinePts = [v(9, 0.6, -6), v(6, 0.8, -11), v(0, 1.5, -10), v(-1, 4, -6), v(0, 8, -3), v(0, 14, -0.5), v(0, 19, 1), v(0, 23.5, 0.5), v(0, 26.5, 2.5), v(0, 27.5, 5)];
  const spine = curve(...spinePts);
  const rad = (t: number) => {
    if (t < 0.35) return 0.25 + (t / 0.35) * 2.6; // 尾
    if (t < 0.62) return 2.85 + Math.sin(((t - 0.35) / 0.27) * Math.PI) * 0.9; // 胴
    return 2.85 - ((t - 0.62) / 0.38) * 1.6; // 首
  };
  g.add(mesh(taperedTube(spine, rad, 64, 14), m.body));
  // 腹の金の板
  g.add(mesh(taperedTube(curve(v(0, 7, -0.4), v(0, 13, 2.8), v(0, 19, 3.2), v(0, 23, 2.6)), (t) => 1.6 - t * 0.5, 16, 10, 0.5), m.belly));
  // 背びれ
  for (let i = 0; i < 16; i++) {
    const t = 0.18 + i * 0.048;
    const p = spine.getPointAt(t);
    const tan = spine.getTangentAt(t);
    const back = v(0, 0, -1).addScaledVector(tan, -tan.z).normalize();
    const cone = mesh(new THREE.ConeGeometry(0.35 + rad(t) * 0.12, 0.8 + rad(t) * 0.45, 5), m.gold);
    cone.position.copy(p).addScaledVector(back, rad(t) * 0.9);
    cone.quaternion.setFromUnitVectors(v(0, 1, 0), back.clone().add(v(0, 0.6, 0)).normalize());
    g.add(cone);
  }
  // 頭
  const h = head(m);
  h.position.set(0, 27.8, 5.2);
  h.rotation.x = 0.35;
  h.scale.setScalar(1.25);
  g.add(h);
  // 翼
  g.add(wing(m, 1), wing(m, -1));
  // 後ろ足
  for (const s of [-1, 1]) {
    g.add(mesh(taperedTube(curve(v(s * 2, 7.5, -3), v(s * 3.6, 5, 0.5), v(s * 3.2, 2.8, -1.2), v(s * 3.2, 0.6, 1)), (t) => 1.9 - t * 1.3, 16, 10), m.body));
    for (let k = -1; k <= 1; k++) {
      const c = mesh(new THREE.ConeGeometry(0.28, 1.4, 6), m.gold);
      c.position.set(s * 3.2 + k * 0.6, 0.4, 2);
      c.rotation.x = Math.PI / 2;
      g.add(c);
    }
    // 前足（胸の前で爪を構える）
    g.add(mesh(taperedTube(curve(v(s * 2.2, 17, 1.5), v(s * 3.8, 14, 4), v(s * 2.8, 13.2, 6.6)), (t) => 1.0 - t * 0.55, 12, 8), m.body));
    for (let k = -1; k <= 1; k++) {
      const c = mesh(new THREE.ConeGeometry(0.2, 1.1, 6), m.gold);
      c.position.set(s * 2.8 + k * 0.4, 13, 7.3);
      c.rotation.x = Math.PI / 2 + 0.5;
      g.add(c);
    }
  }
  return g;
}

/** ホッパー用の竜の頭（口からメダルを吐く）。+x を向く */
export function hopperHead(envMap: THREE.Texture | null) {
  const m = materials({ body: '#1f6b5a', belly: '#d8a640', wing: '#8a1d1d', eye: '#ff3b1a' }, envMap);
  const h = head(m, 0.7);
  h.rotation.y = Math.PI / 2;
  return h;
}
