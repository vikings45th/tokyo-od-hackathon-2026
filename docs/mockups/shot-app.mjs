// dist/ を配信して、LP（/）とツール（/tool/）を撮影する。
// モックではなく **本番ビルドの実物** を撮る。数えるだけでは分からないことがあるので、
// 撮ったあと必ず画像を開いて目視すること（docs/16 §12-2 の作法）。
//
//   npm run build
//   PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs THEME=light \
//     node docs/mockups/shot-app.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../../dist');
const OUT = path.resolve(import.meta.dirname, 'app');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const THEME = process.env.THEME ?? 'light';
const SFX = THEME === 'light' ? '' : `-${THEME}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: THEME,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const shot = async (name, fn) => {
  if (fn) await fn();
  await page.waitForTimeout(1100); // rise アニメの収束を待つ
  const p = path.join(OUT, `${name}${SFX}.png`);
  await page.screenshot({ path: p });
  console.log(`  ${name.padEnd(14)} ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
};
const toSection = (id) =>
  page.evaluate((i) => document.getElementById(i)?.scrollIntoView({ behavior: 'auto', block: 'start' }), id);

console.log(`撮影（theme=${THEME}）:`);

// ── LP ──
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await shot('lp-hero', () => page.evaluate(() => scrollTo(0, 0)));
await shot('lp-gap', () => toSection('s1'));
await shot('lp-number', () => toSection('s2'));
const s3top = await page.evaluate(() => document.getElementById('s3').offsetTop);
await shot('lp-story-2031', () => page.evaluate((t) => scrollTo(0, t + innerHeight * 1.5), s3top));
await shot('lp-story-2038', () => page.evaluate((t) => scrollTo(0, t + innerHeight * 2.5), s3top));
await shot('lp-cta', () => toSection('cta'));
await shot('lp-ev', () => toSection('ev'));
await page.screenshot({ path: path.join(OUT, `lp-full${SFX}.png`), fullPage: true });
console.log('  lp-full');

// ── ツール ──
await page.goto(`${base}/tool/`, { waitUntil: 'networkidle' });
await shot('tool-top', () => page.evaluate(() => scrollTo(0, 0)));
await shot('tool-detail', () => page.evaluate(() => scrollTo(0, 900)));
await shot('tool-heat', () => page.evaluate(() => scrollTo(0, 1900)));
await shot('tool-sources', () => page.evaluate(() => scrollTo(0, document.body.scrollHeight)));

// URL 状態の復元（審査員に URL を渡せること・収録の再現性）
await page.goto(`${base}/tool/?birth=2025-03&muni=%E4%B8%AD%E5%A4%AE%E5%8C%BA`, { waitUntil: 'networkidle' });
const restored = await page.evaluate(() => ({
  entry: document.querySelector('.ctl .eq')?.textContent,
  sel: document.querySelector('.detail .who')?.textContent?.trim(),
  url: location.search,
}));
console.log('  URL復元 →', JSON.stringify(restored, null, 0));
await shot('tool-url-restored');

// モバイル幅で横スクロールが出ないか
const mob = await ctx.newPage();
await mob.setViewportSize({ width: 375, height: 780 });
for (const [name, url] of [['lp', `${base}/`], ['tool', `${base}/tool/`]]) {
  await mob.goto(url, { waitUntil: 'networkidle' });
  const over = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`  375px ${name.padEnd(5)} 横あふれ ${over}px ${over > 0 ? '⛔' : '✅'}`);
  await mob.screenshot({ path: path.join(OUT, `m-${name}${SFX}.png`), fullPage: false });
}

await browser.close();
server.close();
if (errs.length) {
  console.error('\n⛔ ページエラー:\n' + errs.join('\n'));
  process.exit(1);
}
console.log('コンソールエラーなし');
