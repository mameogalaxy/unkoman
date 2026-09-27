import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sfx } from './audio/sfx.ts';
import { Game, START_CREDITS } from './game/game.ts';
import { clearSave, loadSave, writeSave } from './game/save.ts';
import { PhysicsClient } from './physics/client.ts';
import { FIELD, HOPPER, LANES, SHOOTER, laneCenterX } from './physics/layout.ts';
import { buildCabinet, WHEEL_POS } from './render/cabinet.ts';
import { MedalRenderer } from './render/medals.ts';
import { Lamps, Sparkles, type LampMode } from './render/fx.ts';
import { LcdScreen } from './render/screen.ts';
import { SLOT_POS, Slot3D } from './render/slot3d.ts';
import { DungeonView } from './screen3d/dungeon.ts';
import { LcdComposer } from './screen3d/lcd.ts';

// ---- 検証用のURLパラメータ ------------------------------------------------
// ?n=300      初期メダル枚数
// ?inline=1   Worker を使わずメインスレッドで物理
// ?shadow=0   影なし
// ?bloom=0    光のにじみ（ブルーム）なし
// ?dpr=1.5    描画解像度の倍率の上限
// ?hz=60      物理の固定ステップ
// ?cam=0..4   初期視点
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
  { name: '座席', pos: new THREE.Vector3(0, 25.5, 11), look: new THREE.Vector3(0, 15.5, -22) },
  { name: 'フィールド', pos: new THREE.Vector3(0, 40, 14), look: new THREE.Vector3(0, 0, -13) },
  { name: 'ルーレット', pos: new THREE.Vector3(0, 60, 10), look: WHEEL_POS.clone() },
  { name: '液晶', pos: new THREE.Vector3(0, 22.85, 2), look: new THREE.Vector3(0, 22.85, -27) },
  { name: '自由', pos: new THREE.Vector3(30, 50, 70), look: new THREE.Vector3(0, 20, -30) },
];
let camIndex = Number(qs.get('cam') ?? 0) % CAMS.length;
/** 大ルーレットの演出中のカメラ（盤面の正面に寄る） */
const WHEEL_CAM = { pos: new THREE.Vector3(0, WHEEL_POS.y - 4, WHEEL_POS.z + 52), look: WHEEL_POS.clone() };
/** 頭上のジャックポットスロットを見上げるカメラ */
const SLOT_CAM = { pos: new THREE.Vector3(0, SLOT_POS.y - 2, SLOT_POS.z + 36), look: SLOT_POS.clone().add(new THREE.Vector3(0, 1.5, 0)) };
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

