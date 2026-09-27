// ゲームの進行（描画・物理から独立した状態機械）。
// 入力: fed()（メダル投入）, checker()（チェッカー当たり）, won()（手前から獲得）, update(dt)
// 出力: events（払い出し・大ルーレット・効果音）と、画面が読む状態
import { mulberry32 } from '../physics/seed.ts';
import {
  CHEST_TABLE, CRIT_DAMAGE, DUNGEON_COUNT, ENEMY, ENEMY_ATTACK_EVERY, ENEMY_TILE_RATE, FLOORS_PER_DUNGEON,
  GOLD_CELLS, GOLD_WEIGHTS, LOOT_CELLS, LOOT_WEIGHTS, MAX_STOCK, ORBS_FOR_WHEEL, SILVER_CELLS, SILVER_WEIGHTS,
  SLOT_CONSOLATION, SLOT_DRAGON_CHANCE, SLOT_MATCH_CHANCE, SLOT_MATCH_TABLE, SLOT_PAY, SLOT_SYMBOLS, TILES_PER_FLOOR,
  enemyTable, pick,
  type ChestItem, type EnemyKind, type Loot, type SlotSymbol, type StepCell,
} from './rules.ts';
import { WHEEL_CELLS } from './wheelCells.ts';

export interface Tile {
  kind: 'start' | 'chest' | 'enemy' | 'stairs';
  chest?: ChestItem;
  enemy?: EnemyKind;
  done?: boolean;
}

export type Mode =
  | { m: 'map' }
  | { m: 'roulette'; kind: 'silver' | 'gold'; cells: StepCell[]; target: number; t: number; dur: number }
  | { m: 'move'; left: number; t: number }
  | { m: 'floor'; t: number; boss: boolean }
  | { m: 'chest'; item: ChestItem; t: number }
  | { m: 'battle'; kind: EnemyKind; hp: number; max: number; t: number; atkT: number; hitT: number; lastDmg: number; crit: boolean; heroHitT: number }
  | { m: 'victory'; kind: EnemyKind; t: number }
  | { m: 'retreat'; t: number }
  | { m: 'loot'; kind: EnemyKind; cells: Loot[]; target: number; t: number; dur: number }
  | { m: 'slot'; jackpot: boolean; reels: SlotSymbol[]; t: number }
  | { m: 'orb'; t: number; next: Mode }
  | { m: 'wheelIntro'; t: number; reason: 'orb' | 'slot' | 'chain'; spins: number }
  | { m: 'wheel'; spins: number; target: number; waiting: boolean; t: number }
  | { m: 'get'; amount: number; t: number; label: string };

export type GameEvent =
  | { t: 'payout'; n: number }
  | { t: 'wheelSpin'; target: number }
  | { t: 'wheelEnd' }
  | { t: 'sfx'; name: SfxName };

