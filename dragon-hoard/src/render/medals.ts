import * as THREE from 'three';
import { MEDAL } from '../physics/layout.ts';
import type { Snapshot } from '../physics/protocol.ts';
import { createMedalMaps } from './medalTexture.ts';

/** 全メダルを1つの InstancedMesh で描く（ドローコール1回 + 影1回） */
export class MedalRenderer {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(capacity: number, envMap: THREE.Texture | null) {
    // 側面 + 上面 + 下面の3グループ（CylinderGeometry の既定の並び）
    const geo = new THREE.CylinderGeometry(MEDAL.radius, MEDAL.radius, MEDAL.halfThickness * 2, 28, 1);
    const maps = createMedalMaps(256);
    const gold = new THREE.Color('#e3b155');
    const face = new THREE.MeshStandardMaterial({
      color: gold,
      metalness: 1,
      roughness: 1, // roughnessMap を掛ける
      map: maps.face.map,
      normalMap: maps.face.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: maps.face.roughnessMap,
      envMap,
      envMapIntensity: 1.25,
    });
    const rim = new THREE.MeshStandardMaterial({
      color: gold.clone().multiplyScalar(0.85),
      metalness: 1,
      roughness: 0.32,
      normalMap: maps.rim.normalMap,
      envMap,
      envMapIntensity: 1.1,
    });
    this.mesh = new THREE.InstancedMesh(geo, [rim, face, face], capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(s: Snapshot, alpha: number) {
    const { pos, prevPos, quat, prevQuat, count } = s;
    const { m, p, q, qa, qb } = this;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3, i4 = i * 4;
      p.set(
        prevPos[i3] + (pos[i3] - prevPos[i3]) * alpha,
        prevPos[i3 + 1] + (pos[i3 + 1] - prevPos[i3 + 1]) * alpha,
        prevPos[i3 + 2] + (pos[i3 + 2] - prevPos[i3 + 2]) * alpha,
      );
      qa.set(prevQuat[i4], prevQuat[i4 + 1], prevQuat[i4 + 2], prevQuat[i4 + 3]);
      qb.set(quat[i4], quat[i4 + 1], quat[i4 + 2], quat[i4 + 3]);
      q.slerpQuaternions(qa, qb, alpha);
      m.compose(p, q, this.s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
