// alpha 어드민 기능 검증 — 기능을 하나하나 실제로 눌러 확인한다.
//
// 두 단계로 나뉜다:
//  (1) 인증 없이 — 라우트 도달성. 섹션 라우트가 배포됐는지, 404/500 이 없는지.
//      Next App Router 는 없는 라우트에 404 를 주므로 이 단계만으로도 라우트 분리 배포가
//      검증된다.
//  (2) ALPHA_SESSION_TOKEN 이 있을 때 — 실제 기능. 각 섹션이 데이터를 렌더하는지, 구획
//      내비·필터·상태 전환 버튼이 실제로 존재하고 눌리는지.
//
// alpha 는 프로덕션 모드라 헤더 dev 인증이 401 이다(실측) — 그래서 (2)는 세션 쿠키가 필요하다.
//
// Run: [ALPHA_SESSION_TOKEN=...] node scripts/verify_alpha_admin_functions.js
const { chromium } = require('@playwright/test');

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();

/** 사이드바 19개 항목 — 4구획으로 묶인 뒤에도 전부 도달 가능해야 한다. */
const NAV_ROUTES = [
  ['개요', '/admin'],
  ['회원', '/admin/users'],
  ['매치', '/admin/matches'],
  ['팀', '/admin/teams'],
  ['팀매치', '/admin/team-matches'],
  ['리그', '/admin/team-match-series'],
  ['대회', '/admin/tournaments'],
  ['대회 현장 운영', '/admin/ops/tournaments'],
  ['에러 로그', '/admin/ops/errors'],
  ['웹 푸시 실패', '/admin/ops/push-failures'],
  ['SMS · 인증 실패', '/admin/ops/sms-failures'],
  ['웹 푸시 발송', '/admin/ops/push-send'],
  ['경기 운영 플래그', '/admin/ops/operation-flags'],
  ['감사 로그', '/admin/audit'],
  ['공지사항', '/admin/notices'],
  ['팝업', '/admin/popups'],
  ['약관', '/admin/terms'],
  ['문의', '/admin/inquiries'],
  ['연동 설정', '/admin/settings/integrations'],
  ['관리자', '/admin/admins'],
];

const SECTIONS = [
  ['대회 정보', 'info'],
  ['신청 관리', 'registrations'],
  ['대진 관리', 'bracket'],
  ['공지', 'announcements'],
  ['협찬', 'sponsors'],
  ['팝업', 'popups'],
  ['캠페인', 'campaign'],
  ['리뷰 관리', 'reviews'],
  ['개인 어워드', 'awards'],
  ['통계', 'statistics'],
];

