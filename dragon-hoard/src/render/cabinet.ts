// 筐体。当たり判定と同じ寸法（src/physics/layout.ts）で描く。
// 1ステーション = フィールド + 液晶 + フード。周りに隣のステーションと中央の塔（大ルーレット・竜の像）を置く。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BACK_WALL, FIELD, HOPPER, LANES, PUSHER, SCREEN, SHOOTER, laneCenterX } from '../physics/layout.ts';
import { canvas, goldOnWood, panelMaterial, scroll, tex } from './canvasKit.ts';
import { dragonStatue, hopperHead } from './dragon.ts';
import { createMedalMaps } from './medalTexture.ts';
import { GiantWheel } from './wheel.ts';

/** 八角形の中心（中央の塔の位置） */
export const TOWER_CENTER = new THREE.Vector3(0, 0, -86); // 幅42のステーション8台が重ならない距離
export const WHEEL_POS = new THREE.Vector3(0, 76, -60); // 頭上のジャックポットスロットより上
export const WHEEL_RADIUS = 17;

export interface Cabinet {
  group: THREE.Group;
  pusher: THREE.Group;
  wheel: GiantWheel;
  /** 手前の発射台（yaw で左右を向く） */
  shooter: { pivot: THREE.Object3D; barrel: THREE.Object3D };
  /** 狙っている穴の照準リング */
  sight: THREE.Object3D;
  /** レーン上のランプ（チェッカー） */
  checkerLamps: THREE.MeshBasicMaterial[];
  /** 縁のオレンジのランプ管（点滅用） */
  lampTubes: THREE.MeshBasicMaterial;
}

interface Mats {
  chrome: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  hood: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  front: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshStandardMaterial;
  tube: THREE.MeshBasicMaterial;
}

function makeMats(envMap: THREE.Texture | null): Mats {
  // 床: 暗いブロンズに細かいヘアライン
  const f = canvas(256);
  f.ctx.fillStyle = '#6b4a22';
  f.ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    f.ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,220,160' : '30,15,0'},${Math.random() * 0.12})`;
    f.ctx.fillRect(0, Math.random() * 256, 256, 1);
  }
  const floorMap = tex(f.cv, true, true);
  floorMap.repeat.set(3, 3);

  // フード: 木目 + 唐草（UV は cm 座標そのままなので repeat で合わせる）
  const hoodMaps = goldOnWood(1024, 1024, { seed: 11, base: '#2c1409' });
  for (const t of [hoodMaps.map, hoodMaps.normalMap, hoodMaps.orm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 21, 1 / 21);
  }
  const hood = panelMaterial(hoodMaps, envMap);
  hood.envMapIntensity = 0.55;
  // レーンの後ろの金の板
  const panelMaps = goldOnWood(512, 128, { seed: 5, base: '#2a1408' });
  const panel = panelMaterial(panelMaps, envMap);
  // 前面の化粧板（ロゴ入り）
  const frontMaps = goldOnWood(1024, 256, {
    seed: 9,
    draw: (ctx, color) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 12, 1000, 232);
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 976, 208);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 92px Cinzel, Georgia, serif';
      ctx.fillText('DRAGON HOARD', 512, 132);
      ctx.lineWidth = 4;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(512 + s * 420, 128);
        ctx.scale(s, 1);
        scroll(ctx, 0, 0, 44, 0.2);
        ctx.restore();
      }
    },
  });
  const front = panelMaterial(frontMaps, envMap);
  // 城壁の石（焦げ茶）
  const st = canvas(256);
  st.ctx.fillStyle = '#5a2c14';
  st.ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 5; col++) {
      const x = col * 64 - (row % 2) * 32, y = row * 32;
      st.ctx.fillStyle = `hsl(20, 45%, ${18 + Math.random() * 10}%)`;
      st.ctx.fillRect(x + 2, y + 2, 60, 28);
    }
  }
  const stoneMap = tex(st.cv, true, true);
  stoneMap.repeat.set(0.25, 0.25);
  return {
    chrome: new THREE.MeshStandardMaterial({ color: '#f2f5fa', metalness: 1, roughness: 0.08, envMap }),
    gold: new THREE.MeshStandardMaterial({ color: '#e7b650', metalness: 1, roughness: 0.2, envMap }),
    floor: new THREE.MeshStandardMaterial({ map: floorMap, metalness: 0.85, roughness: 0.32, envMap, envMapIntensity: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: '#0b0705', roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#ffe9c8', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.1, envMap, envMapIntensity: 1.6, depthWrite: false,
    }),
    hood,
    panel,
    front,
    stone: new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.75, metalness: 0.05, envMap, envMapIntensity: 0.4 }),
    lacquer: new THREE.MeshStandardMaterial({ color: '#4a0a0e', metalness: 0.3, roughness: 0.35, envMap, envMapIntensity: 0.6 }),
    tube: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.7, 0.12), toneMapped: false }),
  };
}

