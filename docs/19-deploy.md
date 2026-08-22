# デプロイ手順（Cloudflare Pages）

> **この作品は Pages Functions を持たない純粋な静的サイトです。**
> `src/api/` は作っていません（`/api/scenario` は v1 で不採用・`docs/05-tech.md`）。
> なので **Workers ではなく Pages** にデプロイします。コマンドが違うので注意してください。
>
> ```
> ⛔ npx wrangler deploy              ← Workers 用。この作品では使わない
> ✅ npx wrangler pages deploy dist   ← こちら
> ```

**作成日：2026-08-22（③UI担当）**

---

## 0. その前に — まずローカルで見る

**デプロイを1回焼く前に、ローカルで確認してください。** ほとんどはこれで足ります。

```bash
npm run dev                          # 開発中はこちら（HMRあり）
npm run build && npm run preview     # dist/ をそのまま配信。Pages と同じ見え方になる
```

出力された `http://localhost:...` を開きます。
**スマホ幅は DevTools のデバイスツールバー**で確認できます。

`npm run preview` は**ビルド成果物 `dist/` をルート配信する**ので、
wheelズーム・ドラッグ・スクロールとの競合・ダークモード・レスポンシブは
**ローカルで詰め切れます。**

実測（2026-08-22・`npm run preview`）：

```
/                       200 text/html
/assets/index-*.js      200 text/javascript   286,194 bytes
/assets/index-*.css     200 text/css           13,305 bytes
```

**`dist/index.html` の `/assets/...` という絶対パス参照はルート配信で解決します。**
Pages も同じルート配信なので、ここは同じ結果になるはずです。

### ローカルで確認できないこと（＝デプロイして初めて分かること）

| | なぜ |
|---|---|
| **実回線でのロード時間** | ローカルは一瞬で返る。gzip 約96KB が実際どうか |
| **`/` 以外のパスの挙動** | 🔴 **実測で挙動が違います。** `npm run preview` は SPA フォールバックが効くので `/foo` が **200（index.html）** を返しますが、**Cloudflare Pages では 404** です。クライアントルーティングを持たない単一ページなので 404 で正しいのですが、**ローカルでは気づけません** |
| **CDN・キャッシュまわり** | Pages 側の設定でしか出ない |

> 逆に言うと、**上の3つ以外はローカルで確認できます。**
> デプロイ回数を節約したいときはローカルで潰し切ってから焼いてください。

---

## 1. 🔴 いちばん最初に決めること — プロジェクト名

**`<プロジェクト名>.pages.dev` は後から変更できません。**
変えたければプロジェクトを削除して作り直すしかありません（Cloudflare 公式ドキュメント
「Known issues」に明記）。さらに名前が**他アカウントのプロジェクトと衝突すると**
`That domain is already associated with an existing project` で弾かれます。

| 用途 | プロジェクト名 | 誰のアカウント |
|---|---|---|
| **本番（提出用の公開URL）** | `sho1-no-kabe` ← **予約。誰も取らないこと** | ①データ担当 |
| リハーサル・動作確認 | `sho1-no-kabe-preview` | ③UI担当（検証後に削除） |

> ⚠️ **リハーサルで本番名を取らないでください。** ①が本番で使えなくなります。
> 逆にリハーサル側は使い捨てなので、終わったらプロジェクトごと消します。

---

## 2. 前提

- **Node 22 以上**（`wrangler` 4.x が要求します）
- **ローカルマシンで実行すること。** クラウドセッションからはできません
  - `wrangler login` は**ブラウザOAuth**なので、クラウドセッション内で完結しません
  - 🔴 回避策として `CLOUDFLARE_API_TOKEN` を環境変数欄に置くのは**やめてください。**
    公式ドキュメントが「anyone who uses the environment can read the values」と
    明記しています（`CLAUDE.md`・`docs/07-team-workflow.md` §2）
- **Cloudflare 特典（Paidプラン相当）は不要です。**
  無料プランの上限は 20,000ファイル / 1ファイル25MiB / 月500ビルドで、
  この作品は **3ファイル・308KB** なので余裕で収まります。
  特典の発行が 8/23 に間に合わなくても提出できます

