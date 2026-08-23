# リデザイン後の画面（2026-08-23）

`docs/21-redesign.md` の実装結果。**実装した React SPA を実際にビルドして撮ったもの**で、
モックではありません（`npm run build` → `vite preview` → Chromium／DPR 2）。

| ファイル | 何 |
|---|---|
| `pc-top.png` | 1440×900・初期表示。**ヘッダの入力と地図と数字が最初のフレームで全部見える** |
| `pc-muni.png` | 選択自治体の解説パネル（注記・折れ線・打てる手） |
| `pc-story.png` | `#story` を読んでいるところ。**左の地図の年度が段に追従する** |
| `pc-heat.png` | 49自治体 × 12年度。いま地図が見ている列に枠が出る |
| `pc-sources.png` | 出典パネル。ライセンスごとに束ねてある |
| `pc-dark.png` | ダークテーマ |
| `sp-top.png` | 390×844。ヘッダ2段＋地図が sticky |
| `sp-heat.png` | 同上・スクロール後。地図が貼り付いたままヒートマップを読める |

撮り直しは `docs/mockups/shot.mjs` ではなく、`vite preview` に対して直接
Playwright を当てている（`shot.mjs` は旧 `mockup.html` 用）。
