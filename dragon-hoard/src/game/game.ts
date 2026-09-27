// ゲームの進行（描画・物理から独立した状態機械）。
// 入力: fed()（メダル発射）, lane(i)（メダルが i 番の穴を通過）, special()（必殺技ボタン）, won()（手前から獲得）, update(dt)
// 出力: events（払い出し・大ルーレット・効果音）と、画面が読む状態
import { mulberry32 } from '../physics/seed.ts';
import {
  CHECKER_STAY, CHEST_SLOT_TABLE, CHEST_TABLE, DAMAGE, DUNGEON_COUNT, ELEMS, ENEMY, ENEMY_ATTACK_EVERY, ENEMY_DUNGEON_ATK, ENEMY_FIRST_ATTACK, ENEMY_LOOP_ATK, ENEMY_TILE_RATE,
  FLOORS_PER_DUNGEON, GAUGE, GOLD_CELLS, GOLD_WEIGHTS, JACKPOT_TABLE, LANE_SHUFFLE_EVERY, LOOT_CELLS, LOOT_WEIGHTS, MAX_STOCK,
  ORBS_FOR_WHEEL, PARTY_SIZE, SILVER_CELLS, SILVER_WEIGHTS, SLOT_SYMBOLS, TILES_PER_FLOOR, WEAKNESS,
  battleLanes, enemyTable, jackpotSpins, pick,
  type ChestItem, type Elem, type EnemyKind, type HitType, type LaneIcon, type Loot, type SlotOutcome, type SlotSymbol, type StepCell,
} from './rules.ts';
import { WHEEL_CELLS } from './wheelCells.ts';

export interface Tile {
  kind: 'start' | 'chest' | 'enemy' | 'stairs';
  chest?: ChestItem;
  enemy?: EnemyKind;
  party?: number;
  element?: Elem;
  done?: boolean;
}

export interface BattleMode {
  m: 'battle';
  kind: EnemyKind;
  element: Elem;
  /** 敵パーティ各体の HP（0 で撃破） */
  hps: number[];
  max: number;
  lanes: LaneIcon[];
  shuffleT: number;
  t: number;
  atkT: number;
  hitT: number;
  lastDmg: number;
  lastType: HitType;
  /** 最後に攻撃を受けた敵 */
  target: number;
  heroHitT: number;
  /** 最後に受けたダメージ */
  lastAtk: number;
  gauge: number;
}

export interface SlotMode {
  m: 'slot';
  jackpot: boolean;
  spin: number;
  spins: number;
  reels: SlotSymbol[];
  outcome: SlotOutcome;
  t: number;
  medals: number;
  orbs: number;
  dragon: boolean;
  next: Mode;
}

export type Mode =
  | { m: 'map' }
  | { m: 'roulette'; kind: 'silver' | 'gold'; cells: StepCell[]; target: number; t: number; dur: number }
  | { m: 'move'; left: number; t: number }
  | { m: 'floor'; t: number; boss: boolean }
  | { m: 'chest'; item: ChestItem; t: number }
  | BattleMode
  | { m: 'victory'; kind: EnemyKind; party: number; t: number }
  | { m: 'retreat'; t: number }
  | { m: 'loot'; kind: EnemyKind; party: number; cells: Loot[]; target: number; t: number; dur: number }
  | SlotMode
  | { m: 'orb'; t: number; gained: number; next: Mode }
  | { m: 'wheelIntro'; t: number; reason: 'orb' | 'slot' | 'chain'; spins: number }
  | { m: 'wheel'; spins: number; target: number; waiting: boolean; t: number }
  | { m: 'get'; amount: number; t: number; label: string };

export type GameEvent =
  | { t: 'payout'; n: number }
  | { t: 'wheelSpin'; target: number }
  | { t: 'wheelEnd' }
  | { t: 'checker'; lane: number }
  | { t: 'sfx'; name: SfxName };

export type SfxName =
  | 'tick' | 'stop' | 'gold' | 'step' | 'chest' | 'hit' | 'crit' | 'weak' | 'absorb' | 'miss' | 'special' | 'enemyHit'
  | 'win' | 'fanfare' | 'reel' | 'reach' | 'orb' | 'stock' | 'bigwin' | 'shuffle' | 'defeat';

