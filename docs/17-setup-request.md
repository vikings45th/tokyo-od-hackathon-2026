# ②への変更依頼（第2版・2026-08-22）

> ✅ **3件とも②が対応済みです（`abcdae0` → main `c8379f2`）。このドキュメントは記録として残します。**
>
> | 依頼 | 結果 |
> |---|---|
> | A 早生まれ | `entryYearOf(birthYear, birthMonth?)`。加えて `isEarlyBirth` / `entryAgeOffset` も公開され、`birthYearOf` も対称になった。「4月1日生まれだけは月では区別できない」という限界もコメントに明記された |
> | B `demandBand` | `MuniDetail.series[].demandBand`（`band × targetRate`）。`band` 側にも「これは児童数の帯であって需要の帯ではない」と明記された |
> | C `startup` の gitlink | 削除＋`.gitignore` に追加 |
>
> ③側は依頼Aが入ったので **`src/ui/entryYear.ts`（暫定ラッパー）を削除**し、
> `../core` の `entryYearOf` / `isEarlyBirth` を直接使うようにしました。
> **検証：2025年3月生まれ → 2031年度／2025年4月生まれ → 2032年度**（切替後も同じ答え）。

> **第1版（セットアップ依頼）は破棄しました。** ②が先に `package.json` /
> `tsconfig.json` / `vite.config.ts` / `vitest.config.ts` を作り終えていたためです。
> Vite 8.2.2 / TypeScript 7 で、③が入れる `@vitejs/plugin-react` 6.1.0 の
> peer（`vite ^8`）をそのまま満たします。**調整は不要でした。**

`src/core/` を読んで検証しました。**申し送り13点はすべて正確**で、
うち2点は報告よりも状況が良かったです（下の §3）。
**変更依頼は3件だけです。** うち blocking は **依頼Aのみ**。

---

## そのまま貼る（Claude Code 用）

```
あなたは②ロジック担当です。③UI担当から変更依頼が3件来ています。

最初に読むファイル：
  - src/core/entryYear.ts
  - src/core/muniDetail.ts
  - src/core/constants.ts
  - docs/17-setup-request.md（このファイル。依頼の根拠が書いてあります）

触ってよいファイル：
  - src/core/entryYear.ts
  - src/core/muniDetail.ts
  - src/core/constants.ts
  - src/core/__tests__/core.test.ts
  - src/types.ts（依頼Bの型追加のみ）
触らないファイル：
  - src/ui/** と src/index.html（③の領域。まだ作成中です）
  - src/core/compute.ts / forecast.ts / indicators/**（計算ロジックは変えません）

────────────────────────────────────────
依頼A【必須・blocking】entryYearOf に生まれ月を足す

現状：
  export function entryYearOf(birthYear: number): number {
    return birthYear + ENTRY_AGE_OFFSET;   // 常に +7
  }

依頼（後方互換。第2引数は任意にすること）：
  export function entryYearOf(birthYear: number, birthMonth?: number): number

  学校教育法：4月2日〜翌年4月1日生まれが同学年。
  birthMonth が 1〜3（早生まれ）なら +6、それ以外（または未指定）なら +7。

  | 生年月    | 正しい入学年度 | 現状の出力 |
  |-----------|--------------|-----------|
  | 2024年4月 | 2031         | 2031 OK   |
  | 2025年3月 | 2031         | 2032 NG   |
  | 2025年4月 | 2032         | 2032 OK   |

  birthYearOf も対称に扱えるようにしてください（少なくとも
  「早生まれだと1年ずれる」ことをコメントで明示）。

  constants.ts の ENTRY_AGE_OFFSET のコメント
  「生まれ『年』しか受け取らないので +7 に決め打ちし、画面で注記する」
  は、この変更で不要になります。更新してください。

  テストを追加すること：
    entryYearOf(2024, 4)  === 2031
    entryYearOf(2025, 3)  === 2031
    entryYearOf(2025, 4)  === 2032
    entryYearOf(2024)     === 2031   // 第2引数なしは従来どおり

────────────────────────────────────────
依頼B【推奨・blocking ではない】MuniDetail.series に demandBand を足す

申し送りにあった「band は児童数の帯で、demand とは桁が違う」件です。
実測で確認しました（data/sample.json・中央区・2031年度）：

    demand           2,189.8
    band(children)   9,701.8 〜 10,966.5   ← 4.5倍。同じ軸に描くと事故る

muniDetail.ts の series 生成に1行足してください。
demand は children に対して線形なので、厳密に導出できます：

    demandBand: {
      lo: r.projection!.band.lo * (r.detail.rTarget ?? 0),
      hi: r.projection!.band.hi * (r.detail.rTarget ?? 0),
    }

  src/types.ts の MuniDetail.series にも demandBand を足してください。
  band は残してかまいません（児童数のグラフを別に描く可能性があるため）。
  ただし band のコメントに「これは児童数の帯であって需要の帯ではない」と
  明記してください。次に触る人が同じ罠にはまります。

────────────────────────────────────────
依頼C【軽微】startup という空の gitlink を消す

  $ git ls-files -s startup
  160000 cca146747bc3fbf36d0af9c1d3a7ff28f80e0fc1 0  startup

.gitmodules が無いのに mode 160000 のエントリだけがコミットされています。
おそらく②の環境の作業ディレクトリが紛れ込んだものです。
git submodule 系のコマンドが失敗するので、`git rm --cached startup` してください。

────────────────────────────────────────
完了したら報告する内容

  - npm test が green（件数）
  - npm run typecheck が通ること
  - 依頼Bを入れたか（入れないなら③が導出側で対応します）
  - entryYearOf の新しいシグネチャ
```

