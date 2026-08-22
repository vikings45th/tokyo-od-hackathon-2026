# ②への依頼：プロジェクトの初期セットアップ

> **③（UI担当）から②（ロジック/AI担当）へのお願いです。**
> ②の所有ファイル（`package.json` / `vite.config.ts` / `index.html`）に
> **1回だけ**手を入れてほしい、という依頼です。
>
> **これが済んだ時点で③は分岐でき、以後のファイル衝突はゼロになります。**
> `src/core/` の実装方針には一切触れていません。予測エンジンの中身は②の詳細設計です。

**作成日：2026-08-22**／依頼者：③UI担当

---

## そのまま貼る（②の Claude Code に）

````
このリポジトリの初期セットアップをお願いします。③（UI担当）からの依頼です。

## 先に読んでほしいファイル
- docs/15-interfaces.md   ②③の契約（§3 境界B が今回の関係箇所）
- docs/16-ui-detail-design.md  ③のUI詳細設計（§0 に変更理由）
- CLAUDE.md               チーム共通の前提

## やってほしいこと（4つ）

### 1. 依存を追加する
npm i react@19 react-dom@19 @heroui/react tailwindcss @tailwindcss/vite \
      @vitejs/plugin-react d3-geo topojson-client

確認済みのバージョン（2026-08-22 に npm registry で実在確認）:
  react / react-dom      19.2.8   MIT
  @heroui/react           3.2.4   MIT
  tailwindcss             4.3.3   MIT
  @tailwindcss/vite       4.3.3   MIT   ← Tailwind 4 は Vite プラグインが別パッケージ
  @vitejs/plugin-react    6.1.0   MIT   ← peer が vite ^8.0.0。Vite 7以下なら要調整
  d3-geo                  3.1.1   ISC
  topojson-client         3.1.0   ISC

- HeroUI の peer（react-aria / react-aria-components / @react-aria/i18n /
  @react-aria/ssr / @react-aria/utils）は npm 10 が自動で入れます。明示指定は不要です。
- すべて MIT / Apache-2.0 / ISC で、コピーレフト（ソース開示義務）はありません。
- Apache-2.0（react-aria 系）は NOTICE の同梱義務があるので、
  ビルド時に dist/LICENSES.txt へ集約する仕組みを入れてください。

### 2. vite.config.ts
- @tailwindcss/vite と @vitejs/plugin-react を有効にする
- ⚠️ ビルドがネットワークに触れない構成にすること（data/ を読むだけ）

### 3. index.html
- React のルート要素（<div id="root">）と、src/ui/main.tsx への script を用意する
- 中身のUIは書かないでください。src/ui/ は③が書きます。

### 4. src/types.ts の変更5点をレビューする
③が先に入れてあります。②はまだ src/core/ を書き始めていないので手戻りゼロのはずです。
合意できるか、直すべき点があるかを見てください。完全仕様は docs/15-interfaces.md §3。

  1. entryYearOf(birthYear, birthMonth) — 早生まれ対応。
     学校教育法で4月2日〜翌4月1日生まれが同学年。年だけだと1〜3月生まれが1年ずれる。
     実装は birthYear + (birthMonth >= 4 ? 7 : 6)
  2. HeatmapCell に demand / supply / gap を追加 —
     無いと地図のホバーごとに buildMuniDetail を49回呼ぶことになる。588セル×3数値で軽い。
  3. Heatmap.bins を追加 — 色の5段ビンの閾値。
     ③が独自に決めるとデータが変わった瞬間に色の意味が変わるので②が返す。固定閾値にすること。
  4. MuniDetail.alternatives を削除 — ②は地理情報を持たないので実装できない。
     ③が topojson.neighbors()（共有arcから隣接を求める）と Heatmap.cells で算出します。
  5. DEFAULT_SCENARIO を export — { trend: 0.0084 }（+0.84pt/年・実測値）

## 触らないでほしいもの
- src/ui/**    ③の担当
- src/core/**  ②の本番実装は別タスク。このタスクでは書かない
- data/**      ①の担当
- docs/16-ui-detail-design.md、docs/mockups/**  ③の担当

## 受け入れ条件（自分でコマンドを叩いて確かめてください）
1. npm run dev が起動する
2. npm run build が通る
3. ビルドがネットワークに触れない
   → ビルドログに外部ホストへのfetchが無いこと。data/ を読むだけであること。
     （3人のうち1人だけビルドできない事故を防ぐため。docs/13-requirements.md NFR-4）
4. node --experimental-strip-types -e "import('./src/types.ts')" が通る
5. git status の変更が package.json / package-lock.json / vite.config.ts /
   index.html / tsconfig 関連 に収まっている

## 終わったら報告してほしいこと
- 実際に入った各パッケージのバージョン（peer 込み）
- vite / TypeScript のバージョン（③の tsconfig 前提と揃えたいので）
- src/types.ts の5点に合意できたか。直すべき点があればその内容
- npm run build の所要時間と dist のサイズ
````

---

## 人間向けの補足

### なぜ必要か（提出項目③「技術選定の理由」の材料）

| 追加 | 理由 |
|---|---|
| React 19 ＋ Tailwind 4 ＋ HeroUI | **HeroUI が peer で要求**（`react >=19` / `tailwindcss >=4`）。入力・Tooltip・Toast と、**react-aria 由来のキーボード操作**が無料で手に入る |
| `d3-geo` / `topojson-client` | 地図コロプレスの投影と TopoJSON 展開。**地図ライブラリは使わない**（`maplibre-gl` 18.5MB / `leaflet` 3.6MB に対し `d3-geo` 0.2MB。ベースマップのタイル配信という外部依存も避けられる） |

**入れなかったもの**にも理由があります（こちらも提出材料になります）。

- **チャートライブラリ**（recharts 7.1MB / victory 2.2MB・deps27 ほか）
  → 主役の地図とヒートマップが守備範囲外。役に立つのは折れ線1系列だけ
- **d3-zoom**（85KB・deps5）→ 地図の拡大縮小は `viewBox` 書き換え約40行で足りる
- **アニメーションライブラリ** → `IntersectionObserver` ＋ CSS で足りる

### ②の実装には影響しません

`src/core/` は `AppData` を受けて `Heatmap` / `MuniDetail` を返す純関数群で、
**React はビューの都合であって計算には無関係**です。②は `.ts`（`.tsx` ではない）を書き、
React を import しません。**接点は `src/types.ts` の型だけ**です。

⚠️ ただし **`src/api/` だけは Cloudflare Pages Functions ＝ Workers ランタイム**で、
`fs` / `path` / `Buffer` が使えません（`nodejs_compat` を有効にしない限り）。
詳細は `docs/15-interfaces.md`。

### Slack に貼る短縮版

```
③です。初期セットアップだけお願いしたく。触るのは package.json / vite.config.ts /
index.html の3つだけで、1回で終わります。以降は自分が src/ui/ しか触らないので衝突しません。
依頼文は docs/17-setup-request.md にあります（Claude Code にそのまま貼れます）。
あと src/types.ts を5点直しました。まだ src/core/ 未着手のうちに見てもらえると手戻りゼロです。
```
