# Cloudflare Pages へのデプロイ手順

担当：A（実装・インフラ）／最終更新：2026-08-23

このサービスは **サーバーが1つも無い静的サイト**です（`docs/05-tech.md`）。
`npm run build` が `dist/` を吐くだけなので、**Cloudflare Pages にそのまま載ります。**
Workers も D1 も R2 も使いません。

> ✅ **Cloudflare特典（Paidプラン相当）が間に合わなくても問題ありません。**
> 無料プランの Pages で足ります。特典の発行を待たないでください（`docs/02-todo.md`）。

---

## 先に結論

| | 方法 | 誰がやる | 向いている場面 |
|---|---|---|---|
| **A（推奨）** | **GitHub連携**（ダッシュボードでリポジトリを繋ぐ） | 1人が1回だけ設定 | **提出用URL。** push するたび自動で再デプロイされる |
| B | `npm run deploy`（wrangler で手動アップロード） | 各自のローカル | 今すぐ1回見たい／Aが詰まったとき |

**8/23 17:00 が提出締切です。** 締切まで何度も直すので、
**Aを先に通してください。** 一度繋げば以降は `git push` だけで公開URLが更新されます。

---

## 方法A：GitHub連携（推奨・所要5分）

ブラウザだけで完結します。ターミナルもトークンも要りません。

1. https://dash.cloudflare.com/ にログイン
   （特典チームに招待されていれば、右上でチームを切り替える）
2. **Workers & Pages** → **Create** → **Pages** タブ → **Connect to Git**
3. GitHub を認可して `vikings45th/tokyo-od-hackathon-2026` を選ぶ
4. ビルド設定を次のとおり入力する

   | 項目 | 値 |
   |---|---|
   | Project name | `shou1-no-kabe-map` |
   | Production branch | `main` |
   | Framework preset | **None**（Vite プリセットでも可） |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | （空欄のまま） |

   環境変数は**何も要りません**。`.node-version`（`22`）をリポジトリに置いてあるので、
   Cloudflare 側は自動で Node 22 を使います。
5. **Save and Deploy**

数十秒で `https://shou1-no-kabe-map.pages.dev` が出ます。**これが提出用URLです。**

以降、`main` に push すると本番が自動更新されます。
`main` 以外のブランチに push すると**プレビューURL**が別途発行されるので、
提出前のレビューはそちらでできます。

---

## 方法B：ローカルから手動デプロイ

### 🔴 クラウドセッション（Claude Code on the web）からは実行しないこと

`wrangler login` はブラウザOAuthなので、クラウドセッションの中では完結しません。
**必ず自分のPCのターミナルから**実行してください（`CLAUDE.md` / `docs/07-team-workflow.md`）。

```bash
git pull
npm ci
npm run build     # dist/ を作る。ネットワークには行かない
npx wrangler login   # 初回だけ。ブラウザが開くので許可する
npm run deploy       # = wrangler pages deploy
```

`wrangler.toml` にプロジェクト名（`shou1-no-kabe-map`）と出力先（`dist`）を書いてあるので、
**引数は要りません。** 初回だけ「プロジェクトを新規作成するか」を聞かれます。

> ⚠️ **方法Bは `dist/` を直接アップロードします。** 手元のビルドがそのまま公開されるので、
> `git push` していない変更も出ます。**逆に、push しただけでは更新されません。**
> AとBを混ぜると「どっちが今の本番か」が分からなくなります。**Aに寄せてください。**

---

## デプロイ後に必ず確認すること

提出前チェック（`docs/02-todo.md` と合わせて）：

- [ ] 公開URLを**スマホでも**開く。地図が出るか
- [ ] **出典・ライセンス表記が画面に出ているか**（要件 FR-8。大会ルールの提出要件）
- [ ] ブラウザの DevTools → Network で、**外部への通信が発生していないか**
      （計算はブラウザ内で完結する設計。ここが技術力の主張そのもの）
- [ ] `https://<プロジェクト名>.pages.dev/data/` などを直接叩いて **404 になること**
      （転載不可のPDF/CSVが公開されていないことの確認。`vite.config.ts` の `publicDir` 参照）
- [ ] 公開URLを**エントリー項目⑥／スライド／動画**に書き写す

---

## 触ってはいけない設定

- **`wrangler.toml` に API トークンやアカウントIDを書かないこと。**
  このリポジトリは public です（`CLAUDE.md`「秘密情報をコミットしない」）。
- **Cloudflare ダッシュボードの環境変数欄にも秘密情報を置かないこと。**
  公式ドキュメントに「anyone who uses the environment can read the values」と明記されています。
- **`vite.config.ts` の `publicDir` を `'../data'` にしないこと。**
  `data/` 直下の転載不可PDF/CSVが公開URLから配信されます。
  いまは `'public'`（= `src/public/`）で、中身は `_headers` だけです。

---

## リポジトリに入れたファイル

| ファイル | 役割 |
|---|---|
| `wrangler.toml` | プロジェクト名と出力先。`npm run deploy` を引数なしで叩けるようにする |
| `.node-version` | Cloudflare のビルド環境の Node を 22 に固定する |
| `src/public/_headers` | キャッシュとセキュリティヘッダ。ビルド時に `dist/_headers` へコピーされる |

---

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| ビルドが Cloudflare 側で失敗する | ログの Node バージョンを見る。`.node-version` が読まれていなければ、環境変数 `NODE_VERSION=22` を追加 |
| `npm run deploy` で `wrangler: not found` | `npm ci` をやり直す（`wrangler` は devDependencies に入っている） |
| `npx wrangler login` がクラウドセッションで固まる | 仕様です。**ローカルからやり直してください**（上記🔴） |
| デプロイは成功するのに画面が古い | ブラウザのキャッシュ。スーパーリロード。`_headers` で `index.html` は `no-cache` にしてある |
| 特典チームのアカウントに切り替わっていない | ダッシュボード右上のアカウント選択。個人アカウント側にプロジェクトを作っても動きますが、URLが分かれます |
