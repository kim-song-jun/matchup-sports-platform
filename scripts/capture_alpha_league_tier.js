// alpha 리그 티어·승강 3폭 캡처 — PR #619(Task 153) UI 변경 실화면 검증용.
// 대상: ① 리그 체계 목록 ② 리그 체계 생성(승강 규칙 폼 + 미리보기)
//       ③ 리그 체계 상세(시즌·티어 카드) ④ 공개 리그 상세(티어 뱃지)
// alpha 는 프로덕션 모드라 헤더 dev 인증이 401 — 세션 쿠키를 주입한다(발급은 login API 만).
// Run: ALPHA_ADMIN_TOKEN=... [SERIES_ID=...] [LEAGUE_ID=...] node scripts/capture_alpha_league_tier.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const ADMIN = (process.env.ALPHA_ADMIN_TOKEN || '').trim();
const SERIES_ID = (process.env.SERIES_ID || '').trim();
const LEAGUE_ID = (process.env.LEAGUE_ID || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-league-tier');
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!ADMIN) {
  console.error('ALPHA_ADMIN_TOKEN 이 필요합니다.');
  process.exit(1);
}

const WIDTHS = [['mobile', 390], ['tablet', 768], ['desktop', 1440]];

const PAGES = [
  { key: 'admin-series-list', url: '/admin/league-series', token: ADMIN },
  { key: 'admin-series-new', url: '/admin/league-series/new', token: ADMIN },
];
if (SERIES_ID) {
  PAGES.push({ key: 'admin-series-detail', url: `/admin/league-series/${SERIES_ID}`, token: ADMIN });
  // 승강 확정 패널은 "승강 후보 계산"을 눌러야 열린다 — 이 PR 의 핵심 UI 라 반드시 찍는다.
  PAGES.push({ key: 'admin-promotion-panel', url: `/admin/league-series/${SERIES_ID}`, token: ADMIN, clickPreview: true });
}
if (LEAGUE_ID) PAGES.push({ key: 'public-league-tier-badge', url: `/league-matches/${LEAGUE_ID}`, token: null });

async function settle(page, ms = 2500) {
  // 라이브 폴링 화면이 있어 networkidle 은 영원히 안 끝난다 — 고정 대기로 안정화한다.
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(ms);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(400);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [name, width] of WIDTHS) {
    for (const spec of PAGES) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
      if (spec.token) {
        await ctx.addCookies([
          { name: 'teameet_v1_session', value: spec.token, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
        ]);
      }
      const page = await ctx.newPage();
      await page.goto(`${BASE}${spec.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);

      // 생성 화면은 티어 수를 2로 올려야 승강 규칙 폼이 열린다(1티어는 승강이 없어 숨김).
      if (spec.key === 'admin-series-new') {
        await page.selectOption('#series-tier-count', '3').catch(() => {});
        await page.waitForTimeout(500);
      }

      if (spec.clickPreview) {
        const btn = page.getByRole('button', { name: '승강 후보 계산' }).first();
        await btn.click({ timeout: 15000 }).catch((e) => console.warn('preview click 실패:', e.message));
        // 계산 결과가 렌더될 때까지 기다린다. 안 뜨면 그대로 찍어 원인을 눈으로 본다.
        await page
          .getByRole('button', { name: '승강 최종 승인' })
          .waitFor({ timeout: 20000 })
          .catch(() => console.warn('승강 패널이 나타나지 않음'));
        await page.waitForTimeout(800);
      }

      const file = `${spec.key}-${name}-${width}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log(`captured ${file}`);
      await ctx.close();
    }
  }
  await browser.close();
})();
