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

> ⚠️ **訂正（同日追記）**：当初ここに「Custom設定なしで全部通った」と書きましたが、
> 誤りでした。正しくは **このセッションの環境には Custom 許可リストが設定済みで、
> リストに載っているホストだけが通る**状態です。`example.com` `www.google.com`
> は遮断（`000`）されます。**下の表は「許可リストに入っていた」という意味です。**

**このセッションでは、東京都オープンデータ関連は全部通りました。**

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

#### ⛔ 許可リストに入っていないホスト（実測で遮断を確認）

| ホスト | 何に使うか | 状態 |
|---|---|---|
| `www.geospatial.jp` / `plateau.geospatial.jp` | **3Dマップ（PLATEAU）の実データ**。都のカタログの53リソースはここへのリンク | CONNECT **403** |
| `ckan.odpt.org` / `api.odpt.org` / `www.odpt.org` | **都営バス・地下鉄の GTFS / GTFS-RT** | CONNECT **403** |
| `service.api.data.metro.tokyo.lg.jp` | — | CONNECT **502** |

**3Dマップか公共交通のリアルタイムデータを使う案を選んだ場合、
許可リストへの追加が別途必要です。** どちらも
`docs/09-shortlist.md` では足切りしています（ODPTはユーザー登録も必要で、
承認待ちが8/23に直撃するため）。

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

### 3-2. ブランチ運用とコンフリクト対策 ← ここが一番事故る

Claude Code は短時間に大きな差分を生みます。3人が同じファイルを触ると一瞬で衝突します。

#### 原則：1人1本の作業ブランチを持ち、それを使い回す

```
work/<自分の名前>      例: work/taro
```

**作業単位ごとにブランチを切りません。** 1日に何度も `main` へマージして、
そのまま同じブランチで作業を続けます。「これは何ブランチにすべき？」を1日に何度も
考えるコストは、残り1.5日では無視できません。**ローカルもクラウドセッションも同じ手順**です。

#### 各自1回だけのセットアップ（コピペ）

```bash
git config merge.autoStash true
git config rebase.autoStash true
git config push.default current
git config alias.catchup '!git fetch origin main && git merge origin/main'

git switch -c work/<自分の名前>
```

| 設定 | 何が起きるか |
|---|---|
| `merge.autoStash` / `rebase.autoStash` | **作業途中でも `main` を取り込める。**「commit してないから pull できない」が消えます |
| `push.default current` | `git push` だけで自分のブランチが push される（`-u origin ...` が要らない） |
| `git catchup` | **`main` の最新を自分のブランチに取り込む**を1コマンドに |

> `catchup` を rebase ではなく **merge** にしているのは意図的です。PR を出した後に rebase すると
> force push が必要になり、**force push は禁止**（3人が `main` を共有しているため）だからです。

#### 毎日の作業ループ

```bash
git catchup                              # ① 朝イチ／マージ直後／詰まったとき
git add -A && git commit -m "..."        # ② 作業
git push                                 # ③
```

push すると `https://github.com/vikings45th/tokyo-od-hackathon-2026/pull/new/work/<名前>`
という URL がターミナルに表示されます。**それを開くだけで PR が作れます**（`gh` コマンドは不要）。

#### マージは PR → 自分で即 Merge

**レビューは一切ありません。承認は待たず、自分で Merge ボタンを押してください。**

- ⛔ **必ず「Create a merge commit」を選ぶ。「Squash and merge」は使わない**（理由は下）
- ⛔ **マージ後に出る「Delete branch」を押さない** — 使い回すブランチです
- ✅ **マージしたら必ず `git catchup`。** 忘れると次の PR が古い `main` を基準にします

> **なぜ squash がダメか（実測で確認済み）**
>
> squash はブランチのコミットを `main` の履歴に残さないので、Git から見ると
> **そのブランチの変更はまだマージされていない**ことになります。同じブランチを使い続けると、
> 次に `catchup` したときに**マージ済みのはずの変更が蘇って衝突します。**
>
> | 試したこと | squash | merge commit |
> |---|---|---|
> | マージ後、他の人が**同じ行**を直す → `catchup` | **衝突** | **衝突なし** |
> | `catchup` を忘れて2回目のマージ | **衝突** | — |
>
> 使い捨てブランチなら squash で構いませんが、**使い回すブランチでは merge commit 一択**です。

