import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = 'docs/screenshots/task173-team-match-attendance-roster-pre-match';
const HOST_EMAIL = 'league.qa.t01.p01@teameet.test';
const AWAY_EMAIL = 'league.qa.t04.p01@teameet.test';
const PASSWORD = process.env.QA_PASSWORD;

if (!PASSWORD) throw new Error('QA_PASSWORD is required');

mkdirSync(OUT, { recursive: true });
const manifest = [];
const runtimeIssues = [];

const unwrap = (body) => body?.data ?? body;

async function login(email) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`login ${email} -> ${response.status}: ${text.slice(0, 300)}`);
  const data = unwrap(JSON.parse(text));
  const setCookie = response.headers.getSetCookie?.().find((value) => value.startsWith('teameet_v1_session='))
    ?? response.headers.get('set-cookie');
  const sessionCookie = setCookie?.split(';', 1)[0] ?? null;
  if (!sessionCookie?.startsWith('teameet_v1_session=')) throw new Error(`login ${email} did not issue a session cookie`);
  return { sessionCookie, session: data.session, user: data.user };
}

async function api(tokens, path, { method = 'GET', data, command = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      cookie: tokens.sessionCookie,
      'content-type': 'application/json',
      ...(command ? { 'idempotency-key': randomUUID() } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 800)}`);
  return text ? unwrap(JSON.parse(text)) : null;
}

function items(value) {
  return value?.items ?? value?.sports ?? value?.regions ?? [];
}

async function managedTeam(tokens, expectedName) {
  const response = await api(tokens, '/me/teams?permission=manage_team');
  const team = items(response).find((candidate) => candidate.name === expectedName || candidate.team?.name === expectedName);
  if (!team) throw new Error(`${expectedName} managed team not found`);
  return { id: team.teamId ?? team.id, name: team.name ?? team.team?.name };
}

async function createScenario(host, away) {
  const [sports, regions, hostTeam, awayTeam] = await Promise.all([
    api(host, '/master/sports'),
    api(host, '/master/regions'),
    managedTeam(host, '마포 레인저스'),
    managedTeam(away, '송파 유나이티드'),
  ]);
  const sport = items(sports).find((candidate) => String(candidate.code).toLowerCase() === 'futsal');
  const parents = items(regions);
  const region = parents.flatMap((candidate) => candidate.children ?? []).find(Boolean);
  if (!sport || !region) throw new Error('futsal sport or leaf region not found');

  const startsAt = new Date(Date.now() + 26 * 60 * 60 * 1000);
  startsAt.setMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
  const deadlineAt = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
  const stamp = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace(/[^0-9]/g, '');
  const title = `ALPHA QA 참석명단 경기 전 ${stamp}`;
  const created = await api(host, '/team-matches', {
    method: 'POST',
    data: {
      hostTeamId: hostTeam.id,
      sportId: sport.id,
      regionId: region.id,
      title,
      description: '양 팀이 경기 전에 참석명단을 등록하고 제출하는 실제 흐름을 확인하는 Alpha QA 팀매치입니다.',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      manualPlaceName: '잠실 실내 풋살장 A코트',
      addressText: '서울 송파구 올림픽로 25',
      costNote: '총 120,000원 · 상대팀 60,000원',
      minLevelCode: 'beginner',
      maxLevelCode: 'intermediate',
      genderRule: '성별 무관',
      matchFormat: '6:6',
      matchStyle: ['친선', '매너 중심'],
      uniformColor: '파랑',
    },
  });
  const teamMatchId = created.teamMatchId ?? created.id;
  if (!teamMatchId) throw new Error(`team match id missing: ${JSON.stringify(created)}`);
  return { teamMatchId, title, startsAt: startsAt.toISOString(), hostTeam, awayTeam };
}

async function storage(tokens) {
  const value = tokens.sessionCookie.slice('teameet_v1_session='.length);
  return {
    cookies: [{
      name: 'teameet_v1_session', value, domain: 'alpha.teameet.co.kr', path: '/',
      httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    }],
    origins: [{
      origin: BASE,
      localStorage: [
        { name: 'teameet.v1.session', value: 'active' },
      ],
    }],
  };
}

async function newPage(browser, tokens, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, storageState: await storage(tokens) });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeIssues.push({ type: 'console', text: message.text().slice(0, 500), url: page.url() });
  });
  page.on('pageerror', (error) => runtimeIssues.push({ type: 'pageerror', text: error.message.slice(0, 500), url: page.url() }));
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/v1/')) runtimeIssues.push({ type: 'requestfailed', text: request.failure()?.errorText ?? 'failed', url: request.url() });
  });
  return { context, page };
}

async function ready(page, path, visibleText) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (response?.status() !== 200) throw new Error(`${path} returned ${response?.status()}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  if (visibleText) {
    try {
      await page.getByText(visibleText, { exact: true }).first().waitFor({ timeout: 20_000 });
    } catch (error) {
      const body = (await page.locator('body').innerText()).slice(0, 1200);
      throw new Error(`visible text not found: ${visibleText}; url=${page.url()}; body=${body}`, { cause: error });
    }
  }
  await page.waitForTimeout(700);
}

