// 液晶の中の3Dダンジョンに出てくるキャラクターと小物。すべてプリミティブから組み立てたオリジナル。
// 大きさの単位はおおよそ m（主人公の身長 ≒ 1.1）。
import * as THREE from 'three';
import { dragonStatue, taperedTube } from '../render/dragon.ts';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const curve = (...p: V3[]) => new THREE.CatmullRomCurve3(p, false, 'centripetal');

let env: THREE.Texture | null = null;
export function setModelEnv(e: THREE.Texture | null) {
  env = e;
}

const matCache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}
const std = (key: string, p: THREE.MeshStandardMaterialParameters) => mat(key, () => new THREE.MeshStandardMaterial({ envMap: env, ...p })) as THREE.MeshStandardMaterial;

const M = {
  silver: () => std('silver', { color: '#dfe6f0', metalness: 0.95, roughness: 0.22 }),
  darkSilver: () => std('darkSilver', { color: '#8a94a6', metalness: 0.9, roughness: 0.35 }),
  gold: () => std('gold', { color: '#f0c050', metalness: 1, roughness: 0.2 }),
  skin: () => std('skin', { color: '#ffd2b0', roughness: 0.55, metalness: 0 }),
  hair: () => std('hair', { color: '#6a3a1a', roughness: 0.5 }),
  eye: () => std('eye', { color: '#1a0f1a', roughness: 0.2 }),
  eyeHi: () => mat('eyeHi', () => new THREE.MeshBasicMaterial({ color: '#ffffff' })),
  blush: () => mat('blush', () => new THREE.MeshBasicMaterial({ color: '#ff8a8a', transparent: true, opacity: 0.45 })),
  red: () => std('red', { color: '#d0242c', roughness: 0.6, side: THREE.DoubleSide }),
  plume: () => std('plume', { color: '#ff3a2a', roughness: 0.5 }),
  boot: () => std('boot', { color: '#5a3322', roughness: 0.7 }),
  blue: () => std('blue', { color: '#2d5fc8', metalness: 0.5, roughness: 0.3 }),
  blade: () => std('blade', { color: '#f4f8ff', metalness: 1, roughness: 0.08 }),
  wood: () => std('wood', { color: '#8a4a20', roughness: 0.6 }),
  stone: () => std('stone', { color: '#9a9080', roughness: 0.85, flatShading: true }),
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, pos?: [number, number, number], scale?: [number, number, number]) {
  const o = new THREE.Mesh(g, m);
  if (pos) o.position.set(...pos);
  if (scale) o.scale.set(...scale);
  parent?.add(o);
  return o;
}

/** 目（黒い楕円 + ハイライト）。+z を向く */
function eyePair(parent: THREE.Object3D, y: number, z: number, gap: number, r: number, color?: THREE.Material) {
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(r, 14, 10), color ?? M.eye(), parent, [s * gap, y, z], [0.8, 1.15, 0.5]);
    mesh(new THREE.SphereGeometry(r * 0.35, 8, 6), M.eyeHi(), e, [r * 0.25, r * 0.35, r * 0.7]);
  }
}

export interface Actor {
  root: THREE.Group;
  /** state: walk 0..1, attack 0..1（振り下ろしの進み）, hurt 0..1, dead 0..1 */
  update(t: number, s: ActorState): void;
}
export interface ActorState {
  walk?: number;
  attack?: number;
  hurt?: number;
  dead?: number;
}

