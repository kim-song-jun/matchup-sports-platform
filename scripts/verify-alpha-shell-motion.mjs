// alpha 실측 — 앱 셸 승격·전환·스켈레톤·스크롤 복원이 실제 배포본에서 도는지 확인한다.
//
// 육안 스크린샷 대조로 "차이 없음"을 결론내지 않는다(프로젝트 메모리:
// visual-diff-needs-computed-values). 이 스크립트는 전부 computed 값·DOM 노드 동일성으로 잰다.
//
// 핵심 주장 4가지를 각각 반증 가능한 형태로 측정한다:
//   1. 셸 지속성  — 라우트를 옮겨도 하단 탭바가 **같은 DOM 노드**인가
//   2. 스켈레톤   — 전환 중 .tm-skeleton 이 실제로 그려지는가
//   3. 스크롤 복원 — 뒤로가기 후 .tm-scroll-area 의 scrollTop 이 복원되는가
//   4. 전환 배제  — 셸 요소에 view-transition-name 이 붙어 전환에서 빠지는가
//
// 실행: node scripts/verify-alpha-shell-motion.mjs
// (레포 루트 기준. 캡처 스크립트는 scripts/ 안에 둔다 — /tmp 는 모듈 해석 실패)

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const OUT = resolve(process.cwd(), '.screenshots/alpha-shell-motion');
mkdirSync(OUT, { recursive: true });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

// alpha 는 과한 캡처에 전면 403 을 건다(메모리: alpha-rate-limits-heavy-capture).
// 요청 사이에 간격을 두고, 매 응답의 status 를 확인해 403 을 통과로 오독하지 않는다.
const pace = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

