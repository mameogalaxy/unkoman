import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sfx } from './audio.ts';
import { PhysicsClient } from './physics/client.ts';
import { BACK_WALL, FIELD, PUSHER } from './physics/layout.ts';
import { buildCabinet } from './render/cabinet.ts';
import { MedalRenderer } from './render/medals.ts';

// ---- 検証用のURLパラメータ ------------------------------------------------
// ?n=300      初期メダル枚数
// ?inline=1   Worker を使わずメインスレッドで物理
// ?shadow=0   影なし
// ?dpr=1.5    描画解像度の倍率の上限
// ?hz=60      物理の固定ステップ
const qs = new URLSearchParams(location.search);
const INITIAL = Number(qs.get('n') ?? 300);
const HZ = Number(qs.get('hz') ?? 60);
const SHADOW = qs.get('shadow') !== '0';
const DPR = Math.min(window.devicePixelRatio, Number(qs.get('dpr') ?? 2));
const CAPACITY = 700;
const MAX_STEPS_PER_FRAME = 3;

// ---- 描画 ------------------------------------------------------------------
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = SHADOW;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07080d');
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envMap;

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 400);
const CAMS = [
  { name: 'プレイヤー', pos: new THREE.Vector3(0, 30, 16), look: new THREE.Vector3(0, 0, -13) },
  { name: '真上', pos: new THREE.Vector3(0, 70, -13), look: new THREE.Vector3(0, 0, -13.01) },
  { name: '低い位置', pos: new THREE.Vector3(-6, 7, 6), look: new THREE.Vector3(0, 1, -8) },
  { name: '自由', pos: new THREE.Vector3(0, 34, 26), look: new THREE.Vector3(0, 0, -12) },
];
let camIndex = Number(qs.get('cam') ?? 0) % 4;
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
function applyCam() {
  const c = CAMS[camIndex];
  camera.position.copy(c.pos);
  controls.target.copy(c.look);
  camera.lookAt(c.look);
  controls.enabled = c.name === '自由';
  controls.update();
}
function fitCamera() {
  // 縦長の画面では画角を広げてフィールド幅が収まるようにする
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 45 / Math.max(camera.aspect / 0.8, 0.55) : 45;
  camera.updateProjectionMatrix();
}
fitCamera();
applyCam();

scene.add(new THREE.HemisphereLight('#bcd4ff', '#2b1a10', 0.5));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(8, 40, 12);
sun.target.position.set(0, 0, -14);
sun.castShadow = SHADOW;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 20, bottom: -20, near: 10, far: 80 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const fill = new THREE.PointLight('#ffcf7a', 120, 50, 2);
fill.position.set(0, 18, 4);
scene.add(fill);

const cabinet = buildCabinet(envMap);
scene.add(cabinet.group);
const medals = new MedalRenderer(CAPACITY, envMap);
scene.add(medals.mesh);

// ---- 物理 ------------------------------------------------------------------
const physics = new PhysicsClient({
  capacity: CAPACITY,
  count: INITIAL,
  seed: 1,
  opts: { dt: 1 / HZ },
  inline: qs.get('inline') === '1',
});
const sfx = new Sfx();
let dropped = 0;
let wins = 0;
let losses = 0;
physics.onSnapshot = (s) => {
  wins = s.wins;
  losses = s.losses;
  for (const d of s.drops) (d.r === 'win' ? sfx.win(d.x) : sfx.lose(d.x));
  for (const im of s.impacts) sfx.impact(im.dv, im.x);
};

function dropMedal(x: number) {
  const cx = Math.max(-FIELD.innerHalfWidth + 1.5, Math.min(FIELD.innerHalfWidth - 1.5, x));
  physics.addMedal({
    x: cx + (Math.random() - 0.5) * 0.4,
    y: 11,
    z: BACK_WALL.frontZ + 3 + Math.random() * 0.6,
    vx: (Math.random() - 0.5) * 6,
    vy: -40,
    vz: 12,
    wx: (Math.random() - 0.5) * 8,
    wy: (Math.random() - 0.5) * 8,
    wz: (Math.random() - 0.5) * 8,
  });
  dropped++;
}

