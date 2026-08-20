# 都知事杯オープンデータ・ハッカソン2026

3人チームの作業リポジトリです。東京都のオープンデータを活用して、
社会課題の解決に資するデジタルサービスを企画・開発します。

---

## 🔴 動かせない締切

| 日付 | 何が起きるか |
|---|---|
| **8/22（土）** | ハッカソン Day1 — 10:30–17:00（ベルサール半蔵門 2Fホール／Zoom併用） |
| **8/23（日）** | ハッカソン Day2 — 10:00–17:00 ＋ **作品提出締切** |
| 8/23以降 | First Stage プレゼン収録（2分程度の動画・要予約） |
| 10/17（土） | Final Stage・表彰式 |

**提出物：プロトタイプ ＋ プレゼンスライド ＋ 2分程度のプレゼン動画**

---

## 現在のステータス

| | |
|---|---|
| エントリー | ✅ 済み |
| チーム | 3人 |
| **テーマ** | ⬜ **未定**（8/19までに決定） |
| **狙う賞** | ⬜ **未定**（8/19までに決定） |

---

## 🚀 最初にやること

### 1. `CLAUDE.md` を読む

3人の Claude Code が共通で読む前提ファイルです。決まったことはここに反映します。

### 2. ネットワークポリシーを設定する【必須・全員】

**この設定をしないと、東京都のオープンデータにも Cloudflare にもアクセスできません。**

Claude Code のクラウドセッションは既定で GitHub とパッケージレジストリ以外を
すべて遮断します。**環境設定はアカウントごとなので、3人それぞれが実施する必要が
あります。**

→ 手順は **[`docs/07-team-workflow.md`](docs/07-team-workflow.md)**

### 3. `docs/02-todo.md` で今日のタスクを確認する

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 3人のClaude Codeが読む共有前提 |
| [`docs/01-event.md`](docs/01-event.md) | 大会情報（審査基準・賞・日程・提出物） |
| [`docs/02-todo.md`](docs/02-todo.md) | 8/17→8/30 の逆算タスクリスト |
| [`docs/03-data.md`](docs/03-data.md) | データソース調査（カタログ・API・ライセンス） |
| [`docs/04-ideas.md`](docs/04-ideas.md) | アイデア出しのベースと評価マトリクス |
| [`docs/05-tech.md`](docs/05-tech.md) | 技術方針 |
| [`docs/06-open-questions.md`](docs/06-open-questions.md) | 一次情報で確認すべき未確認事項 |
| [`docs/07-team-workflow.md`](docs/07-team-workflow.md) | 環境セットアップと3人運用ルール |
| [`docs/08-themes.md`](docs/08-themes.md) | 東京都提示テーマ全一覧（12カテゴリ・57件） |

---

## 開発

```bash
npm install
npx wrangler dev      # ローカル開発
npx wrangler deploy   # デプロイ（ローカルマシンから実行すること）
```

デプロイをクラウドセッションから実行できない理由は
[`docs/07-team-workflow.md`](docs/07-team-workflow.md) を参照してください。

---

## ⚠️ 守ること

- **APIキー・トークンをコミットしない。** クラウド環境の環境変数欄にも入れない
  （環境を使う人全員に見えます）
- **オープンデータの出典とライセンス表記を作品に必ず入れる。**
  審査観点「オープンデータが有効に活用されているか」に直結します
- **担当ディレクトリの外を大きく書き換えない。**
  3人が同時に Claude Code を動かすため、即コンフリクトします

---

## リンク

| | |
|---|---|
| 公式サイト | https://odhackathon.metro.tokyo.lg.jp/ |
| 公式ガイドブック | https://odh-tokyo2026.code4japan.org/ |
| 東京都オープンデータカタログ | https://catalog.data.metro.tokyo.lg.jp/dataset |
| 東京都オープンデータAPI | https://spec.api.metro.tokyo.lg.jp/spec/usage |
| 事務局への問い合わせ | `9_opendata-hackathon.tokyo@mizuho-rt.co.jp` |
| 参加者Slack | `#03_事務局への質問` |