// ---- セーブデータ・物理・ゲーム ------------------------------------------------
const saved = qs.get('fresh') === '1' ? null : loadSave();
let game = new Game(saved?.game);
const physics = new PhysicsClient({
  capacity: CAPACITY,
  count: INITIAL,
  seed: 1,
  opts: { dt: 1 / HZ },
  inline: qs.get('inline') === '1',
  field: saved?.field,
});
/** フィールドのメダルがこれ以上あるとホッパーは払い出しを待つ */
const HOPPER_WAIT_COUNT = 480;
const sfx = new Sfx();
const screen = new LcdScreen();
let fed = 0;
let wins = 0;
let losses = 0;
let checkerHits = 0;

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

  // 液晶: 3D ダンジョン + 文字の重ね描き
  const dungeon = new DungeonView(envMap);
  const lcd = new LcdComposer(dungeon, screen.texture);
  screen.portrait = dungeon.renderPortrait(renderer);
  const cabinet = buildCabinet(envMap, lcd.texture);
  scene.add(cabinet.group);
  const medals = new MedalRenderer(CAPACITY, envMap);
  scene.add(medals.mesh);
  const slot3d = new Slot3D(envMap);
  scene.add(slot3d.group);
  const sparkles = new Sparkles(500);
  scene.add(sparkles.points);
  const lamps = new Lamps(cabinet.lampTubes);
  scene.add(lamps.bulbs);
  const GOLD = new THREE.Color(1, 0.75, 0.3);
  // 大当たり中に筐体を染めるライト
  const feverLight = new THREE.PointLight('#ffffff', 0, 90, 1.5);
  feverLight.position.set(0, 40, -10);
  scene.add(feverLight);
  let shake = 0;

  physics.onSnapshot = (s) => {
    wins = s.wins;
    losses = s.losses;
    for (const d of s.drops) {
      if (d.r === 'win') {
        sfx.win(d.x);
        game.won(1);
        sparkles.burst(new THREE.Vector3(d.x, 0.5, 1), 5, GOLD, 12, 8);
      } else {
        sfx.lose(d.x);
      }
    }
    for (const im of s.impacts) sfx.impact(im.dv, im.x);
    // 穴を通過したメダル: 戦闘中は攻撃、それ以外は光る穴ならチェッカー当たり（判定は Game 側）
    for (const lane of s.laneHits) game.lane(lane);
  };
  screen.onTick = () => sfx.game('tick');
  cabinet.wheel.onTick = () => sfx.game('tick');

  // 保存（5秒ごと + 画面を離れるとき）
  const save = () => writeSave(game.serialize(), physics.snap);
  setInterval(save, 5000);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });

  // ---- 入力 ----------------------------------------------------------------
  // 画面を左右にドラッグして狙いを動かし、タップで投入
  let aimX = 0;
  const ray = new THREE.Raycaster();
  const lanePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LANES.frontZ);
  const hit = new THREE.Vector3();
  const aimFromPointer = (e: PointerEvent) => {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(lanePlane, hit)) aimX = Math.max(-FIELD.innerHalfWidth + 1.0, Math.min(FIELD.innerHalfWidth - 1.0, hit.x));
  };
  let downAt: { x: number; y: number } | null = null;
  canvasEl.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    document.getElementById('menu')!.hidden = true;
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
    if (e.key === 'ArrowLeft') aimX = Math.max(-14, aimX - 1);
    if (e.key === 'ArrowRight') aimX = Math.min(14, aimX + 1);
    if (e.key === ' ') feed();
    if (e.key === 's' || e.key === 'S') game.special();
  });
  const toast = document.getElementById('toast')!;
  let toastTimer = 0;
  function showToast(text: string) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 1800);
  }
  function feed() {
    if (!game.canFeed()) {
      showToast('手持ちのメダルがありません。「メダル補充」で借りられます');
      return;
    }
    physics.shoot(aimX, 0.35);
    recoil = 1;
    game.fed();
    fed++;
  }

  const creditsEl = document.getElementById('credits')!;
  const specialBtn = document.querySelector<HTMLButtonElement>('button[data-act=special]')!;
  let recoil = 0;
  let auto = false;
  let autoAcc = 0;
  let showHud = qs.get('hud') === '1' || qs.get('debug') === '1';
  const hud = document.getElementById('hud')!;
  hud.hidden = !showHud;
  const menu = document.getElementById('menu')!;
  const onButton = (e: Event) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    sfx.unlock();
    switch (btn.dataset.act) {
      case 'drop': feed(); break;
      case 'special': game.special(); break;
      case 'auto':
        auto = !auto;
        btn.textContent = auto ? '連射 ON' : '連射 OFF';
        break;
      case 'refill':
        game.s.credits += START_CREDITS / 2;
        showToast(`メダルを ${START_CREDITS / 2} 枚補充しました`);
        break;
      case 'reset':
        // 押し間違い防止: 3秒以内にもう一度押すと最初から
        if (btn.dataset.armed !== '1') {
          btn.dataset.armed = '1';
          btn.textContent = 'もう一度で初期化';
          setTimeout(() => {
            btn.dataset.armed = '';
            btn.textContent = '最初から';
          }, 3000);
          break;
        }
        btn.dataset.armed = '';
        btn.textContent = '最初から';
        clearSave();
        game = new Game(null);
        physics.reset(INITIAL, (Math.random() * 1e9) | 0);
        fed = 0;
        showToast('最初からはじめます');
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
      case 'sound': {
        const lv = sfx.cycleLevel();
        btn.textContent = lv === 'all' ? '音 BGM+効果音' : lv === 'sfx' ? '音 効果音のみ' : '音 OFF';
        break;
      }
      case 'hud':
        showHud = !showHud;
        hud.hidden = !showHud;
        break;
      case 'menu':
        menu.hidden = !menu.hidden;
        break;
    }
  };
  document.getElementById('bar')!.addEventListener('click', onButton);
  menu.addEventListener('click', onButton);
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

    // ゲーム進行
    game.update(dtFrame);
    for (const e of game.events) {
      if (e.t === 'sfx') sfx.game(e.name);
      else if (e.t === 'checker') {
        checkerHits++;
        screen.flashHit(e.lane, now);
        sfx.checker();
        lamps.flash(new THREE.Color(3, 0.6, 0.2));
        sparkles.burst(new THREE.Vector3(laneCenterX(e.lane), (LANES.holeBottomY + LANES.topY) / 2, LANES.frontZ + 0.5), 40, GOLD, 22, 6);
      }
      else if (e.t === 'wheelSpin') {
        cabinet.wheel.spin(e.target, () => {
          game.wheelStopped();
          sparkles.burst(WHEEL_POS.clone().add(new THREE.Vector3(0, 0, 3)), 220, GOLD, 45, 10);
          lamps.flash(new THREE.Color(3, 2.6, 1.2));
          shake = 0.6;
        });
      }
    }
    game.events.length = 0;
    // 払い出し: ホッパーへ少しずつ渡す（フィールドが満杯なら待つ）
    if (game.s.pendingPayout > 0 && s && s.payoutQueue < 4 && s.count < HOPPER_WAIT_COUNT) {
      const n = Math.min(4, game.s.pendingPayout);
      physics.payout(n);
      sfx.hopper(n);
      sparkles.burst(new THREE.Vector3(HOPPER.x + 1, HOPPER.y, HOPPER.z), 10, GOLD, 14, 4);
      game.s.pendingPayout -= n;
    }
    // 大ルーレットの間はカメラが寄る
    const md = game.mode;
    const wheelTime = md.m === 'wheelIntro' || md.m === 'wheel' || (md.m === 'get' && cabinet.wheel.recentlyStopped);
    const slotTime = (md.m === 'slot' && md.jackpot) || (md.m === 'get' && md.label === 'ジャックポット');
    if (!controls.enabled) {
      const c = wheelTime ? WHEEL_CAM : slotTime ? SLOT_CAM : CAMS[camIndex];
      camTarget.pos.copy(c.pos);
      camTarget.look.copy(c.look);
    }

    // 演出
    dungeon.update(game, t, dtFrame);
    if (screen.update(now, game)) lcd.render(renderer);
    // 穴の上のランプ: 通常は光る穴だけ赤、戦闘中は属性の色（弱点は点滅）
    const bt = game.battle;
    cabinet.checkerLamps.forEach((m, i) => {
      if (bt) {
        const ic = bt.lanes[i];
        const weak = ic !== 'miss' && ic !== bt.element && ic === ({ fire: 'ice', ice: 'thunder', thunder: 'fire' } as const)[bt.element];
        const c = ic === 'fire' ? [3, 0.6, 0.1] : ic === 'ice' ? [0.4, 1.4, 3] : ic === 'thunder' ? [3, 2.4, 0.3] : [0.08, 0.06, 0.1];
        const k = weak ? (Math.floor(t * 8) % 2 ? 1.4 : 0.5) : ic === bt.element ? 0.25 : 0.6;
        m.color.setRGB(c[0] * k, c[1] * k, c[2] * k);
      } else {
        const lit = i === game.checkerLane;
        m.color.setRGB(lit ? 4 : 0.35, lit ? 0.9 : 0.08, lit ? 0.3 : 0.05);
      }
    });
    specialBtn.hidden = !bt;
    specialBtn.disabled = !game.canSpecial;
    specialBtn.classList.toggle('ready', game.canSpecial);
    // 発射台は狙いの穴を向く。撃つと砲身が少し下がる
    cabinet.sight.position.x += (aimX - cabinet.sight.position.x) * Math.min(1, dtFrame * 20);
    const dz = LANES.frontZ - (SHOOTER.z + 1.2);
    cabinet.shooter.pivot.rotation.y = Math.atan2(-(cabinet.sight.position.x - SHOOTER.x), -dz);
    cabinet.shooter.pivot.rotation.order = 'YXZ';
    cabinet.shooter.pivot.rotation.x = 0.28;
    recoil = Math.max(0, recoil - dtFrame * 6);
    cabinet.shooter.barrel.position.z = recoil * 0.5;
    cabinet.wheel.update(t, dtFrame);
    slot3d.update(game, t, dtFrame);
    // ランプと BGM は場面で切り替える
    const mdl = game.mode;
    const fever = mdl.m === 'wheelIntro' || mdl.m === 'wheel' || (mdl.m === 'get' && mdl.amount >= 100) || (mdl.m === 'slot' && mdl.jackpot);
    const lampMode: LampMode = fever ? 'fever' : mdl.m === 'battle' ? (mdl.kind === 3 ? 'boss' : 'battle') : 'idle';
    lamps.update(t, dtFrame, lampMode);
    sparkles.update(dtFrame);
    sfx.song(fever ? 'chance' : mdl.m === 'battle' || mdl.m === 'victory' ? (mdl.kind === 3 ? 'boss' : 'battle') : 'dungeon');
    feverLight.intensity = fever ? 1500 * (0.6 + 0.4 * Math.sin(t * 12)) : 0;
    if (fever) feverLight.color.setHSL((t * 0.5) % 1, 0.8, 0.6);
    creditsEl.textContent = `手持ち ${game.s.credits}枚` + (game.s.pendingPayout > 0 ? `  払い出し待ち ${game.s.pendingPayout}` : '');

    // カメラは目標へなめらかに寄る
    if (!controls.enabled) {
      const k = 1 - Math.exp(-dtFrame * 4);
      camera.position.lerp(camTarget.pos, k);
      camLook.lerp(camTarget.look, k);
      camera.lookAt(camLook);
      if (shake > 0) {
        shake = Math.max(0, shake - dtFrame);
        camera.position.x += (Math.random() - 0.5) * shake * 1.2;
        camera.position.y += (Math.random() - 0.5) * shake * 1.2;
      }
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

  // 検証用: ?debug=1 でコンソールから操作できるようにする
  if (qs.get('debug') === '1') Object.assign(window, { dh: { get game() { return game; }, physics, cabinet, dungeon } });

  await physics.ready;
  document.getElementById('loading')!.classList.add('hidden');
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

void main();
