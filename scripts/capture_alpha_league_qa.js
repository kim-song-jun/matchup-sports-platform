// alpha 리그전 QA 스윕 3폭 캡처 — PR #586 UI 변경(에러 상태·내 경기 배지) 실화면 검증용.
// 대상: ① 공개 리그 순위(정상) ② 공개 리그 404 딥링크(ErrorState — 기존엔 영구 빈 화면)
//       ③ 어드민 대진 관리(정상) ④ 어드민 잘못된 leagueId(ErrorState)
//       ⑤ 내 팀 상세 최근 경기의 "리그전" 배지
// alpha 는 프로덕션 모드라 헤더 dev 인증이 401 — 세션 쿠키를 주입한다(발급은 login API 만).
// Run: ALPHA_ADMIN_TOKEN=... ALPHA_CAPTAIN_TOKEN=... LEAGUE_ID=... TEAM_A_ID=... \
//      node scripts/capture_alpha_league_qa.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const ADMIN = (process.env.ALPHA_ADMIN_TOKEN || '').trim();
const CAPTAIN = (process.env.ALPHA_CAPTAIN_TOKEN || '').trim();
const LEAGUE_ID = (process.env.LEAGUE_ID || '').trim();
const TEAM_A_ID = (process.env.TEAM_A_ID || '').trim();
// 존재하지 않는 리그 — v4 형식이어야 ParseUUIDPipe(400)가 아니라 404 → ErrorState 경로를 찍는다.
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-league-qa');
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!ADMIN || !CAPTAIN || !LEAGUE_ID || !TEAM_A_ID) {
  console.error('ALPHA_ADMIN_TOKEN / ALPHA_CAPTAIN_TOKEN / LEAGUE_ID / TEAM_A_ID 가 필요합니다.');
  process.exit(1);
}

const WIDTHS = [['mobile', 390], ['tablet', 768], ['desktop', 1440]];
const PAGES = [
  { key: 'public-standings', url: `/league-matches/${LEAGUE_ID}`, token: null },
  { key: 'public-notfound', url: `/league-matches/${MISSING_ID}`, token: null },
  { key: 'admin-fixtures', url: `/admin/league-matches/${LEAGUE_ID}`, token: ADMIN },
  { key: 'admin-notfound', url: `/admin/league-matches/${MISSING_ID}`, token: ADMIN },
  { key: 'my-team-league-badge', url: `/my/teams/${TEAM_A_ID}`, token: CAPTAIN },
];

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
      const file = `${spec.key}-${name}-${width}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log(`captured ${file}`);
      await ctx.close();
    }
  }
  await browser.close();
})();
