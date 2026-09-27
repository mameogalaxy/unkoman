export interface WheelCell {
  medals: number;
  /** 竜マーク付き = 止まると連チャン */
  dragon: boolean;
}

// 巨大ルーレットの14マス。500/300/200 が各2マス（竜マーク）、100 が6マス、50 が2マス
export const WHEEL_CELLS: WheelCell[] = [
  500, 100, 50, 300, 100, 200, 100, 500, 100, 50, 300, 100, 200, 100,
].map((m) => ({ medals: m, dragon: m >= 200 }));
