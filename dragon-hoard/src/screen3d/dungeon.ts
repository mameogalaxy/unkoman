// 液晶の中の3Dダンジョン。奥へ続く通路を主人公が進み、マスの上に宝箱や敵が待つ。
import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { THEMES } from '../render/art.ts';
import { canvas, normalFromHeight, tex } from '../render/canvasKit.ts';
import { mulberry32 } from '../physics/seed.ts';
import { makeChest, makeEnemy, makeHero, makePedestal, makeStairs, setModelEnv, type Actor, type ChestActor } from './models.ts';

/** マスの間隔（m） */
const D = 3.4;
const CORRIDOR_LEN = 80;
const HALF_W = 2.6;
const WALL_H = 4.2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function brickMaps(seed: number) {
  const S = 256;
  const r = mulberry32(seed);
  const C = canvas(S), H = canvas(S);
  C.ctx.fillStyle = '#6a6056';
  C.ctx.fillRect(0, 0, S, S);
  H.ctx.fillStyle = '#000';
  H.ctx.fillRect(0, 0, S, S);
  const bh = 32, bw = 64;
  for (let row = 0; row < S / bh; row++) {
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + (row % 2) * (bw / 2), y = row * bh;
      const l = 55 + r() * 30;
      C.ctx.fillStyle = `hsl(30, 12%, ${l}%)`;
      C.ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      H.ctx.fillStyle = `rgb(${200 + r() * 55},0,0)`;
      H.ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      // ひび
      C.ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      C.ctx.beginPath();
      C.ctx.moveTo(x + r() * bw, y + 3);
      C.ctx.lineTo(x + r() * bw, y + bh - 3);
      C.ctx.stroke();
    }
  }
  const map = tex(C.cv, true, true);
  const normalMap = tex(normalFromHeight(H.cv, 2.5), false, true);
  return { map, normalMap };
}

function floorMaps(seed: number) {
  const S = 256;
  const r = mulberry32(seed);
  const C = canvas(S), H = canvas(S);
  H.ctx.fillStyle = '#000';
  H.ctx.fillRect(0, 0, S, S);
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const l = 40 + r() * 25;
      C.ctx.fillStyle = `hsl(35, 10%, ${l}%)`;
      C.ctx.fillRect(i * 64, j * 64, 64, 64);
      H.ctx.fillStyle = '#fff';
      H.ctx.fillRect(i * 64 + 3, j * 64 + 3, 58, 58);
    }
  }
  C.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  C.ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    C.ctx.beginPath(); C.ctx.moveTo(i * 64, 0); C.ctx.lineTo(i * 64, S); C.ctx.stroke();
    C.ctx.beginPath(); C.ctx.moveTo(0, i * 64); C.ctx.lineTo(S, i * 64); C.ctx.stroke();
  }
  return { map: tex(C.cv, true, true), normalMap: tex(normalFromHeight(H.cv, 2), false, true) };
}

let flameTex: THREE.Texture | null = null;
function flameTexture() {
  if (flameTex) return flameTex;
  const { cv, ctx } = canvas(64);
  const g = ctx.createRadialGradient(32, 40, 2, 32, 36, 30);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.3, 'rgba(255,190,80,0.9)');
  g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 36, 18, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  flameTex = tex(cv, true);
  return flameTex;
}

interface TileObj {
  root: THREE.Group;
  /** 敵パーティ（1〜3体） */
  enemies?: { actor: Actor; deadT: number; baseZ: number }[];
  chest?: ChestActor;
  stairs?: { root: THREE.Group; beam: THREE.Mesh };
}