async function shot(page, file, stage, actor) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    runtimeIssues.push({ type: 'horizontal-overflow', text: `${overflow.scrollWidth}/${overflow.clientWidth}`, url: page.url() });
  }
  const path = `${OUT}/${file}`;
  await page.screenshot({ path, fullPage: true });
  manifest.push({ file: path, stage, actor, viewport: await page.viewportSize(), url: page.url(), overflow });
  console.log(`SHOT ${file}`);
}

async function captureAtBoth(page, desktopFile, mobileFile, stage, actor) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
  await shot(page, desktopFile, stage, actor);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await shot(page, mobileFile, stage, actor);
}

async function approveAndSetAttendance(host, away, state, applicationId) {
  await api(host, `/team-match-applications/${applicationId}/approve`, { method: 'POST' });
  for (const [tokens, team] of [[host, state.hostTeam], [away, state.awayTeam]]) {
    const schedules = await api(tokens, `/teams/${team.id}/schedules?limit=100&type=MATCH`);
    const schedule = items(schedules).find((candidate) => candidate.teamMatchId === state.teamMatchId);
    if (!schedule) throw new Error(`schedule missing for ${team.name}`);
    const members = await api(tokens, `/teams/${team.id}/members?limit=100`);
    const selected = items(members).slice(0, 6);
    if (selected.length < 3) throw new Error(`${team.name} has only ${selected.length} members`);
    let expectedVersion = schedule.version;
    for (const member of selected) {
      const result = await api(tokens, `/teams/${team.id}/schedules/${schedule.id}/attendance/${member.userId}`, {
        method: 'PUT', command: true, data: { status: 'GOING', expectedVersion },
      });
      expectedVersion = result.version;
    }
  }
}

async function rosterJourney(browser, tokens, state, actor, prefix) {
  const { context, page } = await newPage(browser, tokens);
  try {
    await ready(page, `/team-matches/${state.teamMatchId}/lineup`, '참석명단 (0)');
    await captureAtBoth(page, `${prefix}-desktop-empty.png`, `${prefix}-mobile-empty.png`, '참석명단 비어 있음', actor);
    await page.setViewportSize({ width: 1440, height: 900 });
    const addButtons = page.getByRole('button', { name: '명단 추가', exact: true });
    const count = await addButtons.count();
    if (count < 3) throw new Error(`${actor} addable attending members=${count}`);
    while (await addButtons.count()) await addButtons.first().click();
    const gkButton = page.getByRole('button', { name: /골키퍼로 지정$/ }).first();
    await gkButton.click();
    await page.getByText(`참석명단 (${count})`, { exact: true }).waitFor();
    await captureAtBoth(page, `${prefix}-desktop-filled.png`, `${prefix}-mobile-filled.png`, '참석명단 선수 등록 및 GK 지정', actor);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '참석명단 제출하기', exact: true }).click();
    await page.getByText('제출됨', { exact: true }).first().waitFor({ timeout: 25_000 });
    await captureAtBoth(page, `${prefix}-desktop-submitted.png`, `${prefix}-mobile-submitted.png`, '참석명단 제출 완료', actor);
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('라인업 제출하기') || bodyText.includes('라인업이 비어')) {
      throw new Error(`${actor} team-match page still exposes old lineup copy`);
    }
    return count;
  } finally {
    await context.close();
  }
}

