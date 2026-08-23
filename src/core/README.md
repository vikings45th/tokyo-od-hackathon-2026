# `src/core/` — ②ロジック担当

> **③UI担当・①データ担当への申し送りです。ここだけ読めば繋げられます。**
> 契約は `docs/15-interfaces.md` と `src/types.ts`。計算の根拠は `docs/14-basic-design.md`。

---

## 1. 使い方（③はこれだけ）

```ts
import { buildHeatmap, buildMuniDetail, entryYearOf, computeAll } from './core';

const focusYear = entryYearOf(2024, 4);       // → 2031（子が小1になる年度）
// 早生まれ（1〜3月生）は1年早い： entryYearOf(2025, 3) === 2031 / entryYearOf(2025, 4) === 2032
// 第2引数を省くと従来どおり +7
const heatmap   = buildHeatmap(data, focusYear);
const detail    = buildMuniDetail(data, '杉並区', undefined, focusYear);
```

ヒートマップと詳細を同時に描くなら、`computeAll` を1回だけ呼んで
`heatmapFrom(core, focusYear)` / `muniDetailFrom(core, data, muni, focusYear)` に渡すと再計算を避けられます。

### 画面に「根拠」を出すための関数

| 関数 | 何が返るか | どこに出すか |
|---|---|---|
| `measureTrend(data)` | `{ trend, n, rateFrom, rateTo, excluded }` | 「登録率は年 +0.84pt 上昇（48自治体の実測）」の根拠表示 |
| `latentFloorFromData(data)` | 都内 P75 の顕在需要率 | 潜在需要トグルの下限値 |
| `validateAppData(data)` | `{ ok, problems, warnings }` | 開発時のデータ検査（画面には出さなくてよい） |
| `PRESET_SCENARIOS` | プリセット5本（`id` / `label` / `description` / `build`） | シナリオのボタン |

---

## 2. 🔴 ③が必ず守ること

1. **`score: null` は「データなし」。0点として扱わない。** グレー＋「データなし」で描く
2. **`excluded: true` の自治体は色計算に入れない。** 表の下に別枠で `note.text` を添えて出す
3. **`bridgeFrom` の年度から `basis: 'bridged'`。視覚的に区切る**（境界線・網かけ）
4. **`sources` を画面に必ず出す**（名称・提供元・ライセンス・取得日）— FR-8・大会ルール
5. **チャートを書く前に `dataviz` スキルを読む**（`docs/05-tech.md`）
6. 🔴 **`series` の帯は2本ある。取り違えない**（下記）

### 帯は3本ある。取り違えないこと

`MuniDetail.series` には帯が3本入っています。**桁が違うので同じ軸に描くと事故ります**（実測：中央区2031年度）。

| | 値 | 中身 |
|---|---|---|
| `demand` | 2,173.0 | 需要（人） |
| `band` | 9,717.8 〜 10,787.8 | **全学年児童数 N(m,y) の帯**（設計書 §5-3）。⛔ 需要のグラフに描かない |
| **`demandBand`** | **1,855.1 〜 2,834.7** | **需要の帯。** 児童数の推計誤差 **＋ 登録率トレンドの不確かさ** |
| **`gapBand`** | **564.1 〜 1,543.7** | **不足人数の帯**（`gap` = 882）。🔴 S2「◯人分、足りない」に添えるのはこれ |

🔴 **2026-08-23 に `demandBand` の中身が変わりました（docs/19 依頼3-4）。**
以前は `band × targetRate` で**児童数の推計誤差しか入っていません**でした（幅 226.4 → **979.6**）。
モデルを支配しているのは登録率トレンドの方なので、それが入っていないものを「予測区間」と呼べません。

```
relN = (band.lo − children) / children      relR = (r_lo − r_target) / r_target
demandBand.lo = demand × (1 − √(relN² + relR²))     ← 独立と仮定して二乗和平方根
gapBand.lo    = max(demandBand.lo − supply, 0)      ← 供給は推定でなく仮定なので帯を持たない
```

> 🔴 **③へ：`src/ui/Series.tsx` が `band.lo * rTarget` を自前で再計算しています。**
> `r.demandBand` に差し替えてください。**そのままだとトレンドの不確かさが画面に出ません。**

---

## 3. 実装前に数値実験で決めた3点【2026-08-22】

`data/sample.json` で実際に計算して決めました。**設計書と違う所があるので必ず読んでください。**

### 決定1：`r_latent` の分母 N0 は `official[2025]` の6学年合計

設計書 §4-1 は `Muni.baseChildren`（公立学校一覧）と書いていますが、
**`sample.json` の品川区で `baseChildren`(14,417) と `official[2025]`(18,041) が 25.1% 食い違います**（他5自治体は完全一致）。
分母と `N(m,y)` が別系列だと基準年でスコアが狂い、品川区が偽陽性でスコア23を出していました（正しくは7）。

