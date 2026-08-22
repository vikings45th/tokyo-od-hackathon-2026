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
      ├── data/app/munis.json   ─┐
      ├── data/app/schools.json ─┤
      ├── data/app/tokyo.json   ─┼─▶ AppData ──▶ forecast.ts
      ├── data/app/backtest.json─┤                   │
      └── data/app/notes.json   ─┘                   ▼
                                              Projection[]
                                                     │
      data/sample.json ─────────────────────▶  indicators/  ◀── Scenario
      （①が先に置く。②③はこれで着手）             │            ▲
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

| ファイル | 型 | 中身 |
|---|---|---|
| `data/app/munis.json` | `Muni[]` | 49自治体。公式推計・就学予定者・**2025年度実績児童数**・**学童3時点**・注記 |
| `data/app/schools.json` | `School[]` | 公立小。令和5・6・7の3年分の学年別児童数と住所 |
| `data/app/tokyo.json` | `TokyoTotal` | **全都の令和7〜20年度**。`bridged` 区間の接続に使う（設計書 §5-2） |
| `data/app/backtest.json` | `Backtest[]` | 1年先・2年先の実測誤差 |
| `data/app/notes.json` | `Record<string, Note>` | 自治体名 → 注記。生成AI③の出力 |
| `data/sample.json` | `AppData` | **上記を1ファイルにまとめたダミー。②③はまずこれで書く** |

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
node -e "const d=require('./data/app/munis.json'); console.assert(d.length===49)"
# 結合キーが揃っているか（schools の muni が munis に存在するか）
# baseChildren が 0 や null になっていないか
```

---

## 3. 境界B — ②ロジック → ③UI

### ②が公開する関数（シグネチャのみ。中身は②の詳細設計）

```ts
/** AppData を読み込み、予測とスコアを計算してヒートマップを返す */
export function buildHeatmap(
  data: AppData,
  focusYear: number,        // ユーザーの子が小1になる年度
  scenario: Scenario,
): Heatmap;

/** 1自治体の詳細 */
export function buildMuniDetail(
  data: AppData,
  muni: string,
  scenario: Scenario,
): MuniDetail;

/** 生まれ年 → 小1になる年度 */
export function entryYearOf(birthYear: number): number;
```

### ②が守ること

- 🔴 **「除外」には2種類あります。取り違えないこと**（設計書 §4-4）。
  `series-break`（江戸川区）は**トレンド計算からのみ除外し、スコアには含める**。
  `small-sample`（島嶼部・郡部）は**対象範囲から除外**。
  2023年基準で計算すると江戸川区が95点で最上位に固定されます（設計書 §0-1・実測済み）
- 🔴 **`HeatmapCell.score` の `null` は「データなし」。0点として扱わないこと**
- **`basis` を必ず埋める。** `official`（都の公式推計そのもの）と
  `bridged`（全都の伸び率で接続した推定）を③が描き分けます（要件 NFR-5）
- **`Scenario.trend` の既定は 0.0084（+0.84pt/年・実測値）。** これがモデルを支配します（設計書 §0-2）
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
