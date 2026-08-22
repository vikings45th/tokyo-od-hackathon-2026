# インターフェース定義 — 3人の境界

> **このドキュメントと `src/types.ts` が、3人が別々に詳細設計へ入るための境界です。**
> ここが合意できた時点で並行実装を始められます（`docs/10-roles-schedule.md` §2）。
>
> - 型の実体は **[`src/types.ts`](../src/types.ts)**（こちらが正）
> - ダミーデータは **[`data/sample.json`](../data/sample.json)**（実測値ベース・6自治体18校）
> - 設計の根拠は [`docs/14-basic-design.md`](14-basic-design.md)

**作成日：2026-08-22**

---

## 0. ⚠️ 型を変えたくなったら

**勝手に変えないでください。3人全員の手が止まります。**
声をかけて合意してから変えること（`docs/10-roles-schedule.md` §2）。
`src/types.ts` のオーナーは②です。

---

## 1. 誰の出力が、誰の入力になるか

```
 ①データ                    ②ロジック/AI                    ③UI
 ────────                   ─────────────                   ────
 scripts/ で生成
      │
      └── data/app/data.json（AppData形式・本番・1ファイル） ─▶ AppData ──▶ forecast.ts
                                                                    │
                                                                    ▼
                                                             Projection[]
                                                                    │
      data/sample.json ─────────────────────▶  indicators/  ◀── Scenario
      （①が先に置くダミー。②③はこれで着手）        │            ▲
                                                     ▼            │
                                          Heatmap / MuniDetail ────┼──▶ 画面
                                                                  │
                                          /api/scenario ──────────┘
                                          （ScenarioRequest → ScenarioResponse）
```

| 境界 | 型 | 出す人 | 受ける人 |
|---|---|---|---|
| **A** | `AppData`（`munis` / `schools` / `tokyo` / `backtest` / `sources`） | ① | ② |
| **B** | `Heatmap` / `MuniDetail` | ② | ③ |
| **C** | `ScenarioRequest` / `ScenarioResponse` | ③が呼び、②が実装 | 双方 |
| **D** | `Scenario` | ③のスライダー／②のAI | ② |

---

## 2. 境界A — ①データ → ②ロジック

### ①が作るファイル

> **2026-08-22 ②と合意：本番も5分割ではなく `data/app/data.json` に1ファイル集約する。**
> `data/sample.json` と同じ形（`AppData`）のまま、内容をダミーから実データへ差し替える。

| ファイル | 型 | 中身 |
|---|---|---|
| `data/app/data.json` | `AppData` | **本番データ本体（1ファイル）**。`munis`（49自治体。公式推計・就学予定者・**2025年度実績児童数**・**学童3時点**）／`schools`（公立小。令和5・6・7の3年分の学年別児童数と住所）／`tokyo`（**全都の令和7〜20年度**。`bridged` 区間の接続に使う。設計書 §5-2）／`backtest`（1年先・2年先の実測誤差）／`sources` を持つ。生成AI③が作る注記は `munis[].note` に統合してから書き込む（中間ファイルとして `munis.json` 等に分けて作業するのは①の内部実装の自由） |
| `data/sample.json` | `AppData` | **`data/app/data.json` と同じ形のダミー**（6自治体18校）。②③は実データを待たずにまずこれで書く |

### ①が守ること

- **`Muni.name` が全ファイル共通の結合キー**です（`School.muni` も同じ表記）。
  「世田谷区」のように**都の表記をそのまま**使い、表記ゆれを作らないこと
- **`Muni.baseChildren` は令和7年度（2025年度）の実績児童数（全学年）**。
  学童の `2025-05-01` と基準日が一致します（設計書 §4-3）。
  `children2023` は**トレンドの実測にだけ**使います