---

## 人間向けの補足

### なぜ依頼Aだけ blocking なのか

このサービスは**6年後の住宅購入判断**に使わせるものです。
1〜3月生まれ（早生まれ）は**全体の約1/4**で、入学年度が1年早い。
ここが1年ずれると、**ヒートマップで見せる年度の列がまるごと違う**ことになります。

②のコメントにある「画面で注記する」では回避できません。
③のUIは**生年「月」まで入力させる**設計になっているので、
月を持っているのに使わない、という状態になってしまいます。

### 依頼Bを③側でやらない理由

`band.lo × detail.rTarget` は③でも厳密に計算できます。
それでも②にお願いするのは、`series` の中で **`band` だけ意味が違う**状態を
残さないためです。次に触る人（動画収録後の改修や Final Stage）が必ず踏みます。

**②の手が空かないなら③が導出して進めます。** これは blocking ではありません。

---

## §3 検証結果：③が契約に書いた要求のうち2件は、もう満たされていました

`src/core/index.ts` が `computeAll` と `CoreResult` を export しているのを確認しました。

```ts
export interface CoreCell {
  score: number | null; excluded: boolean; basis: Basis;
  projection: Projection | null;
  detail: Record<string, number>;   // rLatent/rTarget/demand/supply/gap/fill/children/...
}
export interface CoreResult {
  years, bridgeFrom, scenario, munis, cells,
  byMuni: Map<string, CoreCell[]>,  // ← O(1) 参照
  notes, excludedMunis, trend, forecast
}
```

→ ③は `buildHeatmap` / `buildMuniDetail` ではなく **`computeAll()` を1回呼んで
`CoreResult` から描きます。** 地図ホバーのたびに再計算する問題も消えました。

## §4 依頼しないもの（②の時間を使わせないため、意識的に降ろしました）

②が offer してくれた変更のうち、以下は**不要**です。

| ②の offer | 判断 |
|---|---|
| `HeatmapCell` に `demand`/`supply`/`gap` を追加 | **不要。** `CoreCell.detail` にある |
| `cells` を Map や2次元配列で引ける形にする | **不要。** `byMuni: Map` がある |
| `Heatmap.bins` を戻す | **不要。削除して正解でした**（下記） |
| `score` の丸め | **不要。** ③が表示時に丸めます |
| `alternatives` の件数変更 | **不要。** ③が地理的隣接で作り直します（下記） |

