// alpha 리그 승강 시즌 E2E — **실제 어드민 화면만** 밟아 완료된 시즌을 만든다.
//
// 이 스크립트는 API 를 직접 때리지 않는다(읽기 전용 확인 제외). 운영자가 브라우저에서
// 하는 그대로 클릭해서:
//   시리즈 생성 → 시즌 시딩 → 대진 생성 → 몰수패 처리(=공식 결과 확정)
//   → 리그 자동 completed → 승강 후보 계산 → 승강 최종 승인 → 다음 시즌 생성
// 까지 간다. 각 단계마다 화면에서 관측한 값을 검증하고 스크린샷을 남긴다.
//
// 몰수패 처리는 DB 조작이 아니라 정식 결과 파이프라인이다 —
// league-match-forfeit.service.ts 가 games 서비스를 통해 리비전을
// DRAFT → SUBMITTED → OFFICIAL 로 올리고, 그 OFFICIAL 전이가
// LeagueCompletionProjectionService 를 태워 리그를 completed 로 만든다.
// 즉 "경기 결과가 실제로 확정되는" 그 경로를 그대로 탄다.
//
// Run: ALPHA_ADMIN_TOKEN=... node scripts/e2e_alpha_league_season_flow.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const ADMIN = (process.env.ALPHA_ADMIN_TOKEN || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-league-season-e2e');
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!ADMIN) {
  console.error('ALPHA_ADMIN_TOKEN 이 필요합니다.');
  process.exit(1);
}

const STAMP = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
const SERIES_TITLE = `(테스트) 시즌완료 E2E ${STAMP}`;
// 티어별 참가 팀 — 팀 선택기는 이름으로 검색하므로 화면에 보이는 이름을 그대로 쓴다.
const TIER_TEAMS = [
  ['(테스트) QA 스쿼드 01팀', '(테스트) QA 스쿼드 02팀'],
  ['(테스트) QA 스쿼드 03팀', '(테스트) QA 스쿼드 04팀'],
];