- **`Muni.gakudo` は3時点の配列**（`2023-05-01` / `2025-05-01` / `2025-10-01`）を**日付昇順**で
- **`official[].year` / `entrants[].year` は西暦**。令和7年度 = 2025。
  **`entrants[].year` は入学年度**（就学予定者「0年後」の R7 値は 2026年度入学）
- **島嶼部・郡部は入れない**（49自治体のみ。設計書 §4-4）
- **`sources` は必ず埋める。** 画面に出す提出要件です（要件 FR-8）

### ✅ 受け入れ条件

```bash
# 型どおりか
node -e "const d=require('./data/app/data.json'); console.assert(d.munis.length===49)"
# 結合キーが揃っているか（schools の muni が munis に存在するか）
# baseChildren が 0 や null になっていないか
```

---

## 3. 境界B — ②ロジック → ③UI

### ②が公開する関数【完全仕様】

**中身の実装は②の詳細設計ですが、外から見える約束はここで固定します。**

```ts
// src/core/index.ts

/** 生年月 → 小1になる年度（西暦）。純関数・同期 */
export function entryYearOf(birthYear: number, birthMonth: number): number;

/** 既定シナリオ。③はこれを起点に差分を当てる */
export const DEFAULT_SCENARIO: DefaultScenario;   // { trend: 0.0084 }

/** 49自治体 × 全年度のスコアを一度に返す */
export function buildHeatmap(
  data: AppData,
  focusYear: number,
  scenario: Scenario,
): Heatmap;

/** 1自治体の詳細。存在しない muni は null */
export function buildMuniDetail(
  data: AppData,
  muni: string,
  scenario: Scenario,
): MuniDetail | null;
```

#### `entryYearOf(birthYear, birthMonth)`

| | |
|---|---|
| 引数 | `birthYear` 西暦 ／ `birthMonth` **1〜12** |
| 返り値 | 入学年度（西暦） |
| 規則 | 学校教育法：**4月2日〜翌年4月1日生まれが同学年**<br>`birthYear + (birthMonth >= 4 ? 7 : 6)` |
| 範囲外 | `birthMonth` が1〜12の外 → **例外を投げず**、12にクランプ |

**境界値**（②はこの3つをテストしてください）：

```
(2024, 4) → 2031      (2025, 3) → 2031  ← 早生まれ      (2025, 4) → 2032
```

#### `buildHeatmap(data, focusYear, scenario)`

| | |
|---|---|
| **事前条件** | `data.munis` は49自治体（島嶼部・郡部は①が除外済み） |
| **返り値** | `Heatmap` |
| `munis` | **`focusYear` のスコア降順**。`score` が `null` の自治体は末尾 |
| `years` | **昇順**。既定 `2027…2038` |
| `cells` | 🔴 **`munis` の順 × `years` の順**。長さは `munis.length * years.length` |
| `focusYear` | 引数そのまま |
| `bridgeFrom` | この年度以降が `basis: 'bridged'`。現データでは **2031** |
| `bins` | **固定** `[0, 10, 25, 40, 60]`（分位にしない） |
| `excludedMunis` | `note.kind === 'small-sample'` のみ。**`series-break` は入れない** |
| **例外** | **投げない。** 計算できないセルは `score/demand/supply/gap` を全て `null` |

🔴 **セルの添字は計算で引けます。③は Map を作りません。**

```ts
const idx = (h: Heatmap, muni: string, year: number) =>
  h.munis.indexOf(muni) * h.years.length + h.years.indexOf(year);
// ホットパスでは munis/years の index を一度だけ Map 化する
```

#### `buildMuniDetail(data, muni, scenario)`

| | |
|---|---|
| 引数 `muni` | **`Muni.name`**（`code` ではない） |
| 存在しない | 🔴 **`null` を返す。例外を投げない** |
| `series` | `years` と同じ年度・同じ順序 |
| `band` | 予測区間。**バックテストの実測誤差から**（1年先 ±1.5%／2年先 ±2.1〜2.6%／3年先以上は外挿） |
| `alternatives` | **返しません**（③が算出。下記「③が②に依存しないもの」） |

