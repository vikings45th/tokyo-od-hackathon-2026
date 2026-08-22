# data — 学童クラブ・児童館（東京都福祉局）

都知事杯オープンデータハッカソン2026 で使う元データ。

- `raw/` — 配布元から取得したそのままのファイル（**Gitには入れていない**。`fetch_*.py` で取り直す）
- `processed/` — `raw/` を機械処理しやすく整形したもの（UTF-8 / BOMなし / LF / ヘッダは英語）
- `app/data.json` — **本番データ本体（`AppData`。②③が読むのはこれだけ）**。詳細は下の
  「`app/data.json` — 本番データ本体」参照
- `scripts/fetch_raw.py` / `fetch_population.py` / `fetch_schools.py` — `raw/*` を取り直す
- `scripts/build_processed.py` → `build_munis.py` → `build_schools.py` → `build_tokyo.py`
  → `build_app_data.py` — `raw/` から `app/data.json` まで作り直す（順番どおりに実行すること）

```bash
python scripts/fetch_raw.py         # data/raw/ をダウンロード（学童）
python scripts/fetch_population.py  # data/raw/population/ をダウンロード（教育人口等推計）
python scripts/fetch_schools.py     # data/raw/schools/ をダウンロード（公立学校一覧）
python scripts/build_processed.py   # data/processed/*.csv を生成（学童3時点）
python scripts/build_munis.py       # data/processed/munis.json を生成
python scripts/build_schools.py     # data/processed/schools.json を生成
python scripts/build_tokyo.py       # data/processed/tokyo.json を生成
python scripts/build_app_data.py    # ↑を1本化して data/app/data.json を生成
```

## ⚠ ライセンス — 2種類あるので混ぜないこと

配布元ページ: https://www.fukushi.metro.tokyo.lg.jp/kodomo/hoiku/gakudou_jidoukan/ichiran
（取得日: 2026-08-22）

### A. オープンデータ（CC BY 4.0）— **作品で堂々と使えるのはこっち**

「学童クラブ数・登録児童数・待機児童数」の系列は、東京都オープンデータカタログに
**東京都福祉局**のデータセットとして登録されており、ライセンスは **CC BY 4.0**。

- カタログ: https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000344
- データセット名: 学童クラブ事業の区市町村別実施状況
- 提供元: 東京都福祉局
- 注意: カタログ側のリソースは令和5年5月1日版で止まっている。最新版（令和7年5月/10月）は
  福祉局サイトに同じ形式・同じURLパターンで置かれているので、そちらから取っている。

出典表記（作品に必ず入れる）:

```
出典: 「学童クラブ事業の区市町村別実施状況」（東京都福祉局）
      https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000344
      （2026-08-22に取得）／ ライセンス: CC BY 4.0
本サービスは上記データを加工して作成しています。
```

### B. カタログ未掲載（サイトポリシーのみ）— **公開リポジトリに置かない**

「東京都学童クラブ名簿」と年度別PDFはオープンデータカタログに無い。
福祉局のサイトポリシー（https://www.fukushi.metro.tokyo.lg.jp/policy ）は

> 掲載されている資料は、個人的かつ非営利的な使用目的だけのために利用する場合に限り、
> 複製、使用、ダウンロードすることができます

としており、**無断転載を禁じている**。したがって:

- ファイル自体を public リポジトリにコミットしない（= `data/raw/` は `.gitignore` 済み）
- 作品で使うなら、事前に福祉局へ利用可否を確認するか、A のオープンデータだけで成立させる
- 手元の分析・検討に使うのは上記の範囲内

## app/data.json — 本番データ本体

`src/types.ts` の `AppData` そのもの（1ファイル・49自治体・約520KB）。②③はこれだけを読む。
`data/sample.json`（6自治体のダミー）と完全に同じ形。

- `munis`（49件） — `processed/munis.json`。23区＋多摩26市。学童3時点・教育人口等推計・
  実績児童数・注記（`note`）を持つ
- `schools`（1,241件） — `processed/schools.json`。49自治体スコープ内の公立小学校
  （令和5〜7年度の3ヴィンテージ）
- `tokyo` — `processed/tokyo.json`。全都・令和7〜20年度の1年生数／全学年数
- `backtest` — `docs/14-basic-design.md` §5-3 の実測値をそのまま使用。
  **backtest.ts（教育人口等推計3ヴィンテージを実際に突き合わせる本計算）は②の担当**
  （同ドキュメント §2 手順5）。①はまだその実装を持っていない
- `sources`（7件） — `data/SOURCES.md` の #1〜7 をそのまま転記（#8社会福祉施設等一覧は
  v1未使用のため含めない）

