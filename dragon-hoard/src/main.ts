import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sfx } from './audio.ts';
import { PhysicsClient } from './physics/client.ts';
import { BACK_WALL, FIELD, LANES } from './physics/layout.ts';
import { buildCabinet, WHEEL_POS } from './render/cabinet.ts';
import { MedalRenderer } from './render/medals.ts';
import { LcdScreen } from './render/screen.ts';

// ---- 検証用のURLパラメータ ------------------------------------------------
// ?n=300      初期メダル枚数
// ?inline=1   Worker を使わずメインスレッドで物理
// ?shadow=0   影なし
// ?bloom=0    光のにじみ（ブルーム）なし
// ?dpr=1.5    描画解像度の倍率の上限
// ?hz=60      物理の固定ステップ
// ?cam=0..3   初期視点
const qs = new URLSearchParams(location.search);
const INITIAL = Number(qs.get('n') ?? 300);
const HZ = Number(qs.get('hz') ?? 60);
const SHADOW = qs.get('shadow') !== '0';
const DPR = Math.min(window.devicePixelRatio, Number(qs.get('dpr') ?? 2));
const CAPACITY = 700;
const MAX_STEPS_PER_FRAME = 3;
let bloomOn = qs.get('bloom') !== '0';

// フォントが揃ってから canvas に文字を描く（最大2秒待つ）
async function loadFonts() {
  const faces = ['900 40px Cinzel', '700 40px Cinzel', '400 40px "Zen Antique"'];
  await Promise.race([
    Promise.all(faces.map((f) => document.fonts.load(f, 'DRAGON 第一の迷宮 宝玉予告光るレーンを狙え当たり見習い剣士地下一階'))),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
}

// ---- 描画 ------------------------------------------------------------------
const canvasEl = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = SHADOW;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0508');
scene.fog = new THREE.Fog('#0a0508', 120, 260);

/** ゲームセンターの店内を模した暖色の環境マップ（金属の映り込み用） */
function arcadeEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(200, 80, 200), new THREE.MeshBasicMaterial({ color: '#1c0e0a', side: THREE.BackSide }));
  env.add(room);
  const glow = (w: number, h: number, c: THREE.Color, x: number, y: number, z: number, rx = 0, ry = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    p.position.set(x, y, z);
    p.rotation.set(rx, ry, 0);
    env.add(p);
  };
  // 天井の照明
  for (let i = -2; i <= 2; i++) glow(14, 60, new THREE.Color(4, 3.3, 2.4), i * 30, 39, 0, Math.PI / 2);
  // 周りの筐体の光（赤・オレンジ・青）
  glow(60, 20, new THREE.Color(2.5, 0.8, 0.2), 0, 5, -99);
  glow(40, 16, new THREE.Color(0.6, 0.9, 2.2), -99, 8, 20, 0, Math.PI / 2);
  glow(40, 16, new THREE.Color(2.4, 0.4, 0.5), 99, 8, -20, 0, Math.PI / 2);
  glow(80, 10, new THREE.Color(2.6, 1.6, 0.6), 0, 12, 99);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 600);
const CAMS = [
  { name: '座席', pos: new THREE.Vector3(0, 30, 22), look: new THREE.Vector3(0, 15, -20) },
  { name: 'フィールド', pos: new THREE.Vector3(0, 40, 14), look: new THREE.Vector3(0, 0, -13) },
  { name: 'ルーレット', pos: new THREE.Vector3(0, 60, 10), look: WHEEL_POS.clone() },
  { name: '自由', pos: new THREE.Vector3(30, 50, 70), look: new THREE.Vector3(0, 20, -30) },
];
let camIndex = Number(qs.get('cam') ?? 0) % CAMS.length;
const controls = new OrbitControls(camera, canvasEl);
controls.enabled = false;
const camTarget = { pos: CAMS[camIndex].pos.clone(), look: CAMS[camIndex].look.clone() };
const camLook = camTarget.look.clone();
function applyCam(instant: boolean) {
  const c = CAMS[camIndex];
  camTarget.pos.copy(c.pos);
  camTarget.look.copy(c.look);
  controls.enabled = c.name === '自由';
  if (instant || controls.enabled) {
    camera.position.copy(c.pos);
    camLook.copy(c.look);
    controls.target.copy(c.look);
    camera.lookAt(camLook);
    controls.update();
  }
}
function fitCamera() {
  // 縦長の画面では画角を広げて横幅が収まるようにする
  camera.aspect = innerWidth / innerHeight;
  const hfov = 58; // 横方向に見せたい角度
  const vfov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov / 2)) / camera.aspect) * 180) / Math.PI;
  camera.fov = Math.min(95, Math.max(42, vfov));
  camera.updateProjectionMatrix();
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(DPR);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  fitCamera();
}

