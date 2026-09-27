# クレジット

## 使用ライブラリ

| 名前 | ライセンス | 用途 |
|---|---|---|
| [three.js](https://threejs.org/) | MIT | 描画・ブルーム |
| [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) | Apache-2.0 | 物理 |

## フォント

| 名前 | ライセンス | 入手元 | 用途 |
|---|---|---|---|
| Cinzel | SIL OFL 1.1 | `@fontsource/cinzel`（Google Fonts） | ロゴ・数字・英字 |
| Zen Antique | SIL OFL 1.1 | [google/fonts](https://github.com/google/fonts/tree/main/ofl/zenantique) を `scripts/subset-font.py` でサブセット化 | 画面の日本語 |

## 素材

外部の画像・3Dモデル・音声はまだ使っていない（この開発環境から Kenney 等の配布サイトに接続できないため）。
すべてコードで生成しているオリジナル。

| 素材 | 作り方 |
|---|---|
| メダルの刻印（竜）・側面のギザ | `src/render/medalTexture.ts` |
| 木目・金の唐草・城壁の石・床 | `src/render/canvasKit.ts` / `cabinet.ts` |
| 液晶の画面（主人公・敵・宝箱・宝玉・スロット図柄・迷宮の背景） | `src/render/art.ts` / `screen.ts` |
| 大ルーレットの盤面 | `src/render/wheel.ts` |
| 竜の像・ホッパーの竜の頭 | `src/render/dragon.ts`（プリミティブの組み合わせ） |
| 環境マップ | `src/main.ts` の `arcadeEnvironment()` |
| 衝突音・獲得音・ハズレ音・チェッカー音 | `src/audio.ts`（WebAudio で合成） |

## 仮置き・差し替え候補の一覧

| 項目 | 今の状態 | 予定 |
|---|---|---|
| 竜の像（中央塔の2体） | プリミティブで組んだ仮モデル | CC0 モデル（Quaternius 等）が入手できれば差し替え、なければ作り込み |
| 液晶の3Dキャラ（主人公／スライム／コウモリ騎士／岩の番人／宝を喰らう竜）・宝箱・迷宮 | `src/screen3d/` でプリミティブから組んだ3Dモデル | CC0 の3Dモデルが入手できれば差し替え候補 |
| 効果音・BGM | 合成音 | ステージ4で CC0 素材に差し替え |
| 隣のステーション | 本体の複製（メダルなし） | このまま |