// ---- 主人公 -------------------------------------------------------------------
export function makeHero(): Actor {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // 足
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.1, 0.34, 0);
    mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 10), M.darkSilver(), leg, [0, -0.12, 0]);
    mesh(new THREE.CapsuleGeometry(0.085, 0.08, 4, 10), M.boot(), leg, [0, -0.28, 0.03], [1, 1, 1.3]);
    body.add(leg);
    legs.push(leg);
  }
  // 胴（丸みのある鎧）
  const torsoPts = [v(0, 0, 0), v(0.2, 0.02, 0), v(0.23, 0.12, 0), v(0.2, 0.28, 0), v(0.15, 0.36, 0), v(0.0, 0.38, 0)].map((p) => new THREE.Vector2(p.x, p.y));
  mesh(new THREE.LatheGeometry(torsoPts, 20), M.silver(), body, [0, 0.33, 0], [1, 1, 0.85]);
  mesh(new THREE.TorusGeometry(0.205, 0.028, 8, 24), M.gold(), body, [0, 0.4, 0], [1, 0.85, 1]).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.035, 8, 6), M.gold(), body, [0, 0.52, 0.19]);
  // マント
  const capeGeo = new THREE.PlaneGeometry(0.5, 0.62, 6, 8);
  capeGeo.translate(0, -0.31, 0);
  const cape = mesh(capeGeo, M.red(), body, [0, 0.7, -0.17]);
  const capeBase = Float32Array.from(capeGeo.attributes.position.array);
  // 腕
  const armL = new THREE.Group();
  armL.position.set(-0.25, 0.64, 0);
  mesh(new THREE.CapsuleGeometry(0.065, 0.16, 4, 10), M.silver(), armL, [0, -0.12, 0]);
  // 盾
  const shield = new THREE.Group();
  shield.position.set(-0.06, -0.2, 0.1);
  shield.rotation.y = -0.35;
  mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24), M.blue(), shield).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 28), M.gold(), shield);
  mesh(new THREE.OctahedronGeometry(0.06), M.gold(), shield, [0, 0, 0.03], [1, 1.4, 0.4]);
  armL.add(shield);
  body.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.25, 0.64, 0);
  mesh(new THREE.CapsuleGeometry(0.065, 0.16, 4, 10), M.silver(), armR, [0, -0.12, 0]);
  const sword = new THREE.Group();
  sword.position.set(0, -0.26, 0.04);
  mesh(new THREE.BoxGeometry(0.05, 0.6, 0.012), M.blade(), sword, [0, 0.36, 0]);
  mesh(new THREE.ConeGeometry(0.025, 0.08, 4), M.blade(), sword, [0, 0.7, 0], [1, 1, 0.25]);
  mesh(new THREE.BoxGeometry(0.2, 0.035, 0.04), M.gold(), sword, [0, 0.05, 0]);
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), M.boot(), sword, [0, -0.02, 0]);
  mesh(new THREE.SphereGeometry(0.03, 8, 6), M.gold(), sword, [0, -0.08, 0]);
  sword.rotation.x = 1.3;
  armR.add(sword);
  body.add(armR);
  // 頭
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  mesh(new THREE.SphereGeometry(0.27, 24, 18), M.skin(), head);
  eyePair(head, -0.01, 0.235, 0.095, 0.045);
  for (const s of [-1, 1]) mesh(new THREE.CircleGeometry(0.04, 12), M.blush(), head, [s * 0.15, -0.08, 0.235]).rotation.y = s * 0.5;
  mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), M.eye(), head, [0, -0.1, 0.255]).rotation.z = Math.PI;
  // 前髪
  for (let i = -2; i <= 2; i++) mesh(new THREE.SphereGeometry(0.075, 10, 8), M.hair(), head, [i * 0.07, 0.12, 0.2 - Math.abs(i) * 0.03], [1, 0.8, 0.7]);
  // 兜
  mesh(new THREE.SphereGeometry(0.295, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), M.silver(), head, [0, 0.03, -0.01]);
  mesh(new THREE.TorusGeometry(0.29, 0.025, 8, 32), M.gold(), head, [0, 0.07, -0.01]).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.05, 0.12, 0.5), M.gold(), head, [0, 0.3, -0.02]);
  for (const s of [-1, 1]) {
    const wing = mesh(new THREE.ConeGeometry(0.06, 0.22, 4), M.gold(), head, [s * 0.3, 0.12, -0.02]);
    wing.rotation.z = -s * 1.1;
    wing.scale.z = 0.35;
  }
  // 羽根飾り
  const plume = mesh(taperedTube(curve(v(0, 0.33, 0.1), v(0, 0.52, -0.05), v(0, 0.5, -0.3), v(0, 0.32, -0.46)), (t) => 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)) + 0.01, 16, 8), M.plume(), head);
  body.add(head);

  const update = (t: number, s: ActorState) => {
    const walk = s.walk ?? 0;
    const ph = t * 11;
    const swing = Math.sin(ph) * 0.6 * walk;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    armL.rotation.x = -swing * 0.6;
    body.position.y = Math.abs(Math.sin(ph)) * 0.05 * walk + Math.sin(t * 2.5) * 0.008;
    // 攻撃: 振りかぶって振り下ろす
    const a = s.attack ?? 0;
    if (a > 0) {
      const k = a < 0.35 ? a / 0.35 : 1 - (a - 0.35) / 0.65;
      armR.rotation.x = a < 0.35 ? -2.4 * k : -2.4 + (1 - k) * 3.4;
      body.rotation.x = a < 0.35 ? -0.1 * k : 0.25 * k;
      root.position.z = 0;
      body.position.z = (a < 0.35 ? 0 : -0.3 * k);
    } else {
      armR.rotation.x = swing * 0.6;
      body.rotation.x = 0;
      body.position.z = 0;
    }
    const hurt = s.hurt ?? 0;
    body.rotation.z = hurt > 0 ? Math.sin(hurt * 30) * 0.12 * hurt : 0;
    head.rotation.z = Math.sin(t * 1.7) * 0.04;
    plume.rotation.x = Math.sin(t * 5) * 0.08 + walk * 0.15;
    // マントのはためき
    const pa = capeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const y = capeBase[i * 3 + 1];
      const x = capeBase[i * 3];
      const d = -y; // 0..0.62 下ほど揺れる
      pa.setZ(i, capeBase[i * 3 + 2] - d * (0.25 + walk * 0.35) - Math.sin(t * 6 + x * 6 + d * 5) * 0.03 * d * 3);
    }
    pa.needsUpdate = true;
    cape.geometry.computeVertexNormals();
  };
  return { root, update };
}

