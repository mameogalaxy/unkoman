import RAPIER from '@dimforge/rapier3d-compat';
import { BACK_WALL, FIELD, KILL_Y, MEDAL, PUSHER } from './layout.ts';

export type DropResult = 'win' | 'lose';

export interface PhysicsOptions {
  /** 固定タイムステップ（秒） */
  dt: number;
  solverIterations: number;
}

export const DEFAULT_OPTIONS: PhysicsOptions = {
  dt: 1 / 60,
  solverIterations: 4,
};

export interface ImpactEvent {
  x: number;
  y: number;
  z: number;
  /** 速度の急変（cm/s）。音量の目安 */
  dv: number;
}

// 重力で説明できない速度変化がこれを超えたら「ぶつかった」とみなす（cm/s）
const IMPACT_DV = 25;
const GRAVITY = 981;

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/**
 * メダルプッシャーの物理世界。
 * メダルの姿勢は pos / quat の Float32Array に密に詰めて保持し、描画側はそれを読むだけにする。
 * 削除は swap-remove なのでインデックスは安定しない（描画側も同じ順で詰め直す）。
 */
export class MedalWorld {
  readonly world: RAPIER.World;
  readonly opts: PhysicsOptions;
  readonly capacity: number;

  count = 0;
  /** 最新ステップの姿勢 */
  readonly pos: Float32Array;
  readonly quat: Float32Array;
  /** 1つ前に読み出した姿勢（補間用） */
  readonly prevPos: Float32Array;
  readonly prevQuat: Float32Array;
  /** 0 = 眠っている */
  readonly awake: Uint8Array;
  /** 最新の線速度（衝突音の検出用） */
  readonly vel: Float32Array;
  private bodies: RAPIER.RigidBody[] = [];
  private colliderToIndex = new Map<number, number>();

  readonly pusher: RAPIER.RigidBody;
  pusherZ = 0; // 前面の z
  private prevPusherZ = 0;
  time = 0;

  stats = { wins: 0, losses: 0, lastStepMs: 0, awakeCount: 0 };
  onDrop: ((result: DropResult, x: number, z: number) => void) | null = null;
  readonly impacts: ImpactEvent[] = [];
  private lastSyncTime = 0;

  constructor(capacity: number, opts: Partial<PhysicsOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.quat = new Float32Array(capacity * 4);
    this.prevPos = new Float32Array(capacity * 3);
    this.prevQuat = new Float32Array(capacity * 4);
    this.awake = new Uint8Array(capacity);
    this.vel = new Float32Array(capacity * 3);

    const world = new RAPIER.World({ x: 0, y: -981, z: 0 });
    // cm 単位の世界。許容誤差や予測距離は lengthUnit 倍される。
    world.lengthUnit = 10;
    world.timestep = this.opts.dt;
    world.numSolverIterations = this.opts.solverIterations;
    this.world = world;

    this.buildStatic();
    this.pusher = this.buildPusher();
  }