### `bins` は③が持ちます。値は `[0, 3, 8, 15, 30]`

契約に書いていた `[0, 10, 25, 40, 60]` は**実測分布に合っていませんでした。**
49自治体 × 12年度 ＝ 588セル（実データ由来の fixture）で数えた結果：

| bins | 2027年度 | 2031年度 | 2038年度 |
|---|---|---|---|
| `[0,10,25,40,60]`（旧契約） | 38 / 10 / 1 / 0 / 0 | 42 / 6 / 0 / 1 / 0 | 16 / 31 / 1 / 1 / 0 |
| **`[0,3,8,15,30]`（採用）** | 17 / 17 / 12 / 3 / 0 | 25 / 13 / 8 / 2 / 1 | 4 / 6 / 19 / 18 / 2 |

旧契約では**上位2色がほぼ使われず地図が単色**になります。
採用案は 2027→2038 で分布が右に大きく動くので、
「年度が進むと濃くなる」というスクロール演出がそのまま絵になります。

**分位ではなく固定値**なので、年度やシナリオを変えても色の意味は動きません。
③が契約に書いた「③が独自に決めると色の意味が動く」という懸念は、
固定値で持つ限り起きません。**②の判断が正しかったです。**

### `alternatives` は③が地理的隣接で作り直します

②の「近隣＝同じ area 区分（23区／多摩26市）」は、地理情報を持たない以上
妥当な実装です。ただし画面に出すと **中央区の「近隣」に世田谷区が並ぶ**ことになり、
引っ越し先の検討には使えません。

③は `data/geo/tokyo-49.topo.json` と `topojson.neighbors()`（共有arcから隣接を求める）を
持っているので、**地理的に隣接する自治体**を出します。
`CoreResult.byMuni` のスコアと突き合わせるだけなので②の変更は不要です。

**②側は現状維持でかまいません。** `MuniDetail.alternatives` は③では使いません。

## §5 ③が守ること（②の申し送りに対する回答）

| ②の申し送り | ③の対応 |
|---|---|
| `score: null` を0点として扱わない | 守ります。グレー表示・色計算から除外 |
| `excluded: true` を色の計算に入れない | 守ります |
| `bridgeFrom` から視覚的に区切る | 守ります（2031年度から） |
| `data.sources` を画面に出す | 守ります。**S5「根拠と出典」に専用セクション**を置きます |
| 江戸川区を別枠に落とさない | 守ります。地図に描き、`series-break` の注記を出します |
| `vite.config.ts` の `publicDir` を `'../data'` にしない | 守ります。`data/app/` ができたらそこだけを指すよう①と調整中 |
| `+0.84pt/年` をハードコードしない | 守ります。`measureTrend(data)` の戻り値を表示します（sampleでは 0.628pt/年） |

## §6 ③が `package.json` / `tsconfig.json` に足すもの（事後報告）

`package.json` は②がオーナーですが、UI実装のため③が以下を追記します。
**全部 MIT か ISC で、コピーレフトはありません。**

| パッケージ | 版 | ライセンス | 何のため |
|---|---|---|---|
| `react` / `react-dom` | 19.2.8 | MIT | HeroUI が要求（>=19） |
| `@heroui/react` | 3.2.4 | MIT | 入力・Tooltip・a11y |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | MIT | HeroUI が要求（>=4） |
| `@vitejs/plugin-react` | 6.1.0 | MIT | JSX 変換（peer は `vite ^8` ＝OK） |
| `d3-geo` | 3.1.1 | ISC | 地図の投影 |
| `topojson-client` | 3.1.0 | ISC | TopoJSON 展開・`neighbors()` |

`tsconfig.json` に `"jsx": "react-jsx"` を足します。②のテストには影響しません。

**地図ライブラリ（maplibre 18.5MB / leaflet 3.6MB）とチャートライブラリは入れません。**
d3-geo 0.2MB ＋ topojson-client 0.07MB で足ります。ズームは `viewBox` の自前実装（約40行）です。
