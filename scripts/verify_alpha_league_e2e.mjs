/**
 * alpha 리그전 운영자 E2E — 어드민 UI 를 실제로 눌러 끝까지 밟는다.
 *
 * 리그 체계 생성 → 1시즌 시딩 → 티어별 대진 생성 → 몰수로 리그 종료
 *   → 승강 후보 계산 → 최종 승인 → 2시즌 자동 생성 확인
 *
 * 감사 보고서의 "확인하지 못한 것" 중 두 건(신규 리그 개설 전 과정 / 승강 확정→다음 시즌)을
 * 실측으로 메우기 위한 스크립트다. 각 단계마다 화면을 캡처한다.
 *
 * 사용법: ALPHA_PASSWORD=... ALPHA_ADMIN_EMAIL=... node scripts/verify_alpha_league_e2e.mjs <outDir>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/league-e2e';
const PASSWORD = process.env.ALPHA_PASSWORD;
const EMAIL = process.env.ALPHA_ADMIN_EMAIL;
if (!PASSWORD || !EMAIL) {
  console.error('ALPHA_PASSWORD / ALPHA_ADMIN_EMAIL 환경변수가 필요해요.');
  process.exit(1);
}

const STAMP = process.env.RUN_STAMP ?? 'run';
const SERIES_TITLE = `(테스트) 감사 E2E ${STAMP}`;
const log = [];
function note(step, detail) {
  const line = `[${step}] ${detail}`;
  log.push(line);
  console.log(line);
}

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const cookie = raw.map((c) => c ?? '').find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error('세션 쿠키를 못 받았어요.');
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

await mkdir(OUT, { recursive: true });
const token = await login();

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'ko-KR',
});
await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
await ctx.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
const page = await ctx.newPage();

const consoleErrors = [];
const badResponses = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`.slice(0, 140)); });

let shotNo = 0;
async function shot(name) {
  shotNo += 1;
  const file = `${OUT}/${String(shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/**
 * STRICT_PICKER=1 이면 우회 조작(다른 칸 클릭 -> blur -> 재포커스) 없이
 * "입력창 클릭 + 타이핑"만으로 목록이 열리는지 본다 — C-0(선택 후 검색창이 다시 안 열림)
 * 수정이 실제로 먹었는지 증명하는 모드다. 기본값은 우회 포함(수정 전에도 완주 가능).
 */
const STRICT_PICKER = process.env.STRICT_PICKER === '1';