function boxAt(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.receiveShadow = shadow;
  g.add(m);
  return m;
}

/** 画面を囲む逆U字のフード（上辺はアーチ） */
function hoodGeometry() {
  const W = FIELD.innerHalfWidth;
  const outerW = W + 6;
  const top = SCREEN.bottomY + SCREEN.height;
  const s = new THREE.Shape();
  s.moveTo(-outerW, -2);
  s.lineTo(-outerW, top + 3);
  s.quadraticCurveTo(0, top + 14, outerW, top + 3);
  s.lineTo(outerW, -2);
  s.lineTo(W + 0.4, -2);
  s.lineTo(W + 0.4, top + 0.3);
  s.lineTo(-W - 0.4, top + 0.3);
  s.lineTo(-W - 0.4, -2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 24 });
  return g;
}

/** 金のメダル型の紋章（メダルの刻印を大きくしたもの） */
function crest(envMap: THREE.Texture | null, r: number) {
  const maps = createMedalMaps(256);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.8, 48), [
    new THREE.MeshStandardMaterial({ color: '#e0ad4c', metalness: 1, roughness: 0.25, envMap }),
    new THREE.MeshStandardMaterial({ color: '#f0c060', metalness: 1, roughness: 1, map: maps.face.map, normalMap: maps.face.normalMap, roughnessMap: maps.face.roughnessMap, envMap }),
    new THREE.MeshStandardMaterial({ color: '#e0ad4c', metalness: 1, roughness: 0.3, envMap }),
  ]);
  m.rotation.x = Math.PI / 2;
  return m;
}