// ---- 物理 ------------------------------------------------------------------
const physics = new PhysicsClient({
  capacity: CAPACITY,
  count: INITIAL,
  seed: 1,
  opts: { dt: 1 / HZ },
  inline: qs.get('inline') === '1',
});
const sfx = new Sfx();
const screen = new LcdScreen();
let fed = 0;
let wins = 0;
let losses = 0;
let checkerHits = 0;

// ---- チェッカー: 画面下のランプが左右に往復する ----------------------------
const CHECKER_STEP = 0.16; // 1レーン進む秒数
function checkerLaneAt(t: number) {
  const n = LANES.count;
  const k = Math.floor(t / CHECKER_STEP) % (n * 2 - 2);
  return k < n ? k : n * 2 - 2 - k;
}

async function main() {
  await loadFonts();
  screen.refreshBase();
  const envMap = arcadeEnvironment();
  scene.environment = envMap;

  scene.add(new THREE.HemisphereLight('#ffd9b0', '#2a0d10', 0.35));
  const sun = new THREE.DirectionalLight('#ffe2b8', 1.6);
  sun.position.set(6, 40, 14);
  sun.target.position.set(0, 0, -14);
  sun.castShadow = SHADOW;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 20, bottom: -20, near: 10, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // フィールドを照らす白熱灯（フードの上から）
  const bulb = new THREE.PointLight('#ffb866', 260, 60, 2);
  bulb.position.set(0, 22, -8);
  scene.add(bulb);
  // 塔（ルーレットと竜）を照らす
  const towerLight = new THREE.SpotLight('#ffd7a0', 4000, 160, 0.5, 0.6, 2);
  towerLight.position.set(0, 100, 30);
  towerLight.target.position.copy(WHEEL_POS);
  scene.add(towerLight, towerLight.target);

  const cabinet = buildCabinet(envMap, screen);
  scene.add(cabinet.group);
  const medals = new MedalRenderer(CAPACITY, envMap);
  scene.add(medals.mesh);

  physics.onSnapshot = (s) => {
    wins = s.wins;
    losses = s.losses;
    for (const d of s.drops) (d.r === 'win' ? sfx.win(d.x) : sfx.lose(d.x));
    for (const im of s.impacts) sfx.impact(im.dv, im.x);
    const now = performance.now();
    for (const lane of s.laneHits) {
      if (lane === checkerLaneAt(now / 1000)) {
        checkerHits++;
        screen.flashHit(lane, now);
        sfx.checker();
        // 仮: 当たりで3枚払い出し（ステージ3で歩数ルーレットに置き換える）
        physics.payout(3);
      }
    }
  };

  // ---- 入力 ----------------------------------------------------------------
  // 画面を左右にドラッグして狙いを動かし、タップで投入
  let aimX = 0;
  const ray = new THREE.Raycaster();
  const lanePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(BACK_WALL.frontZ + 1));
  const hit = new THREE.Vector3();
  const aimFromPointer = (e: PointerEvent) => {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(lanePlane, hit)) aimX = Math.max(-FIELD.innerHalfWidth + 1.4, Math.min(FIELD.innerHalfWidth - 1.4, hit.x));
  };
  let downAt: { x: number; y: number } | null = null;
  canvasEl.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    downAt = { x: e.clientX, y: e.clientY };
    if (!controls.enabled) aimFromPointer(e);
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if (downAt && !controls.enabled) aimFromPointer(e);
  });
  canvasEl.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved < 10 && !controls.enabled) feed();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') aimX = Math.max(-13.6, aimX - 1);
    if (e.key === 'ArrowRight') aimX = Math.min(13.6, aimX + 1);
    if (e.key === ' ') feed();
  });
  function feed() {
    physics.feed(aimX + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 4);
    fed++;
  }

  let auto = false;
  let autoAcc = 0;
  let showHud = true;
  const hud = document.getElementById('hud')!;
  document.getElementById('bar')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    sfx.unlock();
    switch (btn.dataset.act) {
      case 'drop': feed(); break;
      case 'auto':
        auto = !auto;
        btn.textContent = auto ? '連射 ON' : '連射 OFF';
        break;
      case 'payout': physics.payout(20); break;
      case 'reset':
        physics.reset(INITIAL, (Math.random() * 1e9) | 0);
        fed = 0;
        break;
      case 'cam':
        camIndex = (camIndex + 1) % CAMS.length;
        applyCam(false);
        btn.textContent = `視点: ${CAMS[camIndex].name}`;
        break;
      case 'bloom':
        bloomOn = !bloomOn;
        btn.textContent = bloomOn ? '光 ON' : '光 OFF';
        break;
      case 'sound':
        sfx.enabled = !sfx.enabled;
        btn.textContent = sfx.enabled ? '音 ON' : '音 OFF';
        break;
      case 'hud':
        showHud = !showHud;
        hud.hidden = !showHud;
        break;
    }
  });
  addEventListener('resize', resize);
  resize();
  applyCam(true);

  // ---- ループ --------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let fpsFrames = 0;
  let fpsTime = last;
  let frameMs = 0;
  let stepMs = 0;

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dtFrame = Math.min((now - last) / 1000, 0.1);
    last = now;
    sfx.beginFrame();
    const t = now / 1000;

    if (auto) {
      autoAcc += dtFrame;
      while (autoAcc > 0.3) {
        autoAcc -= 0.3;
        feed();
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

    // 演出
    const lit = checkerLaneAt(t);
    screen.setChecker(lit);
    screen.update(now);
    cabinet.checkerLamps.forEach((m, i) => m.color.setRGB(i === lit ? 4 : 0.35, i === lit ? 0.9 : 0.08, i === lit ? 0.3 : 0.05));
    cabinet.aim.position.x += (aimX - cabinet.aim.position.x) * Math.min(1, dtFrame * 18);
    const pulse = 0.75 + 0.25 * Math.sin(t * 3);
    cabinet.lampTubes.color.setRGB(3.2 * pulse, 1.3 * pulse, 0.25 * pulse);
    cabinet.wheel.update(t);

    // カメラは目標へなめらかに寄る
    if (!controls.enabled) {
      const k = 1 - Math.exp(-dtFrame * 4);
      camera.position.lerp(camTarget.pos, k);
      camLook.lerp(camTarget.look, k);
      camera.lookAt(camLook);
    } else {
      controls.update();
    }

    const t0 = performance.now();
    if (bloomOn) composer.render(); else renderer.render(scene, camera);
    frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;

    fpsFrames++;
    if (now - fpsTime > 500 && showHud) {
      const fps = (fpsFrames * 1000) / (now - fpsTime);
      fpsFrames = 0;
      fpsTime = now;
      hud.textContent =
        `FPS ${fps.toFixed(0)}  描画 ${frameMs.toFixed(1)}ms\n` +
        `物理 ${stepMs.toFixed(2)}ms/step (${physics.mode})\n` +
        `メダル ${s?.count ?? 0}  起きている ${s?.awakeCount ?? 0}\n` +
        `投入 ${fed}  獲得 ${wins}  ハズレ ${losses}  チェッカー ${checkerHits}`;
    }
  }

  await physics.ready;
  document.getElementById('loading')!.classList.add('hidden');
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

void main();