export interface SaveData {
  v: 1;
  credits: number;
  dungeon: number;
  floor: number;
  pos: number;
  board: Tile[];
  lv: number;
  exp: number;
  hp: number;
  orbs: number;
  stock: number;
  loop: number;
  battle?: { kind: EnemyKind; element: Elem; hps: number[]; gauge: number };
  pendingPayout: number;
  totals: { fed: number; won: number; paid: number; checker: number; wheel: number };
  seed: number;
}

export const START_CREDITS = 100;

export class Game {
  s: SaveData;
  mode: Mode = { m: 'map' };
  /** 次に戻るモード（get 表示の後など） */
  private after: Mode | null = null;
  /** 大ルーレットが終わった後に戻る先 */
  private afterWheel: Mode | null = null;
  events: GameEvent[] = [];
  /** 画面用: 主人公の表示位置（移動のなめらかさ用） */
  heroX = 0;
  /** チェッカー: 光っている穴と、そこにとどまる残り時間 */
  checkerLane = 3;
  private checkerT = 3;
  private rand: () => number;
  time = 0;

  constructor(save?: SaveData | null) {
    this.s = save ?? Game.fresh();
    this.rand = mulberry32(this.s.seed ^ (Date.now() & 0xffff));
    this.heroX = this.s.pos;
    const b = this.s.battle;
    if (b && Array.isArray(b.hps) && b.element) {
      this.mode = this.battleMode(b.kind, b.element, b.hps, b.gauge ?? 0);
    } else {
      this.s.battle = undefined; // 古い形式の保存データは戦闘をやり直し
    }
    this.jumpChecker();
  }

  static fresh(): SaveData {
    const seed = (Math.random() * 1e9) | 0;
    const g: SaveData = {
      v: 1, credits: START_CREDITS, dungeon: 0, floor: 0, pos: 0, board: [], lv: 1, exp: 0, hp: 100, orbs: 0, stock: 0, loop: 0,
      pendingPayout: 0, totals: { fed: 0, won: 0, paid: 0, checker: 0, wheel: 0 }, seed,
    };
    g.board = Game.makeBoard(0, 0, mulberry32(seed));
    return g;
  }

  static makeBoard(dungeon: number, floor: number, rand: () => number): Tile[] {
    const tiles: Tile[] = [{ kind: 'start', done: true }];
    for (let i = 1; i < TILES_PER_FLOOR - 1; i++) {
      if (rand() < ENEMY_TILE_RATE) {
        const enemy = pick(enemyTable(dungeon, floor), rand);
        const [lo, hi] = PARTY_SIZE[enemy];
        tiles.push({ kind: 'enemy', enemy, party: lo + Math.floor(rand() * (hi - lo + 1)), element: ELEMS[Math.floor(rand() * 3)] });
      } else {
        tiles.push({ kind: 'chest', chest: pick(CHEST_TABLE, rand) });
      }
    }
    tiles.push({ kind: 'stairs' });
    return tiles;
  }

  get maxHp() { return 94 + this.s.lv * 6; }
  get isBossFloor() { return this.s.floor >= FLOORS_PER_DUNGEON; }
  get busy() { return this.mode.m !== 'map'; }
  get battle(): BattleMode | null { return this.mode.m === 'battle' ? this.mode : null; }
  get canSpecial() { const b = this.battle; return !!b && b.gauge >= 100 && b.hps.some((h) => h > 0); }

  private sfx(name: SfxName) { this.events.push({ t: 'sfx', name }); }

  private payout(n: number, label: string, next: Mode = { m: 'map' }) {
    this.addPayout(n);
    this.mode = { m: 'get', amount: n, t: 0, label };
    this.after = next;
    this.sfx(n >= 100 ? 'bigwin' : 'win');
  }

  private addPayout(n: number) {
    this.s.pendingPayout += n;
    this.s.totals.paid += n;
    this.events.push({ t: 'payout', n });
  }

  // ---- 入力 ----------------------------------------------------------------
  canFeed() { return this.s.credits > 0; }

  /** メダルを1枚撃った（手持ちから引く） */
  fed() {
    this.s.credits--;
    this.s.totals.fed++;
  }

  /** 手前から落ちて獲得した */
  won(n = 1) {
    this.s.credits += n;
    this.s.totals.won += n;
  }

