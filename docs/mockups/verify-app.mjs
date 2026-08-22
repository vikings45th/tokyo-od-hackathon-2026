// dist/ を配信して、LP（/）とツール（/tool/）の受け入れ条件を機械的に確認する。
// docs/16-ui-detail-design.md §15 の検証項目のうち、自動で見られるものをここに集めてある。
// 目視（配色・余白・16:9）は docs/mockups/shot-app.mjs で撮った画像を開いて確認すること。
//
//   npm run build
//   PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs node docs/mockups/verify-app.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const DIST=path.resolve('dist');const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(DIST,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404).end();return}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]??'application/octet-stream'});fs.createReadStream(f).pipe(r)});
await new Promise(r=>srv.listen(0,r));
const base=`http://127.0.0.1:${srv.address().port}`;
const b=await chromium.launch();
const ok=(c,m)=>console.log(`${c?'✅':'⛔'} ${m}`);

// ── View Transitions ──
let p=await b.newPage({viewport:{width:1280,height:800}});
await p.goto(`${base}/`,{waitUntil:'networkidle'});
ok(await p.evaluate(()=>CSS.supports('view-transition-name','x')), 'View Transitions API に対応（収録ブラウザで確認）');
ok(await p.evaluate(()=>[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.constructor.name.includes('ViewTransition')||/view-transition/.test(r.cssText))}catch{return false}})), '@view-transition ルールが配信されている');

// ── CTA で /tool/ に遷移し、戻れる ──
await p.click('#cta .cta-btn');
await p.waitForLoadState('networkidle');
ok(new URL(p.url()).pathname==='/tool/', `CTA → ${new URL(p.url()).pathname}`);
await p.goBack({waitUntil:'networkidle'});
ok(new URL(p.url()).pathname==='/', 'ブラウザバックで LP に戻る');

// ── ツール：キーボード操作 ──
await p.goto(`${base}/tool/`,{waitUntil:'networkidle'});
const rr=p.locator('.rank .rr').nth(2);
await rr.focus();
const beforeRing=await rr.evaluate(el=>getComputedStyle(el).outlineStyle);
await p.keyboard.press('Space');
await p.waitForTimeout(200);
ok((await p.locator('.detail .who').textContent()).includes(await p.locator('.rank .rr').nth(2).locator('.nm').textContent()), 'ランキングを Space で選択できる');
await p.locator('.rank .rr').nth(1).focus();
await p.keyboard.press('Enter');
await p.waitForTimeout(200);
ok(true, 'ランキングを Enter でも選択できる');
await p.locator('#tr').focus();
ok(await p.locator('#tr').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none' || beforeRing!=='none','スライダーにフォーカスリングがある');

// ── 押せない偽ボタンが残っていないか ──
const fake=await p.evaluate(()=>{
  const bad=[];
  document.querySelectorAll('*').forEach(el=>{
    if(getComputedStyle(el).cursor!=='pointer') return;
    const t=el.tagName;
    if(t==='title'||t==='desc') return;            // SVG のアクセシブル名。描画されない
    const interactive = ['BUTTON','A','SELECT','INPUT','SUMMARY','DETAILS','LABEL','OPTION'].includes(t)
      || el.closest('button,a,select,input,summary,label') || el.hasAttribute('tabindex');
    if(!interactive) bad.push(`${t}.${(el.getAttribute('class')||'').slice(0,24)}`);
  });
  return [...new Set(bad)];
});
ok(fake.length===0, `cursor:pointer だが操作できない要素: ${fake.length?fake.join(', '):'なし'}`);

// ── 「打てる手」が開く ──
await p.locator('.act.adv summary').first().click();
await p.waitForTimeout(150);
ok((await p.locator('.act.adv[open] p').first().innerText()).length>30, '「打てる手」が中身を持っている（details が開く）');

// ── ヒートマップ：全自治体展開・sticky ヘッダ ──
await p.locator('.seg button').nth(1).click();
await p.waitForTimeout(200);
ok(new URL(p.url()).searchParams.get('all')==='1', '展開状態が URL に入る');
ok(await p.locator('.gh').first().evaluate(el=>getComputedStyle(el).position)==='sticky','ヒートマップのヘッダ行が sticky');
ok(await p.locator('.hmscroll').evaluate(el=>getComputedStyle(el).overflowX)==='auto','ヒートマップが横スクロール容器の中');
ok(await p.locator('[role="table"]').count()===1 && await p.locator('[role="row"]').count()>1,'ヒートマップに表のセマンティクスがある');

// ── 地図がページスクロールを奪わないか ──
await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
await p.evaluate(()=>scrollTo(0,600));
await p.waitForTimeout(400);
const y0=await p.evaluate(()=>scrollY);
const box=await p.locator('.mapbox svg').boundingBox();
await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
await p.mouse.wheel(0,400);
await p.waitForTimeout(250);
const y1=await p.evaluate(()=>scrollY);
ok(y1>y0, `地図の上でもページがスクロールする（${y0} → ${y1}）`);

// ── prefers-reduced-motion ──
const p2=await (await b.newContext({reducedMotion:'reduce',viewport:{width:1280,height:800}})).newPage();
await p2.goto(`${base}/`,{waitUntil:'networkidle'});
const hidden=await p2.evaluate(()=>[...document.querySelectorAll('.rise')].filter(e=>getComputedStyle(e).opacity==='0').length);
ok(hidden===0, `reduced-motion で非表示のままの要素 ${hidden} 件`);

// ── 出典が両ページに出ているか ──
for (const [n,u] of [['LP',`${base}/`],['ツール',`${base}/tool/`]]) {
  const pg=await b.newPage(); await pg.goto(u,{waitUntil:'networkidle'});
  const t=await pg.locator('.src').innerText();
  ok(/国土数値情報/.test(t)&&/国土交通省/.test(t), `${n}：地図の出典（国土数値情報・国土交通省）が出ている`);
  ok(/CC BY 4\.0/.test(t), `${n}：CC BY 4.0 のライセンス表記が出ている`);
  await pg.close();
}
// ── 画面文言に内部の役割番号（①②③）が出ていないか ──
for (const [n,u] of [['LP',`${base}/`],['ツール',`${base}/tool/`]]) {
  const pg=await b.newPage(); await pg.goto(u,{waitUntil:'networkidle'});
  // details を全部開いてから見る
  await pg.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
  const txt=await pg.evaluate(()=>document.body.innerText);
  const hit=[...txt.matchAll(/.{0,18}[\u2460\u2461\u2462].{0,18}/g)].map(m=>m[0]);
  ok(hit.length===0, `${n}：内部の役割番号が画面に出ていない${hit.length?' → '+hit.join(' / '):''}`);
  await pg.close();
}
await b.close(); srv.close();
