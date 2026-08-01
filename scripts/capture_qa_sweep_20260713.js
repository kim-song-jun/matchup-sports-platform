/* eslint-disable no-console */
// v1 공개 대회 화면 시각검증 갭 스윕 (2026-07-13).
// 톨 뷰포트 방식 (DOM 변조 없음) — 참고: docs 메모리 v1-fullpage-capture-tall-viewport, scripts/capture_v5.js
// 화면: list/detail/apply(step1+consent)/my/roster/bracket/results/awards
// 뷰포트: mobile 390 / tablet 768 / desktop 1440
// 실행: node scripts/capture_qa_sweep_20260713.js
const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');

const WEB = 'http://localhost:3013';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'qa-sweep-20260713');

// 가장 데이터가 풍부한 완료 대회 (regs=8, fixtures=18, awards=2, reviews=1)
const T_DONE = '5c46e679-7f80-4e55-a126-6075ca7ad4b2';
// open 상태 대회 (신청 위저드용, registration_deadline_at 미래)
const T_OPEN = 'ee3be1a6-cb15-4707-b29f-a0f2242e2cba';
const REG_ID = 't2reg00-0000-4000-8000-000000000001'; // 티밋 FC confirmed 등록 (T_DONE)
const OWNER_ID = '00000000-0000-4000-8000-000000001001';
const OWNER_EMAIL = 'coverage-active@teameet.v1';
const APPLY_TEAM_NAME = '티밋 FC'; // T_OPEN 미등록 팀
const APPLY_TEAM_ID = 'aa000001-0000-4000-8000-000000000001'; // 티밋 FC team id

// 신청 위저드 캡처는 실제 draft registration을 생성한다 (createRegistration.mutateAsync).
// 뷰포트 재진입 시 draft가 남아있으면 위저드가 팀선택을 건너뛰고 동의 스텝으로 resume해버려
// 캡처가 깨진다 — 각 뷰포트 캡처 전/후 T_OPEN + 티밋 FC 조합의 registration을 정리한다.
function cleanupApplyRegistration() {
  try {
    execSync(
      `docker exec v1_pg_dev psql -U teameet_v1_user -d teameet_v1_dev -c "DELETE FROM v1_tournament_registrations WHERE tournament_id='${T_OPEN}' AND team_id='${APPLY_TEAM_ID}';"`,
      { stdio: 'pipe' },
    );
  } catch (e) {
    console.log('  ! cleanupApplyRegistration 실패:', String(e).slice(0, 200));
  }
}

const VIEWPORTS = [
  ['mobile390', 390, 844],
  ['tablet768', 768, 1024],
  ['desktop1440', 1440, 900],
];

const MAX_H = 8000;

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
    .waitForFunction(() => Array.from(document.images).every((img) => img.complete), { timeout: 10000 })
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
  const check = await page.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    return sa ? { sh: sa.scrollHeight, ch: sa.clientHeight } : null;
  });
  if (check && check.sh > check.ch + 8) {
    console.log(`  ! ${file}: 스크롤 잔여 (sh=${check.sh} ch=${check.ch}) — MAX_H 캡`);
  }
  await page.screenshot({ path: file, type: 'png' });
  console.log(`  ok ${path.basename(file)} (${width}x${target})`);
}

async function capturePage(ctx, name, url, width, baseH, prep) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewportSize({ width, height: baseH });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitLoaded(page);
    if (prep) await prep(page);
    await tallShot(page, `${OUT}/${name}.png`, width, baseH);
  } catch (e) {
    console.log(`  FAIL ${name}: ${String(e).slice(0, 200)}`);
  }
  if (errs.length) console.log(`  console-errors[${name}]: ${errs.slice(0, 5).join(' | ')}`);
  await page.close();
  return errs;
}

async function newCtx(browser, auth) {
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  if (auth) {
    await ctx.addInitScript(({ id, email }) => {
      if (id) localStorage.setItem('teameet.v1.userId', id);
      if (email) localStorage.setItem('teameet.v1.userEmail', email);
    }, auth);
  }
  return ctx;
}

