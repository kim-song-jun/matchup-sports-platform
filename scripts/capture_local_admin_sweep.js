// 로컬 v1 스택 어드민 전수 훑기 — 화면 조사용(코드 정적 분석 결과를 실제 렌더와 대조).
//
// 인증: 로컬은 헤더 dev 인증이 살아 있어 비밀번호가 필요 없다.
// localStorage 의 teameet.v1.userId/userEmail 을 프론트가 x-v1-user-* 헤더로 실어 보낸다.
//
// Run: WEB=http://localhost:3013 ADMIN_ID=... ADMIN_EMAIL=... OUT_DIR=... \
//      node scripts/capture_local_admin_sweep.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const WEB = process.env.WEB || 'http://localhost:3013';
const ADMIN_ID = (process.env.ADMIN_ID || '').trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();
const OUT = process.env.OUT_DIR || path.resolve(__dirname, '../docs/visual-qa/local-admin-sweep');
const ONLY = (process.env.ONLY || '').trim();
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!ADMIN_ID || !ADMIN_EMAIL) {
  console.error('ADMIN_ID / ADMIN_EMAIL 이 필요합니다.');
  process.exit(1);
}

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
];

const ROUTES = [
  ['overview', '/admin'],
  ['users', '/admin/users'],
  ['matches', '/admin/matches'],
  ['teams', '/admin/teams'],
  ['team-matches', '/admin/team-matches'],
  ['series', '/admin/team-match-series'],
  ['series-new', '/admin/team-match-series/new'],
  ['tournaments', '/admin/tournaments'],
  ['tournaments-new', '/admin/tournaments/new'],
  ['notices', '/admin/notices'],
  ['popups', '/admin/popups'],
  ['terms', '/admin/terms'],
  ['inquiries', '/admin/inquiries'],
  ['audit', '/admin/audit'],
  ['ops-tournaments', '/admin/ops/tournaments'],
  ['ops-errors', '/admin/ops/errors'],
  ['ops-push-failures', '/admin/ops/push-failures'],
  ['ops-sms-failures', '/admin/ops/sms-failures'],
  ['ops-push-send', '/admin/ops/push-send'],
  ['ops-operation-flags', '/admin/ops/operation-flags'],
  ['settings-integrations', '/admin/settings/integrations'],
  ['admins', '/admin/admins'],
];

async function capture(page, name, width, route) {
  const file = `${name}-${width}.png`;
  try {
    await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    // AdminGate 통과 확인 — 어드민 셸의 주 메뉴가 붙어야 실제 화면이다.
    // (이걸 안 보면 "로그인 정보를 확인하고 있어요" 인증 로딩 화면을 찍게 된다.)
    await page
      .waitForSelector('nav[aria-label="주 메뉴"]', { state: 'attached', timeout: 60000 })
      .catch(() => {});
    // 그다음 스켈레톤이 걷히고 본문에 내용이 생길 때까지
    await page
      .waitForFunction(
        () => {
          const main = document.querySelector('main');
          if (!main) return false;
          if (main.querySelector('.animate-pulse')) return false;
          const text = (main.innerText ?? '').trim();
          if (/로그인 정보를 확인하고 있어요/.test(text)) return false;
          return text.length > 20;
        },
        { timeout: 30000 },
      )
      .catch(() => {});
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true, scale: 'css' });
    const heading = await page
      .locator('h1')
      .first()
      .innerText()
      .catch(() => '');
    return { name, route, width, file, heading: heading.trim().slice(0, 40), ok: true };
  } catch (err) {
    return { name, route, width, file: null, ok: false, error: String(err).slice(0, 140) };
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const routes = ONLY ? ROUTES.filter(([n]) => ONLY.split(',').includes(n)) : ROUTES;
  const browser = await chromium.launch();
  const results = [];

  for (const [widthName, width] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    // 프론트가 읽는 dev 인증 키를 첫 스크립트 실행 전에 심는다.
    await ctx.addInitScript(
      ([id, email]) => {
        localStorage.setItem('teameet.v1.userId', id);
        localStorage.setItem('teameet.v1.userEmail', email);
      },
      [ADMIN_ID, ADMIN_EMAIL],
    );
    const page = await ctx.newPage();
    for (const [name, route] of routes) {
      const r = await capture(page, name, width, route);
      results.push(r);
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${widthName.padEnd(7)} ${name.padEnd(24)} ${r.heading ?? ''}`);
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n완료 ${results.length - failed.length}/${results.length} · 출력 ${OUT}`);
  for (const f of failed) console.log(`  FAIL ${f.name}@${f.width} — ${f.error}`);
})();
