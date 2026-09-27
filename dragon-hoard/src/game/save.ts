// localStorage への保存。手持ち・進行・フィールドのメダル配置をまとめて1キーに入れる。
import type { FieldLayout, Snapshot } from '../physics/protocol.ts';
import type { SaveData } from './game.ts';

const KEY = 'dragon-hoard/save/v1';

export interface SaveFile {
  game: SaveData;
  field: FieldLayout | null;
  savedAt: number;
}

export function loadSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as SaveFile;
    if (f?.game?.v !== 1) return null;
    return f;
  } catch {
    return null;
  }
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function fieldFromSnapshot(s: Snapshot): FieldLayout {
  return { pos: Array.from(s.pos, r3), quat: Array.from(s.quat, r3) };
}

export function writeSave(game: SaveData, snap: Snapshot | null) {
  try {
    const f: SaveFile = { game, field: snap ? fieldFromSnapshot(snap) : null, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    // 容量不足やプライベートモードでは保存しない（遊ぶことはできる）
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