const ONLY_APPLY = process.argv.includes('--only-apply');

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  let owner;

  if (!ONLY_APPLY) {
    // ── 1) 익명 공개 화면 (list/detail/bracket/results/awards) ──
    const anon = await newCtx(browser);
    const publicPages = [
      ['list', `${WEB}/tournaments`, undefined],
      ['detail', `${WEB}/tournaments/${T_DONE}`, undefined],
      ['bracket', `${WEB}/tournaments/${T_DONE}/bracket`, undefined],
      [
        'results',
        `${WEB}/tournaments/${T_DONE}/results`,
        async (p) => {
          await p.evaluate(() => document.querySelector('.tm-res-expand-btn')?.click());
          await p.waitForTimeout(600);
        },
      ],
      ['awards', `${WEB}/tournaments/${T_DONE}/awards`, undefined],
    ];
    for (const [name, url, prep] of publicPages) {
      for (const [vpName, width, baseH] of VIEWPORTS) {
        const errs = await capturePage(anon, `${name}_${vpName}`, url, width, baseH, prep);
        if (errs.length) failures.push(`${name}_${vpName}: ${errs[0]}`);
      }
    }
    await anon.close();

    // ── 2) 참가팀 대표 (my / roster) — T_DONE, OWNER ──
    owner = await newCtx(browser, { id: OWNER_ID, email: OWNER_EMAIL });
    const ownerPages = [
      ['my', `${WEB}/tournaments/${T_DONE}/my`],
      ['roster', `${WEB}/tournaments/${T_DONE}/registrations/${REG_ID}/roster`],
    ];
    for (const [name, url] of ownerPages) {
      for (const [vpName, width, baseH] of VIEWPORTS) {
        const errs = await capturePage(owner, `${name}_${vpName}`, url, width, baseH);
        if (errs.length) failures.push(`${name}_${vpName}: ${errs[0]}`);
      }
    }
  } else {
    owner = await newCtx(browser, { id: OWNER_ID, email: OWNER_EMAIL });
  }

  // ── 3) 신청 위저드 (T_OPEN) — step1(팀선택) + consent(전체동의) 뷰포트별 ──
  for (const [vpName, width, baseH] of VIEWPORTS) {
    cleanupApplyRegistration(); // 이전 실행 잔여 draft 정리 (resume state 오염 방지)
    const page = await owner.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    try {
      await page.setViewportSize({ width, height: baseH });
      await page.goto(`${WEB}/tournaments/${T_OPEN}/apply`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitLoaded(page);
      await tallShot(page, `${OUT}/apply-step1_${vpName}.png`, width, baseH);

      // 팀 선택 → 다음 (myTeams 비동기 로드 대기 — 뷰포트별로 로드 타이밍이 달라 race 발생 가능)
      await page.setViewportSize({ width, height: baseH });
      await page.waitForFunction(
        (teamName) => (document.body.innerText || '').includes(teamName),
        APPLY_TEAM_NAME,
        { timeout: 15000 },
      );
      await page.waitForTimeout(400);
      await page.evaluate((teamName) => {
        const card = Array.from(document.querySelectorAll('[role="radio"], button, label')).find((el) =>
          (el.textContent || '').includes(teamName),
        );
        if (!card) throw new Error(`팀 카드 없음: ${teamName}`);
        card.click();
      }, APPLY_TEAM_NAME);
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const next = Array.from(document.querySelectorAll('button')).find(
          (b) => /다음|신청 시작/.test((b.textContent || '').trim()) && !b.disabled,
        );
        if (!next) throw new Error('다음 버튼 없음');
        next.click();
      });
      await page.waitForTimeout(1500);
      await waitLoaded(page).catch(() => {});

      // 동의 스텝: "전체 동의" 카드 실클릭 (sr-only input이라 label/input click 무효)
      await page.setViewportSize({ width, height: baseH });
      await page.waitForTimeout(400);
      await page.click('text=전체 동의', { timeout: 8000 });
      await page.waitForTimeout(500);
      await tallShot(page, `${OUT}/apply-consent_${vpName}.png`, width, baseH);
    } catch (e) {
      const msg = `apply_${vpName}: ${String(e).slice(0, 200)}`;
      console.log(`  FAIL ${msg}`);
      failures.push(msg);
    }
    if (errs.length) console.log(`  console-errors[apply_${vpName}]: ${errs.slice(0, 5).join(' | ')}`);
    await page.close();
    cleanupApplyRegistration(); // 캡처 후 draft registration 제거 — 다음 뷰포트/재실행이 깨끗한 상태에서 시작
  }
  await owner.close();

  await browser.close();
  console.log('\n=== DONE ===');
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log(' - ' + f));
  } else {
    console.log('no failures');
  }
})();
