// 모바일 좌우 여백 정합성 감사 — 페이지별 상단 블록의 실측 left/right 오프셋을 뽑는다.
// 스크린샷 썸네일로는 "화면 끝에 붙었는지"를 오판하기 쉬우므로 getBoundingClientRect 실측을 근거로 쓴다.
// Output: docs/visual-qa/mobile-padding/<phase>/<name>.png + <phase>/measurements.json
// Requires the v1 stack running (web :3013 + api :8121 + seeded pg).
// Run: node scripts/audit_mobile_padding.js [before|after]
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const PHASE = process.argv[2] === 'after' ? 'after' : 'before';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/mobile-padding', PHASE);

const HOST_EMAIL = 'host@teameet.v1';

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

const PAGES = [
  ['01-home', '/home'],
  ['02-matches', '/matches'],
  ['03-team-matches', '/team-matches'],
  ['04-teams', '/teams'],
  ['05-tournaments', '/tournaments'],
  ['06-my', '/my'],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function safeErr(e) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 120);
}

/**
 * 스크롤 영역 상단부터 depth 2까지의 블록 요소 좌우 오프셋을 잰다.
 * 배경/보더가 있는 블록만 시각적으로 "여백 없음"이 드러나므로 배경 유무도 함께 기록한다.
 */
async function measure(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('.tm-scroll-area');
    if (!scroll) return { error: 'no .tm-scroll-area' };
    const vw = document.documentElement.clientWidth;
    const rows = [];
    const visit = (el, depth) => {
      if (depth > 2) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      // display:contents 래퍼(.tm-home-desktop 등)는 자기 rect가 0이지만 자식은 실제로 배치된다.
      // 기록만 건너뛰고 depth를 소모하지 않은 채 자식으로 내려가야 홈 같은 페이지가 누락되지 않는다.
      if (cs.display === 'contents') {
        Array.from(el.children).forEach((child) => visit(child, depth));
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 8) return;
      const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      const hasBorder = cs.borderTopWidth !== '0px' || cs.borderBottomWidth !== '0px';
      rows.push({
        depth,
        cls: (el.className && typeof el.className === 'string' ? el.className : el.tagName.toLowerCase()).slice(0, 70),
        tag: el.tagName.toLowerCase(),
        left: Math.round(rect.left),
        right: Math.round(vw - rect.right),
        width: Math.round(rect.width),
        top: Math.round(rect.top),
        padL: cs.paddingLeft,
        padR: cs.paddingRight,
        hasBg,
        hasBorder,
      });
      Array.from(el.children).forEach((child) => visit(child, depth + 1));
    };
    Array.from(scroll.children).forEach((child) => visit(child, 0));
    return { vw, rows: rows.sort((a, b) => a.top - b.top).slice(0, 40) };
  });
}

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}

/** 시드 사용자는 재동의 대상이라 약관 게이트가 모든 페이지를 가로막는다 — 실클릭으로만 통과된다. */
async function passTermsGate(page) {
  const agreeAll = page.locator('text=전체 동의').first();
  if (!(await agreeAll.count().catch(() => 0))) return false;
  await agreeAll.click().catch(() => {});
  await page.waitForTimeout(300);
  const cta = page.locator('button.tm-btn-primary:not([disabled]), button:has-text("동의하고 계속")').first();
  await cta.click().catch(() => {});
  await page.waitForTimeout(1200);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  const summary = {};
  for (const bp of BREAKPOINTS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript((email) => {
      localStorage.removeItem('teameet.v1.userId');
      localStorage.setItem('teameet.v1.userEmail', email);
    }, HOST_EMAIL);
    const page = await ctx.newPage();
    console.log(`\n===== ${PHASE} / ${bp.key} (${bp.width}x${bp.height}) =====`);
    const measurements = {};
    let gatePassed = false;
    for (const [name, route] of PAGES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
        if (!gatePassed) gatePassed = await passTermsGate(page);
        // join-eligibility 같은 후속 쿼리가 늦게 도착 — 1.5초로는 빈 채로 찍힌다.
        await page.waitForTimeout(3000);
        measurements[name] = await measure(page);
        await shot(page, dir, name);
        const anomalies = (measurements[name].rows || []).filter((r) => (r.left <= 4 || r.right <= 4) && (r.hasBg || r.hasBorder));
        console.log(`  OK ${name}  edge-blocks=${anomalies.length}`);
      } catch (e) {
        measurements[name] = { error: safeErr(e) };
        console.log(`  FAIL ${name} ${safeErr(e)}`);
      }
    }
    fs.writeFileSync(path.join(dir, 'measurements.json'), JSON.stringify(measurements, null, 2));
    summary[bp.key] = Object.keys(measurements).length;
    await ctx.close();
  }
  await browser.close();
  console.log('\n=== DONE ===', JSON.stringify(summary));
})();
