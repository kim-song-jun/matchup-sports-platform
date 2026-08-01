/* eslint-disable no-console */
// v5 캡처 — 톨 뷰포트 방식 (DOM 변조 없음).
// 1) 기본 뷰포트로 로드 + 강화 로딩 게이트
// 2) 필요 높이 측정 → 뷰포트 자체를 그 높이로 확장 (.tm-scroll-area 는 absolute inset 이라 함께 늘어남)
// 3) 이미지 로드 대기 후 뷰포트 스크린샷
// 실행: node scripts/capture_v5.js  (사후 blank-bottom 검증은 별도 python sweep)
const { chromium } = require('playwright');

const WEB = 'http://localhost:3013';
const OUT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/fp-shots';
const GIF = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/gif-frames';

const T_DONE = '5c46e679-7f80-4e55-a126-6075ca7ad4b2'; // completed
const T_OPEN = 'ee3be1a6-cb15-4707-b29f-a0f2242e2cba'; // open (신청 위저드)
const REG_ID = 't2reg00-0000-4000-8000-000000000001'; // 티밋 FC confirmed 등록
const OWNER_ID = '00000000-0000-4000-8000-000000001001';
const OWNER_EMAIL = 'coverage-active@teameet.v1';
const ADMIN_EMAIL = 'admin@teameet.v1';
const MAX_H = 6000;

async function waitLoaded(page, minText = 60) {
  await page.waitForFunction(
    (minTextLen) => {
      if (document.querySelector('.tm-skeleton')) return false;
      if (document.querySelector('[aria-busy="true"]')) return false;
      if (document.querySelector('[class*="skeleton" i]')) return false;
      const main = document.querySelector('main') || document.body;
      return (main.innerText || '').trim().length > minTextLen;
    },
    minText,
    { timeout: 20000 },
  );
  // DOM 안정: 400ms 간격 2회 연속 동일 길이
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    const len = await page.evaluate(() => document.body.innerHTML.length);
    if (len === prev) break;
    prev = len;
    await page.waitForTimeout(400);
  }
}

async function waitImages(page) {
  await page
    .waitForFunction(
      () => Array.from(document.images).every((img) => img.complete),
      { timeout: 10000 },
    )
    .catch(() => console.log('  (일부 이미지 로드 대기 초과 — 계속)'));
}

async function tallShot(page, file, width, baseH) {
  const needed = await page.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    let h = document.documentElement.scrollHeight;
    if (sa) {
      const rectTop = sa.getBoundingClientRect().top;
      h = Math.max(h, sa.scrollHeight + Math.max(0, rectTop) + 20);
    }
    return Math.ceil(h);
  });
  const target = Math.min(Math.max(needed + 8, baseH), MAX_H);
  if (target > baseH + 4) {
    await page.setViewportSize({ width, height: target });
    await waitLoaded(page).catch(() => {});
    await page.waitForTimeout(500);
  }
  await waitImages(page);
  // 확장 후 스크롤 영역이 실제로 다 펼쳐졌는지 확인
  const check = await page.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    return sa ? { sh: sa.scrollHeight, ch: sa.clientHeight } : null;
  });
  if (check && check.sh > check.ch + 8) {
    console.log(`  ! ${file}: 스크롤 잔여 (sh=${check.sh} ch=${check.ch}) — MAX_H 캡`);
  }
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  console.log(`  ✓ ${file.split('/').pop()} (${width}x${target})`);
}

async function capturePage(ctx, name, url, width, baseH, prep) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: baseH });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitLoaded(page);
  if (prep) await prep(page);
  await tallShot(page, `${OUT}/${name}.jpeg`, width, baseH);
  await page.close();
}

async function newCtx(browser, auth) {
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  if (auth) {
    await ctx.addInitScript(({ id, email }) => {
      if (id) localStorage.setItem('teameet.v1.userId', id);
      else localStorage.removeItem('teameet.v1.userId');
      if (email) localStorage.setItem('teameet.v1.userEmail', email);
    }, auth);
  }
  return ctx;
}