  /** メダルが lane 番の穴を通過した。戦闘中は攻撃、それ以外は光る穴ならチェッカー当たり */
  lane(lane: number) {
    const b = this.battle;
    if (b) {
      this.attack(b, b.lanes[lane]);
      return;
    }
    if (lane !== this.checkerLane) return;
    this.s.totals.checker++;
    this.events.push({ t: 'checker', lane });
    if (this.s.stock < MAX_STOCK) {
      this.s.stock++;
      this.sfx('stock');
    }
    // 当たった穴からはすぐ移る（同じ穴に撃ち続けるだけでは当たらない）
    this.jumpChecker();
  }

  /** 必殺技（ゲージ満タンで全員に大ダメージ） */
  special() {
    const b = this.battle;
    if (!b || !this.canSpecial) return;
    b.gauge = 0;
    const dmg = DAMAGE.special + this.s.lv;
    for (let i = 0; i < b.hps.length; i++) if (b.hps[i] > 0) b.hps[i] = Math.max(0, b.hps[i] - dmg);
    b.hitT = 0;
    b.lastDmg = dmg;
    b.lastType = 'special';
    this.sfx('special');
    this.saveBattle(b);
  }

  private jumpChecker() {
    let next = this.checkerLane;
    while (next === this.checkerLane) next = Math.floor(this.rand() * 8);
    this.checkerLane = next;
    this.checkerT = CHECKER_STAY[0] + this.rand() * (CHECKER_STAY[1] - CHECKER_STAY[0]);
  }

  private attack(b: BattleMode, icon: LaneIcon) {
    const target = b.hps.findIndex((h) => h > 0);
    if (target < 0) return;
    let type: HitType;
    let dmg: number;
    if (icon === 'miss') {
      type = 'miss';
      dmg = 0;
    } else if (icon === WEAKNESS[b.element]) {
      type = 'weak';
      dmg = DAMAGE.weak + Math.floor(this.s.lv / 4);
    } else if (icon === b.element) {
      type = 'absorb';
      dmg = DAMAGE.absorb;
    } else {
      type = 'normal';
      dmg = DAMAGE.normal + Math.floor(this.s.lv / 6);
    }
    b.hps[target] = Math.max(0, Math.min(b.max, b.hps[target] - dmg));
    if (type === 'normal') b.gauge = Math.min(100, b.gauge + GAUGE.normal);
    if (type === 'weak') b.gauge = Math.min(100, b.gauge + GAUGE.weak);
    b.hitT = 0;
    b.lastDmg = Math.abs(dmg);
    b.lastType = type;
    b.target = target;
    this.sfx(type === 'weak' ? 'weak' : type === 'absorb' ? 'absorb' : type === 'miss' ? 'miss' : 'hit');
    if (b.hps[target] === 0) this.sfx('defeat');
    this.saveBattle(b);
  }

  private saveBattle(b: BattleMode) {
    this.s.battle = { kind: b.kind, element: b.element, hps: b.hps.slice(), gauge: b.gauge };
  }