// ---- 敵 -----------------------------------------------------------------------
function hitFlash(root: THREE.Object3D, amount: number) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'emissive' in m && m.userData.flashable) m.emissiveIntensity = m.userData.baseEmissive + amount * 2.5;
  });
}
function flashable(m: THREE.MeshStandardMaterial, base = 0) {
  m.userData.flashable = true;
  m.userData.baseEmissive = base;
  m.emissive.set('#ffffff');
  m.emissiveIntensity = base;
  return m;
}

/** 弱: 宝石を飲み込んだスライム */
export function makeSlime(): Actor {
  const root = new THREE.Group();
  const bodyMat = flashable(new THREE.MeshStandardMaterial({ color: '#4ad86a', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.88, envMap: env, envMapIntensity: 1.4 }));
  bodyMat.emissive.set('#1a6a2a');
  bodyMat.userData.baseEmissive = 0.35;
  const g = new THREE.SphereGeometry(0.45, 32, 24);
  // 底を平らに、上をしずく型に
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    if (y < -0.12) y = -0.12 + (y + 0.12) * 0.15;
    const top = Math.max(0, y) / 0.45;
    p.setX(i, p.getX(i) * (1 - top * top * 0.35));
    p.setZ(i, p.getZ(i) * (1 - top * top * 0.35));
    p.setY(i, y + top * top * 0.1);
  }
  g.computeVertexNormals();
  const body = mesh(g, bodyMat, root, [0, 0.14, 0]);
  mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: '#ff4a8a', emissive: '#ff2a6a', emissiveIntensity: 1.5 }), body, [0, 0, 0]);
  eyePair(body, 0.12, 0.34, 0.12, 0.06);
  mesh(new THREE.SphereGeometry(0.08, 10, 8), M.eyeHi(), body, [-0.18, 0.3, 0.22], [1, 0.6, 0.5]);
  return {
    root,
    update(t, s) {
      const sq = Math.sin(t * 5) * 0.07;
      body.scale.set(1 + sq, 1 - sq, 1 + sq);
      body.position.y = 0.14 + Math.max(0, Math.sin(t * 2.5)) * 0.06;
      hitFlash(root, s.hurt ?? 0);
      const d = s.dead ?? 0;
      root.scale.setScalar(1 - d);
    },
  };
}

