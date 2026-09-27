// 液晶の合成: 3D ダンジョンを描いた上に、文字・パネルの canvas を重ねて1枚のテクスチャにする。
import * as THREE from 'three';
import type { DungeonView } from './dungeon.ts';

export class LcdComposer {
  readonly rt: THREE.WebGLRenderTarget;
  private overlayScene = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private dungeon: DungeonView, overlay: THREE.Texture, width = 1024, height = 768) {
    this.rt = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
    this.rt.texture.anisotropy = 4;
    this.rt.texture.generateMipmaps = false;
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: overlay, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.overlayScene.add(quad);
  }

  get texture() {
    return this.rt.texture;
  }

  render(renderer: THREE.WebGLRenderer) {
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(this.rt);
    renderer.autoClear = true;
    renderer.render(this.dungeon.scene, this.dungeon.camera);
    renderer.autoClear = false;
    renderer.render(this.overlayScene, this.overlayCam);
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
  }
}