---

### 実データでの例（中央区・2031年度）

**モック `docs/mockups/mock-data.json` と同じ数字です。**

```jsonc
// Heatmap の1セル
{
  "muni": "中央区", "year": 2031,
  "score": 41.0,
  "basis": "bridged",      // 2031年度は都の公式推計(〜2030)を全都の伸びで接続した推定
  "excluded": false,       // series-break でもスコアには含める
  "demand": 2189.8,        // 需要（人）
  "supply": 1291,          // 供給＝2025-05 の登録児童数
  "gap": 898.8             // 不足人数
}

// Heatmap のメタ
{
  "focusYear": 2031, "bridgeFrom": 2031,
  "bins": [0, 10, 25, 40, 60],
  "munis": ["中央区", "品川区", "立川市", "東村山市", ...],   // 41, 23, 16, 12 …
  "years": [2027, 2028, ..., 2038],
  "excludedMunis": []       // 49自治体には small-sample が無いので空
}

// Muni.note（中央区）
{ "kind": "real-shortage",
  "text": "顕在需要率は都内最低水準（0.163）ですが、待機児童が275人おり、…" }
```

🔴 **江戸川区は `excluded: false` で、スコアに含まれます**（2031年度スコア0）。
`note.kind` は `series-break`。**除外するのはトレンド計算からだけ**です。

---

### 呼び出しシーケンス（性能設計と対応）

```
[初期ロード]  fetch data/app/*.json          → AppData
              fetch data/geo/tokyo-49.topo.json → topology
              ③: neighbors(topology) を1回だけ計算してキャッシュ
              ②: buildHeatmap(data, focusYear, DEFAULT_SCENARIO)

[生年月を変更] focusYear = entryYearOf(y, m)
              buildHeatmap(data, focusYear, scenario)
              → 実質は行の並び替え。セルの値は変わらない

[trendをドラッグ] buildHeatmap(data, focusYear, {...scenario, trend})
              🔴 ③は requestAnimationFrame で間引く
              🔴 ②は児童数予測を使い回す（trend に依存しないため）

[自治体を選択]  buildMuniDetail(data, muni, scenario)   ← 1件だけ
              ③: alternatives = neighbors × Heatmap.cells から算出

[シナリオ適用]  POST /api/scenario → Scenario
              buildHeatmap を1回。失敗時はベースラインを維持（要件 NFR-2）
```

---

### エッジケース

| 状況 | ②の返り値 | ③の表示 |
|---|---|---|
| 自治体のデータが欠測 | `score/demand/supply/gap` が全て `null` | グレー＋斜線＋「データなし」。🔴 **0点として塗らない** |
| 射程外の年度（令和21年度以降） | `years` に含めない | 列を描かない |
| `basis: 'bridged'` | `bridgeFrom` 以降 | ヒートマップは斜線。**地図は単一年度なので見出しにバッジで1回だけ**（`docs/16-ui-detail-design.md`） |
| `note.kind: 'series-break'`（江戸川区） | **`excluded: false`。スコアに含む** | 注記を出す。🔴 **地図から消さない** |
| `note.kind: 'small-sample'` | `excludedMunis` に入れる | 表の下に別枠 |
| 存在しない muni | `buildMuniDetail` が `null` | 詳細パネルを空状態に戻す |
| `/api/scenario` 失敗 | — | Toast のみ。**地図・ヒートマップ・ランキングは維持** |

---

### ③が②に依存しないもの【責務の線引き】

**②に投げないでください。②の実装が増えるだけです。**

| ③が自前でやる | 理由 |
|---|---|
| **`alternatives`（近隣の代替自治体）** | ②は地理を持たない。③が `topojson.neighbors()` で隣接を取り、`Heatmap.cells` のスコアと突き合わせる |
| **色の割り当て** | ②は `bins`（閾値）だけ返す。hex は③のテーマの都合 |
| **数値の丸め・単位・カンマ** | ②は生値を返す |
| **文言**（注記の見出し・空状態・打てる手のラベル） | `note.text` 以外は③ |
| **並び替えのUI**（別の年度で並べ直す等） | `cells` に全年度あるので③で完結 |