async function gotoChecked(page, path) {
  // 라이브 경기가 있는 화면은 10초 폴링이라 networkidle 이 끝나지 않는다 → domcontentloaded.
  const res = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const status = res?.status() ?? 0;
  if (status !== 200) throw new Error(`${path} → HTTP ${status} (403 이면 레이트리밋)`);
  await page.waitForTimeout(1500);
  return status;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

const GALLERY_ONLY = process.env.GALLERY_ONLY === '1';

try {
  // GALLERY_ONLY=1 이면 검증 8종을 건너뛰고 캡처만 다시 한다 — alpha 를 불필요하게
  // 여러 번 때리지 않기 위한 것이다(레이트리밋).
  if (!GALLERY_ONLY) {
  // ── 배포 신원 확인 — 내 머지가 실제로 서빙되고 있는지 ──────────────────────
  const head = await page.request.get(`${ORIGIN}/landing`);
  const release = head.headers()['x-teameet-release'];
  const commit = head.headers()['x-teameet-commit'];
  record('배포 신원', Boolean(commit), `release=${release} commit=${commit?.slice(0, 12)}`);

  await gotoChecked(page, '/tournaments');

  // ── 1. 셸 지속성 (이 작업의 핵심 주장) ────────────────────────────────────
  // 하단 탭바 DOM 노드에 표식을 심고 라우트를 옮긴 뒤, 그 표식이 살아 있는지 본다.
  // 셸이 리마운트되면 새 노드가 생기므로 표식이 사라진다.
  const navBefore = await page.evaluate(() => {
    const nav = document.querySelector('.tm-bottom-nav');
    if (!nav) return { found: false };
    nav.dataset.persistProbe = 'alpha-probe-1';
    return { found: true, tabs: nav.querySelectorAll('.tm-bottom-tab').length };
  });

  await page.click('.tm-bottom-tab[href="/teams"]').catch(() => page.goto(`${ORIGIN}/teams`));
  await page.waitForURL(/\/teams/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const navAfter = await page.evaluate(() => {
    const nav = document.querySelector('.tm-bottom-nav');
    return {
      found: Boolean(nav),
      probeSurvived: nav?.dataset.persistProbe === 'alpha-probe-1',
      pathname: location.pathname,
    };
  });
  record(
    '셸 지속성 — 탭 전환 후 하단 탭바가 같은 DOM 노드',
    navBefore.found && navAfter.probeSurvived,
    `표식 심음=${navBefore.found}(탭 ${navBefore.tabs}개) → 전환 후 생존=${navAfter.probeSurvived} @ ${navAfter.pathname}`,
  );

  // 상단바도 같이 확인 — 탭바만 살아남고 헤더가 리마운트되면 반쪽이다.
  // 단, 모든 라우트에 상단바가 있는 것은 아니다(route-chrome 의 topBar:false). 상단바가
  // 없는 화면에서 표식을 심으려다 못 찾은 것을 "리마운트됐다"로 오독하면 안 된다 —
  // 1차 실행에서 실제로 그렇게 오판할 뻔했다(/teams 에는 상단바가 없다).
  // 그래서 **상단바가 실제로 있는 화면끼리** 옮기며 재고, 없으면 판정 자체를 보류한다.
  await gotoChecked(page, '/home');
  const topbarProbe = await page.evaluate(() => {
    const bar = document.querySelector('.tm-topbar');
    if (!bar) return { found: false };
    bar.dataset.persistProbe = 'alpha-probe-2';
    return { found: true };
  });
  let topbarAfter = { survived: false, hasTopbar: false, pathname: '' };
  if (topbarProbe.found) {
    // /matches·/teams 는 route-chrome 에서 topBar:false 다. 상단바 지속성을 재려면
    // **양쪽 다 상단바가 있는** 라우트끼리 옮겨야 한다 — /home 과 /tournaments 가 그렇다.
    // (이 목적지를 /matches 로 뒀다가 "비교 불가"로 판정 보류된 적이 있다.)
    // 부수 효과로 이 다음의 VT 체크도 상단바가 있는 화면에서 돌고, 스켈레톤 테스트의
    // /matches 클릭이 **실제 네비게이션**이 된다(이미 그 페이지에 있으면 전환이 없어
    // 스켈레톤이 뜰 일도 없다 — 2차 실행이 정확히 그렇게 거짓 FAIL 이 났다).
    await page.click('.tm-bottom-tab[href="/tournaments"]').catch(() => {});
    await page.waitForTimeout(2500);
    topbarAfter = await page.evaluate(() => ({
      survived: document.querySelector('.tm-topbar')?.dataset.persistProbe === 'alpha-probe-2',
      hasTopbar: Boolean(document.querySelector('.tm-topbar')),
      pathname: location.pathname,
    }));
  }
  if (!topbarProbe.found) {
    record('셸 지속성 — 상단바', false, '판정 보류: /home 에서 .tm-topbar 를 찾지 못했다(측정 전제 불성립)');
  } else if (!topbarAfter.hasTopbar) {
    record('셸 지속성 — 상단바', false, `판정 보류: 이동한 ${topbarAfter.pathname} 에 상단바가 없어 비교 불가`);
  } else {
    record(
      '셸 지속성 — 상단바도 같은 DOM 노드',
      topbarAfter.survived,
      `/home 에서 표식 → ${topbarAfter.pathname} 로 전환 후 생존=${topbarAfter.survived}`,
    );
  }

  // ── 4. 전환 배제 — 셸에 view-transition-name 이 붙었는가 ──────────────────
  const vtNames = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).viewTransitionName : null;
    };
    return {
      supported: typeof document.startViewTransition === 'function',
      topbar: pick('.tm-topbar'),
      bottomNav: pick('.tm-bottom-nav'),
      progress: pick('.tm-route-progress'),
    };
  });
  const shellExcluded = [vtNames.topbar, vtNames.bottomNav].every((v) => v && v !== 'none');
  record(
    '전환 배제 — 셸 요소에 view-transition-name',
    shellExcluded,
    `VT지원=${vtNames.supported} topbar=${vtNames.topbar} bottomNav=${vtNames.bottomNav}`,
  );

  // ── 2. 스켈레톤 — 전환 중 실제로 그려지는가 ───────────────────────────────
  // 느린 네트워크를 흉내내 로딩 창을 벌린 뒤, 그 순간 .tm-skeleton 을 관측한다.
  // route 핸들러가 두 번 처리되면 'Route is already handled!' 로 프로세스가 죽는다
  // (1차 실행에서 그렇게 죽어 이후 항목이 아예 실행되지 않았다). 방어적으로 감싼다.
  const slowApi = async (route) => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    } catch {
      // 이미 처리됐거나 페이지가 이동해 무효가 된 라우트 — 무시해도 측정에 영향 없다.
    }
  };
  await ctx.route('**/api/**', slowApi);
  const skelPromise = page
    .waitForSelector('.tm-skeleton', { state: 'attached', timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  await page.click('.tm-bottom-tab[href="/matches"]').catch(() => {});
  const skeletonSeen = await skelPromise;
  const skelCount = await page.evaluate(() => document.querySelectorAll('.tm-skeleton').length);
  record(
    '스켈레톤 — 라우트 전환 중 실제 렌더',
    skeletonSeen,
    `전환 중 .tm-skeleton 관측=${skeletonSeen} (관측 시점 이후 잔존 ${skelCount}개)`,
  );
  await ctx.unroute('**/api/**', slowApi).catch(() => {});
  await page.waitForTimeout(2500);

  // ── 3. 스크롤 복원 — 뒤로가기 후 .tm-scroll-area 위치 ─────────────────────
  await gotoChecked(page, '/tournaments');
  await page.waitForTimeout(2000);

  const scrolled = await page.evaluate(async () => {
    // 실제 스크롤러는 window 가 아니라 .tm-scroll-area 다(메모리: v1-web-scrolls-in-a-custom-container).
    const area = document.querySelector('.tm-scroll-area');
    if (!area) return { ok: false, reason: '.tm-scroll-area 없음' };
    if (area.scrollHeight <= area.clientHeight + 50) {
      return { ok: false, reason: `콘텐츠가 짧아 굴릴 수 없음 (scrollHeight=${area.scrollHeight} clientHeight=${area.clientHeight})` };
    }
    area.scrollTop = 400;
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, scrollTop: area.scrollTop, scrollHeight: area.scrollHeight };
  });

  let restoreDetail = scrolled.ok ? '' : `굴리기 실패: ${scrolled.reason}`;
  let restored = false;
  if (scrolled.ok) {
    const firstCard = await page.$('.tm-scroll-area a[href^="/tournaments/"]');
    if (firstCard) {
      await firstCard.click();
      await page.waitForTimeout(3000);
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const after = await page.evaluate(() => {
        const area = document.querySelector('.tm-scroll-area');
        return { scrollTop: area?.scrollTop ?? -1, pathname: location.pathname };
      });
      // 복원은 "정확히 같은 값"이 아니라 "0 이 아니고 원래 값 근처"로 판정한다 —
      // 콘텐츠 높이가 재계산되며 몇 px 어긋날 수 있다.
      restored = after.scrollTop > 200;
      restoreDetail = `굴림 ${scrolled.scrollTop}px → 상세 진입 → 뒤로가기 후 ${after.scrollTop}px @ ${after.pathname}`;
    } else {
      restoreDetail = '목록에 진입할 카드 링크가 없어 왕복 불가';
    }
  }
  record('스크롤 복원 — 뒤로가기 후 .tm-scroll-area 위치', restored, restoreDetail);

  // ── 서비스워커 — 정적 에셋 캐시가 실제로 등록·동작하는가 ──────────────────
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    let cacheNames = [];
    try {
      cacheNames = await caches.keys();
    } catch {
      /* 접근 불가한 컨텍스트 — 아래에서 빈 배열로 보고된다 */
    }
    return {
      supported: true,
      registrations: regs.map((r) => r.active?.scriptURL ?? r.installing?.scriptURL ?? '(pending)'),
      cacheNames,
    };
  });
  record(
    '서비스워커 — 등록 + 캐시 생성',
    sw.supported && sw.registrations?.length > 0,
    `등록=${JSON.stringify(sw.registrations)} caches=${JSON.stringify(sw.cacheNames)}`,
  );

  } // end !GALLERY_ONLY

  // ── 3폭 스크린샷 갤러리 ───────────────────────────────────────────────────
  const shots = [];
  for (const [label, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of [['tournaments', '/tournaments'], ['matches', '/matches'], ['teams', '/teams']]) {
      await pace();
      await gotoChecked(page, path);
      const settled = await page
        .waitForFunction(() => document.querySelectorAll('.tm-skeleton').length === 0, null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      await page.waitForTimeout(600);
      const file = `${OUT}/${name}-${label}-${width}.png`;
      await page.screenshot({ path: file, fullPage: false });
      shots.push({ file, settled });
    }
  }
  const unsettled = shots.filter((s) => !s.settled).map((s) => s.file.split('/').pop());
  record(
    '스크린샷 갤러리',
    shots.length === 9 && unsettled.length === 0,
    `${shots.length}장 저장 → ${OUT}` + (unsettled.length ? ` / 스켈레톤 잔존: ${unsettled.join(', ')}` : ' / 전부 콘텐츠 로드됨'),
  );
} catch (err) {
  record('실행', false, `예외: ${err.message}`);
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n===== ${passed}/${results.length} PASS =====`);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ origin: ORIGIN, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
