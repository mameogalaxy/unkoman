# クレジット

## 使用ライブラリ

| 名前 | ライセンス | 用途 |
|---|---|---|
| [three.js](https://threejs.org/) | MIT | 描画（`RoomEnvironment` による環境マップを含む） |
| [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) | Apache-2.0 | 物理 |

## 素材

ステージ1時点では外部素材を使っていない。

| 素材 | 状態 | 出典 |
|---|---|---|
| メダルの刻印（竜）・側面のギザ | コードで生成（`src/render/medalTexture.ts`） | オリジナル |
| 環境マップ | three.js の `RoomEnvironment` から生成 | – |
| 衝突音・獲得音・ハズレ音 | WebAudio で合成（仮） | オリジナル |

## 仮置き・未作成の一覧

| 項目 | 予定 |
|---|---|
| 筐体（クロームの枠・奥の装飾パネル・ランプ列） | ステージ2で作り込み（CC0 モデル or コード生成） |
| チェッカー・ホッパー・巨大ルーレット | ステージ2〜3 |
| 効果音・BGM | ステージ4で CC0 素材（Kenney など）に差し替え |
