/**
 * 친선 팀매치 전체 사용자 흐름 캡처.
 *
 * 실제 API로 모집 -> 신청 -> 승인 -> 라인업 -> 결과 제출 -> 상대 승인까지 진행한 뒤,
 * 각 상태의 v1 화면을 모바일/데스크톱으로 캡처한다. 브라우저는 visual QA 규칙에 맞춰
 * headed 모드로 실행하며, 콘솔 오류와 HTTP 상태를 manifest에 남긴다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const WEB_BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3013';
const API_BASE = process.env.CAPTURE_API_URL ?? 'http://localhost:8121/api/v1';
const OUT = process.env.CAPTURE_OUT_DIR ?? 'docs/screenshots/friendly-team-match-flow';
const HOST_EMAIL = 'host@teameet.v1';
const OPPONENT_EMAIL = 'owner@teameet.v1';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const jsonHeaders = (email, commandId) => ({
  'content-type': 'application/json',
  ...(email ? { 'x-v1-user-email': email } : {}),
  ...(commandId ? { 'idempotency-key': commandId } : {}),
});

async function api(path, { method = 'GET', email, data, commandId } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: jsonHeaders(email, commandId),
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 800)}`);
  }
  return body?.data ?? body;
}

async function createScenario() {
  const [sports, regions, hostTeams] = await Promise.all([
    api('/master/sports'),
    api('/master/regions'),
    api('/me/teams?permission=manage_team', { email: HOST_EMAIL }),
  ]);
  const sport = sports.sports.find((item) => item.code.toLowerCase() === 'futsal');
  const region = regions.regions.flatMap((item) => item.children ?? []).find(Boolean);
  const hostTeam = hostTeams.items.find((item) => item.sport?.sportId === sport?.id);
  if (!sport || !region || !hostTeam) throw new Error('시나리오용 풋살 팀/종목/지역 시드가 부족합니다.');
  const opponentTeam = await api('/teams', {
    method: 'POST',
    email: OPPONENT_EMAIL,
    data: {
      sportId: sport.id,
      regionId: region.id,
      name: `친선 원정팀 ${randomUUID().slice(0, 6)}`,
      introduction: '친선 팀매치 화면 캡처용 원정팀입니다.',
      activityDays: ['fri'],
      activityFrequency: 'weekly_1',
      activityTimeSlots: ['evening'],
      activityTypes: ['friendly_match', 'team_match'],
      minLevelCode: 'beginner',
      maxLevelCode: 'intermediate',
      genderRule: '성별 무관',
      joinPolicy: 'approval_required',
    },
  });

  const startsAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  startsAt.setHours(19, Math.floor(Date.now() / 1000) % 50, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const deadlineAt = new Date(startsAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  const teamMatch = await api('/team-matches', {
    method: 'POST',
    email: HOST_EMAIL,
    data: {
      hostTeamId: hostTeam.teamId,
      sportId: sport.id,
      regionId: region.id,
      title: '금요일 저녁 친선 풋살 팀매치',
      description: '승패보다 매너와 즐거운 경기를 우선하는 친선 팀매치입니다.',
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
      matchStyle: ['친선', '매너 중시'],
      uniformColor: '파랑',
    },
  });
  const application = await api(`/team-matches/${teamMatch.teamMatchId}/applications`, {
    method: 'POST',
    email: OPPONENT_EMAIL,
    data: { applicantTeamId: opponentTeam.teamId, message: '친선 경기 신청합니다.' },
  });
  const members = await api(`/teams/${hostTeam.teamId}/members`, { email: HOST_EMAIL });
  const playerIds = members.items.slice(0, 3).map((item) => item.userId);
  if (playerIds.length < 1) throw new Error('기록에 연결할 실제 팀원이 없습니다.');
  return {
    teamMatchId: teamMatch.teamMatchId,
    applicationId: application.applicationId,
    hostTeamId: hostTeam.teamId,
    opponentTeamId: opponentTeam.teamId,
    sportId: sport.id,
    regionId: region.id,
    playerIds,
    startsAt,
    endsAt,
    deadlineAt,
  };
}

async function approveAndSubmitLineup(state) {
  await api(`/team-match-applications/${state.applicationId}/approve`, { method: 'POST', email: HOST_EMAIL });
  const schedules = await api(`/teams/${state.hostTeamId}/schedules?limit=100`, { email: HOST_EMAIL });
  const schedule = schedules.items.find((item) => item.teamMatchId === state.teamMatchId);
  if (!schedule) throw new Error('승인된 팀매치와 연결된 팀 일정을 찾을 수 없습니다.');
  let scheduleVersion = schedule.version;
  for (const userId of state.playerIds) {
    const attendanceCommand = randomUUID();
    const attendance = await api(`/teams/${state.hostTeamId}/schedules/${schedule.id}/attendance/${userId}`, {
      method: 'PUT',
      email: HOST_EMAIL,
      commandId: attendanceCommand,
      data: { status: 'GOING', expectedVersion: scheduleVersion },
    });
    scheduleVersion = attendance.version;
  }
  const currentLineup = await api(`/team-matches/${state.teamMatchId}/lineup`, { email: HOST_EMAIL });
  const commandId = randomUUID();
  const saved = await api(`/team-matches/${state.teamMatchId}/lineup`, {
    method: 'PUT',
    email: HOST_EMAIL,
    commandId,
    data: {
      expectedVersion: currentLineup.revision,
      starters: [
        ...state.playerIds.map((userId, index) => ({ userId, goalkeeper: index === 0 })),
        { displayName: '친선 게스트', goalkeeper: false },
      ],
      bench: [],
    },
  });
  const submitCommand = randomUUID();
  const submitted = await api(`/team-matches/${state.teamMatchId}/lineup/submit`, {
    method: 'POST',
    email: HOST_EMAIL,
    commandId: submitCommand,
    data: { expectedVersion: saved.revision },
  });
  const lineup = await api(`/team-matches/${state.teamMatchId}/lineup`, { email: HOST_EMAIL });
  return {
    ...state,
    gameId: submitted.gameId,
    homeSideId: submitted.sideId,
    homeParticipants: lineup.starters,
  };
}

async function submitResult(state) {
  const game = await api(`/games/${state.gameId}`, { email: HOST_EMAIL });
  const createCommand = randomUUID();
  const draft = await api(`/games/${state.gameId}/result-revisions`, {
    method: 'POST',
    email: HOST_EMAIL,
    commandId: createCommand,
    data: {
      expectedVersion: game.version,
      clientCommandId: createCommand,
      score: { home: 2, away: 1 },
      actualParticipants: state.homeParticipants.map((participant, index) => ({
        participantId: participant.id,
        sideId: state.homeSideId,
        started: true,
        goals: index === 0 ? 1 : index === 1 ? 1 : 0,
        assists: 0,
        cards: { yellow: index === 2 ? 1 : 0, red: 0 },
        goalkeeper: index === 0,
      })),
      eventsHash: 'friendly-team-match-capture-no-events',
    },
  });
  const latest = await api(`/games/${state.gameId}`, { email: HOST_EMAIL });
  const submitCommand = randomUUID();
  await api(`/games/${state.gameId}/result-revisions/${draft.revisionId}/submit`, {
    method: 'POST',
    email: HOST_EMAIL,
    commandId: submitCommand,
    data: { expectedVersion: latest.version, clientCommandId: submitCommand },
  });
  return { ...state, revisionId: draft.revisionId };
}

async function approveResult(state) {
  const latest = await api(`/games/${state.gameId}`, { email: OPPONENT_EMAIL });
  const commandId = randomUUID();
  await api(`/games/${state.gameId}/result-revisions/${state.revisionId}/decision`, {
    method: 'POST',
    email: OPPONENT_EMAIL,
    commandId,
    data: { expectedVersion: latest.version, clientCommandId: commandId, decision: 'approve' },
  });
}

async function waitForOfficialRecords(state) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const [teamRecords, userRecords] = await Promise.all([
      api(`/teams/${state.hostTeamId}/records`, { email: HOST_EMAIL }),
      api(`/users/${state.playerIds[0]}/records`, { email: HOST_EMAIL }),
    ]);
    const teamProjected = teamRecords.items?.some((item) => item.gameId === state.gameId);
    const userProjected = userRecords.items?.some((item) => item.gameId === state.gameId);
    if (teamProjected && userProjected) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    'Official friendly records were not projected within 30 seconds. Run the v1 game operations worker and enable PUBLIC_LIVE for screenshot QA.',
  );
}

const draftValue = (state) => ({
  title: '금요일 저녁 친선 풋살 팀매치',
  description: '승패보다 매너와 즐거운 경기를 우선하는 친선 팀매치입니다.',
  grade: '초보',
  format: '6:6',
  style: ['친선', '매너 중시'],
  uniform: '파랑',
  opponentTeam: null,
  gender: '성별 무관',
  imageUrl: '',
  cost: 120000,
  opponentCost: 60000,
  venue: '잠실 실내 풋살장 A코트',
  address: '서울 송파구 올림픽로 25',
  date: state.startsAt.toISOString().slice(0, 10),
  startTime: '19:00',
  endTime: '21:00',
  deadlineDate: state.deadlineAt.toISOString().slice(0, 10),
  deadlineTime: '19:00',
});

async function passTermsGate(page) {
  const agreeAll = page.getByText('전체 동의', { exact: false }).first();
  if ((await agreeAll.count()) === 0) return;
  await agreeAll.click();
  const cta = page.getByRole('button', { name: /동의하고 계속|계속|확인|시작/ }).first();
  if ((await cta.count()) > 0) await cta.click();
  await page.waitForTimeout(1200);
}

async function makeContext(browser, viewport, email, state) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ actorEmail, selection, draft }) => {
      localStorage.removeItem('teameet.v1.userId');
      localStorage.setItem('teameet.v1.userEmail', actorEmail);
      const savedAt = Date.now();
      localStorage.setItem('teameet:v1:team-match-selection', JSON.stringify({ savedAt, value: selection }));
      localStorage.setItem('teameet:v1:team-match-draft:v3', JSON.stringify({ savedAt, value: draft }));
    },
    {
      actorEmail: email,
      selection: { teamId: state.hostTeamId, sportId: state.sportId, regionId: state.regionId },
      draft: draftValue(state),
    },
  );
  return context;
}

const manifest = [];

async function capture(browser, route, state) {
  for (const viewport of VIEWPORTS) {
    const context = await makeContext(browser, viewport, route.email ?? HOST_EMAIL, state);
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
    });
    page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 300)));
    const response = await page.goto(`${WEB_BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await passTermsGate(page);
    await page.waitForTimeout(3000);
    if (route.clickFriendlyTab) {
      const filteredResponsePromise = page.waitForResponse(
        (candidate) => candidate.url().includes('/records?') && candidate.url().includes('type=friendly'),
        { timeout: 15_000 },
      );
      const friendlyTab = page.getByRole('tab', { name: '친선', exact: true });
      await friendlyTab.click();
      const filteredResponse = await filteredResponsePromise;
      if (filteredResponse.status() !== 200) {
        throw new Error(`Friendly records request failed: ${filteredResponse.status()}`);
      }
      const envelope = await filteredResponse.json();
      const filtered = envelope.data ?? envelope;
      if (!filtered.items?.length || filtered.items.some((item) => item.type !== 'friendly')) {
        throw new Error('Friendly tab returned an empty or mixed record list.');
      }
      if (!filtered.items.some((item) => item.gameId === state.gameId)) {
        throw new Error(`Friendly tab does not contain the current game: ${state.gameId}`);
      }
      await page.waitForTimeout(500);
      if ((await friendlyTab.getAttribute('aria-selected')) !== 'true') {
        throw new Error('Friendly tab did not become selected.');
      }
    }
    const dir = `${OUT}/${route.slug}`;
    mkdirSync(dir, { recursive: true });
    const file = `${dir}/${viewport.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const row = {
      slug: route.slug,
      title: route.title,
      actor: route.email ?? HOST_EMAIL,
      path: route.path,
      viewport: viewport.name,
      status: response?.status() ?? 0,
      consoleErrors,
      pageErrors,
      file,
    };
    manifest.push(row);
    console.log(`${viewport.name.padEnd(7)} ${String(row.status).padEnd(3)} err=${consoleErrors.length + pageErrors.length} ${route.path}`);
    await context.close();
  }
}

mkdirSync(OUT, { recursive: true });
let state = await createScenario();
const browser = await chromium.launch({ headless: false });
try {
  const creationRoutes = [
    ['create-team', '팀 선택', '/team-matches/new/team'],
    ['create-sport', '종목 확인', '/team-matches/new/sport'],
    ['create-info', '매치 정보 입력', '/team-matches/new/info'],
    ['create-condition', '경기 조건 입력', '/team-matches/new/condition'],
    ['create-place-time', '장소·시간 입력', '/team-matches/new/place-time'],
    ['create-confirm', '입력 내용 확인', '/team-matches/new/confirm'],
  ].map(([slug, title, path]) => ({ slug, title, path }));
  await capture(browser, { slug: 'list', title: '팀매치 탐색', path: '/team-matches' }, state);
  for (const route of creationRoutes) await capture(browser, route, state);
  await capture(browser, { slug: 'host-detail', title: '호스트 상세·신청팀 관리', path: `/team-matches/${state.teamMatchId}` }, state);
  await capture(browser, { slug: 'edit', title: '팀매치 수정', path: `/team-matches/${state.teamMatchId}/edit` }, state);

  state = await approveAndSubmitLineup(state);
  await capture(browser, { slug: 'matched-detail', title: '매칭 완료 상세', path: `/team-matches/${state.teamMatchId}` }, state);
  await capture(browser, { slug: 'lineup', title: '출전 명단', path: `/team-matches/${state.teamMatchId}/lineup` }, state);
  await capture(browser, { slug: 'result-entry', title: '경기 결과 입력', path: `/team-matches/${state.teamMatchId}/result` }, state);

  state = await submitResult(state);
  await capture(browser, {
    slug: 'result-approval',
    title: '상대팀 결과 승인',
    path: `/team-matches/${state.teamMatchId}/result/approval`,
    email: OPPONENT_EMAIL,
  }, state);

  await approveResult(state);
  await waitForOfficialRecords(state);
  await capture(browser, { slug: 'official-result', title: '공식 결과', path: `/team-matches/${state.teamMatchId}/result` }, state);
  await capture(browser, { slug: 'team-records', title: '팀 친선 전적', path: `/teams/${state.hostTeamId}/records` }, state);
  await capture(browser, { slug: 'user-records', title: '사용자 친선 기록', path: `/users/${state.playerIds[0]}/records` }, state);
  await capture(browser, {
    slug: 'team-records-friendly',
    title: '팀 전적 친선 탭',
    path: `/teams/${state.hostTeamId}/records`,
    clickFriendlyTab: true,
  }, state);
  await capture(browser, {
    slug: 'user-records-friendly',
    title: '사용자 기록 친선 탭',
    path: `/users/${state.playerIds[0]}/records`,
    clickFriendlyTab: true,
  }, state);
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const failures = manifest.filter((row) => row.status !== 200 || row.consoleErrors.length || row.pageErrors.length);
console.log(`captured=${manifest.length} failures=${failures.length}`);
for (const row of failures) console.log(`ISSUE ${row.viewport} ${row.path} status=${row.status} console=${row.consoleErrors.length} page=${row.pageErrors.length}`);
if (manifest.some((row) => row.status !== 200 || row.pageErrors.length)) process.exitCode = 1;
