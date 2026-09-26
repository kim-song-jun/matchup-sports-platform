/**
 * 친선 팀매치 실제 클릭 여정 캡처.
 *
 * 모집/신청/철회/승인/거절/채팅과 기록 행의 상세 이동을 실제 v1 API + headed Chromium으로
 * 검증한다. 각 행은 클릭 전후 URL과 버튼 상태를 manifest에 남긴다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const WEB_BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3013';
const API_BASE = process.env.CAPTURE_API_URL ?? 'http://localhost:8121/api/v1';
const OUT = process.env.CAPTURE_OUT_DIR ?? 'docs/screenshots/friendly-team-match-interactions';
const HOST_EMAIL = 'host@teameet.v1';
const OPPONENT_EMAIL = 'owner@teameet.v1';
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const manifest = [];

async function api(path, { method = 'GET', email, data, commandId } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(email ? { 'x-v1-user-email': email } : {}),
      ...(commandId ? { 'idempotency-key': commandId } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 800)}`);
  const body = text ? JSON.parse(text) : null;
  return body?.data ?? body;
}

async function seedBase() {
  const [sports, regions, hostTeams] = await Promise.all([
    api('/master/sports'),
    api('/master/regions'),
    api('/me/teams?permission=manage_team', { email: HOST_EMAIL }),
  ]);
  const sport = sports.sports.find((item) => item.code.toLowerCase() === 'futsal');
  const region = regions.regions.flatMap((item) => item.children ?? []).find(Boolean);
  const hostTeam = hostTeams.items.find((item) => item.sport?.sportId === sport?.id);
  if (!sport || !region || !hostTeam) throw new Error('QA용 풋살 팀/종목/지역 시드가 부족합니다.');
  const members = await api(`/teams/${hostTeam.teamId}/members`, { email: HOST_EMAIL });
  return { sport, region, hostTeam, userId: members.items[0]?.userId };
}

async function createRecruitingScenario(base, suffix) {
  const opponentTeam = await api('/teams', {
    method: 'POST',
    email: OPPONENT_EMAIL,
    data: {
      sportId: base.sport.id,
      regionId: base.region.id,
      name: `클릭검증 원정팀 ${suffix}-${randomUUID().slice(0, 4)}`,
      introduction: '친선 팀매치 신청·채팅 클릭 검증용 팀입니다.',
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
  const startsAt = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);
  startsAt.setHours(19, Math.floor(Date.now() / 1000) % 50, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const deadlineAt = new Date(startsAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  const match = await api('/team-matches', {
    method: 'POST',
    email: HOST_EMAIL,
    data: {
      hostTeamId: base.hostTeam.teamId,
      sportId: base.sport.id,
      regionId: base.region.id,
      title: `실제 클릭 검증 친선 팀매치 ${suffix}`,
      description: '신청, 승인, 채팅, 상세 이동 버튼을 실제로 검증하는 친선 팀매치입니다.',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      manualPlaceName: '잠실 실내 풋살장 B코트',
      addressText: '서울 송파구 올림픽로 25',
      costNote: '총 100,000원 · 상대팀 50,000원',
      minLevelCode: 'beginner',
      maxLevelCode: 'intermediate',
      genderRule: '성별 무관',
      matchFormat: '6:6',
      matchStyle: ['친선', '매너 중시'],
      uniformColor: '파랑',
    },
  });
  return {
    teamMatchId: match.teamMatchId,
    opponentTeamId: opponentTeam.teamId,
    opponentTeamName: (await api(`/teams/${opponentTeam.teamId}`, { email: OPPONENT_EMAIL })).name,
  };
}

async function makeContext(browser, viewport, email) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript((actorEmail) => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', actorEmail);
  }, email);
  return context;
}

async function ready(page, path) {
  const response = await page.goto(`${WEB_BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
  if (response?.status() !== 200) throw new Error(`${path} returned ${response?.status()}`);
}

async function shot(page, viewport, slug, title, extra = {}) {
  const dir = `${OUT}/${slug}`;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${viewport.name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  manifest.push({ slug, title, viewport: viewport.name, url: page.url(), file, ...extra });
  console.log(`${viewport.name.padEnd(7)} ${slug.padEnd(30)} ${new URL(page.url()).pathname}`);
}

async function waitPath(page, pattern) {
  await page.waitForURL(pattern, { timeout: 15_000 });
  await page.waitForTimeout(1200);
}

async function verifyNavigation(page, locator, expected, label) {
  const from = new URL(page.url()).pathname;
  await locator.click();
  await waitPath(page, expected);
  const to = new URL(page.url()).pathname;
  return { action: label, from, to };
}

async function applicationJourney(browser, viewport, base) {
  const state = await createRecruitingScenario(base, viewport.name);
  const applicantContext = await makeContext(browser, viewport, OPPONENT_EMAIL);
  const applicantPage = await applicantContext.newPage();
  const errors = [];
  applicantPage.on('pageerror', (error) => errors.push(error.message));
  await ready(applicantPage, `/team-matches/${state.teamMatchId}`);
  const applyButton = applicantPage.getByRole('button', { name: `${state.opponentTeamName}으로 신청` }).last();
  if (!(await applyButton.isEnabled())) throw new Error('상대팀 신청 버튼이 활성화되지 않았습니다.');
  await shot(applicantPage, viewport, 'applicant-before-apply', '다른 팀 신청 전 상세', { actor: OPPONENT_EMAIL });
  await applicantPage.evaluate(() => {
    window.__teamMatchShared = false;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => { window.__teamMatchShared = true; },
    });
  });
  await applicantPage.getByRole('button', { name: '공유' }).first().click();
  if (!(await applicantPage.evaluate(() => window.__teamMatchShared === true))) throw new Error('공유 버튼이 navigator.share를 호출하지 않았습니다.');
  await ready(applicantPage, '/team-matches');
  const listCard = applicantPage.locator('a.tm-match-row').first();
  const listCardHref = await listCard.getAttribute('href');
  const listNav = await verifyNavigation(applicantPage, listCard, `**${listCardHref}`, '목록 경기 카드');
  await shot(applicantPage, viewport, 'list-card-detail-click', '목록 경기 카드 클릭 상세', { actor: OPPONENT_EMAIL, ...listNav });
  await ready(applicantPage, `/team-matches/${state.teamMatchId}`);
  await applicantPage.getByRole('button', { name: `${state.opponentTeamName}으로 신청` }).last().click();
  await applicantPage.getByText('신청을 접수했어요').waitFor({ timeout: 15_000 });
  const disabledChat = applicantPage.getByRole('button', { name: '승인 후 채팅' }).last();
  if (!(await disabledChat.isDisabled())) throw new Error('승인 전 채팅 버튼이 잠기지 않았습니다.');
  await shot(applicantPage, viewport, 'applicant-pending', '신청 승인 대기·채팅 잠금', { actor: OPPONENT_EMAIL });

  const hostContext = await makeContext(browser, viewport, HOST_EMAIL);
  const hostPage = await hostContext.newPage();
  await ready(hostPage, `/team-matches/${state.teamMatchId}`);
  await hostPage.getByText(state.opponentTeamName, { exact: true }).waitFor();
  await shot(hostPage, viewport, 'host-application-review', '호스트 신청팀 승인·거절 화면', { actor: HOST_EMAIL });
  const editNav = await verifyNavigation(hostPage, hostPage.getByRole('link', { name: '매치 관리' }).last(), `**/team-matches/${state.teamMatchId}/edit`, '매치 관리');
  await shot(hostPage, viewport, 'host-edit-click', '호스트 매치 관리 클릭', { actor: HOST_EMAIL, ...editNav });
  await ready(hostPage, `/team-matches/${state.teamMatchId}`);
  await hostPage.getByText(state.opponentTeamName, { exact: true }).waitFor();
  const teamLink = hostPage.getByRole('link', { name: `${state.opponentTeamName} 팀 보기` });
  const teamNav = await verifyNavigation(hostPage, teamLink, `**/teams/${state.opponentTeamId}`, '신청팀 팀 보기');
  await shot(hostPage, viewport, 'applicant-team-detail', '신청팀 상세 이동', { actor: HOST_EMAIL, ...teamNav });
  await ready(hostPage, `/team-matches/${state.teamMatchId}`);
  await hostPage.getByRole('button', { name: `${state.opponentTeamName} 승인` }).click();
  await hostPage.getByText('승인된 상대팀').waitFor({ timeout: 15_000 });
  await shot(hostPage, viewport, 'host-approved', '호스트 승인 완료 상세', { actor: HOST_EMAIL });

  const chatNav = await verifyNavigation(hostPage, hostPage.getByRole('button', { name: '채팅' }).last(), '**/chat/**', '승인 후 채팅');
  await hostPage.getByRole('textbox').last().waitFor({ timeout: 15_000 });
  await shot(hostPage, viewport, 'team-match-chat', '승인 후 팀매치 채팅방', { actor: HOST_EMAIL, ...chatNav });
  if (errors.length) throw new Error(`application journey page errors: ${errors.join(' | ')}`);
  await applicantContext.close();
  await hostContext.close();
  return state;
}

async function withdrawJourney(browser, viewport, base) {
  const state = await createRecruitingScenario(base, `withdraw-${viewport.name}`);
  await api(`/team-matches/${state.teamMatchId}/applications`, {
    method: 'POST', email: OPPONENT_EMAIL, data: { applicantTeamId: state.opponentTeamId, message: '신청 취소 검증' },
  });
  const context = await makeContext(browser, viewport, OPPONENT_EMAIL);
  const page = await context.newPage();
  await ready(page, `/team-matches/${state.teamMatchId}`);
  const cancel = page.getByRole('button', { name: `${state.opponentTeamName} 신청 취소` }).last();
  await cancel.click();
  await page.getByRole('button', { name: `${state.opponentTeamName}으로 신청` }).last().waitFor({ timeout: 15_000 });
  await shot(page, viewport, 'application-withdrawn', '다른 팀 신청 취소 후', { actor: OPPONENT_EMAIL, action: '신청 취소' });
  await context.close();
}

async function hostActionsJourney(browser, viewport, base) {
  const state = await createRecruitingScenario(base, `host-actions-${viewport.name}`);
  const context = await makeContext(browser, viewport, HOST_EMAIL);
  const page = await context.newPage();
  await ready(page, `/team-matches/${state.teamMatchId}`);
  await page.getByRole('button', { name: '모집 마감' }).click();
  await page.getByRole('button', { name: '모집 재개' }).waitFor({ timeout: 15_000 });
  await shot(page, viewport, 'host-closed', '호스트 모집 마감 후', { actor: HOST_EMAIL, action: '모집 마감' });
  await page.getByRole('button', { name: '모집 재개' }).click();
  await page.getByRole('button', { name: '팀매치 취소' }).click();
  const dialog = page.getByRole('dialog', { name: '팀매치를 취소할까요?' });
  await dialog.waitFor({ timeout: 15_000 });
  await shot(page, viewport, 'host-cancel-confirm', '상세 팀매치 취소 확인', { actor: HOST_EMAIL, action: '팀매치 취소 확인' });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  if (await dialog.isVisible()) throw new Error('팀매치 취소 확인 모달이 닫히지 않았습니다.');
  await context.close();
}

async function rejectJourney(browser, viewport, base) {
  const state = await createRecruitingScenario(base, `reject-${viewport.name}`);
  await api(`/team-matches/${state.teamMatchId}/applications`, {
    method: 'POST', email: OPPONENT_EMAIL, data: { applicantTeamId: state.opponentTeamId, message: '거절 검증' },
  });
  const context = await makeContext(browser, viewport, HOST_EMAIL);
  const page = await context.newPage();
  await ready(page, `/team-matches/${state.teamMatchId}`);
  const rejectButton = page.getByRole('button', { name: `${state.opponentTeamName} 거절` });
  await rejectButton.click();
  await rejectButton.waitFor({ state: 'detached', timeout: 15_000 });
  await shot(page, viewport, 'application-rejected', '호스트 신청 거절 후', { actor: HOST_EMAIL, action: '신청 거절' });
  await context.close();
}

async function completedRecordJourneys(browser, viewport, base) {
  const teamRecords = await api(`/teams/${base.hostTeam.teamId}/records?type=friendly`, { email: HOST_EMAIL });
  const item = teamRecords.items?.find((record) => record.teamMatchId);
  if (!item?.teamMatchId) throw new Error('상세 이동을 검증할 친선 팀 전적이 없습니다.');
  const context = await makeContext(browser, viewport, HOST_EMAIL);
  const page = await context.newPage();
  await ready(page, `/teams/${base.hostTeam.teamId}/records?type=friendly`);
  await ready(page, `/team-matches/${item.teamMatchId}`);
  const hostTeamLinks = page.locator(`a[href="/teams/${base.hostTeam.teamId}"]`);
  const homeTeamNav = await verifyNavigation(page, viewport.name === 'desktop' ? hostTeamLinks.last() : hostTeamLinks.first(), `**/teams/${base.hostTeam.teamId}`, '홈팀 보기');
  await shot(page, viewport, 'home-team-detail-click', '홈팀 카드 클릭 상세', { actor: HOST_EMAIL, ...homeTeamNav });
  await ready(page, `/team-matches/${item.teamMatchId}`);
  const lineupNav = await verifyNavigation(page, page.getByRole('link', { name: '라인업 관리' }), `**/team-matches/${item.teamMatchId}/lineup`, '라인업 관리');
  await shot(page, viewport, 'completed-lineup-click', '완료 경기 라인업 관리', { actor: HOST_EMAIL, ...lineupNav });
  await ready(page, `/teams/${base.hostTeam.teamId}/records?type=friendly`);
  const teamNav = await verifyNavigation(
    page,
    page.locator(`a[href="/team-matches/${item.teamMatchId}"]:not([data-nav-back])`).first(),
    `**/team-matches/${item.teamMatchId}`,
    '팀 전적 경기 행',
  );
  await shot(page, viewport, 'team-record-detail-click', '팀 전적 경기 클릭 상세', { actor: HOST_EMAIL, ...teamNav });

  await ready(page, `/users/${base.userId}/records?type=friendly`);
  const userLink = page.locator('a[href^="/team-matches/"]:not([data-nav-back])').first();
  const href = await userLink.getAttribute('href');
  if (!href) throw new Error('사용자 친선 기록 상세 링크가 없습니다.');
  const userNav = await verifyNavigation(page, userLink, `**${href}`, '사용자 기록 경기 행');
  await shot(page, viewport, 'user-record-detail-click', '사용자 기록 경기 클릭 상세', { actor: HOST_EMAIL, ...userNav });

  await ready(page, `/team-matches/${item.teamMatchId}`);
  const resultNav = await verifyNavigation(page, page.getByRole('link', { name: '경기 결과 보기' }), `**/team-matches/${item.teamMatchId}/result`, '경기 결과 보기');
  await shot(page, viewport, 'completed-result-click', '완료 경기 결과 보기', { actor: HOST_EMAIL, ...resultNav });
  await ready(page, `/team-matches/${item.teamMatchId}`);
  const reviewNav = await verifyNavigation(page, page.getByRole('link', { name: '후기 남기기' }), `**/my/reviews/team_match/${item.teamMatchId}`, '후기 남기기');
  await shot(page, viewport, 'completed-review-click', '완료 경기 후기 작성', { actor: HOST_EMAIL, ...reviewNav });
  await context.close();
}

mkdirSync(OUT, { recursive: true });
const base = await seedBase();
const browser = await chromium.launch({ headless: false });
console.log('headedChromium=started');
try {
  for (const viewport of VIEWPORTS) {
    await applicationJourney(browser, viewport, base);
    await withdrawJourney(browser, viewport, base);
    await hostActionsJourney(browser, viewport, base);
    await rejectJourney(browser, viewport, base);
    await completedRecordJourneys(browser, viewport, base);
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`captured=${manifest.length} interactions=${new Set(manifest.map((row) => row.slug)).size}`);