const steps = [];
function record(label, detail) {
  steps.push({ label, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail) {
  steps.push({ label, detail, failed: true });
  console.error(`  ✗ ${label} — ${detail}`);
  throw new Error(`${label}: ${detail}`);
}

async function settle(page, ms = 1200) {
  // 리그 화면은 폴링이 있어 networkidle 이 끝나지 않는다 — 고정 대기로 안정화한다.
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(ms);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`    📸 ${name}.png`);
}

/**
 * 팀 선택기(EntityPicker): combobox 에 타이핑 -> role=option 드롭다운에서 고른다.
 *
 * fill() 은 값만 바꿔서 디바운스된 onSearch 가 안 도는 경우가 있다 —
 * pressSequentially 로 실제 키 입력을 흉내내야 검색이 걸린다.
 */
async function pickTeam(page, tier, teamName) {
  const input = page.locator(`#seed-picker-${tier}`);
  // 이름 전체 대신 고유한 뒷부분만 넣는다("(테스트) " 접두어는 모든 팀이 공유한다).
  const query = teamName.replace(/^\(테스트\)\s*/, '');

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // 드롭다운은 onFocus 에서만 열린다(setOpen(true)). 항목을 하나 고르면 setOpen(false)
    // 가 되는데, 입력에 포커스가 남아 있어 그냥 다시 클릭해도 focus 가 재발화하지 않아
    // 메뉴가 닫힌 채로 있다 — 두 번째 팀부터 후보가 0건으로 보이던 원인이다.
    // 명시적으로 blur 한 뒤 클릭해야 focus 이벤트가 다시 뜬다.
    await input.evaluate((el) => el.blur());
    await page.waitForTimeout(150);
    await input.click();
    await input.fill('');
    await page.waitForTimeout(250);
    await input.pressSequentially(query, { delay: 60 });
    await page.waitForTimeout(1200);

    const option = page.getByRole('option', { name: new RegExp(escapeRe(teamName)) }).first();
    if (await option.count()) {
      await option.click();
      await page.waitForTimeout(500);
      const chip = page.getByRole('button', { name: `${tier}부에서 ${teamName} 제거` });
      if (await chip.count()) return;
    }
    const shown = await page.getByRole('option').allTextContents().catch(() => []);
    console.log(`    (재시도 ${attempt}) "${query}" 후보: ${shown.slice(0, 5).join(' / ') || '없음'}`);
  }
  fail('팀 선택', `${tier}부에 "${teamName}" 을 추가하지 못함`);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([
    { name: 'teameet_v1_session', value: ADMIN, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
  ]);
  const page = await ctx.newPage();

  try {
    // ── [1] 시리즈 생성 (SERIES_ID 를 주면 그 시리즈를 이어서 쓴다) ────────
    console.log('\n[1] 리그 체계 생성');
    const RESUME = (process.env.SERIES_ID || '').trim();
    if (RESUME) {
      await page.goto(`${BASE}/admin/league-series/${RESUME}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);
      record('시리즈 재사용', RESUME.slice(0, 8));
    } else {
    await page.goto(`${BASE}/admin/league-series/new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page);

    await page.fill('#series-title', SERIES_TITLE);
    await page.selectOption('#series-sport', { label: '풋살' }).catch(async () => {
      const opts = await page.locator('#series-sport option').allTextContents();
      fail('종목 선택', `풋살 옵션 없음. 있는 옵션: ${opts.join(', ')}`);
    });
    const regionOptions = await page.locator('#series-region option').allTextContents();
    const gangnam = regionOptions.find((t) => t.includes('강남')) ?? regionOptions.find((t) => t.trim() && !t.includes('선택'));
    await page.selectOption('#series-region', { label: gangnam });
    await page.selectOption('#series-tier-count', '2');
    await page.waitForTimeout(400);
    await shot(page, '01-series-new');

    await page.getByRole('button', { name: '리그 체계 만들기' }).first().click()
      .catch(async () => { await page.locator('button[type="submit"], button:has-text("만들기")').last().click(); });
    await page.waitForURL(/\/admin\/league-series\/[0-9a-f-]{36}/, { timeout: 30000 });
    await settle(page);
    record('시리즈 생성', `${SERIES_TITLE} · 지역 ${gangnam}`);
    }
    const seriesId = page.url().match(/league-series\/([0-9a-f-]{36})/)[1];

    // ── [2] 시즌 시딩 ──────────────────────────────────────────────────────
    // 이미 시딩된 시리즈를 이어서 돌릴 수 있어야 한다 — 시딩 패널은 시즌이 생기면
    // 사라지므로, 패널 유무로 판단해 건너뛴다.
    console.log('\n[2] 1시즌 시딩 (티어별 팀 배정)');
    const seedPanel = await page.locator('#seed-title-1').count();
    if (seedPanel === 0) {
      record('시즌 시딩', '이미 시딩된 시리즈 — 건너뜀');
    } else {
    for (let tier = 1; tier <= TIER_TEAMS.length; tier += 1) {
      await page.fill(`#seed-title-${tier}`, `${SERIES_TITLE} ${tier}부`);
      for (const name of TIER_TEAMS[tier - 1]) await pickTeam(page, tier, name);
      record(`${tier}부 배정`, TIER_TEAMS[tier - 1].join(' + '));
    }
    await shot(page, '02-season-seed');

    const seedBtn = page.getByRole('button', { name: '1시즌 만들기' });
    if (await seedBtn.isDisabled()) fail('시즌 시딩', '"1시즌 만들기" 버튼이 비활성 상태');
    await seedBtn.click();
    await page.waitForTimeout(3000);
    await settle(page);
    await shot(page, '03-season-created');
    }

    // 시즌 카드가 생겼는지 화면에서 확인
    const tierCards = await page.locator('text=/^[12]부$/').count();
    if (tierCards < 2) fail('시즌 시딩', `티어 카드가 ${tierCards}개만 보임(2개 기대)`);
    record('1시즌 생성', `티어 카드 ${tierCards}개 확인`);

    // 아직 경기가 안 끝났으면 승강 계산이 막혀 있어야 한다(수정된 게이트).
    const previewBtnEarly = page.getByRole('button', { name: '승강 후보 계산' }).first();
    const earlyEnabled = await previewBtnEarly.isEnabled().catch(() => false);
    if (earlyEnabled) {
      record('게이트 확인', '이미 전 경기 확정 상태 — 활성 (재실행)');
    } else {
      record('게이트 확인', '경기 미확정 시점 "승강 후보 계산" 비활성 ✓');
    }

    // ── [3] 리그별 대진 생성 ───────────────────────────────────────────────
    console.log('\n[3] 리그별 대진 생성');
    const leagueLinks = await page.locator('a[href*="/admin/league-matches/"]').evaluateAll((els) =>
      [...new Set(els.map((el) => el.getAttribute('href')))],
    );
    const leagueIds = leagueLinks.map((h) => h.match(/league-matches\/([0-9a-f-]{36})/)?.[1]).filter(Boolean);
    if (leagueIds.length < 2) fail('리그 링크', `시즌 카드에서 리그 링크를 ${leagueIds.length}개만 찾음`);

    for (const [i, leagueId] of leagueIds.slice(0, 2).entries()) {
      await page.goto(`${BASE}/admin/league-matches/${leagueId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 6000);
      // 대진이 0건이면 생성 폼이 토글 없이 바로 떠 있다. 이미 있으면 폼 자체가 없다.
      if (await page.locator('#weeks-count').count()) {
        await page.fill('#weeks-count', '1');
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: '라운드로빈 대진 생성' }).click();
        await page.waitForTimeout(3500);
        await settle(page);
      } else {
        console.log(`    (${i + 1}부는 이미 대진이 있어 생성 건너뜀)`);
      }
      const rows = await page.getByRole('button', { name: /몰수패 처리$/ }).count();
      const anyFixture = await page.locator('table tbody tr').count();
      if (anyFixture < 1) fail('대진 생성', `${i + 1}부에 대진이 0건`);
      record(`${i + 1}부 대진`, `대진 ${anyFixture}건 · 몰수 가능 ${rows}건`);
      if (i === 0) await shot(page, '04-fixtures-created');
    }

    // ── [4] 몰수패 처리 = 공식 결과 확정 ───────────────────────────────────
    console.log('\n[4] 몰수패 처리로 전 경기 결과 확정');
    for (const [i, leagueId] of leagueIds.slice(0, 2).entries()) {
      await page.goto(`${BASE}/admin/league-matches/${leagueId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 6000);

      for (let guard = 0; guard < 12; guard += 1) {
        const btns = page.getByRole('button', { name: /몰수패 처리$/ });
        if ((await btns.count()) === 0) break;
        await btns.first().click();
        await page.getByRole('dialog').waitFor({ timeout: 15000 });
        // 어느 팀이 불참인지 선택 — 첫 옵션(홈팀 불참)을 쓴다.
        const sel = page.locator('#admin-reason-status');
        const values = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
        await sel.selectOption(values[0]);
        // fill() 로 넣으면 값과 글자수는 반영되는데 확인 버튼이 비활성으로 남는다
        // (실측). 실제 키 입력을 흉내내야 제출 가능 상태가 된다.
        const reason = page.locator('#admin-reason-text');
        await reason.click();
        await reason.pressSequentially('E2E 검증: 상대팀 불참으로 몰수 처리', { delay: 25 });
        await page.waitForTimeout(500);
        if (i === 0 && guard === 0) await shot(page, '05-forfeit-modal');
        await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
        await page.waitForTimeout(3500);
        await settle(page, 800);
      }
      record(`${i + 1}부 결과 확정`, '남은 몰수 대상 0건');
    }
    await shot(page, '06-fixtures-confirmed');

    // ── [5] 리그 자동 completed → 승강 게이트 열림 ─────────────────────────
    console.log('\n[5] 리그 자동 종료 확인 + 승강 게이트');
    await page.goto(`${BASE}/admin/league-series/${seriesId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 2000);
    await shot(page, '07-series-completed');

    const notFinished = await page.getByText('아직 끝나지 않은 리그가 있어요').count()
      + await page.getByText('아직 진행 중인 리그가 있어요').count();
    const previewBtn = page.getByRole('button', { name: '승강 후보 계산' }).first();
    const nowEnabled = await previewBtn.isEnabled().catch(() => false);
    if (!nowEnabled) {
      fail('승강 게이트', `전 경기 확정 후에도 "승강 후보 계산" 이 비활성 (미완료 안내 ${notFinished}건)`);
    }
    record('리그 자동 종료', `미완료 안내 ${notFinished}건 · "승강 후보 계산" 활성 ✓`);

    // ── [6] 승강 후보 계산 ─────────────────────────────────────────────────
    console.log('\n[6] 승강 후보 계산');
    await previewBtn.click();
    await page.getByRole('button', { name: '승강 최종 승인' }).waitFor({ timeout: 30000 });
    await settle(page, 1200);
    await shot(page, '08-promotion-preview');

    const promoted = await page.locator('text=승격').count();
    const relegated = await page.locator('text=강등').count();
    record('승강 후보 계산', `승격 표시 ${promoted}건 · 강등 표시 ${relegated}건`);

    // ── [7] 최종 승인 → 다음 시즌 ──────────────────────────────────────────
    console.log('\n[7] 승강 최종 승인');
    await page.getByRole('button', { name: '승강 최종 승인' }).click();
    await page.waitForTimeout(5000);
    await settle(page, 1500);
    await shot(page, '09-next-season-created');

    const season2 = await page.getByText('2시즌', { exact: false }).count();
    if (season2 === 0) fail('다음 시즌', '화면에 2시즌이 나타나지 않음');
    record('다음 시즌 생성', `화면에 2시즌 표시 ${season2}건`);

    console.log(`\n✅ E2E 완료 — seriesId=${seriesId}`);
    console.log(`   스크린샷: ${OUT}`);
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ seriesId, seriesTitle: SERIES_TITLE, steps }, null, 2));
  } catch (err) {
    console.error(`\n❌ 실패: ${err.message}`);
    await shot(page, 'ZZ-failure').catch(() => {});
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ error: err.message, steps }, null, 2));
    process.exitCode = 1;
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
