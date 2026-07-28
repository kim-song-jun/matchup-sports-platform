// Copilot 15차 검증 — 팀매치 생성 1단계(팀 선택)의 '권한 기준' 카드.
// blocked(member-only): orange 카드 + EmptyState 제거 / normal(host): grey 카드.
// Output: docs/visual-qa/copilot15-verify/<name>.png  (mobile 390)
// Requires v1 stack: web :3013 + api :8121 + seeded pg.  Run: node scripts/capture_copilot15.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/copilot15-verify');

const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];          // creatable team → normal grey card
const MEMBER = ['4c094cab-4fb6-4d54-a43b-99fd3f4f9ee7', 'member@teameet.v1'];      // member-only → blocked orange card

const ROUTE = '/team-matches/new/team';
const VIEWPORT = { width: 390, height: 844 };
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function safeErr(e) { return (e instanceof Error ? e.message : String(e)).slice(0, 140); }

async function shot(page, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(ROOT, name + '.png'), fullPage: true, scale: 'css' });
}

async function capture(browser, auth, name) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await ctx.addInitScript(([i, e]) => {
    localStorage.setItem('teameet.v1.userId', i);
    localStorage.setItem('teameet.v1.userEmail', e);
  }, auth);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  let bodyHas = {};
  try {
    await page.goto(BASE + ROUTE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const txt = await page.evaluate(() => document.body.innerText);
    bodyHas = {
      권한기준: txt.includes('권한 기준'),
      차단문구: txt.includes('지금은 다음 단계로 이동할 수 없어요'),
      구EmptyState제목: txt.includes('팀매치를 만들 수 있는 팀이 없어요'),
    };
    await shot(page, name);
    console.log('  OK', name, JSON.stringify(bodyHas));
  } catch (e) {
    console.log('  FAIL', name, safeErr(e));
  }
  await page.close();
  await ctx.close();
  return { name, bodyHas, errs: [...new Set(errs)].slice(0, 8) };
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const out = [];
  out.push(await capture(browser, MEMBER, 'blocked-member-only'));
  out.push(await capture(browser, HOST, 'normal-host'));
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(out, null, 2));
  console.log('\n=== DONE ===');
  for (const r of out) console.log(`${r.name}: ${JSON.stringify(r.bodyHas)} consoleErrs=${r.errs.length}`);
})();