### ②の言語・フレームワーク

**素のTypeScript のままです。React は要りません。**
`src/core/` は `AppData` を受けて `Heatmap` / `MuniDetail` を返す純関数群で、
**React はビューの都合であって計算には無関係**だからです。
②は `.ts`（`.tsx` ではない）を書き、React を import しません。

**接点は `src/types.ts` の型だけ**なので、③が UI フレームワークを替えても②は無傷です。

共有されるのは3つだけ：

| 共有物 | 注意 |
|---|---|
| TypeScript のバージョンと `tsconfig` | ②③で1つ |
| Vite のビルド設定 | ②所有 |
| **`src/api/` のランタイム** | ⚠️ ここだけ別世界（下記） |

> 🔴 **`src/api/` は Cloudflare Pages Functions ＝ Workers ランタイム**です。
> Node でもブラウザでもありません。`fetch` はありますが
> **`fs` / `path` / `Buffer` は使えません**（`nodejs_compat` を有効にしない限り）。
> Node の感覚で書くとデプロイ時に落ちます。

### ②が守ること

- 🔴 **「除外」には2種類あります。取り違えないこと**（設計書 §4-4）。
  `series-break`（江戸川区）は**トレンド計算からのみ除外し、スコアには含める**。
  `small-sample`（島嶼部・郡部）は**対象範囲から除外**。
  2023年基準で計算すると江戸川区が95点で最上位に固定されます（設計書 §0-1・実測済み）
- 🔴 **`HeatmapCell.score` の `null` は「データなし」。0点として扱わないこと**
- **`basis` を必ず埋める。** `official`（都の公式推計そのもの）と
  `bridged`（全都の伸び率で接続した推定）を③が描き分けます（要件 NFR-5）
- **`Scenario.trend` の既定は 0.0084（+0.84pt/年・実測値）。** これがモデルを支配します（設計書 §0-2）

#### 🔴 決定論的であること

**`Math.random()` / `Date.now()` / `new Date()` を使わないでください。**

UIは状態を URL に持ちます（`?birth=2024&muni=13102&trend=0.0084`）。
審査員に「このURLを開いてください」と言えるようにするためです
（`docs/16-ui-detail-design.md` §9）。
**同じ入力から同じ出力が出ないと、この設計が丸ごと壊れます。**
「今日」が必要なら**引数で渡してください**。

#### 🔴 児童数の予測は `trend` に依存しない — ここで切ると速い

**性能の勘所です。**

```
Projection（児童数）   ← scenario.housing にのみ依存
r_target（需要率）     ← trend が効くのはここだけ
```

スライダーを動かしたとき、**重い予測エンジン（コーホート→按分→raking）を
回し直す必要はありません。** そこで切って使い回せば、ドラッグ中は掛け算だけになります。
**49自治体 × 12年度を毎フレーム再計算するかどうかの分かれ目**です。

#### その他

- **例外を投げない。** データ欠落は `score: null` を返す。
  throw すると React のツリーが落ち、③が Error Boundary を書く羽目になります
- **引数を変更しない（immutable）。** ③は `useMemo` で包むので、
  ②が引数を書き換えると再計算の判定が壊れます
- **丸めない。** 生の数値を返し、表示の丸めは③がやります
- **同期関数にする。** `Promise` を返すとUI側のレンダリングが不必要に複雑になります
  （データは事前ロード済み）
- **`Indicator.compute` は純関数**にすること。シナリオ変更のたび49自治体×年度ぶん呼ばれます

### ③が守ること