const [host, away] = await Promise.all([login(HOST_EMAIL), login(AWAY_EMAIL)]);
const state = await createScenario(host, away);
const browser = await chromium.launch({ headless: false });
let applicationId;
try {
  {
    const { context, page } = await newPage(browser, away);
    await ready(page, `/team-matches/${state.teamMatchId}`, state.title);
    await captureAtBoth(page, '01-desktop-recruiting-detail.png', '02-mobile-recruiting-detail.png', '상대팀 모집 상세', 'away');
    await context.close();
  }

  const application = await api(away, `/team-matches/${state.teamMatchId}/applications`, {
    method: 'POST', data: { applicantTeamId: state.awayTeam.id, message: '참석명단 제출 흐름 Alpha QA 신청입니다.' },
  });
  applicationId = application.applicationId ?? application.id;
  {
    const { context, page } = await newPage(browser, away);
    await ready(page, `/team-matches/${state.teamMatchId}`, '승인 대기');
    await captureAtBoth(page, '03-desktop-application-requested.png', '03-mobile-application-requested.png', '상대팀 신청 및 승인 대기', 'away');
    await context.close();
  }
  {
    const { context, page } = await newPage(browser, host);
    await ready(page, `/team-matches/${state.teamMatchId}`, state.awayTeam.name);
    await captureAtBoth(page, '04-desktop-host-application-review.png', '04-mobile-host-application-review.png', '호스트 신청팀 확인', 'host');
    await context.close();
  }

  await approveAndSetAttendance(host, away, state, applicationId);
  {
    const { context, page } = await newPage(browser, host);
    await ready(page, `/team-matches/${state.teamMatchId}`, '참석명단 관리');
    await captureAtBoth(page, '05-desktop-matched-detail.png', '05-mobile-matched-detail.png', '매칭 완료 및 참석명단 진입', 'host');
    await context.close();
  }

  state.hostRosterCount = await rosterJourney(browser, host, state, 'host', '06-host-roster');
  state.awayRosterCount = await rosterJourney(browser, away, state, 'away', '07-away-roster');

  const [hostLineup, awayLineup, detail] = await Promise.all([
    api(host, `/team-matches/${state.teamMatchId}/lineup`),
    api(away, `/team-matches/${state.teamMatchId}/lineup`),
    api(host, `/team-matches/${state.teamMatchId}`),
  ]);
  state.hostLineupState = hostLineup.state;
  state.awayLineupState = awayLineup.state;
  state.matchStatus = detail.status;
} finally {
  await browser.close();
}

const summary = {
  teamMatchId: state.teamMatchId,
  title: state.title,
  startsAt: state.startsAt,
  hostTeam: state.hostTeam.name,
  awayTeam: state.awayTeam.name,
  hostRosterCount: state.hostRosterCount,
  awayRosterCount: state.awayRosterCount,
  hostLineupState: state.hostLineupState,
  awayLineupState: state.awayLineupState,
  matchStatus: state.matchStatus,
  screenshotCount: manifest.length,
  runtimeIssueCount: runtimeIssues.length,
  screenshots: manifest,
  runtimeIssues,
};
writeFileSync(`${OUT}/qa-summary.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...summary, screenshots: undefined, runtimeIssues: undefined }, null, 2));
if (runtimeIssues.length) process.exitCode = 1;
