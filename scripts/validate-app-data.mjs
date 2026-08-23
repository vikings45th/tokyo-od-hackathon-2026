#!/usr/bin/env node
/**
 * ①のデータ受け入れ検査 CLI（docs/19 依頼1）。
 *
 *   npm run validate                        … data/app/data.json を検査
 *   npm run validate data/sample.json       … パス指定
 *
 * 終了コード: 0 = problems なし / 1 = problems あり（warnings では落とさない）
 *
 * 🔴 判定ロジックは持たない。`src/core/validate.ts` の `validateAppData()` を呼ぶだけ。
 *    scripts/validate_app_data.py は src/types.ts を手で書き写したもので二重管理になっており、
 *    GakudoStat.asOf を3時点にハードコードしているため①が時点を足すと誤検知する。
 *    **こちらが正。** Python 版は Node の無い環境向けの控えとして残す。
 *
 * TypeScript を直接読むために Vite の SSR ローダを使う（Node の型ストリップだけでは
 * `./heatmap` のような拡張子なし import が解決できないため）。追加の依存は不要。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(ROOT, process.argv[2] ?? 'data/app/data.json');

let data;
try {
  data = JSON.parse(readFileSync(target, 'utf8'));
} catch (e) {
  console.error(`✖ 読めません: ${target}\n  ${e.message}`);
  process.exit(1);
}

const server = await createServer({
  configFile: false,
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { validateAppData } = await server.ssrLoadModule('/src/core/validate.ts');
await server.close();

const { ok, problems, warnings } = validateAppData(data);

console.log(`検査対象: ${target}`);
if (Array.isArray(data?.munis)) {
  console.log(`  自治体 ${data.munis.length} 件 / 学校 ${data.schools?.length ?? 0} 件 / 出典 ${data.sources?.length ?? 0} 件`);
}

for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const p of problems) console.error(`  ✖ ${p}`);

if (ok) {
  console.log(`✔ problems なし（warnings ${warnings.length} 件）`);
  process.exit(0);
}
console.error(`✖ problems ${problems.length} 件。data/app/*.json を直してください（warnings ${warnings.length} 件）`);
process.exit(1);