/** 1ステーションぶんの静的な飾り（隣のステーションにも使い回す） */
function stationShell(m: Mats, screenMat: THREE.Material, envMap: THREE.Texture | null, main: boolean) {
  const g = new THREE.Group();
  const W = FIELD.innerHalfWidth;

  // 床（奥：全幅、手前：落とし穴ぶん狭い）
  const rearLen = FIELD.gutterDepthZ - FIELD.backZ;
  boxAt(g, W * 2, 2, rearLen, m.floor, 0, -1, FIELD.backZ + rearLen / 2);
  const frontLen = FIELD.frontZ - FIELD.gutterDepthZ;
  boxAt(g, (W - FIELD.gutterWidth) * 2, 2, frontLen, m.floor, 0, -1, FIELD.gutterDepthZ + frontLen / 2);
  boxAt(g, (W - FIELD.gutterWidth) * 2, 0.4, 0.5, m.gold, 0, -0.15, FIELD.frontZ - 0.25);
  for (const s of [-1, 1]) {
    boxAt(g, FIELD.gutterWidth, 0.2, frontLen, m.dark, s * (W - FIELD.gutterWidth / 2), -6, FIELD.gutterDepthZ + frontLen / 2);
    boxAt(g, 0.3, 2.2, frontLen, m.gold, s * (W - FIELD.gutterWidth - 0.15), -1, FIELD.gutterDepthZ + frontLen / 2);
  }
  // 受け皿と前面の化粧板
  boxAt(g, W * 2 + 12, 0.4, 9, m.dark, 0, -9, 5);
  const fp = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 12, 8, 1), [m.lacquer, m.lacquer, m.gold, m.lacquer, m.front, m.lacquer]);
  fp.position.set(0, -5, 9.5);
  g.add(fp);
  boxAt(g, W * 2 + 13, 0.8, 1.6, m.gold, 0, -0.6, 9.6);
  // 手前の台（肘置き）
  boxAt(g, W * 2 + 12, 1.2, 10, m.lacquer, 0, -1.4, 4.2);

  // ガラスの側板とクロームの枠
  const wallLen = FIELD.frontZ - FIELD.backZ;
  for (const s of [-1, 1]) {
    const gl = boxAt(g, 0.25, 15, wallLen, m.glass, s * (W + 0.15), 6.5, FIELD.backZ + wallLen / 2, false);
    gl.renderOrder = 10;
    boxAt(g, 0.7, 0.7, 27, m.chrome, s * (W + 0.4), 14, -13.5);
    boxAt(g, 0.7, 15, 0.7, m.chrome, s * (W + 0.4), 6.5, FIELD.frontZ - 0.35);
    // 城壁（ガラスの外）
    const cw = 5;
    const cx = s * (W + 0.8 + cw / 2);
    boxAt(g, cw, 12, 26, m.stone, cx, 5, -14);
    for (let k = 0; k < 6; k++) boxAt(g, cw, 2, 2.4, m.stone, cx, 12, -26 + k * 4.6);
    boxAt(g, cw + 0.4, 0.5, 26.4, m.gold, cx, 11.1, -14);
  }

  // 奥壁: レーンの後ろの金の板（上段テーブルのすぐ上から画面の下まで）
  const by = PUSHER.height + BACK_WALL.gap;
  boxAt(g, W * 2, SCREEN.bottomY - by, 1, m.panel, 0, by + (SCREEN.bottomY - by) / 2, BACK_WALL.frontZ - 0.5);
  // レーンの仕切り（銀の指）
  const lw = (W * 2) / LANES.count;
  const depth = LANES.frontZ - BACK_WALL.frontZ;
  const fh = LANES.topY - LANES.bottomY;
  for (let k = 1; k < LANES.count; k++) {
    const f = boxAt(g, LANES.fingerThickness, fh, depth, m.chrome, -W + lw * k, LANES.bottomY + fh / 2, BACK_WALL.frontZ + depth / 2);
    f.castShadow = true;
    // 指先の丸み
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(LANES.fingerThickness / 2, LANES.fingerThickness / 2, depth, 10), m.chrome);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(-W + lw * k, LANES.bottomY, BACK_WALL.frontZ + depth / 2);
    g.add(tip);
  }
  // 穴の下のガラス板、穴の下辺（金）、穴の上の横木（金）
  const lowH = LANES.holeBottomY - (LANES.bottomY + 0.6);
  const lg = boxAt(g, W * 2, lowH, 0.16, m.glass, 0, LANES.bottomY + 0.6 + lowH / 2, LANES.frontZ + 0.08, false);
  lg.renderOrder = 11;
  boxAt(g, W * 2, 0.28, 0.5, m.gold, 0, LANES.holeBottomY - 0.14, LANES.frontZ + 0.1);
  boxAt(g, W * 2, 0.6, 1.3, m.gold, 0, LANES.topY + 0.3, LANES.frontZ - 0.3);
  // 穴のふち（銀の枠）
  for (let k = 0; k < LANES.count; k++) {
    const x = laneCenterX(k);
    const hw = lw / 2 - LANES.fingerThickness / 2;
    const hh = LANES.topY - LANES.holeBottomY;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 4), m.chrome);
    frame.rotation.z = Math.PI / 4;
    frame.scale.set(hw * Math.SQRT2 * 0.98, hh * Math.SQRT2 * 0.5 * 0.98, 1);
    frame.position.set(x, (LANES.holeBottomY + LANES.topY) / 2, LANES.frontZ + 0.05);
    g.add(frame);
  }
  // 奥壁の上段より下（プッシャーが出入りする口の上の縁）
  boxAt(g, W * 2, 0.6, 0.8, m.chrome, 0, by + 0.3, BACK_WALL.frontZ + 0.2);

  // 液晶
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), screenMat);
  scr.position.set(0, SCREEN.bottomY + SCREEN.height / 2, SCREEN.z + 0.04);
  g.add(scr);
  // 液晶の表面ガラス（映り込み）
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height),
    new THREE.MeshStandardMaterial({ color: '#000', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.18, envMap, envMapIntensity: 1.2, depthWrite: false }));
  sg.position.copy(scr.position).add(new THREE.Vector3(0, 0, 0.08));
  g.add(sg);
  // フード
  const hood = new THREE.Mesh(hoodGeometry(), m.hood);
  hood.position.set(0, 0, BACK_WALL.frontZ - 2.4); // 前面が液晶とほぼ同じ面になるように
  hood.receiveShadow = true;
  g.add(hood);
  // フード上の紋章と金の縁
  const top = SCREEN.bottomY + SCREEN.height;
  const cr = crest(envMap, 4.2);
  cr.position.set(0, top + 6.2, BACK_WALL.frontZ + 1.4);
  g.add(cr);
  boxAt(g, SCREEN.width + 2.1, 0.7, 0.6, m.gold, 0, top + 0.45, BACK_WALL.frontZ + 0.3);
  for (const s of [-1, 1]) boxAt(g, 0.6, SCREEN.height + 0.8, 0.6, m.gold, s * (SCREEN.width / 2 + 0.75), SCREEN.bottomY + SCREEN.height / 2, BACK_WALL.frontZ + 0.3);

  // 縁のオレンジのランプ管（ステーションの境目から塔へ）
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * (W + 6.5), 16, -8);
    const b = new THREE.Vector3(s * (W + 3), 50, -38);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, a.distanceTo(b), 10), m.tube);
    tube.position.copy(a).lerp(b, 0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(tube);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 24, 12), m.gold);
    post.position.set(s * (W + 6.5), 0, 6);
    g.add(post);
  }

  // 上段テーブル（隣のステーションは静止した飾り）
  if (!main) {
    boxAt(g, W * 2, PUSHER.height, 12, m.chrome, 0, PUSHER.height / 2, (PUSHER.frontMinZ + PUSHER.frontMaxZ) / 2 - 6);
  }
  return g;
}

