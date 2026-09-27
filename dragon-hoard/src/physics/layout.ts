// 筐体の寸法。単位はすべて cm（1 unit = 1 cm）。
// 座標系: +x 右, +y 上, +z 手前（プレイヤー側）。下段フィールドの前端が z = 0。

export const MEDAL = {
  radius: 1.25, // 直径 25mm
  halfThickness: 0.1, // 厚さ 2mm
  density: 8.0, // 真鍮 g/cm^3（質量の相対値としてのみ使う）
  friction: 0.28,
  restitution: 0.18,
} as const;

export const FIELD = {
  innerHalfWidth: 15, // 左右ガラス内側の半幅
  floorY: 0,
  frontZ: 0, // 下段フィールドの前端（ここから落ちたら獲得）
  gutterDepthZ: -10, // この z より手前は左右に落とし穴（ハズレ）がある
  gutterWidth: 3, // 落とし穴の幅
  backZ: -44, // 下段床の奥端（プッシャーの下まで続く）
  floorFriction: 0.22,
} as const;

export const PUSHER = {
  height: 3.0, // 上段テーブル上面の高さ
  depth: 22, // 前後方向の長さ（最前進時も後端が奥壁の下に隠れる長さ）
  frontMinZ: -20, // 最も引いた時の前面 z
  frontMaxZ: -12, // 最も出た時の前面 z
  period: 4.0, // 1往復の秒数
  friction: 0.3,
} as const;

export const BACK_WALL = {
  frontZ: -27, // 奥壁の前面
  thickness: 4,
  gap: 0.08, // プッシャー上面との隙間（メダル厚より十分小さい）
  height: 20,
} as const;

// これより下に落ちたメダルは判定して削除する
export const KILL_Y = -4;

// 画面の下のレーン（チェッカー）。奥壁の前に銀の仕切りが並び、手前の板に8つの穴が開いている。
// 手前の発射台から飛ばしたメダルが穴に入ると、仕切りの間を縦に落ちて上段へ出る。
export const LANES = {
  count: 8,
  frontZ: BACK_WALL.frontZ + 1.5, // 仕切りの手前端 = 穴の面
  bottomY: 4.7, // 仕切りの下端（上段のメダルの山より上）
  holeBottomY: 8.0, // 穴の下辺
  topY: 11.2, // 穴の上辺 = 仕切りの上端
  fingerThickness: 0.36,
  sensorY: 5.4, // この高さを通過したら「レーン通過」
} as const;

// 手前中央の発射台
export const SHOOTER = {
  x: 0,
  y: 9.0,
  z: 2.5,
  /** 穴まで飛ぶ時間（秒）。短いほど低く速い弾道 */
  flightTime: 0.19,
} as const;

export function laneCenterX(i: number) {
  const w = (FIELD.innerHalfWidth * 2) / LANES.count;
  return -FIELD.innerHalfWidth + w * (i + 0.5);
}

// 奥壁 = 液晶画面
export const SCREEN = {
  width: 30,
  height: 22.5,
  bottomY: 11.6,
  z: BACK_WALL.frontZ - 0.05,
} as const;

// 左奥のホッパー（竜の口）。払い出しメダルはここから勢いよく飛び出す
export const HOPPER = {
  x: -FIELD.innerHalfWidth + 0.9,
  y: 12.2,
  z: BACK_WALL.frontZ + 4.2,
} as const;