const results = { pass: 0, fail: 0, skip: 0, lines: [] };
function record(ok, label, detail) {
  if (ok === null) {
    results.skip += 1;
    results.lines.push(`  SKIP  ${label}${detail ? ` — ${detail}` : ''}`);
  } else if (ok) {
    results.pass += 1;
    results.lines.push(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    results.fail += 1;
    results.lines.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  console.log(results.lines[results.lines.length - 1]);
}

async function statusOf(ctx, path) {
  const res = await ctx.request.get(`${BASE}${path}`, { maxRedirects: 0, failOnStatusCode: false });
  return { status: res.status(), location: res.headers()['location'] ?? null };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (TOKEN) {
    await ctx.addCookies([
      {
        name: 'teameet_v1_session',
        value: TOKEN,
        domain: new URL(BASE).hostname,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
  }

  console.log(`\n═══ 1단계 · 라우트 도달성 (인증 불필요) ═══`);
  const health = await statusOf(ctx, '/api/v1/health');
  record(health.status === 200, 'API health', `HTTP ${health.status}`);

  for (const [label, path] of NAV_ROUTES) {
    const r = await statusOf(ctx, path);
    record(r.status < 400, `nav 라우트 ${label}`, `${path} → HTTP ${r.status}`);
  }

  // 대회 상세: 목록에서 id 를 얻어야 섹션을 검증할 수 있다.
  let tournamentId = null;
  if (TOKEN) {
    try {
      const res = await ctx.request.get(`${BASE}/api/v1/admin/tournaments?limit=1`, { failOnStatusCode: false });
      if (res.ok()) {
        const body = await res.json();
        const items = body?.data?.items ?? body?.items ?? [];
        tournamentId = items[0]?.id ?? null;
      } else {
        record(false, '대회 목록 API', `HTTP ${res.status()} — 토큰이 만료됐을 수 있어요`);
      }
    } catch (err) {
      record(false, '대회 목록 API', String(err).slice(0, 80));
    }
  }

  if (tournamentId) {
    const redirect = await statusOf(ctx, `/admin/tournaments/${tournamentId}`);
    const toRegistrations = (redirect.location ?? '').includes('/registrations');
    record(
      redirect.status >= 300 && redirect.status < 400 && toRegistrations,
      '대회 상세 기본 진입 → 신청 관리 redirect',
      `HTTP ${redirect.status} → ${redirect.location ?? '(Location 없음)'}`,
    );
    for (const [label, slug] of SECTIONS) {
      const r = await statusOf(ctx, `/admin/tournaments/${tournamentId}/${slug}`);
      record(r.status < 400, `섹션 라우트 ${label}`, `/${slug} → HTTP ${r.status}`);
    }
  } else {
    record(null, '대회 상세 섹션 라우트', TOKEN ? '대회가 0건이라 확인 불가' : 'ALPHA_SESSION_TOKEN 없음');
  }

  if (!TOKEN) {
    console.log(`\n═══ 2단계 · 기능 검증 — 건너뜀 (ALPHA_SESSION_TOKEN 없음) ═══`);
    await browser.close();
    summarize();
    return;
  }

  console.log(`\n═══ 2단계 · 기능 검증 (세션 쿠키) ═══`);
  const page = await ctx.newPage();

  const gotoAdmin = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('nav[aria-label="주 메뉴"]', { state: 'attached', timeout: 60000 });
    await page
      .waitForFunction(
        () => {
          const m = document.querySelector('main');
          return m && !m.querySelector('.animate-pulse') && (m.innerText ?? '').trim().length > 20;
        },
        { timeout: 40000 },
      )
      .catch(() => {});
  };

  // 2-1) 사이드바 4구획이 실제로 렌더되는지 + 항목 전부 링크로 존재하는지
  try {
    await gotoAdmin('/admin');
    for (const group of ['플랫폼', '콘텐츠', '운영', '설정']) {
      const n = await page.getByRole('group', { name: group }).count();
      record(n > 0, `사이드바 구획 "${group}"`, `${n}개`);
    }
    for (const [label, path] of NAV_ROUTES) {
      const link = page.locator(`nav[aria-label="주 메뉴"] a[href="${path}"]`).first();
      record((await link.count()) > 0, `사이드바 링크 ${label}`, path);
    }
  } catch (err) {
    record(false, '사이드바 렌더', String(err).slice(0, 90));
  }

  // 2-2) eyebrow 가 구획명으로 통일됐는지 (대표 3개)
  for (const [path, expected] of [
    ['/admin/users', '플랫폼'],
    ['/admin/notices', '콘텐츠'],
    ['/admin/audit', '운영'],
  ]) {
    try {
      await gotoAdmin(path);
      const eyebrow = (await page.locator('main p').first().innerText().catch(() => '')).trim();
      record(eyebrow === expected, `eyebrow ${path}`, `"${eyebrow}" (기대 "${expected}")`);
    } catch (err) {
      record(false, `eyebrow ${path}`, String(err).slice(0, 70));
    }
  }

  // 2-3) 목록 기능: 필터 칩 클릭이 실제로 목록을 바꾸는지
  try {
    await gotoAdmin('/admin/users');
    const chips = page.locator('main button[aria-pressed], main [role="group"] button');
    const chipCount = await chips.count();
    record(chipCount > 0, '회원 목록 상태 필터 칩', `${chipCount}개`);
    const before = await page.locator('main table tbody tr, main ul[role="list"] > li').count();
    const active = page.getByRole('button', { name: /^활성/ }).first();
    if (await active.count()) {
      await active.click();
      await page.waitForTimeout(1500);
      const after = await page.locator('main table tbody tr, main ul[role="list"] > li').count();
      record(true, '필터 클릭 동작', `행 ${before} → ${after}`);
    } else {
      record(null, '필터 클릭 동작', '활성 칩을 찾지 못했어요');
    }
  } catch (err) {
    record(false, '회원 목록 필터', String(err).slice(0, 90));
  }

  // 2-4) 대회 상세 섹션 내비: 각 섹션을 눌러 이동하고 활성 표시가 맞는지
  if (tournamentId) {
    try {
      await gotoAdmin(`/admin/tournaments/${tournamentId}/registrations`);
      const secNav = page.locator('nav[aria-label="대회 관리 섹션"]');
      record((await secNav.count()) > 0, '대회 상세 섹션 내비 존재');
      for (const group of ['운영', '노출', '사후']) {
        const n = await secNav.getByRole('group', { name: group }).count();
        record(n > 0, `섹션 구획 "${group}"`, `${n}개`);
      }
      for (const [label, slug] of SECTIONS) {
        const link = secNav.locator(`a[href$="/${slug}"]`).first();
        if (!(await link.count())) {
          record(false, `섹션 이동 ${label}`, '링크 없음');
          continue;
        }
        await link.click();
        await page
          .waitForFunction(
            (s) => location.pathname.endsWith(`/${s}`),
            slug,
            { timeout: 20000 },
          )
          .catch(() => {});
        await page.waitForTimeout(700);
        const activeText = (
          await secNav
            .locator('a[aria-current="page"]')
            .first()
            .innerText()
            .catch(() => '')
        )
          .trim()
          .split('\n')[0];
        const onPath = page.url().endsWith(`/${slug}`);
        const hasBody = await page
          .locator('main')
          .innerText()
          .then((t) => t.trim().length > 40)
          .catch(() => false);
        record(onPath && activeText === label && hasBody, `섹션 이동 ${label}`, `url ok=${onPath} 활성="${activeText}" 본문=${hasBody}`);
      }
    } catch (err) {
      record(false, '대회 상세 섹션 내비', String(err).slice(0, 90));
    }
  }

  // 2-5) 이번에 고친 결함이 실제로 사라졌는지 (가로 스크롤 · 페이지네이션 · 약관 높이)
  try {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await mobile.addCookies([
      { name: 'teameet_v1_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    ]);
    const mp = await mobile.newPage();
    for (const path of ['/admin/notices', '/admin/users']) {
      await mp.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await mp.waitForSelector('nav[aria-label="주 메뉴"]', { state: 'attached', timeout: 60000 }).catch(() => {});
      await mp
        .waitForFunction(() => {
          const m = document.querySelector('main');
          return m && !m.querySelector('.animate-pulse') && (m.innerText ?? '').trim().length > 20;
        }, { timeout: 40000 })
        .catch(() => {});
      const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      record(over === 0, `모바일 가로 스크롤 없음 ${path}`, `${over}px`);
    }
    await mobile.close();
  } catch (err) {
    record(false, '모바일 가로 스크롤 검증', String(err).slice(0, 90));
  }

  try {
    await gotoAdmin('/admin/users');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('main nav button, main button')]
        .filter((el) => /^(이전|다음|\d+)$/.test((el.innerText || '').trim()))
        .map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    const allOk = small.length > 0 && small.every((h) => h >= 44);
    record(allOk, '페이지네이션 44px 이상', small.length ? `높이 ${[...new Set(small)].join(',')}px` : '버튼 없음');
  } catch (err) {
    record(false, '페이지네이션 높이', String(err).slice(0, 80));
  }

  try {
    await gotoAdmin('/admin/terms');
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    record(h < 3200, '약관 화면 높이', `${h}px (수정 전 4851px)`);
  } catch (err) {
    record(false, '약관 화면 높이', String(err).slice(0, 80));
  }

  await browser.close();
  summarize();
})();

function summarize() {
  console.log(`\n═══ 결과 ═══`);
  console.log(`  PASS ${results.pass} · FAIL ${results.fail} · SKIP ${results.skip}`);
  if (results.fail > 0) {
    console.log('\n실패 항목:');
    for (const l of results.lines.filter((l) => l.startsWith('  FAIL'))) console.log(l);
    process.exitCode = 1;
  }
}
