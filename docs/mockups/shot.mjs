// docs/mockups/ をローカル配信して、セクションごとにスクリーンショットする。
// playwright は devDependency に入れてもよいが、リポジトリ直下の package.json は
// ②の所有物なので、外部に入れた playwright を PLAYWRIGHT_MODULE で差し込めるようにしている。
//   例) PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs node docs/mockups/shot.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = import.meta.dirname;
const MIME = { '.html':'text/html', '.json':'application/json', '.js':'text/javascript' };

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const THEME = process.env.THEME ?? 'light';
const SFX = THEME === 'light' ? '' : `-${THEME}`;   // ライトが既定なので接尾辞なし
const url = `http://127.0.0.1:${server.address().port}/docs/mockups/mockup.html?theme=${THEME}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => m.type() === 'error' && errs.push(m.text()));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="1"]', { timeout: 10000 });

const shot = async (name, fn) => {
  await fn();
  await page.waitForTimeout(1100);              // rise アニメの収束を待つ
  const p = path.join(OUT, `screen-${name}${SFX}.png`);
  await page.screenshot({ path: p });
  console.log(`  ${name.padEnd(12)} ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
};
const toSection = id => page.evaluate(i => {
  document.getElementById(i).scrollIntoView({ behavior: 'auto', block: 'start' });
}, id);

console.log(`撮影（theme=${THEME}）:`);
await shot('hero',    () => page.evaluate(() => scrollTo(0, 0)));
await shot('gap',     () => toSection('s1'));
await shot('number',  () => toSection('s2'));
// S3 は 340vh。3ステップの真ん中あたりを撮る
const s3top = await page.evaluate(() => document.getElementById('s3').offsetTop);
await shot('story-2031', () => page.evaluate(t => scrollTo(0, t + innerHeight * 1.5), s3top));
await shot('story-2038', () => page.evaluate(t => scrollTo(0, t + innerHeight * 2.5), s3top));
await shot('tool',    () => toSection('s4'));
await shot('tool-zoom', async () => {
  await toSection('s4');
  await page.click('#zKu');                     // 23区へ寄せる
});
await shot('sources', () => toSection('s5'));

// フルページも1枚
const full = path.join(OUT, `screen-full${SFX}.png`);
await page.screenshot({ path: full, fullPage: true });
console.log(`  full         ${(fs.statSync(full).size/1024).toFixed(0)} KB`);

await browser.close();
server.close();
if (errs.length) { console.error('\n⛔ ページエラー:\n' + errs.join('\n')); process.exit(1); }
console.log('エラーなし');
