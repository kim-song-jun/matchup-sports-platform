// 울트라와이드(1920/2560) 반응형 실측 + 캡처.
// 콘텐츠가 늘어지지 않고 max-width 캡 + 중앙정렬 유지하는지 ground-truth 측정.
// 출력: docs/visual-qa/ultrawide-v1/{1920,2560}/<name>.png + 콘솔 측정 요약.
// 요구: v1 스택(web :3013 + api :8121 + seed pg) 가동.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/ultrawide-v1');
const HOST = 'host@teameet.v1';
const ADMIN = 'admin@teameet.v1';
const TMATCH = '00000000-0000-4000-8000-000000000301';

const WIDTHS = [
  { key: '1920', width: 1920, height: 1080 },
  { key: '2560', width: 2560, height: 1440 },
];

const CONSUMER = [
  ['home', '/home'],
  ['matches', '/matches'],
  ['teams', '/teams'],
  ['team-match-detail', `/team-matches/${TMATCH}`],
  ['my', '/my'],
];
const ADMIN_PAGES = [
  ['admin-overview', '/admin'],
  ['admin-users', '/admin/users'],
  ['admin-matches', '/admin/matches'],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

// 페이지 내부에서 콘텐츠 폭/중앙정렬/overflow를 측정
function measureInPage() {
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth;
  const horizontalOverflow = docW > vw + 2;
  const main = document.querySelector('main') || document.body;
  // main 하위에서 "실제 콘텐츠 폭"을 추정: 직접 자식 중 가장 넓은 블록의 rect
  let widest = { w: 0, left: 0, right: 0, sel: '' };
  const candidates = main.querySelectorAll(':scope > *, :scope > * > *');
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    if (r.width > widest.w && r.height > 80) {
      widest = { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(vw - r.right), sel: el.className?.toString().slice(0, 40) || el.tagName };
    }
  }
  const centered = Math.abs(widest.left - widest.right) <= 24; // 좌우 여백 대칭 ±24px
  return { vw, docW, horizontalOverflow, contentW: widest.w, leftGap: widest.left, rightGap: widest.right, centered, sel: widest.sel };
}

async function run(ctx, dir, pages, results, wkey) {
  const page = await ctx.newPage();
  for (const [name, route] of pages) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(400);
      const m = await page.evaluate(measureInPage);
      await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: false, scale: 'css' });
      const flag = m.horizontalOverflow ? '🔴OVERFLOW' : (m.contentW > 1500 ? '🟠SPRAWL' : (!m.centered ? '🟡OFF-CENTER' : '🟢'));
      results.push({ w: wkey, name, ...m, flag });
      console.log(`  [${wkey}] ${flag} ${name}: content=${m.contentW}px L=${m.leftGap} R=${m.rightGap} overflow=${m.horizontalOverflow} (${m.sel})`);
    } catch (e) {
      console.log(`  [${wkey}] FAIL ${name}: ${(e.message || e).slice(0, 80)}`);
    }
  }
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const all = [];
  for (const bp of WIDTHS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n===== ${bp.key} (${bp.width}x${bp.height}) =====`);
    const vp = { viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 };

    const host = await browser.newContext(vp);
    await host.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    await run(host, dir, CONSUMER, all, bp.key);
    await host.close();

    const adm = await browser.newContext(vp);
    await adm.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, ADMIN);
    await run(adm, dir, ADMIN_PAGES, all, bp.key);
    await adm.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'measure.json'), JSON.stringify(all, null, 2));
  const issues = all.filter((r) => r.flag !== '🟢');
  console.log(`\n=== 측정 ${all.length}건, 이슈 ${issues.length}건 ===`);
  for (const i of issues) console.log(`  ${i.flag} [${i.w}] ${i.name}: content=${i.contentW}px L=${i.leftGap} R=${i.rightGap}`);
})();
