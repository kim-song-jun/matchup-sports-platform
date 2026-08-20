// alpha(프로덕션 모드) 어드민 콘솔 전수 훑기 — 27개 화면 × 3폭 캡처.
//
// 목적: 코드 정적 분석으로 낸 "난잡함" 진단을 실제 렌더된 화면과 대조하기 위한 조사용 스윕이다.
// PR 갤러리용 before/after 캡처가 아니므로 산출물은 레포 밖(스크래치패드)에 쓴다.
//
// 헤더 dev 인증은 alpha 프로덕션 게이트에 막히므로 세션 쿠키를 주입한다
// (근거: apps/v1_api/src/auth/v1-session.ts — 세션은 서명만 하는 stateless 쿠키).
//
// Run: ALPHA_SESSION_TOKEN=... OUT_DIR=/path/to/out node scripts/capture_alpha_admin_sweep.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const OUT = process.env.OUT_DIR || path.resolve(__dirname, '../docs/visual-qa/admin-ia-sweep');
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 이 필요합니다.');
  process.exit(1);
}

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
];

/** 고정 경로 — 목록·도구·설정 화면 */
const STATIC_ROUTES = [
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

/** 상세 화면은 실제 id 가 필요하다 — 목록 API 에서 첫 항목을 뽑아 경로를 만든다. */
async function resolveDetailRoutes(ctx) {
  const pick = async (apiPath, idField = 'id') => {
    try {
      const res = await ctx.request.get(`${BASE}${apiPath}`);
      if (!res.ok()) return null;
      const body = await res.json();
      const items = body?.items ?? body?.data?.items ?? body?.data ?? body;
      return Array.isArray(items) && items.length ? items[0]?.[idField] ?? null : null;
    } catch {
      return null;
    }
  };

  const routes = [];
  const userId = await pick('/api/v1/admin/users?limit=1');
  if (userId) routes.push(['user-detail', `/admin/users/${userId}`]);
  const teamId = await pick('/api/v1/admin/teams?limit=1');
  if (teamId) routes.push(['team-detail', `/admin/teams/${teamId}`]);
  const inquiryId = await pick('/api/v1/admin/inquiries?limit=1');
  if (inquiryId) routes.push(['inquiry-detail', `/admin/inquiries/${inquiryId}`]);
  const leagueId = await pick('/api/v1/admin/league-matches?limit=1', 'leagueId');
  if (leagueId) routes.push(['league-detail', `/admin/league-matches/${leagueId}`]);

  const tournamentId = await pick('/api/v1/admin/tournaments?limit=1');
  if (tournamentId) {
    // 현재(변경 전) alpha 는 탭 한 화면이다. 섹션 라우트는 머지 후에만 존재하므로
    // 여기서는 상세 진입 화면만 찍는다.
    routes.push(['tournament-detail', `/admin/tournaments/${tournamentId}`]);
  }
  return routes;
}

async function capture(page, name, width, route) {
  const file = `${name}-${width}.png`;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // alpha 는 실시간 소켓이 계속 붙어 있어 networkidle 에 도달하지 않는다.
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    // 스켈레톤이 걷힐 때까지 — 본문에 글자가 생기거나 빈 상태 문구가 뜰 때까지 기다린다.
    await page
      .waitForFunction(
        () => {
          const main = document.querySelector('main');
          if (!main) return false;
          if (main.querySelector('.animate-pulse')) return false;
          return (main.innerText ?? '').trim().length > 20;
        },
        { timeout: 25000 },
      )
      .catch(() => {});
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true, scale: 'css' });
    return { name, route, width, file, ok: true };
  } catch (err) {
    return { name, route, width, file: null, ok: false, error: String(err).slice(0, 160) };
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 호스트 부하를 감안해 브라우저는 하나만 띄우고 폭마다 컨텍스트만 바꾼다.
  const browser = await chromium.launch();
  const results = [];
  let routes = null;

  for (const [widthName, width] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addCookies([
      {
        name: 'teameet_v1_session',
        value: TOKEN,
        domain: 'alpha.teameet.co.kr',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ]);

    if (!routes) {
      const detail = await resolveDetailRoutes(ctx);
      routes = [...STATIC_ROUTES, ...detail];
      console.log(`대상 화면 ${routes.length}개 (상세 ${detail.length}개 해석됨)`);
    }

    const page = await ctx.newPage();
    for (const [name, route] of routes) {
      const r = await capture(page, name, width, route);
      results.push(r);
      console.log(`${r.ok ? 'ok ' : 'FAIL'} ${widthName.padEnd(7)} ${name}`);
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n완료: ${results.length - failed.length}/${results.length} 성공`);
  if (failed.length) {
    console.log('실패 목록:');
    for (const f of failed) console.log(`  ${f.name} @${f.width} — ${f.error}`);
  }
  console.log('출력:', OUT);
})();
