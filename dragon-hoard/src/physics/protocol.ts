import type { DropResult, ImpactEvent, PhysicsOptions } from './world.ts';

export interface MedalSpawn {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  wx: number; wy: number; wz: number;
}

/** 保存用のメダル配置（位置 xyz と姿勢 xyzw を並べたもの） */
export interface FieldLayout {
  pos: number[];
  quat: number[];
}

export type Command =
  | { t: 'add'; m: MedalSpawn }
  | { t: 'shoot'; x: number; jitter: number }
  | { t: 'payout'; count: number }
  | { t: 'reset'; count: number; seed: number };

export type ToWorker =
  | { type: 'init'; capacity: number; opts: Partial<PhysicsOptions>; count: number; seed: number; field?: FieldLayout | null }
  | { type: 'step'; steps: number; cmds: Command[] };

export interface Snapshot {
  count: number;
  pos: Float32Array;
  quat: Float32Array;
  prevPos: Float32Array;
  prevQuat: Float32Array;
  pusherZ: number;
  prevPusherZ: number;
  steps: number;
  stepMs: number; // このスナップショットでの1ステップ平均
  awakeCount: number;
  wins: number;
  losses: number;
  drops: { r: DropResult; x: number; z: number }[];
  impacts: ImpactEvent[];
  /** 通過したレーン番号（チェッカー） */
  laneHits: number[];
  payoutQueue: number;
}

export type FromWorker = { type: 'ready'; snap: Snapshot } | { type: 'state'; snap: Snapshot };
