// ゲームの数値（配当・確率・敵の強さ）。バランス調整はステージ5でここをいじる。

export type Weighted<T> = { v: T; w: number }[];

export function pick<T>(table: Weighted<T>, rand: () => number): T {
  const total = table.reduce((a, b) => a + b.w, 0);
  let r = rand() * total;
  for (const e of table) {
    if ((r -= e.w) < 0) return e.v;
  }
  return table[table.length - 1].v;
}

/** 歩数ルーレット。'gold' は GOLD ルーレットへ昇格 */
export type StepCell = number | 'gold';
export const SILVER_CELLS: StepCell[] = [1, 3, 5, 'gold', 1, 3, 5, 1];
export const SILVER_WEIGHTS: Weighted<number> = [
  { v: 0, w: 22 }, { v: 1, w: 18 }, { v: 2, w: 10 }, { v: 3, w: 9 },
  { v: 4, w: 16 }, { v: 5, w: 12 }, { v: 6, w: 7 }, { v: 7, w: 6 },
]; // インデックスの重み
export const GOLD_CELLS: StepCell[] = [3, 5, 10, 3, 5, 10];
export const GOLD_WEIGHTS: Weighted<number> = [
  { v: 0, w: 20 }, { v: 1, w: 20 }, { v: 2, w: 10 }, { v: 3, w: 20 }, { v: 4, w: 20 }, { v: 5, w: 10 },
];

export type ChestItem = 'm5' | 'm10' | 'm15' | 'orb' | 'slot';
export const CHEST_TABLE: Weighted<ChestItem> = [
  { v: 'm5', w: 34 }, { v: 'm10', w: 26 }, { v: 'm15', w: 14 }, { v: 'orb', w: 16 }, { v: 'slot', w: 10 },
];

export type EnemyKind = 0 | 1 | 2 | 3; // 弱・中・強・ボス
export const ENEMY = [
  { name: 'スライム', hp: 8, atk: 10, exp: 2 },
  { name: 'コウモリ騎士', hp: 18, atk: 16, exp: 5 },
  { name: '岩の番人', hp: 34, atk: 24, exp: 10 },
  { name: '宝を喰らう竜', hp: 90, atk: 32, exp: 30 },
] as const;
/** 敵パーティの人数（最小, 最大） */
export const PARTY_SIZE: [number, number][] = [[1, 3], [1, 2], [1, 1], [1, 1]];
/** 敵の攻撃間隔（秒）。仲間が多いほど短くなる。戦闘開始から最初の攻撃までは FIRST 秒 */
export const ENEMY_ATTACK_EVERY = 4.5;
export const ENEMY_FIRST_ATTACK = 1.8;
/** 周回ごとに敵の攻撃力が増える割合 */
export const ENEMY_LOOP_ATK = 0.25;
/** ダンジョンが深いほど敵の攻撃力が増える割合 */
export const ENEMY_DUNGEON_ATK = 0.15;

// ---- 戦闘: レーンの属性 ------------------------------------------------------
// 穴に入ったメダルのレーンで攻撃が決まる。敵の弱点属性なら大ダメージ、敵と同じ属性は吸収されて回復、ミスは空振り
export type Elem = 'fire' | 'ice' | 'thunder';
export const ELEMS: Elem[] = ['fire', 'ice', 'thunder'];
export const ELEM_NAME: Record<Elem, string> = { fire: '炎', ice: '氷', thunder: '雷' };
/** 弱点: 炎←氷, 氷←雷, 雷←炎 */
export const WEAKNESS: Record<Elem, Elem> = { fire: 'ice', ice: 'thunder', thunder: 'fire' };
export type LaneIcon = Elem | 'miss';
export type HitType = 'normal' | 'weak' | 'absorb' | 'miss' | 'special';
export const DAMAGE = { normal: 2, weak: 6, absorb: -3, special: 16 };
/** 必殺技ゲージの増え方（満タン 100） */
export const GAUGE = { normal: 12, weak: 25 };
/** レーンの属性が入れ替わる間隔（秒） */
export const LANE_SHUFFLE_EVERY = 6;
/** 8レーンの内訳: 弱点2・吸収1・その他の属性3・ミス2 */
export function battleLanes(enemy: Elem, rand: () => number): LaneIcon[] {
  const weak = WEAKNESS[enemy];
  const other = ELEMS.find((e) => e !== enemy && e !== weak)!;
  const lanes: LaneIcon[] = [weak, weak, enemy, other, other, other, 'miss', 'miss'];
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}