再生成: `python scripts/build_app_data.py`（`processed/munis.json`・`schools.json`・
`tokyo.json` が先に必要）

### 生成AIを使った箇所（docs/14-basic-design.md §7・docs/11-ai-log.md）

- **`scripts/plans/gakudo_stats.json`**（用途①）— 学童3時点CSVの先頭30行を読んで
  作った抽出プラン（ヘッダ行番号・2ブロックの列位置・数値クリーニング規則）。
  `build_processed.py` の `apply_plan()` がこれを決定論的に実行する。**LLMは値に触らない**
- **`scripts/notes_text.py`**（用途③）— `build_munis.py` の `attach_notes()` が決定論的に
  出した `note.kind`（8自治体）に対して、実測値だけを見て書いた文面。
  判定ロジックは変えていない。**きっかけとなる数値ルールを変えたいときは
  `build_munis.py` 側を直す**（このファイルは文面だけ）

## processed/ の中身

### `gakudou_stats_by_municipality.csv` — 区市町村別の状況（**ライセンスA / CC BY 4.0**）

186行 = 62区市町村 × 3時点。long形式。

| 列 | 説明 |
|---|---|
| `as_of` | 基準日（`2023-05-01` / `2025-05-01` / `2025-10-01`） |
| `muni_code` | 全国地方公共団体コード5桁（例: 13101 = 千代田区）。**他データとの結合キー** |
| `muni_name` | 区市町村名 |
| `clubs` | クラブ数 |
| `registered_children` | 登録児童数 |
| `waiting_children` | **待機児童数** |

元データは区部・市町村部が左右2ブロックに分かれた帳票形式なので、それを縦に潰している。
検算（元資料の総計と一致することを確認済み）:

| 時点 | クラブ数 | 登録児童数 | 待機児童数 |
|---|---|---|---|
| 2023-05-01 | 1,958 | 132,648 | 3,524 |
| 2025-05-01 | 2,090 | 147,245 | 3,360 |
| 2025-10-01 | 2,093 | 142,580 | 1,548 |

### `gakudou_clubs_2025-05-01.csv` — 学童クラブ名簿（**ライセンスB / 扱い注意**）

都内の学童クラブ2,090件、1施設1行。住所があるのでジオコーディングして地図に載せられる。
ただし上記Bの通り**公開リポジトリには置いていない**（`.gitignore` 済み）。
使う場合はライセンスの確認が先。

| 列 | 説明 |
|---|---|
| `muni_code` | 全国地方公共団体コード5桁 |
| `muni_name` | 区市町村名 |
| `muni_no` | 都の資料上の通し番号（1〜62） |
| `setup_type` | `公設` / `民設` |
| `club_name` | 施設名 |
| `postal_code` | 郵便番号 |
| `address` | 所在地（全角英数→半角に正規化済み） |

## raw/population/, raw/schools/ — 東京都教育庁のデータ（カタログ掲載・CC BY 4.0）

学童とは別に、児童数の実績・推計（`Muni.official`/`baseChildren`/`children2023` の元）と
学校別データ（`School[]` の元）を取得している。ライセンス上はコミットしても問題ない
（CC BY 4.0）が、他の `raw/` 同様に**Gitには入れず**、`fetch_*.py` で都度取り直す運用にする。

- `scripts/fetch_population.py` … 教育人口等推計（区市町村・学年別の児童数実績＋推計。
  令和5・6・7年度版）を `raw/population/` に取得
- `scripts/fetch_schools.py` … 公立学校統計調査報告書【東京都公立学校一覧】
  （公立小学校1校1行の名簿。令和5・6・7年度版）を `raw/schools/` に取得
- どちらもファイル名の付け方が年度ごとに違うため、URLを固定で書かず
  CKANの `package_show` でリソース一覧を取ってから選んでいる

```bash
python scripts/fetch_population.py   # data/raw/population/ を取り直す
python scripts/fetch_schools.py      # data/raw/schools/ を取り直す
```

### `raw/population/{R5,R6,R7}_result01.csv` — 区市町村・学年別の児童数（実績＋推計）

`data/processed/munis.json`（`scripts/build_munis.py`）の `official`/`entrants`/
`baseChildren`/`children2023` の元データ。1行が「自治体×区分（小学校/中学校/就学予定者）
×学年」、列が「西暦年度」の縦持ち。R7版が本番の基準（令和7〜12年度）、R5版は
`children2023`（トレンド実測用の2023年度実績）に使う。R6版は3ヴィンテージ目
（`Backtest[]` 用。まだ未使用）。

