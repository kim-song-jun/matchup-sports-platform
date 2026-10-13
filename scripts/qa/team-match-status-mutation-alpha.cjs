// Explicitly authorized Alpha-only mutation QA. Creates one owned fixture; cancels it on cleanup.
const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const origin = 'https://alpha.teameet.co.kr';

async function main() {
  for (const key of ['QA_OUTPUT_DIR', 'QA_ADMIN_EMAIL', 'QA_ADMIN_PASSWORD', 'QA_PLAYER_EMAIL', 'QA_PLAYER_PASSWORD']) if (!process.env[key]) throw new Error(`${key} required`);
  const output = process.env.QA_OUTPUT_DIR;
  await fs.mkdir(output, { recursive: true });
  const evidence = { origin, checks: [], errors: [], cleanup: null };
  const browser = await chromium.launch({ headless: false, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  console.log('Owned browser parent:', process.pid);
  if (process.platform === 'win32') console.log(execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${process.pid} } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`], { encoding: 'utf8' }).trim());
  let fixtureId;
  let admin;
  const check = (name, valid, values) => { evidence.checks.push({ name, pass: !!valid, values }); if (!valid) throw new Error(`Contract failed: ${name}`); };
  const json = async response => { const body = await response.json(); if (!response.ok()) throw new Error(`HTTP ${response.status()}: ${body.code || 'unknown'}`); return body.data; };
  try {
    admin = await browser.newContext();
    const player = await browser.newContext();
    const guest = await browser.newContext();
    const adminPage = await admin.newPage();
    const playerPage = await player.newPage();
    for (const page of [adminPage, playerPage]) {
      page.on('pageerror', error => evidence.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
    }
    const login = async (page, email, password, redirect) => {
      await page.goto(`${origin}/login/email?redirect=${encodeURIComponent(redirect)}`, { waitUntil: 'domcontentloaded' });
      let hydrated = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
        try {
          await page.waitForFunction(() => document.querySelector('input[placeholder="비밀번호"]')?.type === 'text', undefined, { timeout: 500 });
          hydrated = true;
          break;
        } catch { /* Retry the same visible action until its handler is attached. */ }
      }
      if (!hydrated) throw new Error('Login form did not hydrate');
      await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
      await page.getByLabel('이메일', { exact: true }).fill(email);
      await page.getByLabel('비밀번호', { exact: true }).fill(password);
      await page.waitForTimeout(1000);
      const [response] = await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST'), page.getByRole('button', { name: '로그인', exact: true }).click()]);
      await json(response);
      await page.waitForURL(url => url.pathname === redirect);
    };
    evidence.phase = 'admin login';
    await login(adminPage, process.env.QA_ADMIN_EMAIL, process.env.QA_ADMIN_PASSWORD, '/admin/team-matches');
    evidence.phase = 'player login';
    await login(playerPage, process.env.QA_PLAYER_EMAIL, process.env.QA_PLAYER_PASSWORD, '/my');
    evidence.phase = 'fixture lifecycle';
    const teamsData = await json(await player.request.get(`${origin}/api/v1/me/teams`));
    const team = (Array.isArray(teamsData) ? teamsData : teamsData.items).find(t => ['owner', 'manager'].includes(t.role));
    if (!team) throw new Error('Test player has no managed team');
    const title = `(QA) 팀매치 상태 ${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const deadlineAt = new Date(now + 25000).toISOString();
    const created = await json(await admin.request.post(`${origin}/api/v1/admin/team-matches`, { data: {
      clientCommandId: randomUUID(), sportId: team.sport.sportId, regionId: '5db9ccb1-b68f-441b-b42b-2b530550450d', title,
      description: '사용자 승인 Alpha 팀매치 상태 검증 전용. 실제 모집 아님.', manualPlaceName: 'QA 전용 테스트 구장',
      startsAt: new Date(now + 7 * 86400000).toISOString(), endsAt: new Date(now + 7 * 86400000 + 7200000).toISOString(), deadlineAt,
    } }));
    fixtureId = created.teamMatchId;
    evidence.fixtureId = fixtureId;
    evidence.title = title;
    if (!fixtureId) throw new Error('Created fixture id missing');
    const publicRead = async () => json(await guest.request.get(`${origin}/api/v1/team-matches/${fixtureId}`));
    const adminRead = async () => json(await admin.request.get(`${origin}/api/v1/admin/team-matches/${fixtureId}`));
    const initial = await publicRead();
    check('initial recruiting', initial.status === 'recruiting', { status: initial.status });
    await adminPage.waitForTimeout(Math.max(0, new Date(deadlineAt).getTime() - Date.now() + 1000));
    const expired = await publicRead();
    check('elapsed deadline closes recruitment', expired.status === 'closed', { status: expired.status });
    const changeStatus = async status => {
      await adminPage.goto(`${origin}/admin/team-matches?q=${encodeURIComponent(title)}`, { waitUntil: 'domcontentloaded' });
      await adminPage.getByRole('button', { name: `${title} 상태 변경`, exact: true }).click();
      const dialog = adminPage.getByRole('dialog');
      await dialog.getByLabel('변경할 상태', { exact: true }).selectOption(status);
      await dialog.getByPlaceholder('처리 사유를 입력해 주세요.').fill(`Alpha QA ${status}`);
      const [response] = await Promise.all([adminPage.waitForResponse(r => r.url().endsWith(`/team-matches/${fixtureId}/status`) && r.request().method() === 'POST'), dialog.getByRole('button', { name: '확인', exact: true }).click()]);
      await json(response);
      await dialog.waitFor({ state: 'hidden' });
    };
    await changeStatus('recruiting');
    const reopened = await publicRead();
    const rawReopened = await adminRead();
    check('admin UI reopening applies and clears deadline', reopened.status === 'recruiting' && rawReopened.deadlineAt === null, { publicStatus: reopened.status, deadlineAt: rawReopened.deadlineAt });
    const assign = await admin.request.post(`${origin}/api/v1/admin/team-matches/${fixtureId}/status`, { data: { status: 'matched', reason: 'QA 확인: 승인 없는 매칭 금지' } });
    const assignError = await assign.json();
    check('unapproved matching forbidden', assign.status() === 409 && assignError.code === 'TEAM_MATCH_ASSIGNMENT_REQUIRED', { http: assign.status(), code: assignError.code });
    await changeStatus('closed');
    check('admin UI close applies', (await publicRead()).status === 'closed');
    await adminPage.goto(`${origin}/admin/team-matches/${fixtureId}/edit`, { waitUntil: 'domcontentloaded' });
    await adminPage.getByLabel('제목', { exact: true }).waitFor();
    check('closed editor hydrates correct entity', await adminPage.getByLabel('제목', { exact: true }).inputValue() === title);
    for (const width of [390, 768, 1440]) {
      await adminPage.setViewportSize({ width, height: 1000 });
      await adminPage.screenshot({ path: path.join(output, `after-closed-edit-${width}.png`), fullPage: true });
      check(`closed editor overflow ${width}`, !(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    }
    const changedDescription = 'Alpha QA: 마감 상태에서 수정 내용 실제 저장 확인';
    await adminPage.getByLabel('모집 안내', { exact: true }).fill(changedDescription);
    const [saved] = await Promise.all([adminPage.waitForResponse(r => r.url().endsWith(`/admin/team-matches/${fixtureId}`) && r.request().method() === 'PATCH'), adminPage.getByRole('button', { name: '수정 내용 저장', exact: true }).click()]);
    await json(saved);
    const edited = await adminRead();
    check('closed edit persisted without reopening', edited.status === 'closed' && edited.description === changedDescription, { status: edited.status });
    await changeStatus('recruiting');
    await json(await player.request.post(`${origin}/api/v1/team-matches/${fixtureId}/applications`, { data: { applicantTeamId: team.teamId, message: 'Alpha QA 전용 신청' } }));
    const myRead = async () => json(await player.request.get(`${origin}/api/v1/me/team-matches?scope=applied&limit=50`));
    check('applicant my matches visible before cancel', (await myRead()).items.some(item => item.teamMatchId === fixtureId));
    await playerPage.goto(`${origin}/my/matches/joined?type=team`, { waitUntil: 'domcontentloaded' });
    await playerPage.getByText(title, { exact: true }).waitFor();
    for (const width of [390, 768, 1440]) {
      await playerPage.setViewportSize({ width, height: 1000 });
      await playerPage.screenshot({ path: path.join(output, `after-my-before-cancel-${width}.png`), fullPage: true });
      check(`my matches overflow ${width}`, !(await playerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    }
    await changeStatus('cancelled');
    const retained = await adminRead();
    check('cancelled admin record retained', retained.status === 'cancelled', { status: retained.status });
    for (const suffix of ['', '/application-eligibility', '/lineup', '/record']) {
      const response = await player.request.get(`${origin}/api/v1/team-matches/${fixtureId}${suffix}`);
      check(`cancelled user ${suffix || 'detail'} hidden`, response.status() === 404, { http: response.status() });
    }
    const publicList = await json(await guest.request.get(`${origin}/api/v1/team-matches?query=${encodeURIComponent(title)}&status=cancelled`));
    check('cancelled public list absent even explicit filter', publicList.items.length === 0);
    check('cancelled applicant my matches absent', !(await myRead()).items.some(item => item.teamMatchId === fixtureId));
    await playerPage.reload({ waitUntil: 'domcontentloaded' });
    await playerPage.getByRole('heading').first().waitFor();
    await playerPage.waitForTimeout(1500);
    check('cancelled my UI absent', await playerPage.getByText(title, { exact: true }).count() === 0);
    for (const width of [390, 768, 1440]) {
      await playerPage.setViewportSize({ width, height: 1000 });
      await playerPage.screenshot({ path: path.join(output, `after-my-after-cancel-${width}.png`), fullPage: true });
    }
    const unavailablePage = await guest.newPage();
    const unavailableResponse = await unavailablePage.goto(`${origin}/team-matches/${fixtureId}`, { waitUntil: 'domcontentloaded' });
    await unavailablePage.getByRole('heading', { name: '페이지를 찾을 수 없어요', exact: true }).waitFor();
    check('cancelled direct URL shows not found', await unavailablePage.getByText(title, { exact: true }).count() === 0, { http: unavailableResponse.status() });
    for (const width of [390, 768, 1440]) {
      await unavailablePage.setViewportSize({ width, height: 1000 });
      await unavailablePage.screenshot({ path: path.join(output, `after-cancelled-detail-${width}.png`), fullPage: true });
    }
    const reopenCancelled = await admin.request.post(`${origin}/api/v1/admin/team-matches/${fixtureId}/status`, { data: { status: 'recruiting', reason: 'QA 확인: 취소 재모집 금지' } });
    const reopenError = await reopenCancelled.json();
    check('cancelled reopen forbidden', reopenCancelled.status() === 409 && reopenError.code === 'TEAM_MATCH_REOPEN_FORBIDDEN', { http: reopenCancelled.status(), code: reopenError.code });
    check('no browser errors', evidence.errors.length === 0, { count: evidence.errors.length });
  } finally {
    try {
      if (fixtureId && admin) {
        const cancelled = await admin.request.post(`${origin}/api/v1/admin/team-matches/${fixtureId}/status`, { data: { status: 'cancelled', reason: 'Alpha QA cleanup: 검증 전용 매치 취소' } });
        evidence.cleanup = { fixtureId, cancelledHttp: cancelled.status() };
        if (!cancelled.ok()) throw new Error(`Cleanup HTTP ${cancelled.status()}`);
      }
    } catch (error) {
      evidence.cleanupError = error.message;
    } finally {
      try { await fs.writeFile(path.join(output, 'mutation-evidence.json'), JSON.stringify(evidence, null, 2)); }
      finally { await browser.close(); }
    }
  }
  if (evidence.cleanupError) throw new Error(evidence.cleanupError);
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