async function clickTab(page, label) {
  await page.evaluate((txt) => {
    const el = Array.from(document.querySelectorAll('[role="tab"], button')).find(
      (b) => (b.textContent || '').trim() === txt,
    );
    if (!el) throw new Error(`tab not found: ${txt}`);
    el.click();
  }, label);
  await page.waitForTimeout(1200);
  await waitLoaded(page).catch(() => {});
}

(async () => {
  const browser = await chromium.launch();

  // ── 1) 익명 공개 페이지 (모바일 390 / 데스크탑 1440) ──
  const anon = await newCtx(browser);
  const publicPages = [
    ['list', `${WEB}/tournaments`],
    ['detail', `${WEB}/tournaments/${T_DONE}`],
    ['bracket', `${WEB}/tournaments/${T_DONE}/bracket`],
    ['results', `${WEB}/tournaments/${T_DONE}/results`],
    ['awards', `${WEB}/tournaments/${T_DONE}/awards`],
    ['reviews', `${WEB}/tournaments/${T_DONE}/reviews`],
  ];
  for (const [name, url] of publicPages) {
    // results 는 조별리그 아코디언 펼친 상태로 (영상 칩 노출)
    const prep =
      name === 'results'
        ? async (p) => {
            await p.evaluate(() => document.querySelector('.tm-res-expand-btn')?.click());
            await p.waitForTimeout(600);
          }
        : undefined;
    await capturePage(anon, `fp_${name}_m`, url, 390, 844, prep);
    await capturePage(anon, `fp_${name}_d`, url, 1440, 900, prep);
  }
  await anon.close();

  // ── 2) 참가팀 대표 (my / roster / 신청 위저드 3스텝) ──
  const owner = await newCtx(browser, { id: OWNER_ID, email: OWNER_EMAIL });
  await capturePage(owner, 'fp_my_m', `${WEB}/tournaments/${T_DONE}/my`, 390, 844);
  await capturePage(owner, 'fp_my_d', `${WEB}/tournaments/${T_DONE}/my`, 1440, 900);
  await capturePage(owner, 'fp_roster_m', `${WEB}/tournaments/${T_DONE}/registrations/${REG_ID}/roster`, 390, 844);
  await capturePage(owner, 'fp_roster_d', `${WEB}/tournaments/${T_DONE}/registrations/${REG_ID}/roster`, 1440, 900);

  // 신청 위저드 — 실제 플로우 진행하며 스텝별 캡처 (종료 후 DB에서 생성 registration 삭제)
  const wiz = await owner.newPage();
  await wiz.setViewportSize({ width: 390, height: 844 });
  await wiz.goto(`${WEB}/tournaments/${T_OPEN}/apply`, { waitUntil: 'domcontentloaded' });
  await waitLoaded(wiz);
  await tallShot(wiz, `${OUT}/fp_apply_step1_m.jpeg`, 390, 844);

  // 팀 선택(티밋 FC) → 다음
  await wiz.setViewportSize({ width: 390, height: 844 });
  await wiz.waitForTimeout(400);
  await wiz.evaluate(() => {
    const card = Array.from(document.querySelectorAll('button, label, [role="radio"]')).find((el) =>
      (el.textContent || '').includes('티밋 FC'),
    );
    if (!card) throw new Error('티밋 FC 선택지 없음');
    card.click();
  });
  await wiz.waitForTimeout(300);
  await wiz.evaluate(() => {
    const next = Array.from(document.querySelectorAll('button')).find(
      (b) => /다음|신청 시작/.test((b.textContent || '').trim()) && !b.disabled,
    );
    if (!next) throw new Error('다음 버튼 없음');
    next.click();
  });
  await wiz.waitForTimeout(1500);
  await waitLoaded(wiz).catch(() => {});
  await tallShot(wiz, `${OUT}/fp_apply_step2_m.jpeg`, 390, 844);

  // 동의 전체 체크 → 다음 (입금자명은 자동 채움 검증 겸 그대로)
  await wiz.setViewportSize({ width: 390, height: 844 });
  await wiz.waitForTimeout(400);
  const step3ok = await wiz.evaluate(async () => {
    document.querySelectorAll('input[type="checkbox"]:not(:checked)').forEach((c) => c.click());
    await new Promise((r) => setTimeout(r, 300));
    const next = Array.from(document.querySelectorAll('button')).find(
      (b) => /다음|제출|신청/.test((b.textContent || '').trim()) && !b.disabled && b.type !== 'reset',
    );
    if (!next) return false;
    next.click();
    return true;
  });
  if (step3ok) {
    await wiz.waitForTimeout(1800);
    await waitLoaded(wiz).catch(() => {});
    await tallShot(wiz, `${OUT}/fp_apply_step3_m.jpeg`, 390, 844);
  } else {
    console.log('  ! step3 진입 실패');
  }
  // 데스크탑 위저드 1장 (step1 로 새로 — draft 재진입 화면일 수 있음)
  await wiz.close();
  await capturePage(owner, 'fp_apply_d', `${WEB}/tournaments/${T_OPEN}/apply`, 1440, 900);
  await owner.close();

  // ── 3) 어드민 (데스크탑) ──
  const admin = await newCtx(browser, { id: null, email: ADMIN_EMAIL });
  await capturePage(admin, 'fp_admin_list_d', `${WEB}/admin/tournaments`, 1440, 900);
  await capturePage(admin, 'fp_admin_new_d', `${WEB}/admin/tournaments/new`, 1440, 900);
  await capturePage(admin, 'fp_admin_info_d', `${WEB}/admin/tournaments/${T_DONE}`, 1440, 900);

  const adminDetail = await admin.newPage();
  await adminDetail.setViewportSize({ width: 1440, height: 900 });
  await adminDetail.goto(`${WEB}/admin/tournaments/${T_DONE}`, { waitUntil: 'domcontentloaded' });
  await waitLoaded(adminDetail);
  await clickTab(adminDetail, '신청 관리');
  await tallShot(adminDetail, `${OUT}/fp_admin_registrations_d.jpeg`, 1440, 900);

  await adminDetail.setViewportSize({ width: 1440, height: 900 });
  await adminDetail.waitForTimeout(500);
  await clickTab(adminDetail, '대진 관리');
  await tallShot(adminDetail, `${OUT}/fp_admin_bracket_d.jpeg`, 1440, 900);

  // GIF 프레임: 결과 모달(다중 영상 편집기)
  await adminDetail.setViewportSize({ width: 1440, height: 900 });
  await adminDetail.waitForTimeout(500);
  await adminDetail.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.getAttribute('aria-label') || '').includes('final') && b.textContent.includes('결과 입력'),
    );
    if (!btn) throw new Error('결과 입력 버튼 없음');
    btn.click();
  });
  await adminDetail.waitForTimeout(900);
  await adminDetail.screenshot({ path: `${GIF}/gif_b2.jpeg`, type: 'jpeg', quality: 82 });
  console.log('  ✓ gif_b2 (결과 모달 — 다중 영상 편집기)');
  await adminDetail.keyboard.press('Escape');
  await adminDetail.waitForTimeout(400);
  await adminDetail.screenshot({ path: `${GIF}/gif_b1.jpeg`, type: 'jpeg', quality: 82 });
  console.log('  ✓ gif_b1 (대진 관리 탭)');
  await adminDetail.close();
  await admin.close();

  // ── 4) GIF 프레임: 공개 결승 스트립 + 모달 재생 ──
  const anon2 = await newCtx(browser);
  const res = await anon2.newPage();
  await res.setViewportSize({ width: 800, height: 900 });
  await res.goto(`${WEB}/tournaments/${T_DONE}/results`, { waitUntil: 'domcontentloaded' });
  await waitLoaded(res);
  await waitImages(res);
  await res.screenshot({ path: `${GIF}/gif_b3.jpeg`, type: 'jpeg', quality: 82 });
  console.log('  ✓ gif_b3 (결승 하이라이트 스트립)');
  await res.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.tm-video-strip-item')).find((b) =>
      b.textContent.includes('결승골 장면'),
    );
    item.click();
  });
  await res.waitForTimeout(1600);
  await res.screenshot({ path: `${GIF}/gif_b4.jpeg`, type: 'jpeg', quality: 82 });
  console.log('  ✓ gif_b4 (모달 재생 + 플레이리스트)');
  await res.close();
  await anon2.close();

  await browser.close();
  console.log('DONE');
})();
