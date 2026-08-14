// alpha 실측 캡처: 대회 라인업 화면과 스태프 배정 모달을 3폭(390/768/1440)으로 찍는다.
//
//   ALPHA_SESSION_TOKEN="$(cat /private/tmp/alpha_admin.cookie)" \
//     node scripts/capture_alpha_mobile_lineup_staff.mjs
//
// PR #423 검증용 — 하단 탭바가 하단 고정 CTA/바텀시트를 가리던 문제와, 스태프 배정
// 폼이 UUID 직접 입력에서 닉네임 검색으로 바뀐 것을 실제 화면으로 확인한다.
// 스크린샷과 함께 "탭바가 렌더되지 않는가"를 DOM 으로도 측정해 육안 대조에 기대지 않는다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const OUT = process.env.OUT_DIR || '/private/tmp/alpha-mobile-fix';
if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 필요');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const TOURNAMENT_ID = process.env.TOURNAMENT_ID || '663d78c6-fa99-4007-a81b-06937ff14c19';
const FIXTURE_ID = process.env.FIXTURE_ID || 'c9eed3d8-10c5-4dc5-970f-770fc487f978';

const WIDTHS = [
  { key: 'mobile-390', width: 390, height: 900 },
  { key: 'tablet-768', width: 768, height: 1024 },
  { key: 'desktop-1440', width: 1440, height: 900 },
];

const PAGES = [
  { key: 'lineup', path: `/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}/lineup` },
  { key: 'staff', path: `/tournament-ops/tournaments/${TOURNAMENT_ID}/staff` },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const vp of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([{
    name: 'teameet_v1_session',
    value: TOKEN,
    domain: new URL(BASE).hostname,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();

  for (const target of PAGES) {
    // alpha 는 원격이라 일시적 네트워크 오류로 goto 가 던질 수 있다 — 한 번 실패했다고
    // 캡처 전체를 잃지 않도록 재시도한다.
    let navigated = false;
    for (let attempt = 0; attempt < 3 && !navigated; attempt += 1) {
      try {
        await page.goto(BASE + target.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        navigated = true;
      } catch (err) {
        console.log(`   (재시도 ${attempt + 1}) ${String(err).split('\n')[0]}`);
        await page.waitForTimeout(3000);
      }
    }
    if (!navigated) {
      console.log(`${target.key}/${vp.key}: 진입 실패 — 건너뜀`);
      continue;
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    // 세션 확인("로그인 정보를 확인하고 있어요")이 끝나기 전에 찍으면 로딩 화면만 남는다.
    await page
      .waitForFunction(() => !/로그인 정보를 확인하고 있어요/.test(document.body.innerText), null, { timeout: 20_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);

    // 대회 운영진(admin)은 라인업 진입 시 "어느 팀의 명단을 짤까요?" 팀 선택을 먼저 본다.
    // 저장·제출 CTA 가 붙는 실제 편집 화면은 팀을 고른 뒤에 나오므로, 겹침을 측정하려면
    // 여기까지 들어가야 한다.
    if (target.key === 'lineup') {
      const pick = page.getByRole('button', { name: /명단 짜기/ }).first();
      if ((await pick.count()) > 0 && (await pick.isVisible().catch(() => false))) {
        await pick.click().catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(2500);
      }
    }

    // 스태프 화면에서는 배정 모달을 열어 검색 UI 자체를 찍는다.
    let opened = false;
    if (target.key === 'staff') {
      const grant = page.getByRole('button', { name: '스태프 배정' }).first();
      if (await grant.count() > 0 && await grant.isVisible().catch(() => false)) {
        await grant.click().catch(() => {});
        await page.waitForTimeout(900);
        opened = await page.getByRole('dialog').count() > 0;
      }
    }

    // 육안 대조 대신 DOM 으로 측정한다 — 이 수정의 핵심은 "탭바가 렌더되지 않는 것"이다.
    const probe = await page.evaluate(() => {
      const nav = document.querySelector('nav.tm-bottom-nav');
      const cta = document.querySelector('.tm-fixed-cta');
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const navRect = rect(nav);
      const ctaRect = rect(cta);
      return {
        path: location.pathname,
        hasBottomNav: nav !== null,
        hasFixedCta: cta !== null,
        // 탭바와 CTA 가 세로로 겹치는 픽셀 수. 0 이어야 한다.
        overlapPx: navRect && ctaRect
          ? Math.max(0, Math.min(navRect.bottom, ctaRect.bottom) - Math.max(navRect.top, ctaRect.top))
          : 0,
        // UUID 직접 입력이 남아 있으면 옛 화면이다.
        hasUuidField: /사용자 ID \(UUID\)/.test(document.body.innerText),
        hasSearchField: /배정할 사람/.test(document.body.innerText),
        head: (document.body.innerText || '').slice(0, 140).replace(/\n+/g, ' | '),
      };
    });

    const file = `${OUT}/${target.key}-${vp.key}.png`;
    await page.screenshot({ path: file, fullPage: false });
    results.push({ page: target.key, viewport: vp.key, file, opened, ...probe });
    console.log(
      `${target.key}/${vp.key}: nav=${probe.hasBottomNav} cta=${probe.hasFixedCta} overlap=${probe.overlapPx}px ` +
      `uuidField=${probe.hasUuidField} searchField=${probe.hasSearchField}${target.key === 'staff' ? ` modal=${opened}` : ''}`,
    );
    console.log(`   ${probe.head}`);
  }

  await ctx.close();
}

await browser.close();
console.log('\n저장 위치:', OUT);