→ **`official[2025]` を分母にします。** `baseChildren` は `validateAppData` の検算専用。
→ **①へ**：この2つは同じ年の同じ値のはずです。出所を突合してください。実データでも同じズレが出ると同じ事故が起きます。

### 決定2：既定は現行式のまま。「潜在需要」は `Scenario.latentFloor` で切り替える

基準年2025では `N = N0` なので `D = Reg+Wait`、`S = Reg` となり、
**`score` は `待機 ÷ (登録+待機)` と完全に一致します。**
要件 §1-2 検証1 が「48中18が0でランキングできない」と否定した待機児童数指標が、そのまま出発点になっています。

`sample.json` 6自治体・2031年度の実測：

| | 2031年の中央値 | 0点の自治体 |
|---|---|---|
| 既定（`latentFloor` 未指定） | **2.9** | 3/6 |
| `latentFloor: latentFloorFromData(data)`（P75 = 0.2587） | **8.2** | 2/6 |

→ **既定は変えません**（実測 0.0084・誠実さが売り）。
→ **③へ**：`latentFloor` をトグルで出してください。ラベルは
　 「抑制された需要が、受け皿の厚い区並みに満たされたら」。
　 **⚠️ これは都の実測値ではなく仮定です。画面に「仮定」と明記してください。**

### 決定3：`bridgeFrom` は 2031。**UC-1 の主役年が `bridged` に入ります**

`Muni.official` の児童数は **2030年度（令和12）まで**しかありません。
`docs/14-basic-design.md` §5-2 の表「令和9〜13年度入学＝official」は**データ上は誤り**です。

→ **③へ**：**境界線は focusYear（2031）の手前に来ます。**
　 網かけ＋「都の公式推計どうしを接続した推定」表記＋誤差帯の拡大で受けてください。
→ **①へ**：都の区市町村別推計が本当に令和12年度で切れるか確認してください。
　 令和13年度まで出せるなら `bridgeFrom` は自動で 2032 になり、この論点は消えます（コード変更不要）。

---

## 4. FR-7 を作らないことの影響

**自然文シナリオ（FR-7）は v1 で作りません。** したがって：

- **境界C（`POST /api/scenario`）は存在しません。** `src/api/` も作っていません
- `ScenarioRequest` / `ScenarioResponse` 型は未使用のまま残っています
- 代わりに **`PRESET_SCENARIOS`（5本）** を `src/core/scenario.ts` に置きました。③はボタンで切り替えるだけです
- 実行時の生成AI呼び出しはゼロになります。提出項目③「生成AI等の活用方法」は
  **①（様式不定CSVの読解ETL）と③（注記生成）＝前処理の2か所**で書くことになります

`docs/15-interfaces.md` §4 と `docs/13-requirements.md` FR-7 の更新が必要です（②の担当外）。

---

## 5. モジュールの地図

```
index.ts        公開API。③はここだけ import する
compute.ts      ★計算の本体。全自治体×全年度の CoreResult を作る
heatmap.ts      CoreResult → Heatmap      ← ③が形を変えたいときはここだけ直す
muniDetail.ts   CoreResult → MuniDetail   ← 同上
forecast.ts     N(m,y)。official / bridged の接続（設計書 §5-2）
bands.ts        予測区間（設計書 §5-3）
indicators/     軸。gakudo.ts が §4-2 の式。軸を足すときは index.ts の配列に足すだけ（FR-9）
score.ts        総合スコア Σ(score×weight)/Σ(weight)
scenario.ts     クランプ・住宅係数・PRESET_SCENARIOS
trend.ts        measureTrend / latentFloorFromData
notes.ts        注記の解決（①のデータ優先、無ければ §4-4 の規則）
scope.ts        N0・r_latent・除外判定
validate.ts     ①のデータ受け入れ検査
```

---

## 5-A. バックテストの再現（2026-08-23 追加・docs/19 依頼4）

```ts
import { computeBacktest } from './core';
computeBacktest(input);   // → Backtest[]（horizon 1・2）
```

画面 S5 の「1年先 0.93% / 2年先 1.37%（49自治体）」は、**リポジトリの中だけで検算できます。**

```
src/core/backtest.ts                          計算（純関数）
src/core/__tests__/fixtures/backtest-input.json   入力 3.8KB（49自治体 × 3ヴィンテージ）
scripts/build_backtest.py                     前処理側の同じ計算（元CSVから直接）
```

`npm test` が **①の `data/app/data.json` の `backtest` と `toEqual` で一致すること**まで確かめます。
🔴 **一致しなくなったら、直すのは画面の数字の方です。逆はやらないこと。**

> **①へ**：この入力を `data/processed/` 側で持ちたい場合、`scripts/build_backtest.py` の
> `build_backtest()` の中で作っている `r5 / r6 / r7` から
> `{ targetYear: 2025, actual: r7, predicted: [{horizon:1, byMuni:r6}, {horizon:2, byMuni:r5}] }`
> を dump するだけです（`BacktestInput` 型・`src/types.ts`）。移したら fixture は消します。

