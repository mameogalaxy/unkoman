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
