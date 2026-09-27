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
  { name: 'スライム', hp: 5, atk: 6, exp: 2 },
  { name: 'コウモリ騎士', hp: 10, atk: 10, exp: 5 },
  { name: '岩の番人', hp: 18, atk: 16, exp: 10 },
  { name: '宝を喰らう竜', hp: 40, atk: 20, exp: 30 },
] as const;
/** 敵の攻撃間隔（秒） */
export const ENEMY_ATTACK_EVERY = 7;
/** 会心のダメージ倍率（投入1枚 = 1ダメージ） */
export const CRIT_DAMAGE = 5;

/** 戦利品ルーレット（敵の強さ別）。数値はメダル枚数 */
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

/** スロットの図柄 */
export type SlotSymbol = 'dragon' | 'm50' | 'm20' | 'm10' | 'orb';
export const SLOT_SYMBOLS: SlotSymbol[] = ['dragon', 'm50', 'm20', 'm10', 'orb'];
export const SLOT_PAY: Record<SlotSymbol, number> = { dragon: 0, m50: 50, m20: 20, m10: 10, orb: 0 };
/** 竜が3つ揃う確率（宝箱スロット / ボス撃破のジャックポットスロット） */
export const SLOT_DRAGON_CHANCE = { chest: 0.06, jackpot: 0.35 };
/** 竜以外の3つ揃い */
export const SLOT_MATCH_TABLE: Weighted<SlotSymbol> = [
  { v: 'm10', w: 40 }, { v: 'm20', w: 25 }, { v: 'm50', w: 10 }, { v: 'orb', w: 10 },
];
export const SLOT_MATCH_CHANCE = { chest: 0.45, jackpot: 0.5 };
/** ハズレの残念賞 */
export const SLOT_CONSOLATION = { chest: 5, jackpot: 30 };

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
