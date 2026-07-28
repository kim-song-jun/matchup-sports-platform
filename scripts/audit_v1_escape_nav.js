// 로그인 후 주요 화면을 순회하며 "탈출 내비게이션" 상태를 실측한다.
// 측정: ① 보이는 홈 이동 수단 ② 하단 탭바 활성 탭이 화면과 맞는지 ③ 고정 CTA·탭바 겹침
//       ④ 콘솔 에러 / 4xx. web 3013(→8121) 전제. 단일 브라우저·모바일 1폭(부하 최소).
// Run: node scripts/audit_v1_escape_nav.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const API = 'http://localhost:8121/api/v1';
const OUT = path.resolve(__dirname, '../docs/visual-qa/escape-nav-audit');
const EMAIL = process.env.HOST_EMAIL || 'host@teameet.v1';
const VIEWPORT = { width: 390, height: 844 };
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

// 라우트가 속한 탭. null 이면 5개 탭 어디에도 속하지 않는 화면(활성 탭이 없어야 맞다).
const ROUTES = (ids) => [
  ['홈', '/home', 'home'],
  ['매치 목록', '/matches', 'matches'],
  ['매치 상세', `/matches/${ids.matchId}`, 'matches'],
  ['매치 생성 종목', '/matches/new/sport', 'matches'],
  ['대회 목록', '/tournaments', 'tournaments'],
  ['대회 상세', `/tournaments/${ids.tournamentId}`, 'tournaments'],
  ['대회 참가신청', `/tournaments/${ids.tournamentId}/apply`, 'tournaments'],
  ['내 신청', `/tournaments/${ids.tournamentId}/my`, 'tournaments'],
  ['선수 명단', `/tournaments/${ids.tournamentId}/registrations/${ids.registrationId}/roster`, 'tournaments'],
  ['순위·브래킷', `/tournaments/${ids.tournamentId}/bracket`, 'tournaments'],
  ['최종결과', `/tournaments/${ids.tournamentId}/results`, 'tournaments'],
  ['시상·리뷰', `/tournaments/${ids.tournamentId}/awards`, 'tournaments'],
  ['대회 리뷰', `/tournaments/${ids.tournamentId}/reviews`, 'tournaments'],
  ['팀 목록', '/teams', 'teams'],
  ['팀 상세', `/teams/${ids.teamId}`, 'teams'],
  ['팀 멤버', `/teams/${ids.teamId}/members`, 'teams'],
  ['팀 생성', '/teams/new', 'teams'],
  ['팀매칭 목록', '/team-matches', null],
  ['팀매칭 생성', '/team-matches/new', null],
  ['마이', '/my', 'my'],
  ['내 매치(생성)', '/my/matches/created', 'my'],
  ['내 매치(참여)', '/my/matches/joined', 'my'],
  ['받은 초대', '/my/invitations', 'my'],
  ['내 리뷰', '/my/reviews', 'my'],
  ['문의 목록', '/my/inquiries', 'my'],
  ['문의 작성', '/my/inquiries/new', 'my'],
  ['설정', '/my/settings', 'my'],
  ['알림 설정', '/my/settings/notifications', 'my'],
  ['프로필 편집', '/my/profile/edit', 'my'],
  ['검색', '/search', null],
  ['채팅 목록', '/chat', null],
  ['알림', '/notifications', null],
  ['공지사항', '/notices', null],
  ['이벤트', '/events', null],
];

async function fetchIds(page) {
  const get = async (p) => {
    const r = await page.request.get(API + p, { headers: { 'x-v1-user-email': EMAIL } });
    if (!r.ok()) return null;
    const j = await r.json().catch(() => null);
    return j && j.data !== undefined ? j.data : j;
  };
  const first = (v) => (Array.isArray(v) ? v[0] : Array.isArray(v?.items) ? v.items[0] : null);
  const [matches, tournaments, teams] = await Promise.all([get('/matches'), get('/tournaments'), get('/teams')]);
  const tournamentId = first(tournaments)?.id ?? 'aa000000-0000-4000-8000-000000000001';
  const regs = await get(`/tournaments/${tournamentId}/registrations/me`).catch(() => null);
  return {
    matchId: first(matches)?.id ?? 'missing',
    tournamentId,
    registrationId: first(regs)?.id ?? 'aa100000-0000-4000-8000-000000000001',
    teamId: first(teams)?.id ?? 'missing',
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await ctx.addInitScript((e) => localStorage.setItem('teameet.v1.userEmail', e), EMAIL);
  const page = await ctx.newPage();

  await page.goto(BASE + '/home', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(800);
  if (await page.getByText('새 필수 약관을 확인해 주세요').count()) {
    await page.getByText('필수 약관 전체 동의').first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /동의/ }).last().click();
    await page.waitForTimeout(1500);
    console.log('consent gate passed');
  }

  const ids = await fetchIds(page);
  console.log('ids:', JSON.stringify(ids));

  const results = [];
  for (const [label, route, expectedTab] of ROUTES(ids)) {
    const errs = [];
    const bad = [];
    const onErr = (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); };
    const onRes = (r) => {
      if (r.status() >= 400) { try { bad.push(`${r.status()} ${new URL(r.url()).pathname}`); } catch { /* */ } }
    };
    page.on('console', onErr);
    page.on('response', onRes);
    let row;
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForTimeout(900);
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      row = await page.evaluate(() => {
        const rendered = (el) => Boolean(el) && el.getClientRects().length > 0;
        const nav = document.querySelector('.tm-bottom-nav');
        const navVisible = rendered(nav);
        const activeTab = nav
          ? (Array.from(nav.querySelectorAll('.tm-bottom-tab')).find((t) => t.dataset.active === 'true')?.innerText || '').trim()
          : null;
        const homeShortcut = rendered(document.querySelector('.tm-topbar-actions a[aria-label="홈으로"]'));
        const homeWays = Array.from(document.querySelectorAll('a[href="/home"], a[href="/"]')).filter(rendered).length;
        const back = rendered(document.querySelector('a[aria-label="뒤로가기"]'));
        // 고정 CTA 와 탭바의 세로 구간이 겹치는지 실측
        let overlap = false;
        const cta = document.querySelector('.tm-fixed-cta');
        if (rendered(cta) && navVisible) {
          const a = cta.getBoundingClientRect();
          const b = nav.getBoundingClientRect();
          overlap = a.bottom > b.top + 1 && a.top < b.bottom - 1;
        }
        return { navVisible, activeTab, homeShortcut, homeWays, back, ctaOverlap: overlap, hasCta: rendered(cta) };
      });
      row.url = page.url().replace('http://localhost:3013', '');
    } catch (e) {
      row = { error: String(e.message || e).slice(0, 100) };
    }
    page.off('console', onErr);
    page.off('response', onRes);
    results.push({ label, route, expectedTab, ...row, consoleErrors: [...new Set(errs)].slice(0, 3), http4xx: [...new Set(bad)].slice(0, 3) });
    const mark = row.error ? 'ERR' : row.homeWays > 0 ? 'ok ' : '!! ';
    console.log(`${mark} ${label.padEnd(14)} home=${row.homeWays ?? '-'} tab=${row.navVisible ? (row.activeTab || 'none') : '-'} btn=${row.homeShortcut ? 'Y' : 'n'} cta=${row.hasCta ? (row.ctaOverlap ? 'OVERLAP' : 'ok') : '-'} err=${errs.length} 4xx=${bad.length}`);
  }

  await page.close();
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify({ ids, results }, null, 2));
  console.log(`\nsaved → ${OUT}/audit.json`);
})();