🔴 **義務教育学校（前期課程）の児童を含む総数。**「公立学校一覧」（`raw/schools/`。
小学校のみの名簿）とは4自治体（品川区・江東区・北区・八王子市）で最大20%差がある。
`Muni.baseChildren`/`children2023` はこちら（教育人口等推計）を正とする
（2026-08-22 決定。`docs/14-basic-design.md` §4-1）。

### `raw/population/{R5,R6,R7}_survey.csv` — 住宅種別×学年別の児童発生率

`Scenario.housing` の係数（`docs/14-basic-design.md` §4-5 の表）の元データ。1戸あたり
の入居で各学年の子が何人発生するかを住宅種別ごとに示す。

### `raw/schools/{R5,R6,R7}_shougakkou_ichiran.csv` — 公立小学校1校1行の名簿

`School[]`（`docs/15-interfaces.md` 境界A）の元データ。列は学校番号・設置者（＝自治体名）・
学校名・学年別児童数など。3年分とも学校番号が共通キー。**公立小1,255校**
（`docs/13-requirements.md` §1-2 検証5）。

### `raw/schools/{R6,R7}_shougakkou_soukatsu.csv` — 自治体別の小学校児童数集計

`shougakkou_ichiran` を自治体単位に集計した表（**義務教育学校を含まない**）。
R5版はカタログに存在しない。学校合計の検算に使える（DoD「学校合計が
都の自治体×学年推計と一致する」）が、`Muni.baseChildren` の値そのものには使わない
（上記の理由で `raw/population/` を正とするため）。

### `raw/schools/{R5,R6,R7}_gimu_ichiran.csv` — 義務教育学校1校1行の名簿

小中一貫9年制校。前期課程（小1〜6相当）の児童数は教育人口等推計の自治体児童数に
含まれるが、`shougakkou_ichiran`（小学校のみ）には出てこない。`baseChildren` の
基準決定の根拠として参照用に保存（`School[]` には含めない。小学校ではないため）。

## raw/ の一覧（学童・児童館。取得済み・Git管理外）

`raw/_manifest.json` に取得元URL・ファイル名・サイズを記録している。

### A. CC BY 4.0（カタログ掲載）

| ファイル | 形式 | サイズ | 取得元 |
|---|---|---|---|


### B. カタログ未掲載（転載不可）

| ファイル | 形式 | サイズ | 取得元 |
|---|---|---|---|
| `令和６年度東京の児童館実施状況調査.pdf` | PDF | 2.3 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-07-28-141439-465 |
| `R5-Children's-Center-Activity-Report.pdf` | PDF | 2.3 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2025-04-07-145803-382 |
| `r4jidoukan.pdf` | PDF | 1.0 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/r4jidoukan |
| `r3jidoukanchousa.pdf` | PDF | 1.0 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/r3jidoukanchousa |
| `【公表資料】東京都の学童クラブ事業実施状況（令和8年度5月1日時点【速報値】）.pdf` | PDF | 417 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/080501sokuhou |
| `★【令和7年度】「東京の学童クラブ事業実施状況」.pdf` | PDF | 3.1 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-03-12-162635-475 |
| `★【令和6年度】「東京の学童クラブ事業実施状況」.pdf` | PDF | 1.1 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-03-12-165622-665 |
| `令和5年度　東京の学童クラブ実施状況.pdf` | PDF | 1.0 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-03-12-165738-269 |
| `R4gakudouchousa.pdf` | PDF | 1.0 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/r4gakudouchousa-pdf |
| `令和3年度 東京の学童クラブ実施状況.pdf` | PDF | 1.4 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-03-12-165958-714 |
| `survey-result060501.pdf` | PDF | 78 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/-6-5-1- |
| `学童クラブ事業実施状況都公表資料（令和7年5月1日時点）.pdf` | PDF | 110 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2025-12-22-113118-390 |
| `20250501.csv` | CSV | 2 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/20250501-csv |
| `学童クラブ事業実施状況都公表資料（令和7年10月1日時点）.pdf` | PDF | 110 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2025-12-22-113218-129 |
| `20251001.csv` | CSV | 2 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/20251001-csv |
| `学童クラブ名簿（令和7年5月1日現在）.pdf` | PDF | 3.1 MB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-03-12-162707-551 |
| `学童クラブ名簿（令和7年5月1日現在）.csv` | CSV | 154 KB | https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2026-03-12-162749-619 |

PDFは年度別の実施状況調査（施設数・開所時間・職員体制などの集計表）。機械可読ではない。
**5日間のスコープでは、Aの `gakudou_stats_by_municipality.csv` を主役にするのが現実的。**
