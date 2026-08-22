# data — 学童クラブ・児童館（東京都福祉局）

都知事杯オープンデータハッカソン2026 で使う元データ。

- `raw/` — 配布元から取得したそのままのファイル（**Gitには入れていない**。理由は下の「ライセンス」）
- `processed/` — `raw/` を機械処理しやすく整形したもの（UTF-8 / BOMなし / LF / ヘッダは英語）
- `scripts/fetch_raw.py` — `raw/` を取り直す
- `scripts/build_processed.py` — `raw/` から `processed/` を作り直す

```bash
python scripts/fetch_raw.py        # data/raw/ をダウンロード
python scripts/build_processed.py  # data/processed/ を生成
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

## raw/ の一覧（取得済み・Git管理外）

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