async function pickTeam(tier, query) {
  const picker = page.locator(`#seed-picker-${tier}`);
  if (!STRICT_PICKER) {
    // EntityPicker 가 onFocus 에서만 메뉴를 열던 시절의 우회 — 선택 직후에도 입력창이
    // 포커스를 유지해 재클릭·재입력으로는 안 열렸다. 수정 후에는 STRICT_PICKER 로 검증한다.
    await page.locator(`#seed-title-${tier}`).click();
    await page.waitForTimeout(300);
  }
  await picker.click();
  await page.waitForTimeout(400);
  await picker.fill('');
  await page.waitForTimeout(300);
  await picker.pressSequentially(query, { delay: 40 });
  await page.waitForTimeout(2200);
  const expanded = await picker.getAttribute('aria-expanded');
  if (STRICT_PICKER) {
    note('2-시딩', `[strict] "${query}" 입력 후 aria-expanded=${expanded}`);
    if (expanded !== 'true') {
      throw new Error(`C-0 미해결: 우회 없이 목록이 열리지 않았다 (aria-expanded=${expanded})`);
    }
  } else if (expanded !== 'true') {
    await page.locator(`#seed-title-${tier}`).click();
    await page.waitForTimeout(300);
    await picker.click();
    await page.waitForTimeout(2000);
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const option = page.getByRole('option', { name: new RegExp(escaped) }).first();
  try {
    await option.waitFor({ state: 'visible', timeout: 8000 });
  } catch (err) {
    const visible = await page.getByRole('option').evaluateAll((els) => els.map((e) => e.textContent.trim().slice(0, 30)));
    note('2-시딩', `"${query}" 옵션을 못 찾음. 보이는 옵션: ${visible.join(' / ') || '(없음)'}`);
    throw err;
  }
  const label = (await option.textContent())?.trim().slice(0, 40);
  await option.click();
  await page.waitForTimeout(700);
  return label;
}

try {
  // ── 1. 리그 체계 생성 ─────────────────────────────────────────
  // 앞선 실행이 시딩 단계에서 실패했다면 SERIES_ID 로 그 시리즈를 이어서 쓴다(빈 시리즈 양산 방지).
  if (process.env.SERIES_ID) {
    note('1-생성', `기존 시리즈 재사용 seriesId=${process.env.SERIES_ID}`);
    await page.goto(`${BASE}/admin/league-series/${process.env.SERIES_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot('series-detail-empty');
  } else {
  await page.goto(`${BASE}/admin/league-series/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot('series-new-empty');

  const submitDisabledBefore = await page.getByRole('button', { name: '리그 체계 만들기' }).isDisabled();
  note('1-폼', `입력 전 제출 버튼 disabled=${submitDisabledBefore}`);

  await page.fill('#series-title', SERIES_TITLE);
  await page.selectOption('#series-sport', { label: '풋살' });
  await page.selectOption('#series-region', { label: '강남구' });
  await page.selectOption('#series-tier-count', '2');
  await page.waitForTimeout(600);
  await shot('series-new-filled');

  const submitDisabledAfter = await page.getByRole('button', { name: '리그 체계 만들기' }).isDisabled();
  note('1-폼', `입력 후 제출 버튼 disabled=${submitDisabledAfter}`);

  await page.getByRole('button', { name: '리그 체계 만들기' }).click();
  await page.waitForURL(/\/admin\/league-series\/[0-9a-f-]{36}$/, { timeout: 20000 });
  note('1-생성', `리그 체계 생성 완료 seriesId=${page.url().split('/').pop()}`);
  await page.waitForTimeout(2500);
  await shot('series-detail-empty');
  }
  const seriesId = page.url().split('/').pop();

  // ── 2. 1시즌 시딩 ────────────────────────────────────────────
  if (process.env.SKIP_SEED === '1') {
    note('2-시딩', '이미 시딩된 시리즈 — 시딩 단계를 건너뛴다');
  } else {
  const t1 = await pickTeam(1, '(테스트) QA 스쿼드 05팀');
  const t2 = await pickTeam(1, '(테스트) QA 스쿼드 06팀');
  const t3 = await pickTeam(2, '(테스트) QA 스쿼드 07팀');
  const t4 = await pickTeam(2, '(테스트) QA 스쿼드 08팀');
  note('2-시딩', `1부 [${t1}, ${t2}] / 2부 [${t3}, ${t4}]`);
  await page.fill('#seed-title-1', `${SERIES_TITLE} 1시즌 1부`);
  await page.fill('#seed-title-2', `${SERIES_TITLE} 1시즌 2부`);
  await page.waitForTimeout(400);
  await shot('season-seed-filled');

  await page.getByRole('button', { name: '1시즌 만들기' }).click();
  await page.waitForTimeout(6000);
  await shot('series-detail-season1');
  }

  // 티어 리그 링크 수집
  const leagueLinks = await page.locator('a[href^="/admin/league-matches/"]').evaluateAll((els) =>
    els.map((el) => ({ href: el.getAttribute('href'), text: el.textContent.trim() })),
  );
  note('2-시딩', `생성된 티어 리그 ${leagueLinks.length}개: ${leagueLinks.map((l) => l.text).join(' | ')}`);
  if (leagueLinks.length < 2) throw new Error('티어 리그가 2개 생성되지 않았어요.');

  // ── 3~4. 티어별 대진 생성 + 몰수로 종료 ───────────────────────
  for (const link of leagueLinks) {
    await page.goto(`${BASE}${link.href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(`league-${link.text.includes('1부') ? 'tier1' : 'tier2'}-before-fixtures`);

    const genBtn = page.getByRole('button', { name: '라운드로빈 대진 생성' });
    if (await genBtn.count()) {
      await page.fill('#weeks-count', '1');
      await page.fill('#fixture-place-name', '감사 E2E 구장');
      await genBtn.click();
      await page.waitForTimeout(6000);
      await shot(`league-${link.text.includes('1부') ? 'tier1' : 'tier2'}-fixtures`);
    } else {
      note('3-대진', `${link.text}: 대진이 이미 있어 생성 단계를 건너뛴다`);
    }

    // AdminDataTable 은 데스크톱 <table> 과 모바일 카드 목록을 둘 다 DOM 에 렌더하므로
    // 버튼 개수는 대진 수의 2배로 잡힌다 — 개수로 세지 말고 "남아 있는 동안" 반복한다.
    const forfeitSel = 'button[aria-label$="몰수패 처리"]';
    const distinct = new Set(
      await page.locator(forfeitSel).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))),
    );
    note('3-대진', `${link.text}: 몰수 가능 대진 ${distinct.size}건 (DOM 버튼 ${await page.locator(forfeitSel).count()}개 — 표/카드 이중 렌더)`);

    for (let i = 0; i < distinct.size; i += 1) {
      if ((await page.locator(forfeitSel).count()) === 0) break;
      await page.locator(forfeitSel).first().click();
      await page.waitForSelector('#admin-reason-status', { timeout: 10000 });
      const opts = await page.locator('#admin-reason-status option').evaluateAll((els) =>
        els.map((el) => ({ v: el.value, t: el.textContent.trim() })),
      );
      // 홈팀 불참으로 통일 (첫 번째 실제 옵션)
      const target = opts.find((o) => o.v);
      await page.selectOption('#admin-reason-status', target.v);
      const reasonBox = page.locator('#admin-reason-text');
      await reasonBox.click();
      await reasonBox.pressSequentially('감사 E2E 몰수 처리', { delay: 20 });
      await page.waitForTimeout(600);
      const submit = page.getByRole('button', { name: '확인' }).last();
      const state = await page.evaluate(() => ({
        reason: document.querySelector('#admin-reason-text')?.value,
        status: document.querySelector('#admin-reason-status')?.value?.slice(0, 8),
        disabled: [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '확인')?.disabled,
      }));
      note('4-몰수', `모달 상태: 사유="${state.reason}" 상태=${state.status} 제출disabled=${state.disabled}`);
      await shot(`forfeit-modal-${link.text.includes('1부') ? 'tier1' : 'tier2'}-${i}`);
      await submit.click();
      await page.waitForTimeout(5000);
      note('4-몰수', `${link.text} 대진 ${i + 1}: "${target.t}" 처리`);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const stateText = await page.locator('body').innerText();
    const completed = /진행 중으로 되돌리기/.test(stateText);
    note('4-종료', `${link.text}: 종료 상태 감지(되돌리기 버튼 존재) = ${completed}`);
    await shot(`league-${link.text.includes('1부') ? 'tier1' : 'tier2'}-after-forfeit`);
  }

  // ── 5. 승강 후보 계산 → 최종 승인 ─────────────────────────────
  await page.goto(`${BASE}/admin/league-series/${seriesId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await shot('series-before-promotion');

  const calcBtn = page.getByRole('button', { name: '승강 후보 계산' }).first();
  const calcDisabled = await calcBtn.isDisabled();
  note('5-승강', `승강 후보 계산 버튼 disabled=${calcDisabled}`);
  await calcBtn.click();
  await page.waitForTimeout(5000);
  await shot('promotion-preview');

  const previewText = await page.locator('body').innerText();
  const hasPoints = /승점|득실/.test(previewText);
  note('5-승강', `preview 화면에 승점·득실 표기 존재 = ${hasPoints}`);

  const commitBtn = page.getByRole('button', { name: '승강 최종 승인' });
  await commitBtn.waitFor({ state: 'visible', timeout: 15000 });
  note('5-승강', `최종 승인 버튼 disabled=${await commitBtn.isDisabled()}`);
  await commitBtn.click();
  await page.waitForTimeout(8000);
  await shot('after-commit');

  // ── 6. 2시즌 생성 확인 ───────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const finalText = await page.locator('body').innerText();
  const hasSeason2 = /2시즌/.test(finalText);
  note('6-다음시즌', `2시즌 섹션 존재 = ${hasSeason2}`);
  const season1Calc = await page.getByRole('button', { name: '승강 후보 계산' }).count();
  note('6-다음시즌', `확정 후에도 남아 있는 "승강 후보 계산" 버튼 수 = ${season1Calc}`);
  await shot('series-final');

  // 공개 순위표에서 승강 표기 확인
  const api = await page.evaluate(async (sid) => {
    const r = await fetch(`/api/v1/admin/league-series/${sid}`);
    return r.ok ? await r.json() : { error: r.status };
  }, seriesId);
  const seasons = api?.data?.seasons ?? [];
  note('6-다음시즌', `API 기준 시즌 수 = ${seasons.length} (${seasons.map((s) => `s${s.seasonNo}:${s.tiers.length}티어`).join(', ')})`);
  const s1 = seasons.find((s) => s.seasonNo === 1);
  if (s1) {
    for (const t of s1.tiers) {
      const st = await page.evaluate(async (lid) => {
        const r = await fetch(`/api/v1/league-matches/${lid}/standings`);
        return r.ok ? await r.json() : { error: r.status };
      }, t.leagueId);
      const rows = (st?.data?.standings ?? []).map((x) => `${x.position}.${x.teamName} ${x.points}점 [${x.promotionKind ?? '-'}→${x.promotionToTierLabel ?? '-'}]`);
      note('6-순위', `${t.tierLabel}: ${rows.join(' | ')}`);
    }
    await page.goto(`${BASE}/league-matches/${s1.tiers[0].leagueId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot('public-standings-after-promotion');
  }

  note('결과', `콘솔 오류 ${consoleErrors.length}건 / 4xx·5xx ${badResponses.length}건`);
  if (badResponses.length) note('결과', `실패 응답: ${[...new Set(badResponses)].slice(0, 8).join(' ; ')}`);
  if (consoleErrors.length) note('결과', `콘솔: ${[...new Set(consoleErrors)].slice(0, 5).join(' ; ')}`);
  await writeFile(`${OUT}/e2e-log.txt`, log.join('\n'));
  console.log(`\n완료 → ${OUT} (스크린샷 ${shotNo}장)`);
} catch (err) {
  note('실패', err.message);
  await shot('failure');
  await writeFile(`${OUT}/e2e-log.txt`, log.join('\n'));
  console.error('\n실패:', err.message);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await browser.close();
}