  // ---- 進行 ----------------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    const md = this.mode;
    this.heroX += Math.sign(this.s.pos - this.heroX) * Math.min(Math.abs(this.s.pos - this.heroX), dt * 5);
    if (md.m !== 'battle') {
      this.checkerT -= dt;
      if (this.checkerT <= 0) this.jumpChecker();
    }
    switch (md.m) {
      case 'map':
        if (this.s.stock > 0) {
          this.s.stock--;
          this.startRoulette('silver');
        }
        break;
      case 'roulette': {
        const prev = md.t;
        md.t += dt;
        const cell = md.cells[md.target];
        if (prev < md.dur && md.t >= md.dur) this.sfx(cell === 'gold' ? 'gold' : 'stop');
        if (md.t >= md.dur + 0.8) {
          if (cell === 'gold') this.startRoulette('gold');
          else this.mode = { m: 'move', left: cell, t: 0 };
        }
        break;
      }
      case 'move': {
        md.t += dt;
        if (md.t >= 0.32) {
          md.t = 0;
          if (this.s.pos >= this.s.board.length - 1) {
            this.mode = { m: 'map' }; // 念のため: 盤面の端から先へは進まない
            break;
          }
          this.s.pos++;
          md.left--;
          this.sfx('step');
          const tile = this.s.board[this.s.pos];
          if (tile.kind === 'stairs') {
            this.mode = { m: 'floor', t: 0, boss: this.s.floor + 1 >= FLOORS_PER_DUNGEON };
          } else if (md.left <= 0 || this.s.pos >= this.s.board.length - 1) {
            this.land(tile);
          }
        }
        break;
      }
      case 'floor':
        md.t += dt;
        if (md.t > 2.2) this.nextFloor();
        break;
      case 'chest':
        md.t += dt;
        if (md.t > 1.6) this.openChest(md.item);
        break;
      case 'battle': {
        md.t += dt;
        md.hitT += dt;
        md.heroHitT += dt;
        md.atkT += dt;
        md.shuffleT += dt;
        const alive = md.hps.filter((h) => h > 0).length;
        if (md.shuffleT > LANE_SHUFFLE_EVERY && alive > 0) {
          md.shuffleT = 0;
          md.lanes = battleLanes(md.element, this.rand);
          this.sfx('shuffle');
        }
        if (alive > 0 && md.atkT > ENEMY_ATTACK_EVERY / (1 + 0.35 * (alive - 1))) {
          md.atkT = 0;
          md.heroHitT = 0;
          md.lastAtk = this.enemyAtk(md.kind);
          this.s.hp = Math.max(0, this.s.hp - md.lastAtk);
          this.sfx('enemyHit');
          if (this.s.hp <= 0) {
            this.s.battle = undefined;
            this.mode = { m: 'retreat', t: 0 };
            break;
          }
        }
        if (alive === 0 && md.hitT > 0.9) {
          this.s.battle = undefined;
          this.gainExp(ENEMY[md.kind].exp * md.hps.length);
          this.s.hp = Math.min(this.maxHp, this.s.hp + 8);
          this.mode = { m: 'victory', kind: md.kind, party: md.hps.length, t: 0 };
          this.sfx('fanfare');
        }
        break;
      }
      case 'victory':
        md.t += dt;
        if (md.t > 1.8) {
          const tile = this.s.board[this.s.pos];
          if (tile) tile.done = true;
          if (md.kind === 3) {
            // ボス撃破: ダンジョンの深さに応じた回数のジャックポットスロット → 次のダンジョン
            this.clearDungeon();
            this.startSlot(true, jackpotSpins(this.s.dungeon === 0 ? DUNGEON_COUNT - 1 : this.s.dungeon - 1, this.s.loop), { m: 'floor', t: 0, boss: false });
          } else {
            this.startLoot(md.kind, md.party);
          }
        }
        break;
      case 'retreat':
        md.t += dt;
        if (md.t > 2.2) {
          this.s.hp = this.maxHp;
          this.s.pos = Math.max(0, this.s.pos - 1);
          this.mode = { m: 'map' };
        }
        break;
      case 'loot': {
        md.t += dt;
        if (md.t >= md.dur + 0.7) {
          const r = md.cells[md.target];
          if (r === 'orb') this.gainOrbs(1, { m: 'map' });
          else if (r === 'slot') this.startSlot(false, 1, { m: 'map' });
          else this.payout(r, 'バトルボーナス');
        } else if (md.t >= md.dur && md.t - dt < md.dur) {
          this.sfx('stop');
        }
        break;
      }
      case 'slot': {
        const prev = md.t;
        md.t += dt;
        for (const at of [1.4, 2.0, 2.9]) if (prev < at && md.t >= at) this.sfx('reel');
        if (prev < 2.0 && md.t >= 2.0 && md.reels[0] === md.reels[1]) this.sfx('reach');
        if (prev < 2.9 && md.t >= 2.9) this.applySlot(md);
        if (md.t > 4.0) this.nextSpin(md);
        break;
      }
      case 'orb':
        md.t += dt;
        if (md.t > 1.8) {
          if (this.s.orbs >= ORBS_FOR_WHEEL) {
            this.s.orbs = 0;
            this.afterWheel = md.next;
            this.mode = { m: 'wheelIntro', t: 0, reason: 'orb', spins: 0 };
            this.sfx('bigwin');
          } else {
            this.mode = md.next;
          }
        }
        break;
      case 'wheelIntro':
        md.t += dt;
        if (md.t > 2.4) this.spinWheel(md.spins);
        break;
      case 'wheel':
        md.t += dt;
        break;
      case 'get':
        md.t += dt;
        if (md.t > (md.amount >= 100 ? 3.0 : 1.8)) {
          this.mode = this.after ?? { m: 'map' };
          this.after = null;
        }
        break;
    }
  }

  private startRoulette(kind: 'silver' | 'gold') {
    const cells = kind === 'silver' ? SILVER_CELLS : GOLD_CELLS;
    const target = pick(kind === 'silver' ? SILVER_WEIGHTS : GOLD_WEIGHTS, this.rand);
    this.mode = { m: 'roulette', kind, cells, target, t: 0, dur: kind === 'gold' ? 2.6 : 2.2 };
  }

  private land(tile: Tile) {
    if (tile.done) {
      this.mode = { m: 'map' };
      return;
    }
    if (tile.kind === 'chest') {
      this.mode = { m: 'chest', item: tile.chest!, t: 0 };
      this.sfx('chest');
    } else if (tile.kind === 'enemy') {
      const kind = tile.enemy!;
      const n = tile.party ?? 1;
      const element = tile.element ?? ELEMS[Math.floor(this.rand() * 3)];
      this.mode = this.battleMode(kind, element, Array(n).fill(ENEMY[kind].hp), 0);
      this.saveBattle(this.mode as BattleMode);
    } else {
      this.mode = { m: 'map' };
    }
  }

  private battleMode(kind: EnemyKind, element: Elem, hps: number[], gauge: number): BattleMode {
    return {
      m: 'battle', kind, element, hps: hps.slice(), max: ENEMY[kind].hp, lanes: battleLanes(element, this.rand), shuffleT: 0,
      t: 0, atkT: ENEMY_ATTACK_EVERY - ENEMY_FIRST_ATTACK, hitT: 9, lastDmg: 0, lastType: 'normal', target: 0, heroHitT: 9, lastAtk: 0, gauge,
    };
  }

  /** 敵の攻撃力（周回で強くなり、ぶれ ±20%） */
  private enemyAtk(kind: EnemyKind) {
    const base = ENEMY[kind].atk * (1 + ENEMY_LOOP_ATK * this.s.loop + ENEMY_DUNGEON_ATK * this.s.dungeon);
    return Math.round(base * (0.8 + this.rand() * 0.4));
  }

  private gainExp(n: number) {
    this.s.exp += n;
    while (this.s.exp >= this.s.lv * 20) {
      this.s.exp -= this.s.lv * 20;
      this.s.lv++;
      this.s.hp = Math.min(this.maxHp, this.s.hp + 25); // レベルアップで少し回復
    }
  }

  private gainOrbs(n: number, next: Mode) {
    this.s.orbs = Math.min(ORBS_FOR_WHEEL, this.s.orbs + n);
    this.mode = { m: 'orb', t: 0, gained: n, next };
    this.sfx('orb');
  }

  private openChest(item: ChestItem) {
    const tile = this.s.board[this.s.pos];
    if (tile) tile.done = true;
    if (item === 'orb') this.gainOrbs(1, { m: 'map' });
    else if (item === 'slot') this.startSlot(false, 1, { m: 'map' });
    else this.payout(Number(item.slice(1)), '宝箱');
  }

  private startLoot(kind: EnemyKind, party: number) {
    const k = Math.min(2, kind) as 0 | 1 | 2;
    // 仲間が多いほど目が大きくなる（5枚単位）
    const mul = 1 + 0.5 * (party - 1);
    const cells = LOOT_CELLS[k].map((c) => (typeof c === 'number' ? Math.round((c * mul) / 5) * 5 : c));
    this.mode = { m: 'loot', kind, party, cells, target: pick(LOOT_WEIGHTS[k], this.rand), t: 0, dur: 2.4 };
  }

  // ---- スロット ----------------------------------------------------------------
  private startSlot(jackpot: boolean, spins: number, next: Mode) {
    const mode: SlotMode = { m: 'slot', jackpot, spin: 0, spins, reels: [], outcome: { k: 'medal', n: 0 }, t: 0, medals: 0, orbs: 0, dragon: false, next };
    this.rollSlot(mode);
    this.mode = mode;
  }

  /** 結果を先に決めて、それが見える図柄の並びを作る */
  private rollSlot(md: SlotMode) {
    const o = pick(md.jackpot ? JACKPOT_TABLE : CHEST_SLOT_TABLE, this.rand);
    md.outcome = o;
    md.t = 0;
    let reels: SlotSymbol[];
    if (o.k === 'dragon') reels = ['dragon', 'dragon', 'dragon'];
    else if (o.k === 'medal') {
      const sym = `m${o.n}` as SlotSymbol;
      reels = [sym, sym, sym];
    } else {
      // 宝玉 n 個: 宝玉の図柄が n 個出る。残りは揃わない小さなメダル図柄
      const fill: SlotSymbol[] = ['m10', 'm20', 'm50'].sort(() => this.rand() - 0.5) as SlotSymbol[];
      reels = [0, 1, 2].map((i) => (i < o.n ? 'orb' : fill[i])) as SlotSymbol[];
      if (o.n < 3) reels.sort(() => this.rand() - 0.5);
    }
    md.reels = reels;
    void SLOT_SYMBOLS;
  }

  private applySlot(md: SlotMode) {
    const o = md.outcome;
    if (o.k === 'medal') {
      md.medals += o.n;
      this.addPayout(o.n);
      this.sfx(o.n >= 100 ? 'bigwin' : 'win');
    } else if (o.k === 'orb') {
      md.orbs += o.n;
      this.s.orbs = Math.min(ORBS_FOR_WHEEL, this.s.orbs + o.n);
      this.sfx('orb');
    } else {
      md.dragon = true;
      this.sfx('bigwin');
    }
  }

  private nextSpin(md: SlotMode) {
    md.spin++;
    if (md.spin < md.spins && !md.dragon) {
      this.rollSlot(md);
      return;
    }
    // 全部回し終わった
    if (md.dragon || this.s.orbs >= ORBS_FOR_WHEEL) {
      if (!md.dragon) this.s.orbs = 0;
      this.afterWheel = md.next;
      this.mode = { m: 'wheelIntro', t: 0, reason: md.dragon ? 'slot' : 'orb', spins: 0 };
      return;
    }
    if (md.medals > 0) {
      this.mode = { m: 'get', amount: md.medals, t: 0, label: md.jackpot ? 'ジャックポット' : 'スロット' };
      this.after = md.next;
      return;
    }
    this.mode = md.next;
  }

  // ---- 大ルーレット ------------------------------------------------------------
  private spinWheel(spins: number) {
    const target = Math.floor(this.rand() * WHEEL_CELLS.length);
    this.mode = { m: 'wheel', spins, target, waiting: true, t: 0 };
    this.s.totals.wheel++;
    this.events.push({ t: 'wheelSpin', target });
  }

  /** 3D の大ルーレットが止まった（main から呼ぶ） */
  wheelStopped() {
    const md = this.mode;
    if (md.m !== 'wheel') return;
    const cell = WHEEL_CELLS[md.target];
    this.addPayout(cell.medals);
    this.sfx('bigwin');
    if (cell.dragon) {
      // 竜マーク: 連チャン
      this.mode = { m: 'get', amount: cell.medals, t: 0, label: `連チャン！ ${md.spins + 2}回目へ` };
      this.after = { m: 'wheelIntro', t: 1.4, reason: 'chain', spins: md.spins + 1 };
    } else {
      this.mode = { m: 'get', amount: cell.medals, t: 0, label: '大ルーレット' };
      this.after = this.afterWheel ?? { m: 'map' };
      this.afterWheel = null;
      this.events.push({ t: 'wheelEnd' });
    }
  }

  private clearDungeon() {
    this.s.dungeon++;
    if (this.s.dungeon >= DUNGEON_COUNT) {
      this.s.dungeon = 0;
      this.s.loop++;
    }
    this.s.floor = -1; // nextFloor で 0 になる
  }

  private nextFloor() {
    const md = this.mode;
    if (md.m === 'floor' && md.boss) {
      // ボスの間
      this.s.floor = FLOORS_PER_DUNGEON;
      this.s.board = [{ kind: 'start', done: true }, { kind: 'enemy', enemy: 3, party: 1, element: ELEMS[Math.floor(this.rand() * 3)] }];
      this.s.pos = 0;
      this.heroX = 0;
      this.s.hp = this.maxHp;
      this.mode = { m: 'move', left: 1, t: 0 };
      return;
    }
    this.s.floor++;
    this.s.board = Game.makeBoard(this.s.dungeon, this.s.floor, this.rand);
    this.s.pos = 0;
    this.heroX = 0;
    this.s.hp = Math.min(this.maxHp, this.s.hp + 20);
    this.mode = { m: 'map' };
  }

  /** 保存用のスナップショット（戦闘中の敵HPも含む） */
  serialize(): SaveData {
    return JSON.parse(JSON.stringify(this.s));
  }
}