---

## 3. 手順

```bash
# ── ビルド ──
git pull origin main
npm ci
npm run build          # dist/ ができる。⚠️ ネットワークに触れない（NFR-4）

# ── 🔴 デプロイ前の最終確認：転載不可ファイルが混ざっていないこと ──
find dist -type f                                    # 3ファイルのはず
find dist \( -name '*.pdf' -o -name '*.csv' \)       # 何も出ないこと

# ── ログイン（ブラウザが開く） ──
npx wrangler login

# ── プロジェクト作成（初回だけ） ──
npx wrangler pages project create <プロジェクト名> --production-branch=main

# ── デプロイ ──
npx wrangler pages deploy dist --project-name=<プロジェクト名> --branch=main
```

`<プロジェクト名>` は §1 の表から選びます。
成功すると `https://<プロジェクト名>.pages.dev` が出力されます。

### リハーサルの後始末（③）

```bash
npx wrangler pages project delete sho1-no-kabe-preview --yes
npx wrangler pages project list        # 消えたことを確認
```

---

## 4. 🔴 デプロイ前チェック（毎回）

- [ ] `npm run build` が通る
- [ ] `find dist \( -name '*.pdf' -o -name '*.csv' \)` が **0件**
      — `data/` 直下には**転載不可のPDF・CSV**があり、`vite.config.ts` の
      `publicDir` を `'../data'` にすると**まるごと配信されます**。
      いまは `publicDir: false` なので安全ですが、毎回確認してください。
      **審査用動画は YouTube で一般公開されます**
- [ ] 画面に**出典・ライセンス表記**が出る（大会ルールの提出要件・FR-8）

---

## 5. 公開URLで見るチェックリスト

CI やスクリーンショットで確認済みのことは省き、
**実機ブラウザ・公開URLでしか分からないもの**だけを挙げます。

### デプロイ特有の壊れ方

- [ ] トップを開いて**白画面にならない**
      （`dist/index.html` は `/assets/...` の**絶対パス参照**。ルート配信なら通る）
- [ ] DevTools の Console と Network に**赤が出ない**（404 / MIME / CSP）
- [ ] `/` 以外のパス（例 `/foo`）は **404 になる**。
      クライアントルーティングを持たない単一ページなので**これで正しい**。
      404ページを作りたくなったら `_redirects` を足す判断になります

### 実機でしか確かめられない操作

- [ ] 地図の **wheel ズーム**（トラックパッドの2本指スクロール含む）
- [ ] **ドラッグで移動** / **ダブルクリックで復帰**
- [ ] 「◯◯区の周辺へ」で寄ったとき、**自治体名ラベルが実際に読める**
- [ ] **ページのスクロールと地図のズームが競合しない**
      （地図上では `preventDefault` している。ページが飛ばないこと）
- [ ] S3 の sticky 地図が **2027 → 2031 → 2038** と切り替わる
- [ ] 折れ線のホバーで年度の数値が出る

### 見た目

- [ ] **スマホ幅**で崩れない（方針は「崩れないだけでよい」・`docs/05-tech.md`）
- [ ] **DARK / LIGHT** 両方まともに見える
- [ ] 初回ロードが待たされない（**gzip 約96KB**）
- [ ] 🔴 **出典・ライセンスがS5に出ている**
- [ ] ⚠️ ①のデータが入るまでは **グレー43自治体の断り書き**が出る。
      この状態でURLを共有するときは、**未完成であることを必ず添えてください**

---

## 6. 実施記録

> リハーサルや本番デプロイをしたら、**ここに結果を1行ずつ足してください。**
> 詰まった箇所が①の本番デプロイの先回り情報になります。

| 日付 | 誰 | プロジェクト名 | 結果・詰まったところ |
|---|---|---|---|
| | | | |

---

## 7. 出典

- [Wrangler commands（pages）](https://developers.cloudflare.com/workers/wrangler/commands/pages/)
- [Known issues · Cloudflare Pages](https://developers.cloudflare.com/pages/platform/known-issues/) — `*.pages.dev` は変更不可
- [Limits · Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)
- [Preview deployments · Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