function pusherMesh(m: Mats) {
  const W = FIELD.innerHalfWidth;
  const pusher = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.04, PUSHER.height, PUSHER.depth), m.chrome);
  body.position.set(0, PUSHER.height / 2, -PUSHER.depth / 2);
  body.receiveShadow = true;
  body.castShadow = true;
  pusher.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.04, 0.02, PUSHER.depth), m.floor);
  top.position.set(0, PUSHER.height + 0.011, -PUSHER.depth / 2);
  top.receiveShadow = true;
  pusher.add(top);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.02, 0.5, 0.32), m.gold);
  lip.position.set(0, PUSHER.height - 0.25 + 0.02, -0.15);
  pusher.add(lip);
  return pusher;
}

/** 中央の塔: 八角柱の台座、大ルーレット、左右の竜の像 */
function tower(m: Mats, envMap: THREE.Texture | null) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 44, 8), m.lacquer);
  base.position.set(TOWER_CENTER.x, 22, TOWER_CENTER.z);
  base.rotation.y = Math.PI / 8;
  g.add(base);
  for (const y of [8, 30, 44]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(20.6, 20.6, 1.2, 8), m.gold);
    band.position.set(TOWER_CENTER.x, y, TOWER_CENTER.z);
    band.rotation.y = Math.PI / 8;
    g.add(band);
  }
  const wheel = new GiantWheel(WHEEL_RADIUS, envMap);
  wheel.group.position.copy(WHEEL_POS);
  g.add(wheel.group);
  // ルーレットの支柱
  const col = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, WHEEL_POS.y - 44, 12), m.gold);
  col.position.set(WHEEL_POS.x, 44 + (WHEEL_POS.y - 44) / 2, WHEEL_POS.z - 3);
  g.add(col);
  const d1 = dragonStatue({ body: '#1f7a62', belly: '#d8a640', wing: '#7a1f24', eye: '#ffcf30' }, envMap);
  d1.position.set(-27, 44, WHEEL_POS.z - 6);
  d1.rotation.y = 0.55;
  d1.scale.setScalar(0.95);
  const d2 = dragonStatue({ body: '#a3202a', belly: '#e4b44e', wing: '#1f5a7a', eye: '#40f0ff' }, envMap);
  d2.position.set(27, 44, WHEEL_POS.z - 6);
  d2.rotation.y = -0.55;
  d2.scale.setScalar(0.95);
  g.add(d1, d2);
  return { group: g, wheel };
}