/** 中: コウモリの翼を持つ小悪魔の騎士 */
export function makeBatKnight(): Actor {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const purple = flashable(new THREE.MeshStandardMaterial({ color: '#7a3ab0', roughness: 0.4, metalness: 0.3, envMap: env }));
  mesh(new THREE.CapsuleGeometry(0.2, 0.25, 6, 14), purple, body, [0, 0.55, 0]);
  const head = mesh(new THREE.SphereGeometry(0.22, 18, 14), purple, body, [0, 0.98, 0.02]);
  eyePair(head, 0.02, 0.19, 0.08, 0.045, new THREE.MeshBasicMaterial({ color: '#ffe23a' }));
  for (const s of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.22, 8), M.gold(), head, [s * 0.12, 0.2, 0]);
    horn.rotation.z = -s * 0.5;
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.2, 4), purple, head, [s * 0.22, 0.02, 0]);
    ear.rotation.z = -s * 1.3;
  }
  // 翼
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.75, 0.35);
  wingShape.lineTo(0.62, 0.05);
  wingShape.lineTo(0.5, 0.12);
  wingShape.lineTo(0.42, -0.15);
  wingShape.lineTo(0.3, -0.05);
  wingShape.lineTo(0.18, -0.25);
  wingShape.closePath();
  const wingMat = new THREE.MeshStandardMaterial({ color: '#3a1458', roughness: 0.6, side: THREE.DoubleSide, envMap: env });
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.12, 0.7, -0.12);
    const wm = mesh(new THREE.ShapeGeometry(wingShape), wingMat, w);
    wm.scale.x = s;
    body.add(w);
    wings.push(w);
  }
  // 槍
  const spear = new THREE.Group();
  spear.position.set(0.3, 0.55, 0.1);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), M.wood(), spear);
  mesh(new THREE.ConeGeometry(0.06, 0.24, 4), M.blade(), spear, [0, 0.7, 0]);
  body.add(spear);
  return {
    root,
    update(t, s) {
      const f = Math.sin(t * 12) * 0.6;
      wings[0].rotation.y = -f;
      wings[1].rotation.y = f;
      body.position.y = 0.2 + Math.sin(t * 3) * 0.08;
      spear.rotation.x = (s.attack ?? 0) > 0 ? Math.sin((s.attack ?? 0) * Math.PI) * 1.2 : 0;
      hitFlash(root, s.hurt ?? 0);
      root.scale.setScalar(1 - (s.dead ?? 0));
    },
  };
}

/** 強: ルーンが光る岩の番人 */
export function makeGolem(): Actor {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rock = flashable(new THREE.MeshStandardMaterial({ color: '#9a8c7a', roughness: 0.9, flatShading: true, envMap: env, envMapIntensity: 0.4 }));
  const rune = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.0), toneMapped: false });
  const r = (rad: number, p: [number, number, number], s: [number, number, number], parent: THREE.Object3D = body) =>
    mesh(new THREE.DodecahedronGeometry(rad, 0), rock, parent, p, s);
  r(0.42, [0, 0.95, 0], [1.1, 1, 0.8]);
  r(0.3, [0, 0.45, 0], [1, 0.8, 0.8]);
  const head = r(0.2, [0, 1.45, 0.05], [1, 0.9, 0.9]);
  eyePair(head, 0.02, 0.17, 0.08, 0.035, rune);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.55, 1.15, 0);
    r(0.2, [0, -0.1, 0], [1, 1.2, 1], arm);
    r(0.24, [0, -0.5, 0.05], [1, 1.1, 1], arm);
    body.add(arm);
    arms.push(arm);
    r(0.18, [s * 0.2, 0.15, 0], [1, 1, 1]);
  }
  mesh(new THREE.BoxGeometry(0.05, 0.4, 0.02), rune, body, [0, 0.95, 0.34]);
  mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), rune, body, [0, 1.05, 0.34]);
  return {
    root,
    update(t, s) {
      body.rotation.z = Math.sin(t * 1.5) * 0.04;
      const a = s.attack ?? 0;
      arms[1].rotation.x = a > 0 ? -Math.sin(a * Math.PI) * 1.8 : Math.sin(t * 1.5) * 0.1;
      arms[0].rotation.x = -Math.sin(t * 1.5) * 0.1;
      rune.color.setRGB(0.4, 1.2 + Math.sin(t * 4) * 0.5, 1.6 + Math.sin(t * 4) * 0.5);
      hitFlash(root, s.hurt ?? 0);
      root.scale.setScalar(1 - (s.dead ?? 0));
    },
  };
}