---

## 5-B. 🔴 自治体別トレンド（2026-08-23 追加・docs/19 依頼3）

```ts
const t = measureTrend(data);
t.trend         // 都計比の傾き +0.008128（③の S5 が表示している値。従来どおり）
t.byMuni        // Map<自治体名, MuniTrend>
t.medianSlope   // 自治体別傾きの中央値 +0.0089
t.slopeP10 / t.slopeP90   // +0.0033 / +0.0187（自治体間のばらつき）
t.measuredCount // 自前で傾きを引けた自治体数。🔴 いまは 0 / 49
t.points        // 使えた時点数の中央値。🔴 いまは 2
```

`MuniDetail.trend`（= `MuniTrend`）で、その自治体の傾きが**実測か都平均か**が分かります。

| フィールド | 意味 |
|---|---|
| `used` | 🔴 実際にモデルが使った傾き |
| `fallback` | **true なら「この区の傾きは測れていない。都の実測値を当てている」。画面にそう書くこと** |
| `slope` / `se` / `nPoints` | この自治体だけで引いた傾き・標準誤差・使えた時点数 |
| `ciLo` / `ciHi` | 傾きの下限・上限（片側10%）。`demandBand` の幅はここから来る |
| `denominator` | 分母に使った系列（`childrenSeries` / `schools` / `official`） |

### 🔴 いまは49自治体すべて `fallback: true` です

学童は3時点ありますが **2025-10 に対応する児童数が無い**ので落ち、実質2点＝自由度0。
`MIN_TREND_POINTS = 3` に届かず、全件が都の実測値（+0.81pt）へフォールバックします。

→ **①へ：学童 2024-05-01 の1点（`data/` の令和6年度PDF）を足すだけで有効になります。**
　 分母は `AppData.schools[].actual`（[令和5,6,7]）に既にあるので、**②のコード変更は不要**です。
　 そのとき縮約推定が同時に効き、標準誤差の大きい自治体は都平均へ寄ります。

### `Scenario.trend` の意味が変わりました（後方互換）

| 渡し方 | 挙動 |
|---|---|
| **数値を渡す**（③のスライダー） | その値を49自治体すべてに一律。**従来どおり。画面の挙動は変わりません** |
| **未指定**（`computeAll(data)`） | **自治体別の実測値**。引けない自治体は都の実測値へフォールバック |

`core.scenario.trend` は「実際に使われた一律の値」で、未指定のときは `measureTrend(data).trend`
に揃えてあります（定数を表示しつつ実測値で計算する、という食い違いを作らないため）。

---

## 6. まだ作っていないもの

| | 状態 | 影響 |
|---|---|---|
| **学校別コーホート＋raking**（設計書 §5-1） | **未実装** | **スコアもヒートマップも数字は変わりません。** スコアに必要な自治体別児童数は `Muni.official` に既にあり、raking の出力は定義上その公式値と一致するため。DoD#1・#2 と「都の推計をブラウザで再実行」という技術力の見せ場だけが未達。`forecast.ts` の `projectMuni` を差し替えれば入ります |
| ~~`backtest.ts`~~ | ✅ **実装済み**（2026-08-23） | `computeBacktest(input)` が 0.93% / 1.37% を再現し、`data/app/data.json` の `backtest` と一致することを `npm test` が assert します。DoD#3 達成 |
| `src/api/` | **作りません** | FR-7 を作らないため |

---

## 7. 開発コマンド

```bash
npm test          # vitest。66件
npm run typecheck # tsc --noEmit
npm run dev       # vite
npm run build     # NFR-4：ネットに触れない
npm run validate                    # data/app/data.json を検査（problems があれば exit 1）
npm run validate data/sample.json   # パス指定も可
```

> ⚠️ **このリポジトリのルート雛形（`package.json` / `tsconfig.json` / `vite.config.ts` / `vitest.config.ts`）は②が作りました。**
> `package-lock.json` のオーナーも②です。依存を足したいときは声をかけてください。
> `vite.config.ts` は `root: 'src'` なので、**③が `src/index.html` を置くまで `npm run dev` / `npm run build` は動きません**（NFR-4 の確認もそこまで待ちです）。

### 🔴 `vite.config.ts` の `publicDir` について

いまは **`publicDir: false`** にしてあります。**`'../data'` にしないでください。**
`data/` 直下には転載不可のPDF・CSVが置かれており、まるごと `dist/` にコピーされて
公開URLから配信されてしまいます（`data/README.md`・`CLAUDE.md` のライセンス方針違反。**動画はYouTubeで一般公開されます**）。

③は `import data from '../../data/app/data.json'` で読んでいます（Vite がバンドルに畳み込むので
`publicDir` も実行時のネットワークも不要。NFR-4）。**`publicDir: '../data'` にはしないでください。**