/**
 * 動かない飾りを材質ごとに1つのメッシュへまとめる（スマホのドローコール削減）。
 * exclude に入れたオブジェクト（とその子）は触らない。
 */
function bakeStatic(root: THREE.Object3D, exclude: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (exclude.has(o)) return;
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !Array.isArray(o.material)) {
      let g = (o.geometry as THREE.BufferGeometry).clone();
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      const list = buckets.get(o.material) ?? [];
      list.push(g);
      buckets.set(o.material, list);
      victims.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  for (const v of victims) v.removeFromParent();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.applyMatrix4(inv);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

export function buildCabinet(envMap: THREE.Texture | null, screenTex: THREE.Texture): Cabinet {
  const m = makeMats(envMap);
  const group = new THREE.Group();
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  screenMat.color.setScalar(1.05);
  group.add(stationShell(m, screenMat, envMap, true));

  // 隣のステーション（中央の塔のまわりに 45° ずつ）。液晶は暗めの別素材
  const sideScreen = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, color: new THREE.Color(0.55, 0.55, 0.6) });
  for (const k of [-2, -1, 1, 2]) {
    const pivot = new THREE.Group();
    pivot.position.copy(TOWER_CENTER);
    pivot.rotation.y = (k * Math.PI) / 4;
    const shell = stationShell(m, sideScreen, envMap, false);
    shell.position.sub(TOWER_CENTER);
    pivot.add(shell);
    group.add(pivot);
  }

  const t = tower(m, envMap);
  group.add(t.group);
  // ここまでの静的な飾りをまとめる（ルーレットは回るので除外）
  bakeStatic(group, new Set([t.wheel.group]));

  const pusher = pusherMesh(m);
  group.add(pusher);

  // ホッパー（左奥の壁から竜の頭が突き出し、口からメダルを吐く）
  const head = hopperHead(envMap);
  head.scale.setScalar(1.3);
  head.position.set(HOPPER.x - 3.2, HOPPER.y + 0.5, HOPPER.z);
  head.rotation.z = -0.25; // 少し下を向いてフィールドへ吐く
  group.add(head);
  // 首の付け根の金の台座（城壁の上）
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.4, 3, 12), m.gold);
  neck.position.set(HOPPER.x - 5.2, HOPPER.y - 1.2, HOPPER.z);
  group.add(neck);

  // 手前中央の発射台（細い支柱の上の金の砲身）
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, SHOOTER.y + 1, 12), m.chrome);
  post.position.set(SHOOTER.x, (SHOOTER.y - 1) / 2 - 0.3, SHOOTER.z + 1.2);
  group.add(post);
  const pivot = new THREE.Group();
  pivot.position.set(SHOOTER.x, SHOOTER.y, SHOOTER.z + 1.2);
  const housing = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), m.gold);
  pivot.add(housing);
  const barrel = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 2.4, 20, 1, true), m.gold);
  tube.rotation.x = Math.PI / 2;
  tube.position.z = -1.2;
  (tube.material as THREE.Material).side = THREE.DoubleSide;
  barrel.add(tube);
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.12, 8, 24), m.chrome);
  muzzle.position.z = -2.4;
  barrel.add(muzzle);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), m.dark);
  bore.position.z = -1.0;
  barrel.add(bore);
  pivot.add(barrel);
  group.add(pivot);
  // 照準（狙っている穴を囲む光る枠）
  const sight = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.2), toneMapped: false }));
  sight.rotation.z = Math.PI / 4;
  const shw = (FIELD.innerHalfWidth * 2) / LANES.count / 2;
  sight.scale.set(shw * Math.SQRT2, (LANES.topY - LANES.holeBottomY) * Math.SQRT2 * 0.5, 1);
  sight.position.set(0, (LANES.holeBottomY + LANES.topY) / 2, LANES.frontZ + 0.25);
  group.add(sight);

  const checkerLamps: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < LANES.count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.08, 0.05), toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(laneCenterX(i), LANES.topY + 0.3, LANES.frontZ + 0.36);
    group.add(lamp);
    checkerLamps.push(mat);
  }

  // 床（ゲームセンターのカーペット）
  const floor = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: '#1a0f18', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -24;
  group.add(floor);

  return { group, pusher, wheel: t.wheel, shooter: { pivot, barrel }, sight, checkerLamps, lampTubes: m.tube };
}