/** ボス: 金貨の山に陣取る紫の竜 */
export function makeBoss(): Actor {
  const root = new THREE.Group();
  const d = dragonStatue({ body: '#6a2aa0', belly: '#e8b84e', wing: '#3a0e58', eye: '#ffde3a' }, env);
  d.scale.setScalar(0.12);
  d.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'emissive' in m && !m.userData.flashable) {
      if (m.emissiveIntensity > 1) return; // 目
      flashable(m);
    }
  });
  root.add(d);
  // 金貨の山
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12), M.gold(), 90);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 90; i++) {
    const a = i * 2.4, r = Math.sqrt(i / 90) * 1.6;
    const h = Math.max(0, 0.5 - r * 0.3) * Math.random();
    q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
    m4.compose(v(Math.cos(a) * r, h, Math.sin(a) * r + 0.4), q, v(1, 1, 1));
    coins.setMatrixAt(i, m4);
  }
  root.add(coins);
  return {
    root,
    update(t, s) {
      d.scale.setScalar(0.12 * (1 + Math.sin(t * 2) * 0.01));
      d.rotation.x = (s.attack ?? 0) > 0 ? Math.sin((s.attack ?? 0) * Math.PI) * 0.25 : 0;
      hitFlash(d, s.hurt ?? 0);
      d.position.y = -(s.dead ?? 0) * 3;
    },
  };
}

export function makeEnemy(kind: number): Actor {
  return kind === 0 ? makeSlime() : kind === 1 ? makeBatKnight() : kind === 2 ? makeGolem() : makeBoss();
}

// ---- 小物 -----------------------------------------------------------------------
export interface ChestActor {
  root: THREE.Group;
  setOpen(k: number): void;
}

export function makeChest(gold: boolean): ChestActor {
  const root = new THREE.Group();
  const wood = gold ? M.gold() : std('chestWood', { color: '#9a4f22', roughness: 0.55 });
  const band = gold ? std('chestBand', { color: '#c02a3a', metalness: 0.5, roughness: 0.3 }) : M.gold();
  mesh(new THREE.BoxGeometry(0.7, 0.4, 0.46), wood, root, [0, 0.2, 0]);
  for (const x of [-0.25, 0.25]) mesh(new THREE.BoxGeometry(0.06, 0.42, 0.48), band, root, [x, 0.2, 0]);
  const glow = mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.5, 1.2), toneMapped: false, transparent: true, opacity: 0 }), root, [0, 0.41, 0]);
  glow.rotation.x = -Math.PI / 2;
  const lid = new THREE.Group();
  lid.position.set(0, 0.4, -0.23);
  const lidMesh = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.7, 20, 1, false, 0, Math.PI), wood, lid, [0, 0, 0.23]);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.rotation.y = Math.PI / 2;
  for (const x of [-0.25, 0.25]) {
    const b = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 20, 1, false, 0, Math.PI), band, lid, [x, 0, 0.23]);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = Math.PI / 2;
  }
  mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), band, lid, [0, -0.02, 0.47]);
  root.add(lid);
  return {
    root,
    setOpen(k) {
      lid.rotation.x = -k * 1.9;
      (glow.material as THREE.MeshBasicMaterial).opacity = k;
    },
  };
}

/** マスの台座 */
let pedestalGeo: THREE.BufferGeometry | null = null;
export function makePedestal(kind: 'normal' | 'stairs' | 'start') {
  pedestalGeo ??= new THREE.CylinderGeometry(0.95, 1.05, 0.14, 28);
  const root = new THREE.Group();
  const top = kind === 'stairs' ? M.gold() : std('pedestal', { color: '#b8ad98', roughness: 0.7, metalness: 0.1 });
  mesh(pedestalGeo, top, root, [0, 0.07, 0]);
  const ring = mesh(new THREE.TorusGeometry(0.97, 0.03, 6, 40), M.gold(), root, [0, 0.14, 0]);
  ring.rotation.x = Math.PI / 2;
  return root;
}

/** フロアの出口（下り階段と光の柱） */
export function makeStairs(boss: boolean) {
  const root = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    mesh(new THREE.BoxGeometry(1.6 - i * 0.2, 0.1, 0.3), std('stair', { color: '#2a1a10', roughness: 0.8 }), root, [0, 0.1 - i * 0.12, -0.2 - i * 0.28]);
  }
  const beam = mesh(new THREE.CylinderGeometry(0.9, 0.9, 4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: boss ? new THREE.Color(2.5, 0.3, 0.3) : new THREE.Color(1.6, 1.4, 0.6), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    root, [0, 2, -0.5]);
  return { root, beam };
}