// ---- 入力 ------------------------------------------------------------------
let lane = 0;
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PUSHER.height);
const hit = new THREE.Vector3();
let downAt: { x: number; y: number; t: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 8 || controls.enabled) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hit)) {
    lane = hit.x;
    dropMedal(lane);
  }
});

let auto = false;
let autoAcc = 0;
const bar = document.getElementById('bar')!;
bar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn) return;
  sfx.unlock();
  switch (btn.dataset.act) {
    case 'drop': dropMedal(lane); break;
    case 'auto':
      auto = !auto;
      btn.textContent = auto ? '連射 ON' : '連射 OFF';
      break;
    case 'rain':
      for (let i = 0; i < 30; i++) setTimeout(() => dropMedal((Math.random() - 0.5) * 26), i * 60);
      break;
    case 'reset':
      physics.reset(INITIAL, (Math.random() * 1e9) | 0);
      dropped = 0;
      break;
    case 'cam':
      camIndex = (camIndex + 1) % CAMS.length;
      applyCam();
      btn.textContent = `視点: ${CAMS[camIndex].name}`;
      break;
    case 'sound':
      sfx.enabled = !sfx.enabled;
      btn.textContent = sfx.enabled ? '音 ON' : '音 OFF';
      break;
  }
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  fitCamera();
});

// ---- ループ ----------------------------------------------------------------
const hud = document.getElementById('hud')!;
let acc = 0;
let last = performance.now();
let fpsFrames = 0;
let fpsTime = last;
let fps = 0;
let frameMs = 0;
let stepMs = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dtFrame = Math.min((now - last) / 1000, 0.1);
  last = now;
  sfx.beginFrame();

  if (auto) {
    autoAcc += dtFrame;
    while (autoAcc > 0.25) {
      autoAcc -= 0.25;
      lane = Math.sin(now / 1300) * 11;
      dropMedal(lane);
    }
  }

  // 固定ステップ。物理が追いつかないときは時間を捨ててスローモーションにする
  acc = Math.min(acc + dtFrame, MAX_STEPS_PER_FRAME * physics.dt);
  if (!physics.inFlight) {
    const steps = Math.floor(acc / physics.dt + 1e-6);
    if (steps > 0 && physics.request(steps)) acc -= steps * physics.dt;
  }

  const s = physics.snap;
  if (s) {
    const span = Math.max(1, s.steps) * physics.dt * 1000;
    const alpha = s.steps === 0 ? 1 : Math.min(1, (now - physics.receivedAt) / span);
    medals.update(s, alpha);
    cabinet.pusher.position.z = s.prevPusherZ + (s.pusherZ - s.prevPusherZ) * alpha;
    if (s.steps > 0) stepMs = stepMs * 0.9 + s.stepMs * 0.1;
  }

  const t0 = performance.now();
  renderer.render(scene, camera);
  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;

  fpsFrames++;
  if (now - fpsTime > 500) {
    fps = (fpsFrames * 1000) / (now - fpsTime);
    fpsFrames = 0;
    fpsTime = now;
    const n = s?.count ?? 0;
    const payout = dropped > 0 ? `${((wins / dropped) * 100).toFixed(0)}%` : '-';
    hud.textContent =
      `FPS ${fps.toFixed(0)}  render ${frameMs.toFixed(1)}ms\n` +
      `物理 ${stepMs.toFixed(2)}ms/step (${physics.mode}, ${HZ}Hz)\n` +
      `メダル ${n}  起きている ${s?.awakeCount ?? 0}\n` +
      `投入 ${dropped}  獲得 ${wins}  ハズレ ${losses}\n` +
      `還元 ${payout}  (初期の山が崩れる分を含む)`;
  }
}

physics.ready.then(() => {
  document.getElementById('loading')!.classList.add('hidden');
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
});
