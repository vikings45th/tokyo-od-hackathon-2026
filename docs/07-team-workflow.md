# チーム開発ガイド — 環境セットアップと3人運用ルール

3人がそれぞれ Claude Code を使って開発するための手順とルールです。
**セットアップは3人全員がそれぞれ実施する必要があります。**

---

## 1. 環境セットアップ（各自1回）

### 1-1. ネットワークポリシーを Custom に変更する【必須】

Claude Code のクラウドセッションは既定で **Trusted** レベルです。この状態では
**GitHub とパッケージレジストリ以外すべて遮断**され、次が使えません：

- 東京都オープンデータカタログ（`catalog.data.metro.tokyo.lg.jp`）
- 東京都オープンデータAPI（`spec.api.metro.tokyo.lg.jp`）
- 大会公式サイト（`odhackathon.metro.tokyo.lg.jp`）
- 公式ガイドブック（`odh-tokyo2026.code4japan.org`）
- **Cloudflare API（`api.cloudflare.com`）← デプロイができない原因**

Trusted の既定リストに入っている Cloudflare 系ドメインは
`production.cloudflare.docker.com` だけで、`api.cloudflare.com` は含まれません。

#### 手順

1. [claude.ai/code](https://claude.ai/code) を開く
2. メッセージ入力欄の**すぐ上の行**にある、環境名（`Default` など）が表示された
   **クラウドアイコン**を選択
   - 設定ページや直接URLは存在しません。このセレクタからしか開けません
3. **どちらかを選ぶ**（違いは下の表）
   - **既存の `Default` を書き換える** … `Default` にホバー → 右に出る**歯車アイコン**
   - **新しく作る** … **Add cloud environment**
4. **名前**を入れる（新規作成の場合）
   - 例：`都知事杯ハッカソン`。**空のままだとプレースホルダーの「デフォルト」になります**
5. **Network access** を `Trusted` → **`Custom`** に変更
   - ⚠️ ここが本命です。**Custom を選んで初めて Allowed domains の欄が現れます**
6. **Allowed domains** に下のリストを貼り付け（1行1ドメイン）
7. **「Also include default list of common package managers」に必ずチェックを入れる**
   - ⚠️ 外すと GitHub・npm も含めて、リストしたドメイン以外すべて遮断されます
8. **環境変数は空のまま**にする
   - 表示されている `NODE_ENV=production` などは**プレースホルダー**です
   - 画面自体に「**この環境を使用するすべてのユーザーに表示されるため、
     シークレットや認証情報は追加しないでください**」と書かれています。
     Cloudflare のトークンをここに置かない方針（後述）の根拠がこれです
9. **セットアップスクリプトも空のまま**にする
   - `npm install` もプレースホルダーです。リポジトリにまだ `package.json` が
     無いので入れても意味がありません。技術構成が決まってから追加してください
10. **保存**（新規なら「環境を作成」）

#### どちらのルートを選ぶか

| | 既存の `Default` を書き換え | 新しい環境を作る |
|---|---|---|
| セッション開始時の操作 | **不要**（自動的に適用） | **毎回この環境を選ぶ必要がある** |
| 他の作業への影響 | 全セッションに及ぶ | ハッカソン用に隔離できる |
| 事故のリスク | 低い | **選び忘れると Trusted のまま立ち上がる** |

> ⚠️ **新しい環境を作った場合の最大の落とし穴**
>
> **新セッションを開始するとき、その環境を選び忘れると `Default`（Trusted）で
> 立ち上がります。** 「設定したはずなのに繋がらない」の原因はほぼこれです。
> 疎通チェック（後述）が `000` を返したら、まず**どの環境で動いているか**を
> 確認してください。

#### Allowed domains（そのままコピペ）

```
*.metro.tokyo.lg.jp
code4japan.org
*.code4japan.org
api.cloudflare.com
dash.cloudflare.com
*.cloudflare.com
*.workers.dev
*.pages.dev
```

`*.` は全サブドメインにマッチします。`*.metro.tokyo.lg.jp` ひとつで
odhackathon / catalog.data / portal.data / spec.api / www をまとめてカバーします。

#### 注意点

- **設定はアカウントごと。** 公式ドキュメントに
  「Environments you create are personal to your account」
  「there's no organization-level allowlist that admins can push to every member's
  environments」と明記されています。**3人それぞれが自分で設定してください。**
- **反映は新しいセッションから。** 実行中のセッションは設定を読み直しません。
  設定を変えたら**セッションを開き直してください。**
- GitHub通信とMCPコネクタ通信はこの許可リストを通らない（別proxy）ので影響ありません。

#### 設定できたか確認する

新しいセッションで Claude に次を実行してもらってください。

```bash
for H in catalog.data.metro.tokyo.lg.jp spec.api.metro.tokyo.lg.jp \
         odhackathon.metro.tokyo.lg.jp odh-tokyo2026.code4japan.org \
         api.cloudflare.com; do
  printf '%-40s %s\n' "$H" \
    "$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "https://$H/" 2>/dev/null)"
done
```

**判定方法：**

- `000` … 接続できていない。**そのドメインはまだ許可されていません**
- それ以外（`200` / `301` / `302` / `403` など）… **到達できています。成功**

`403` でも「サーバーまで届いてサーバーが答えた」という意味なので成功です。
遮断されている場合は TLS トンネルが張れず、ステータスコード自体が返りません。

#### 実測結果（2026-08-20・クラウドセッションから）

**Custom 設定なしのクラウドセッションで、すでに全部通りました。**

| ホスト | コード | 備考 |
|---|---|---|
| `catalog.data.metro.tokyo.lg.jp` | 403 | トップHTMLはAWS WAFが弾く。**`/api/3/action/*` は200** |
| `portal.data.metro.tokyo.lg.jp` | 200 | ポータル本体のHTMLが返る |
| `www.opendata.metro.tokyo.lg.jp` | 200 | **CSV実データのDL成功**（CC BY） |
| `spec.api.metro.tokyo.lg.jp` | 200 | |
| `odhackathon.metro.tokyo.lg.jp` | 200 | 大会公式 |
| `odh-tokyo2026.code4japan.org` | 200 | |
| `api.cloudflare.com` | 301 / 400 | 到達。400は「Authorizationヘッダが無い」というCloudflare自身の応答 |
| `api.github.com` | 200 | |
| npm / PyPI | 200 | proxyの `noProxy` に入っていて直結 |

つまり**この環境では東京都のデータを直接叩けます**。CKAN API は素の
`curl` のUA（`curl/8.x`）でも200が返るので、UA偽装は不要です。
カタログの**トップHTMLだけ**が WAF に弾かれるので、ブラウザUAを付けるか、
そもそもAPIを使ってください。

**ただし環境設定はアカウントごとです。** 上の表は「このリポジトリで
セッションを立てたらこうなる」という保証ではありません。3人それぞれが
自分のセッションで上のスクリプトを走らせて確認してください。
`000` が出た人は下の 1-1 の手順で Custom 許可リストを設定します。

**例外1つ**：`https://github.com/`（Web UI のHTML）は
agent proxy 自身が `400 Request path could not be canonicalized.` を返します。
`git clone` / `git push` / `api.github.com` / GitHub MCP はすべて正常なので、
実作業に影響はありません。GitHubのページを読みたいときは
`api.github.com` か GitHub MCP ツールを使ってください。

### 1-2. リポジトリをクローンする

```bash
git clone https://github.com/vikings45th/tokyo-od-hackathon-2026.git
cd tokyo-od-hackathon-2026
```

### 1-3. Cloudflare にログインする（ローカルで）

```bash
npx wrangler login
```

ブラウザが開いて認証されます。**これはローカルマシンでのみ実行できます。**

### 1-4. 事務局提供ツールの申請状況を確認する

事務局から参加チーム向けに、申請制で以下が提供されています（9月末まで）：

1. **生成AI開発ツール**（OpenCode + Cloudflare Workers AI）
2. **サービス公開環境**（Cloudflare Paidプラン相当）

まだ申請していなければ、公式ガイドブックの該当ページから手続きしてください。
不明点は参加者Slackの `#03_事務局への質問`、または
`9_opendata-hackathon.tokyo@mizuho-rt.co.jp` へ。

---

## 2. Cloudflare デプロイの方針

### 推奨：デプロイは各自のローカルから

```bash
npx wrangler deploy
```

理由は2つあります。

1. `wrangler login` は**ブラウザOAuth**なので、クラウドセッション内では完結しない
2. クラウドセッションから叩くには `CLOUDFLARE_API_TOKEN` を環境変数欄に置く必要が
   あるが、公式ドキュメントが明確に警告している：
   > Anyone who uses the environment can read the values, and cloud environments have
   > no dedicated secrets store, so **don't add API keys or other credentials**

**クラウドセッションは実装とテストに使い、公開操作は手元で行う**——これが一番安全です。

### どうしてもクラウドから叩く場合

- Cloudflare ダッシュボードで**権限を絞ったAPIトークン**を作る
  （必要な権限は Workers Scripts:Edit 程度。Global API Key は絶対に使わない）
- 環境変数欄に `CLOUDFLARE_API_TOKEN` として設定する
- **イベント終了後（10/17以降）に必ず失効させる**
- トークンを知っているのは環境の所有者だけ、という前提を崩さない
  （環境は個人アカウントごとなので、他の2人には見えません）

### ローカル開発

```bash
npx wrangler dev
```

デプロイせずにローカルで動作確認できます。日常の開発はこれで十分です。

---

## 3. 3人で Claude Code を使うときのルール

### 3-1. チームで揃えたい設定はリポジトリにコミットする

これが鉄則です。**各自のマシンに置いた設定は他の2人に効きません。**

| | 共有される？ | 理由 |
|---|---|---|
| リポジトリの `CLAUDE.md` | ✅ | クローンの一部 |
| リポジトリの `.claude/settings.json` | ✅ | 同上 |
| リポジトリの `.claude/commands/`, `agents/`, `skills/` | ✅ | 同上 |
| リポジトリの `.mcp.json` | ✅ | `claude mcp add --scope project` で作る |
| 各自の `~/.claude/CLAUDE.md` | ❌ | 個人マシン上にあるため |
| `claude mcp add` をユーザースコープで追加したMCP | ❌ | `~/.claude.json` に書かれるため |
| 各自のマシンにだけ入れたツール | ❌ | クラウドセッションは毎回まっさらなVM |

**決まったことは `CLAUDE.md` に書いてコミットしてください。**
これが3人のClaude Codeにとっての共有記憶になります。

### 3-2. コンフリクト対策 ← ここが一番事故る

Claude Code は短時間に大きな差分を生みます。3人が同じファイルを触ると一瞬で衝突します。

**担当をレイヤーではなくディレクトリ境界で割ってください。**

```
✗ 悪い割り方：「Aさんがフロント、Bさんがバック、Cさんがデータ」
   → 1つの機能を作るのに3人が同じファイル群を触る

✓ 良い割り方：「src/map/ はAさん、src/chart/ はBさん、src/api/ はCさん」
   → 各自が自分のディレクトリだけを触る
```

その他のルール：

- ブランチは `feat/<名前>/<機能>` の短命ブランチ。長生きさせない
- **push 前に必ず `git pull --rebase`**
- `package-lock.json` などの生成物は**オーナーを1人に固定**する。
  他の人は自分で再生成せず、取り込むだけ
- 3人が同時に同じファイルへ Claude にリファクタさせない
- 大きな構成変更をする前に、Slack か口頭で一声かける

### 3-3. Claude Code の使い方

- **設計判断はプランモードで。** 方針が分かれる作業は
  `claude --permission-mode plan` で合意してから実装に入る。
  3人が別々の前提で書き始めるのが最悪のパターンです
- **こまめにコミット＆プッシュ。** クラウドセッションのVMは放置すると回収されます
- **レート制限はアカウント全体で共有。** 並列セッションを増やすと消費が早くなります
- 詰まったら `docs/06-open-questions.md` に書き足す。1人で抱えない

### 3-4. セキュリティ・大会ルール

- **APIキー・トークンは絶対にコミットしない。** 環境変数欄にも入れない
- **オープンデータの出典とライセンス表記を作品に必ず入れる。**
  これは大会の趣旨そのものであり、審査観点にも直結します
- 個人情報を含むデータは扱わない

---

## 4. 困ったときの連絡先

| 用件 | 連絡先 |
|---|---|
| 事務局への質問 | 参加者Slack `#03_事務局への質問` |
| メールでの問い合わせ | `9_opendata-hackathon.tokyo@mizuho-rt.co.jp` |
| 公式サイト | https://odhackathon.metro.tokyo.lg.jp/ |
| 公式ガイドブック | https://odh-tokyo2026.code4japan.org/ |

チーム専用の Slack チャンネル作成も申請できます。

---

## 参考

- [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments) — 環境設定・許可リスト・既定ドメイン
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) — クラウドセッションの制約
