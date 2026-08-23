import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ⚠️ NFR-4：ビルドはネットワークに触れないこと。ローカルの data/ を読むだけ。
// root は src/（docs/14-basic-design.md §9 の構成）。src/index.html は③UI担当が置いた。
export default defineConfig({
  root: 'src',
  plugins: [react(), tailwindcss()],

  // 🔴 publicDir を `../data` にしないこと。
  //    data/ 直下には転載不可のPDF・CSVが置かれており、まるごと dist/ にコピーされて
  //    公開URLから配信されてしまう（data/README.md・CLAUDE.md のライセンス方針違反）。
  //
  //    ③注記（2026-08-22）：UI は data/*.json を **import** しています（src/ui/data.ts）。
  //    Vite が JSON をバンドルに畳み込むので、実行時 fetch も publicDir も不要です。
  //    ①の data/app/data.json が来たら import 先を1行変えるだけ。
  //    → publicDir は false のままで構いません。
  //    A注記（2026-08-23）：Cloudflare Pages の `_headers` を dist/ 直下に置く必要があるため、
  //    publicDir を **`src/public`** にしました（root が src/ なので相対パスです）。
  //    ここに入るのは自作の設定ファイルだけ。**`../data` には絶対に向けないこと。**
  publicDir: 'public',

  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