export class DungeonView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 4 / 3, 0.1, 80);
  readonly hero: Actor;
  private corridor = new THREE.Group();
  private theme = -1;
  private boardKey = '';
  private tiles = new Map<number, TileObj>();
  private tileGroup = new THREE.Group();
  private torches: { flame: THREE.Sprite; z: number; x: number }[] = [];
  private torchLights: THREE.PointLight[] = [];
  private hemi: THREE.HemisphereLight;
  private camPos = new THREE.Vector3(1.3, 2.3, 4);
  private camLook = new THREE.Vector3(0, 0.8, -4);
  private heroStand = 1.4;
  private heroSide = 0;

  constructor(envMap: THREE.Texture | null) {
    setModelEnv(envMap);
    this.scene.environment = envMap;
    this.hero = makeHero();
    this.hero.root.rotation.y = Math.PI; // 奥（-z）を向く
    this.scene.add(this.hero.root, this.corridor, this.tileGroup);
    this.hemi = new THREE.HemisphereLight('#ffe8c8', '#302018', 0.9);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight('#fff0dd', 1.4);
    key.position.set(2, 5, 4);
    this.scene.add(key);
    // 主人公を照らすランタン（主人公についてくる）
    const lantern = new THREE.PointLight('#ffd89a', 6, 7, 1.6);
    lantern.position.set(0.6, 1.8, 0.6);
    this.hero.root.add(lantern);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffb050', 10, 9, 1.6);
      this.scene.add(l);
      this.torchLights.push(l);
    }
  }

  private buildCorridor(theme: number) {
    this.corridor.clear();
    this.torches = [];
    const th = THEMES[theme];
    this.scene.background = new THREE.Color(th.sky[0]);
    this.scene.fog = new THREE.Fog(th.sky[0], 10, 34);
    this.hemi.color.set(th.torch);
    const bricks = brickMaps(theme + 1);
    bricks.map.repeat.set(CORRIDOR_LEN / 3, WALL_H / 1.5);
    bricks.normalMap.repeat.copy(bricks.map.repeat);
    const wallMat = new THREE.MeshStandardMaterial({ map: bricks.map, normalMap: bricks.normalMap, color: th.wall, roughness: 0.85 });
    const fl = floorMaps(theme + 7);
    fl.map.repeat.set(HALF_W, CORRIDOR_LEN / 2);
    fl.normalMap.repeat.copy(fl.map.repeat);
    const floorMat = new THREE.MeshStandardMaterial({ map: fl.map, normalMap: fl.normalMap, color: th.floor, roughness: 0.6, metalness: 0.1 });
    floorMat.color.lerp(new THREE.Color('#ffffff'), 0.5);
    const zc = -CORRIDOR_LEN / 2 + 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, CORRIDOR_LEN), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = zc;
    this.corridor.add(floor);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_LEN, WALL_H), wallMat);
      wall.rotation.y = -s * Math.PI / 2;
      wall.position.set(s * HALF_W, WALL_H / 2, zc);
      this.corridor.add(wall);
    }
    // 天井のアーチと柱（2マスごと）
    const pillarMat = new THREE.MeshStandardMaterial({ color: th.brick, roughness: 0.7, metalness: 0.2 });
    pillarMat.color.lerp(new THREE.Color('#d8c8a8'), 0.35);
    const goldMat = new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.3 });
    const count = Math.ceil(CORRIDOR_LEN / (D * 2));
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, WALL_H, 0.5), pillarMat, count * 2);
    const arches = new THREE.InstancedMesh(new THREE.TorusGeometry(HALF_W - 0.25, 0.22, 6, 20, Math.PI), pillarMat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const z = 8 - i * D * 2 - D / 2;
      m.makeTranslation(-HALF_W + 0.25, WALL_H / 2, z);
      pillars.setMatrixAt(i * 2, m);
      m.makeTranslation(HALF_W - 0.25, WALL_H / 2, z);
      pillars.setMatrixAt(i * 2 + 1, m);
      m.makeTranslation(0, WALL_H, z);
      arches.setMatrixAt(i, m);
      for (const s of [-1, 1]) {
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), color: th.torch, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        flame.scale.set(0.35, 0.55, 1);
        flame.position.set(s * (HALF_W - 0.55), 2.35, z + 0.3);
        this.corridor.add(flame);
        const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.35, 6), goldMat);
        holder.position.set(s * (HALF_W - 0.55), 2.05, z + 0.3);
        this.corridor.add(holder);
        this.torches.push({ flame, z: z + 0.3, x: s * (HALF_W - 0.55) });
      }
    }
    this.corridor.add(pillars, arches);
    // 天井
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, CORRIDOR_LEN), new THREE.MeshStandardMaterial({ color: '#100a08', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, WALL_H + 0.3, zc);
    this.corridor.add(ceil);
    for (const l of this.torchLights) l.color.set(th.torch);
  }

  private disposeTile(o: TileObj) {
    this.tileGroup.remove(o.root);
    o.root.traverse((c) => {
      const mm = c as THREE.Mesh;
      mm.geometry?.dispose();
    });
  }

  private syncTiles(g: Game) {
    const b = g.s.board;
    const key = `${g.s.dungeon}/${g.s.floor}/${g.s.loop}/${b.length}/${b.map((t) => t.kind[0] + (t.enemy ?? '') + (t.chest ?? '')).join('')}`;
    if (key !== this.boardKey) {
      for (const o of this.tiles.values()) this.disposeTile(o);
      this.tiles.clear();
      this.boardKey = key;
    }
    const lo = Math.max(0, g.s.pos - 1), hi = Math.min(b.length - 1, g.s.pos + 8);
    for (const [i, o] of this.tiles) {
      if (i < lo || i > hi) {
        this.disposeTile(o);
        this.tiles.delete(i);
      }
    }
    for (let i = lo; i <= hi; i++) {
      const tile = b[i];
      let o = this.tiles.get(i);
      if (!o) {
        o = { root: new THREE.Group() };
        o.root.position.z = -i * D;
        o.root.add(makePedestal(tile.kind === 'stairs' ? 'stairs' : 'normal'));
        if (tile.kind === 'chest') {
          o.chest = makeChest(tile.chest === 'slot' || tile.chest === 'orb');
          o.chest.root.position.y = 0.14;
          o.chest.setOpen(tile.done ? 1 : 0);
          o.root.add(o.chest.root);
        } else if (tile.kind === 'stairs') {
          o.stairs = makeStairs(g.s.floor + 1 >= 3);
          o.root.add(o.stairs.root);
        }
        this.tileGroup.add(o.root);
        this.tiles.set(i, o);
      }
      // 敵パーティ（倒した後は消す）
      const wantEnemy = tile.kind === 'enemy' && !tile.done;
      if (wantEnemy && !o.enemies) {
        const n = tile.party ?? 1;
        const xs = n === 1 ? [0] : n === 2 ? [-0.55, 0.55] : [-0.8, 0, 0.8];
        o.enemies = xs.map((x, k) => {
          const actor = makeEnemy(tile.enemy!);
          actor.root.position.set(x, 0.14, n === 3 && k === 1 ? -0.45 : 0);
          if (n > 1) actor.root.scale.setScalar(0.85);
          o!.root.add(actor.root);
          return { actor, deadT: -1, baseZ: actor.root.position.z };
        });
      } else if (!wantEnemy && o.enemies && g.mode.m !== 'victory') {
        for (const e of o.enemies) {
          o.root.remove(e.actor.root);
          e.actor.root.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
        }
        o.enemies = undefined;
      }
    }
  }

  update(g: Game, t: number, dt: number) {
    const theme = g.s.dungeon % THEMES.length;
    if (theme !== this.theme) {
      this.theme = theme;
      this.buildCorridor(theme);
      this.boardKey = '';
    }
    this.syncTiles(g);
    const md = g.mode;
    const tileZ = -g.s.pos * D;
    const inBattle = md.m === 'battle' || md.m === 'victory' || md.m === 'retreat';
    const boss = (md.m === 'battle' || md.m === 'victory') && md.kind === 3;
    // 主人公の立ち位置（戦闘中は敵から離れる）
    const stand = inBattle ? (boss ? 4.6 : 2.5) : 1.4;
    this.heroStand += (stand - this.heroStand) * Math.min(1, dt * 4);
    const heroZ = -g.heroX * D + this.heroStand;
    // 宝箱・戦闘では主人公が左に寄って、カメラから相手が見えるようにする
    const side = inBattle || md.m === 'chest' ? -0.75 : 0;
    this.heroSide += (side - this.heroSide) * Math.min(1, dt * 4);
    // 攻撃を受けると後ろへよろける
    const knock = md.m === 'battle' && md.heroHitT < 0.6 ? Math.sin((md.heroHitT / 0.6) * Math.PI) * 0.5 : 0;
    this.hero.root.position.set(this.heroSide, 0.14, heroZ + knock);
    const walking = md.m === 'move' || Math.abs(g.heroX - g.s.pos) > 0.02;
    this.hero.update(t, {
      walk: walking ? 1 : 0,
      attack: md.m === 'battle' && md.hitT < 0.45 && md.lastType !== 'absorb' ? md.hitT / 0.45 : 0,
      hurt: md.m === 'battle' && md.heroHitT < 0.5 ? 1 - md.heroHitT / 0.5 : 0,
    });

    // マスの上のもの
    for (const [i, o] of this.tiles) {
      if (o.enemies) {
        const here = i === g.s.pos;
        o.enemies.forEach((e, k) => {
          const b = here && md.m === 'battle' ? md : null;
          const hit = !!b && b.hitT < 0.3 && b.lastType !== 'miss' && b.lastType !== 'absorb' && (b.lastType === 'special' || b.target === k);
          // HP が 0 になった敵はその場で沈んで消える
          const dead = (b && b.hps[k] === 0) || (here && md.m === 'victory');
          if (dead && e.deadT < 0) e.deadT = 0;
          if (e.deadT >= 0) e.deadT += dt;
          // 攻撃: 主人公に向かって踏み込む
          const lunge = b && b.heroHitT < 0.6 && b.hps[k] > 0 ? Math.sin((b.heroHitT / 0.6) * Math.PI) : 0;
          e.actor.root.position.z = e.baseZ + lunge * (md.m === 'battle' && md.kind === 3 ? 2.2 : 1.1);
          e.actor.update(t + i + k * 1.3, {
            hurt: hit ? 1 - b!.hitT / 0.3 : 0,
            attack: b && b.heroHitT < 0.5 ? b.heroHitT / 0.5 : 0,
            dead: e.deadT >= 0 ? clamp01((e.deadT - 0.25) / 0.7) : 0,
          });
        });
      }
      if (o.chest && i === g.s.pos && md.m === 'chest') o.chest.setOpen(clamp01((md.t - 0.6) / 0.5));
      else if (o.chest && g.s.board[i]?.done) o.chest.setOpen(1);
      if (o.stairs) (o.stairs.beam.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 3) * 0.08;
    }

    // たいまつ: ゆらぎ + 主人公の前方の3つにライトを置く
    for (const tr of this.torches) {
      const f = 1 + Math.sin(t * 13 + tr.z) * 0.08 + Math.sin(t * 7.3 + tr.z * 3) * 0.06;
      tr.flame.scale.set(0.35 * f, 0.55 * f, 1);
    }
    const ahead = this.torches.filter((tr) => tr.z < heroZ + 3).sort((a, b) => b.z - a.z).slice(0, 3);
    this.torchLights.forEach((l, k) => {
      const tr = ahead[k];
      if (!tr) return;
      l.position.set(tr.x * 0.85, 2.3, tr.z);
      l.intensity = 9 + Math.sin(t * 11 + k) * 1.5;
    });

    // カメラ
    let cp: THREE.Vector3, cl: THREE.Vector3;
    if (inBattle && !boss) {
      cp = new THREE.Vector3(2.0, 2.0, tileZ + 6.6);
      cl = new THREE.Vector3(0.1, 0.7, tileZ + 0.6);
    } else if (boss) {
      cp = new THREE.Vector3(2.2, 1.5, tileZ + 9.4);
      cl = new THREE.Vector3(0, 2.1, tileZ);
    } else if (md.m === 'chest') {
      cp = new THREE.Vector3(1.3, 1.8, tileZ + 3.4);
      cl = new THREE.Vector3(0.1, 0.4, tileZ);
    } else {
      cp = new THREE.Vector3(1.0, 2.7, heroZ + 5.4);
      cl = new THREE.Vector3(0, 0.8, heroZ - 5);
    }
    const k = 1 - Math.exp(-dt * 3.5);
    this.camPos.lerp(cp, k);
    this.camLook.lerp(cl, k);
    this.camera.position.copy(this.camPos);
    // 被弾・会心で画面が揺れる
    if (md.m === 'battle' && (md.heroHitT < 0.3 || ((md.lastType === 'weak' || md.lastType === 'special') && md.hitT < 0.3))) {
      this.camera.position.x += (Math.random() - 0.5) * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * 0.08;
    }
    this.camera.lookAt(this.camLook);
  }

  /** HUD 用の主人公の顔（一度だけ描いて canvas に写す） */
  renderPortrait(renderer: THREE.WebGLRenderer, size = 128) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#3a6ac8');
    scene.environment = this.scene.environment;
    const hero = makeHero();
    hero.update(0, {});
    scene.add(hero.root, new THREE.HemisphereLight('#ffffff', '#6080c0', 2));
    const dl = new THREE.DirectionalLight('#ffffff', 2);
    dl.position.set(1, 2, 3);
    scene.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    cam.position.set(0.35, 1.05, 1.5);
    cam.lookAt(0, 0.92, 0);
    const rt = new THREE.WebGLRenderTarget(size, size);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const buf = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    renderer.setRenderTarget(null);
    rt.dispose();
    const { cv, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    // 上下反転 + リニア → sRGB
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          const l = buf[si + c] / 255;
          img.data[di + c] = 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
        }
        img.data[di + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}