  private box(hx: number, hy: number, hz: number, x: number, y: number, z: number, friction: number) {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(friction).setRestitution(0.1),
    );
  }

  private buildStatic() {
    const { innerHalfWidth: W, floorY, frontZ, gutterDepthZ, gutterWidth, backZ, floorFriction } = FIELD;
    const t = 1; // 床・壁の半厚
    // 奥側の床（全幅）
    const rearLen = gutterDepthZ - backZ;
    this.box(W, t, rearLen / 2, 0, floorY - t, backZ + rearLen / 2, floorFriction);
    // 手前の床（左右に落とし穴を残す）
    const frontLen = frontZ - gutterDepthZ;
    this.box(W - gutterWidth, t, frontLen / 2, 0, floorY - t, gutterDepthZ + frontLen / 2, floorFriction);
    // 左右のガラス
    const wallH = 30;
    const wallLen = frontZ - backZ;
    for (const s of [-1, 1]) {
      this.box(t, wallH / 2, wallLen / 2, s * (W + t), floorY + wallH / 2 - 2, backZ + wallLen / 2, 0.1);
    }
    // 奥壁（プッシャー上面の少し上から）
    const by = PUSHER.height + BACK_WALL.gap;
    this.box(W, BACK_WALL.height / 2, BACK_WALL.thickness / 2, 0, by + BACK_WALL.height / 2,
      BACK_WALL.frontZ - BACK_WALL.thickness / 2, 0.2);
    // 最奥のふた
    this.box(W, 10, t, 0, 10, backZ - t, 0.2);
  }

  private buildPusher() {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const hz = PUSHER.depth / 2;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(FIELD.innerHalfWidth - 0.02, PUSHER.height / 2, hz)
        .setTranslation(0, PUSHER.height / 2, -hz)
        .setFriction(PUSHER.friction)
        .setRestitution(0.1),
      body,
    );
    this.pusherZ = this.prevPusherZ = this.pusherFrontAt(0);
    body.setTranslation({ x: 0, y: 0, z: this.pusherZ }, true);
    return body;
  }

  pusherFrontAt(t: number) {
    const mid = (PUSHER.frontMinZ + PUSHER.frontMaxZ) / 2;
    const amp = (PUSHER.frontMaxZ - PUSHER.frontMinZ) / 2;
    return mid + amp * Math.sin((t / PUSHER.period) * Math.PI * 2);
  }

  /** 描画補間用のプッシャー位置 */
  pusherRenderZ(alpha: number) {
    return this.prevPusherZ + (this.pusherZ - this.prevPusherZ) * alpha;
  }

  addMedal(
    x: number, y: number, z: number,
    q: { x: number; y: number; z: number; w: number } = { x: 0, y: 0, z: 0, w: 1 },
    v?: { x: number; y: number; z: number },
    w?: { x: number; y: number; z: number },
  ): number {
    if (this.count >= this.capacity) return -1;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation(q)
      // 薄い円盤同士のすり抜け防止（安価な予測接触）
      .setSoftCcdPrediction(0.6)
      .setAngularDamping(0.15)
      .setLinearDamping(0.05);
    if (v) desc.setLinvel(v.x, v.y, v.z);
    if (w) desc.setAngvel(w);
    const body = this.world.createRigidBody(desc);
    const cd = RAPIER.ColliderDesc.cylinder(MEDAL.halfThickness, MEDAL.radius)
      .setDensity(MEDAL.density)
      .setFriction(MEDAL.friction)
      .setRestitution(MEDAL.restitution);
    const col = this.world.createCollider(cd, body);
    const i = this.count++;
    this.bodies[i] = body;
    this.colliderToIndex.set(col.handle, i);
    this.pos.set([x, y, z], i * 3);
    this.prevPos.set([x, y, z], i * 3);
    this.quat.set([q.x, q.y, q.z, q.w], i * 4);
    this.prevQuat.set([q.x, q.y, q.z, q.w], i * 4);
    this.awake[i] = 1;
    this.vel.set(v ? [v.x, v.y, v.z] : [0, 0, 0], i * 3);
    return i;
  }

  private removeAt(i: number) {
    const body = this.bodies[i];
    this.colliderToIndex.delete(body.collider(0).handle);
    this.world.removeRigidBody(body);
    const last = --this.count;
    if (i !== last) {
      const moved = this.bodies[last];
      this.bodies[i] = moved;
      this.colliderToIndex.set(moved.collider(0).handle, i);
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.prevPos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.quat.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.prevQuat.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.awake[i] = this.awake[last];
      this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    }
    this.bodies.length = last;
  }

  clear() {
    while (this.count > 0) this.removeAt(this.count - 1);
  }

  /** 固定ステップを1回進める */
  step() {
    const t0 = performance.now();
    this.time += this.opts.dt;
    this.prevPusherZ = this.pusherZ;
    this.pusherZ = this.pusherFrontAt(this.time);
    this.pusher.setNextKinematicTranslation({ x: 0, y: 0, z: this.pusherZ });
    this.world.step();
    this.stats.lastStepMs = performance.now() - t0;
  }

  /**
   * ステップを進めた後に1回呼ぶ。起きているメダルの姿勢を読み出し、
   * 衝突（音用）と落下したメダルを判定・削除する。
   */
  sync() {
    let awakeCount = 0;
    const { pos, quat, prevPos, prevQuat, vel } = this;
    const elapsed = this.time - this.lastSyncTime;
    this.lastSyncTime = this.time;
    const gdv = GRAVITY * elapsed;
    for (let i = 0; i < this.count; i++) {
      const b = this.bodies[i];
      const i3 = i * 3, i4 = i * 4;
      prevPos[i3] = pos[i3]; prevPos[i3 + 1] = pos[i3 + 1]; prevPos[i3 + 2] = pos[i3 + 2];
      prevQuat[i4] = quat[i4]; prevQuat[i4 + 1] = quat[i4 + 1]; prevQuat[i4 + 2] = quat[i4 + 2]; prevQuat[i4 + 3] = quat[i4 + 3];
      if (b.isSleeping()) {
        this.awake[i] = 0;
        continue;
      }
      awakeCount++;
      this.awake[i] = 1;
      const p = b.translation();
      const r = b.rotation();
      pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z;
      quat[i4] = r.x; quat[i4 + 1] = r.y; quat[i4 + 2] = r.z; quat[i4 + 3] = r.w;
      const v = b.linvel();
      const dx = v.x - vel[i3], dy = v.y - (vel[i3 + 1] - gdv), dz = v.z - vel[i3 + 2];
      vel[i3] = v.x; vel[i3 + 1] = v.y; vel[i3 + 2] = v.z;
      const dv = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dv > IMPACT_DV && this.impacts.length < 24) {
        this.impacts.push({ x: p.x, y: p.y, z: p.z, dv });
      }
    }
    this.stats.awakeCount = awakeCount;
    // 落下判定（後ろから回すと swap-remove で取りこぼさない）
    for (let i = this.count - 1; i >= 0; i--) {
      const y = pos[i * 3 + 1];
      if (y > KILL_Y) continue;
      const x = pos[i * 3], z = pos[i * 3 + 2];
      // 前端より手前 & 床幅の内側で落ちたものだけが獲得
      const win = z > FIELD.frontZ - 0.5 && Math.abs(x) < FIELD.innerHalfWidth - FIELD.gutterWidth + 0.5;
      if (win) this.stats.wins++; else this.stats.losses++;
      this.onDrop?.(win ? 'win' : 'lose', x, z);
      this.removeAt(i);
    }
  }
}