// ---- チェッカー --------------------------------------------------------------
/** 光る穴がその場にとどまる秒数（最小, 最大）。当たるとすぐ別の穴へ移る */
export const CHECKER_STAY: [number, number] = [2.5, 5];

/** バトルボーナス（戦利品）ルーレット。ハズレなし。数値はメダル枚数で、敵パーティの人数で増える */
export type Loot = number | 'orb' | 'slot';
export const LOOT_CELLS: Loot[][] = [
  [5, 10, 5, 15, 'orb', 10],
  [10, 20, 10, 30, 'orb', 20],
  [30, 50, 30, 100, 'orb', 'slot'],
];
export const LOOT_WEIGHTS: Weighted<number>[] = [
  [{ v: 0, w: 30 }, { v: 1, w: 22 }, { v: 2, w: 25 }, { v: 3, w: 8 }, { v: 4, w: 5 }, { v: 5, w: 10 }],
  [{ v: 0, w: 28 }, { v: 1, w: 20 }, { v: 2, w: 25 }, { v: 3, w: 9 }, { v: 4, w: 10 }, { v: 5, w: 8 }],
  [{ v: 0, w: 30 }, { v: 1, w: 20 }, { v: 2, w: 20 }, { v: 3, w: 8 }, { v: 4, w: 12 }, { v: 5, w: 10 }],
];

// ---- スロット ----------------------------------------------------------------
export type SlotSymbol = 'dragon' | 'orb' | 'm300' | 'm100' | 'm50' | 'm20' | 'm10';
export const SLOT_SYMBOLS: SlotSymbol[] = ['dragon', 'orb', 'm300', 'm100', 'm50', 'm20', 'm10'];
/** スロットの結果: 宝玉 n 個 / メダル n 枚 / 竜（大ルーレット） */
export type SlotOutcome = { k: 'orb'; n: number } | { k: 'medal'; n: number } | { k: 'dragon' };
/** ボス撃破のジャックポットスロット（ダンジョンが深いほど回数が増える） */
export const JACKPOT_TABLE: Weighted<SlotOutcome> = [
  { v: { k: 'orb', n: 1 }, w: 28 }, { v: { k: 'orb', n: 2 }, w: 16 }, { v: { k: 'orb', n: 3 }, w: 8 },
  { v: { k: 'medal', n: 50 }, w: 22 }, { v: { k: 'medal', n: 100 }, w: 14 }, { v: { k: 'medal', n: 300 }, w: 5 },
  { v: { k: 'dragon' }, w: 7 },
];
/** 宝箱のスロット */
export const CHEST_SLOT_TABLE: Weighted<SlotOutcome> = [
  { v: { k: 'medal', n: 10 }, w: 40 }, { v: { k: 'medal', n: 20 }, w: 25 }, { v: { k: 'medal', n: 50 }, w: 8 },
  { v: { k: 'orb', n: 1 }, w: 22 }, { v: { k: 'dragon' }, w: 3 },
];
export function jackpotSpins(dungeon: number, loop: number) {
  return Math.min(5, 1 + dungeon + loop);
}

/** 盤面 */
export const FLOORS_PER_DUNGEON = 3;
export const DUNGEON_COUNT = 4;
export const TILES_PER_FLOOR = 16;
export const ORBS_FOR_WHEEL = 8;
/** 保留（チェッカー当たりの持ち越し）の上限 */
export const MAX_STOCK = 4;
export const DUNGEON_NAMES = ['翠の洞窟', '氷の神殿', '炎の火山', '竜の城'];
/** 階層ごとの敵の出やすさ [弱, 中, 強] */
export function enemyTable(dungeon: number, floor: number): Weighted<EnemyKind> {
  const d = dungeon + floor * 0.4;
  return [
    { v: 0, w: Math.max(4, 30 - d * 6) },
    { v: 1, w: 10 + d * 3 },
    { v: 2, w: 2 + d * 3 },
  ];
}
export const ENEMY_TILE_RATE = 0.45;
