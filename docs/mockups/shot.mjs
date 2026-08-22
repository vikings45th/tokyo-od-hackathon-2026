// docs/mockups/ をローカル配信して mockup.html を2状態スクリーンショットする
// playwright は devDependency に入れてもよいが、リポジトリ直下の package.json は
// ②の所有物なので、外部に入れた playwright を PLAYWRIGHT_MODULE で差し込めるようにしている。
//   例) PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node docs/mockups/shot.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MIME = { '.html':'text/html', '.json':'application/json', '.js':'text/javascript' };

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/docs/mockups/mockup.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => m.type() === 'error' && errs.push(m.text()));

for (const state of ['initial', 'selected']) {
  await page.goto(`${base}?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
  const out = path.join(import.meta.dirname, `screen-${state}.png`);
  await page.locator('.wrap').screenshot({ path: out });
  console.log(`${state}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
await browser.close();
server.close();
if (errs.length) { console.error('\n⛔ ページエラー:\n' + errs.join('\n')); process.exit(1); }
console.log('エラーなし');
