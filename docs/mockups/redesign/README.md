# リデザイン後の画面（2026-08-23・第2版）

`docs/21-redesign.md` の実装結果。**実装した React SPA を実際にビルドして撮ったもの**で、
モックではありません（`npm run build` → `vite preview` → Chromium／DPR 2）。

骨格は「1本の縦スクロール。幅でモードを切り替える」：
`.read 660px`（読む）→ **幅が変わる** → `.wide 1360px`（使う）→ **幅が戻る** → `.read`（確かめる）。

| ファイル | 何 |
|---|---|
| `pc-top.png` | 1440×900・初期表示。`#lede` は1画面を占有せず、`#why` の頭が見えている |
| `pc-why.png` | 困りごと3点。強調は数字だけ（3つとも大見出しにすると同型反復になる） |
| `pc-ask.png` | **蝶番。** ここで一般の話が「あなたの話」になる。直後に幅が変わって地図が全幅で開く |
| `pc-tool.png` | 地図が主役。右柱に選択自治体の明細と順位。**凍結ペインは無い** |
| `pc-muni.png` | 選択自治体の注記・折れ線・打てる手 |
| `pc-heat.png` | 49自治体 × 12年度。右に表の読み方 |
| `pc-scenario.png` | 条件プリセット |
| `pc-sources.png` | 出典。ライセンスごとに束ねてある |
| `pc-dark.png` | ダークテーマ |
| `pc-1280.png` | 1280×800 |
| `sp-top.png` / `sp-tool.png` / `sp-heat.png` | 390×844。ヘッダ2段、1列、sticky なし |

撮り直しは `vite preview` に対して Playwright を当てている
（`docs/mockups/shot.mjs` は旧 `mockup.html` 用なので使わない）。