- **`basis: 'bridged'` の列は視覚的に区切る**（境界線・網かけ）
- **`excludedMunis` は表の下に別枠で、`note.text` を添えて表示する**
- **`score: null` のセルはグレー＋「データなし」**
- **`sources` を画面に必ず出す**（名称・提供元・ライセンス・取得日）

---

## 4. 境界C — `/api/scenario`

```
POST /api/scenario
Request:  ScenarioRequest  { text: string; munis: string[] }
Response: ScenarioResponse
  成功 → { ok: true,  scenario: Scenario, summary: string }
  失敗 → { ok: false, reason: string }
```

### 🔴 ③が必ず実装すること

**`ok: false` のとき、またはリクエスト自体が失敗したときも、
ベースラインのスコアとヒートマップは表示され続けること**（要件 NFR-2）。

Workers AI のクレジットはチーム$100・追加は承認制です（`docs/05-tech.md`）。
**落ちる前提で作ってください。** スライダーによる `trend` の変更は
`/api/scenario` を経由しないので、**APIが死んでも感度分析は動きます。**

### ②が必ず実装すること

- **JSONスキーマで検証してから返す**
- `trend` は `[-0.05, +0.05]`、`units` は `[0, 5000]` に**クランプ**
- **APIキーは Secrets Store か環境変数。ソースにも環境変数欄にも書かない**（`CLAUDE.md`）

---

## 5. `data/sample.json` の中身（実測値ベース）

**①が実データを出すまで、②③はこれで書き始めてください。**

| | |
|---|---|
| 自治体 | **6件**：中央区・杉並区・世田谷区・品川区・江戸川区・三鷹市（**各3時点の学童実績つき**） |
| 学校 | **18校**（各自治体3校・令和5/6/7の3年分） |
| 全都 | 令和7〜20年度（**14年分**） |
| バックテスト | 1年先・2年先の**実測値** |
| サイズ | 約20KB |

### わざとこの6自治体を選んでいます

| 自治体 | 実測値（2025-05） | なぜ入れたか |
|---|---|---|
| **江戸川区** | 72クラブ・登録6,623人・顕在需要率0.212<br>（2023-05 は **4クラブ・141人**） | **`series-break` の動作確認用。** **トレンド計算から除外しつつ、スコアには含める**——除外先を取り違えていないかがここで分かる |
| **中央区** | 31クラブ・登録1,291人・**待機275人**・顕在需要率0.163 | **`real-shortage` の動作確認用。** 待機÷登録が17.6%で都内最大。**除外してはいけない側** |
| **世田谷区** | 73クラブ・登録9,577人・**待機0** | **待機0でもリスクが0とは限らない**ことの確認用 |
| **杉並区** | 59クラブ・登録6,301人・**待機481人（都内最多）** | 課題仮説の実体験の舞台 |
| **品川区** | 37クラブ・登録3,484人・待機0 | スコア中位の確認用 |
| **三鷹市** | 登録2,435人・待機0 | 多摩市部の代表 |

**バックテストの実測値**（`docs/14-basic-design.md` §5-3 と同じ）：

```
1年先（令和6年度版 → 令和7年度実数・57地区）
  平均 +0.25% / 絶対誤差平均 0.93% / p10 -1.46% / p90 +1.57%
2年先（令和5年度版 → 令和7年度実数・57地区）
  平均 +0.26% / 絶対誤差平均 1.51% / p10 -2.13% / p90 +2.61%
```

> ⚠️ **3年先以上の誤差は測れません。** ヴィンテージが令和5・6・7の3世代しかないためです。
> **外挿だと画面に明記してください。**

---

## 6. 合格条件

**この3つが言えたら、分かれて詳細設計に入ってよい状態です。**

1. **①**：「自分が出すファイルと、その1件1件の意味が分かる」
2. **②**：「自分の入力（`AppData` ＋ `Scenario`）と出力（`Heatmap` / `MuniDetail`）が分かる」
3. **③**：「`data/sample.json` を読んで画面を描き始められる」