export type SfxName = 'tick' | 'stop' | 'gold' | 'step' | 'chest' | 'hit' | 'crit' | 'enemyHit' | 'win' | 'fanfare' | 'reel' | 'reach' | 'orb' | 'stock' | 'bigwin';

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
  battle?: { kind: EnemyKind; hp: number };
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
  events: GameEvent[] = [];
  /** 画面用: 主人公の表示位置（移動のなめらかさ用） */
  heroX = 0;
  private rand: () => number;
  time = 0;

  constructor(save?: SaveData | null) {
    this.s = save ?? Game.fresh();
    this.rand = mulberry32(this.s.seed ^ (Date.now() & 0xffff));
    this.heroX = this.s.pos;
    if (this.s.battle) {
      const b = this.s.battle;
      this.mode = this.battleMode(b.kind, b.hp);
    }
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
      if (rand() < ENEMY_TILE_RATE) tiles.push({ kind: 'enemy', enemy: pick(enemyTable(dungeon, floor), rand) });
      else tiles.push({ kind: 'chest', chest: pick(CHEST_TABLE, rand) });
    }
    tiles.push({ kind: 'stairs' });
    return tiles;
  }

  get maxHp() { return 90 + this.s.lv * 10; }
  get isBossFloor() { return this.s.floor >= FLOORS_PER_DUNGEON; }
  get busy() { return this.mode.m !== 'map'; }

  private sfx(name: SfxName) { this.events.push({ t: 'sfx', name }); }

  private payout(n: number, label: string, next: Mode = { m: 'map' }) {
    this.s.pendingPayout += n;
    this.s.totals.paid += n;
    this.events.push({ t: 'payout', n });
    this.mode = { m: 'get', amount: n, t: 0, label };
    this.after = next;
    this.sfx(n >= 100 ? 'bigwin' : 'win');
  }

  // ---- 入力 ----------------------------------------------------------------
  canFeed() { return this.s.credits > 0; }

  /** メダルを1枚投入した（手持ちから引く） */
  fed() {
    this.s.credits--;
    this.s.totals.fed++;
    const b = this.mode;
    if (b.m === 'battle') this.damage(1, false);
  }

  /** 手前から落ちて獲得した */
  won(n = 1) {
    this.s.credits += n;
    this.s.totals.won += n;
  }

  /** チェッカー当たり */
  checker() {
    this.s.totals.checker++;
    if (this.mode.m === 'battle') {
      this.damage(CRIT_DAMAGE + Math.floor(this.s.lv / 3), true);
      return;
    }
    if (this.s.stock < MAX_STOCK) {
      this.s.stock++;
      this.sfx('stock');
    }
  }

  // ---- 進行 ----------------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    const md = this.mode;
    // 主人公の表示位置
    this.heroX += Math.sign(this.s.pos - this.heroX) * Math.min(Math.abs(this.s.pos - this.heroX), dt * 5);
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
            // ボスの間は最後のマス（ボス）で止まる
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
      case 'battle':
        md.t += dt;
        md.hitT += dt;
        md.heroHitT += dt;
        md.atkT += dt;
        if (md.hp > 0 && md.atkT > ENEMY_ATTACK_EVERY) {
          md.atkT = 0;
          md.heroHitT = 0;
          this.s.hp = Math.max(0, this.s.hp - ENEMY[md.kind].atk);
          this.sfx('enemyHit');
          if (this.s.hp <= 0) {
            this.s.battle = undefined;
            this.mode = { m: 'retreat', t: 0 };
          }
        }
        if (md.hp <= 0 && md.hitT > 0.8) {
          this.s.battle = undefined;
          this.gainExp(ENEMY[md.kind].exp);
          this.mode = { m: 'victory', kind: md.kind, t: 0 };
          this.sfx('fanfare');
        }
        if (this.mode === md) this.s.battle = { kind: md.kind, hp: md.hp };
        break;
      case 'victory':
        md.t += dt;
        if (md.t > 1.8) {
          const tile = this.s.board[this.s.pos];
          if (tile) tile.done = true;
          if (md.kind === 3) this.startSlot(true);
          else this.startLoot(md.kind);
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
          if (r === 'orb') this.gainOrb();
          else if (r === 'slot') this.startSlot(false);
          else this.payout(r, '戦利品');
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
        if (md.t > 3.8) this.finishSlot(md);
        break;
      }
      case 'orb':
        md.t += dt;
        if (md.t > 1.6) {
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
      this.mode = this.battleMode(tile.enemy!, ENEMY[tile.enemy!].hp);
    } else {
      this.mode = { m: 'map' };
    }
  }

  private battleMode(kind: EnemyKind, hp: number): Mode {
    this.s.battle = { kind, hp };
    return { m: 'battle', kind, hp, max: ENEMY[kind].hp, t: 0, atkT: 0, hitT: 9, lastDmg: 0, crit: false, heroHitT: 9 };
  }

  private damage(n: number, crit: boolean) {
    const b = this.mode;
    if (b.m !== 'battle' || b.hp <= 0) return;
    b.hp = Math.max(0, b.hp - n);
    b.hitT = 0;
    b.lastDmg = n;
    b.crit = crit;
    this.s.battle = { kind: b.kind, hp: b.hp };
    this.sfx(crit ? 'crit' : 'hit');
  }

  private gainExp(n: number) {
    this.s.exp += n;
    while (this.s.exp >= this.s.lv * 12) {
      this.s.exp -= this.s.lv * 12;
      this.s.lv++;
      this.s.hp = this.maxHp;
    }
  }

  private gainOrb(next: Mode = { m: 'map' }) {
    this.s.orbs = Math.min(ORBS_FOR_WHEEL, this.s.orbs + 1);
    this.mode = { m: 'orb', t: 0, next };
    this.sfx('orb');
  }

  private openChest(item: ChestItem) {
    const tile = this.s.board[this.s.pos];
    if (tile) tile.done = true;
    if (item === 'orb') this.gainOrb();
    else if (item === 'slot') this.startSlot(false);
    else this.payout(Number(item.slice(1)), '宝箱');
  }

  private startLoot(kind: EnemyKind) {
    const k = Math.min(2, kind) as 0 | 1 | 2;
    this.mode = { m: 'loot', kind, cells: LOOT_CELLS[k], target: pick(LOOT_WEIGHTS[k], this.rand), t: 0, dur: 2.4 };
  }

  private startSlot(jackpot: boolean) {
    const key = jackpot ? 'jackpot' : 'chest';
    let reels: SlotSymbol[];
    const r = this.rand();
    if (r < SLOT_DRAGON_CHANCE[key]) {
      reels = ['dragon', 'dragon', 'dragon'];
    } else if (r < SLOT_DRAGON_CHANCE[key] + SLOT_MATCH_CHANCE[key]) {
      const s = pick(SLOT_MATCH_TABLE, this.rand);
      reels = [s, s, s];
    } else {
      // ハズレ（リーチ演出のため2つまでは揃うことがある）
      const a = SLOT_SYMBOLS[Math.floor(this.rand() * SLOT_SYMBOLS.length)];
      let c = SLOT_SYMBOLS[Math.floor(this.rand() * SLOT_SYMBOLS.length)];
      const b = this.rand() < 0.4 ? a : SLOT_SYMBOLS[Math.floor(this.rand() * SLOT_SYMBOLS.length)];
      if (a === b && c === a) c = SLOT_SYMBOLS[(SLOT_SYMBOLS.indexOf(a) + 1) % SLOT_SYMBOLS.length];
      reels = [a, b, c];
    }
    this.mode = { m: 'slot', jackpot, reels, t: 0 };
  }

  private finishSlot(md: Extract<Mode, { m: 'slot' }>) {
    const [a, b, c] = md.reels;
    const next: Mode = md.jackpot ? { m: 'floor', t: 0, boss: false } : { m: 'map' };
    if (md.jackpot) this.clearDungeon();
    if (a === b && b === c) {
      if (a === 'dragon') {
        this.mode = { m: 'wheelIntro', t: 0, reason: 'slot', spins: 0 };
        this.sfx('bigwin');
        if (md.jackpot) this.afterWheel = next;
        return;
      }
      if (a === 'orb') {
        this.gainOrb(next);
        return;
      }
      this.payout(SLOT_PAY[a] * (md.jackpot ? 2 : 1), md.jackpot ? 'ジャックポット' : 'スロット', next);
      return;
    }
    this.payout(SLOT_CONSOLATION[md.jackpot ? 'jackpot' : 'chest'], md.jackpot ? 'ボス撃破ボーナス' : 'スロット', next);
  }

  /** 大ルーレットが終わった後に戻る先 */
  private afterWheel: Mode | null = null;

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
    this.s.pendingPayout += cell.medals;
    this.s.totals.paid += cell.medals;
    this.events.push({ t: 'payout', n: cell.medals });
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
      this.s.board = [{ kind: 'start', done: true }, { kind: 'enemy', enemy: 3 }];
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
    this.s.hp = Math.min(this.maxHp, this.s.hp + 30);
    this.mode = { m: 'map' };
  }

  /** 保存用のスナップショット（戦闘中の敵HPも含む） */
  serialize(): SaveData {
    return JSON.parse(JSON.stringify(this.s));
  }
}
