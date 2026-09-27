// ステージ1用の仮の筐体。当たり判定と同じ寸法で描く（見た目の作り込みはステージ2）。
import * as THREE from 'three';
import { BACK_WALL, FIELD, PUSHER } from '../physics/layout.ts';

export interface Cabinet {
  group: THREE.Group;
  pusher: THREE.Group;
}

export function buildCabinet(envMap: THREE.Texture | null): Cabinet {
  const g = new THREE.Group();
  const W = FIELD.innerHalfWidth;

  const floorMat = new THREE.MeshStandardMaterial({ color: '#2a3550', metalness: 0.6, roughness: 0.35, envMap, envMapIntensity: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#e8eef5', metalness: 1, roughness: 0.12, envMap });
  const dark = new THREE.MeshStandardMaterial({ color: '#0b0d14', roughness: 0.9 });
  const panelMat = new THREE.MeshStandardMaterial({ color: '#5b1720', metalness: 0.3, roughness: 0.5, envMap, envMapIntensity: 0.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: '#bfe4ff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, envMap, envMapIntensity: 1.5, depthWrite: false,
  });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // 床（奥：全幅、手前：落とし穴ぶん狭い）
  const rearLen = FIELD.gutterDepthZ - FIELD.backZ;
  box(W * 2, 2, rearLen, floorMat, 0, -1, FIELD.backZ + rearLen / 2);
  const frontLen = FIELD.frontZ - FIELD.gutterDepthZ;
  box((W - FIELD.gutterWidth) * 2, 2, frontLen, floorMat, 0, -1, FIELD.gutterDepthZ + frontLen / 2);
  // 前端のクロームの縁
  box((W - FIELD.gutterWidth) * 2, 0.3, 0.4, chrome, 0, -0.15, FIELD.frontZ - 0.2);
  // 落とし穴の底（暗い穴）
  for (const s of [-1, 1]) box(FIELD.gutterWidth, 0.2, frontLen, dark, s * (W - FIELD.gutterWidth / 2), -6, FIELD.gutterDepthZ + frontLen / 2);
  // 取り出し口（前端の下）
  box(W * 2 + 4, 0.2, 10, dark, 0, -8, 5);

  // ガラスの側板とクロームの枠
  const wallLen = FIELD.frontZ - FIELD.backZ;
  for (const s of [-1, 1]) {
    const gl = box(0.3, 16, wallLen, glass, s * (W + 0.15), 7, FIELD.backZ + wallLen / 2);
    gl.receiveShadow = false;
    gl.renderOrder = 10;
    box(0.8, 0.8, wallLen, chrome, s * (W + 0.4), 15, FIELD.backZ + wallLen / 2);
    box(0.8, 16, 0.8, chrome, s * (W + 0.4), 7, FIELD.frontZ - 0.4);
  }

  // 奥壁（装飾パネルの仮置き）
  const by = PUSHER.height + BACK_WALL.gap;
  const bw = box(W * 2, BACK_WALL.height, BACK_WALL.thickness, panelMat, 0, by + BACK_WALL.height / 2, BACK_WALL.frontZ - BACK_WALL.thickness / 2);
  bw.castShadow = true;
  box(W * 2, 0.5, 0.6, chrome, 0, by + 0.25, BACK_WALL.frontZ + 0.3);

  // プッシャー（上段テーブル）
  const pusher = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.04, PUSHER.height, PUSHER.depth),
    new THREE.MeshStandardMaterial({ color: '#8fa0b8', metalness: 0.9, roughness: 0.25, envMap }));
  body.position.set(0, PUSHER.height / 2, -PUSHER.depth / 2);
  body.receiveShadow = true;
  body.castShadow = true;
  pusher.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.04, 0.02, PUSHER.depth), floorMat);
  top.position.set(0, PUSHER.height + 0.011, -PUSHER.depth / 2);
  top.receiveShadow = true;
  pusher.add(top);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.02, PUSHER.height + 0.04, 0.32), chrome);
  lip.position.set(0, PUSHER.height / 2 + 0.01, -0.15);
  pusher.add(lip);
  g.add(pusher);

  return { group: g, pusher };
}
