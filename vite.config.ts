import { defineConfig } from 'vite';

// ⚠️ NFR-4：ビルドはネットワークに触れないこと。ローカルの data/ を読むだけ。
// root は src/（docs/14-basic-design.md §9 の構成）。src/index.html は③UI担当が置く。
export default defineConfig({
  root: 'src',

  // 🔴 publicDir を `../data` にしないこと。
  //    data/ 直下には転載不可のPDF・CSVが置かれており、まるごと dist/ にコピーされて
  //    公開URLから配信されてしまう（data/README.md・CLAUDE.md のライセンス方針違反）。
  //    ①が data/app/ を生成したら、そこだけを指すように差し替える：publicDir: '../data/app'
  publicDir: false,

  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
