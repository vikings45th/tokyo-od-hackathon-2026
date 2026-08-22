import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ⚠️ NFR-4：ビルドはネットワークに触れないこと。ローカルの data/ を読むだけ。
// root は src/（docs/14-basic-design.md §9 の構成）。
export default defineConfig({
  root: 'src',
  plugins: [react()],

  // 🔴 publicDir を `'../data'` にしないこと。
  //    data/ 直下には転載不可のPDF・CSVが置かれており、まるごと dist/ にコピーされて
  //    公開URLから配信されてしまう（data/README.md・CLAUDE.md のライセンス方針違反）。
  //    UI は data/*.json を **import** している（src/ui/data.ts）ので publicDir は不要。
  publicDir: false,

  build: {
    outDir: '../dist',
    emptyOutDir: true,

    // ③（2026-08-22）：LP とツールの2ページ構成にした。
    //   `/`      → src/index.html      … 課題と主張（説得）
    //   `/tool/` → src/tool/index.html … 実際に触る画面（提供）
    // 1枚だった頃はツールがページの78%地点にあり、公開URLを開いた審査員が
    // 9画面スクロールしないと何も触れなかった。ルータは入れていない。
    rollupOptions: {
      // パスは package.json のある場所からの相対（npm script は必ずここで走る）。
      // @types/node を足したくないので node:path / __dirname は使わない。
      input: {
        main: 'src/index.html',
        tool: 'src/tool/index.html',
      },
    },
  },
});