#### `main` に入れる頻度 ← ブランチ運用で一番事故るところ

**ブランチ運用の失敗は「切っただけで放置」です。** 溜めると 8/23 に巨大なブランチを
3本同時マージすることになり、そこで詰みます。

- **最低でも1日3回**は `main` へマージする
  （`docs/10-roles-schedule.md` の **15:00 中間同期 / 17:00 チェックポイント / 20:00 締め**）
- **半日以上マージしない状態を作らない**
- **動くようになった時点で出す。**「完成してから」は待たない

#### クラウドセッション（claude.ai/code）

**手順は上とまったく同じ**です。自動生成される `claude/xxx` ブランチをそのまま使い、
push → PR → 自分で Merge。違いは2点だけ：

- `claude/*` は**使い捨て**なので、マージ時に **「Delete branch」を押してよい**
  （次のセッションは新しいブランチから始まります）。**Squash and merge も使えます**
- **その日のうちに必ず `main` へ。** 2日溜めない

#### `main` は保護しない

GitHub の Branch protection は**掛けません**。ルールとしてはブランチを切りますが、
**8/23 直前の緊急修正やマージ事故のときに `main` へ直接 push で逃げられる**状態を残します。

#### ⛔ やってはいけないこと

- **`git push --force`** — 3人が `main` を共有しているので他2人の作業が消えます
- **他人の `work/*` ブランチにコミットする**
- **自分のブランチを `main` に rebase する**（`catchup` = merge で取り込む。上記のとおり）

#### 担当をレイヤーではなくディレクトリ境界で割る

**これがコンフリクト対策の本体です。** ブランチは「`main` を壊さない」「捨てやすい」を
足すだけで、衝突そのものを防いでいるのはこちらです。

```
✗ 悪い割り方：「Aさんがフロント、Bさんがバック、Cさんがデータ」
   → 1つの機能を作るのに3人が同じファイル群を触る

✓ 良い割り方：「src/map/ はAさん、src/chart/ はBさん、src/api/ はCさん」
   → 各自が自分のディレクトリだけを触る
```

実際の割り当ては `docs/10-roles-schedule.md` §1 で決めています
（① `scripts/` `data/` ／ ② `src/core/` `src/api/` ／ ③ `src/ui/`）。

#### 縦割りで防げない衝突源と、その潰し方

| 衝突源 | 対策 |
|---|---|
| `docs/11-ai-log.md`（3人が追記する表） | **`.gitattributes` で union merge**（設定済み） |
| `docs/02-todo.md`（3人がチェックを付ける） | 同上 |
| `src/types.ts` | **変更前に必ず一声。** 型変更は3人全員の手を止めます |
| `package.json` / `package-lock.json` などの生成物 | **オーナーを1人に固定**する（②）。他の人は再生成せず取り込むだけ |
| `CLAUDE.md` / `docs/` の他ファイル | 触るのは基本1人。同時編集しない |

リポジトリ直下の `.gitattributes` に、こう書いてあります：

```
docs/11-ai-log.md merge=union
docs/02-todo.md   merge=union
```

union merge は**両側の変更を残す**ので、この2ファイルは衝突しません
（`catchup` のたびに `main` 側の変更を取り込むので、ブランチ運用でもそのまま効きます）。
まれに**重複行**が出ますが、**見つけたら消すだけ**です。

その他：

- 3人が同時に同じファイルへ Claude にリファクタさせない
- 大きな構成変更をする前に、Slack か口頭で一声かける

#### 壊れたときに戻る手段

**動いた瞬間にタグを打ってください。タグは `main` の上で打ちます**（作業ブランチ上ではない）。

```bash
git switch main && git pull
git tag day1-1700 && git push origin day1-1700
git switch work/<自分の名前>          # 作業ブランチに戻る
```

- タイミングは `docs/10-roles-schedule.md` のチェックポイント
  （Day1 **17:00** / **20:00**、Day2 **12:00** の機能フリーズ）
- 壊れたら `git checkout day1-1700 -- <パス>` で**そのファイルだけ**戻せます

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
