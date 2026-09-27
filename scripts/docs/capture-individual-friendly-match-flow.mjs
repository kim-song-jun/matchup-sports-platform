import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const WEB_BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3013';
const API_BASE = process.env.CAPTURE_API_URL ?? 'http://localhost:8121/api/v1';
const OUT = process.env.CAPTURE_OUT_DIR ?? 'docs/visual-qa/individual-friendly-match-lifecycle-20260918';
const HOST = 'host@teameet.v1';
const APPLICANT = 'applicant@teameet.v1';
const OWNER = 'owner@teameet.v1';
const ADMIN = 'admin@teameet.v1';
const PRIMARY = '00000000-0000-4000-8000-000000000201';
const REQUESTED = '00000000-0000-4000-8000-000000000207';
const APPROVED = '00000000-0000-4000-8000-000000000208';
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const manifest = [];
const runtimeIssues = [];

async function api(path, { method = 'GET', email, data } = {}) {
  const response = await fetch(API_BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(email ? { 'x-v1-user-email': email } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 1000)}`);
  const body = text ? JSON.parse(text) : null;
  return body?.data ?? body;
}

async function createFutureMatch() {
  const [sportsResult, regionsResult] = await Promise.all([
    api('/master/sports'),
    api('/master/regions'),
  ]);
  const sports = sportsResult.sports ?? sportsResult;
  const regionGroups = regionsResult.regions ?? regionsResult;
  const sport = sports.find((item) => item.code === 'running') ?? sports[0];
  const region = regionGroups.flatMap((item) => item.children ?? [item]).find((item) => item.id);
  const startsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  startsAt.setHours(19, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const deadlineAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  return api('/matches', {
    method: 'POST',
    email: HOST,
    data: {
      sportId: sport.id,
      regionId: region.id,
      title: '개인 친선매치 전체 플로우 QA',
      description: '모집 마감, 재개, 취소 버튼과 상세 이동을 실제 API로 확인하는 QA 매치입니다.',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      capacity: 8,
      manualPlaceName: '한강공원 러닝 코스',
      addressText: '서울특별시 영등포구 여의동로 330',
      rulesText: '서로 배려하며 정시에 시작해요.',
      minLevelCode: 'beginner',
      maxLevelCode: 'intermediate',
      genderRule: '성별 무관',
    },
  });
}

async function contextFor(browser, viewport, email) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    extraHTTPHeaders: { 'x-v1-user-email': email },
  });
  await context.addInitScript((actor) => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', actor);
  }, email);
  return context;
}

async function openState(browser, viewport, state) {
  const context = await contextFor(browser, viewport, state.email);
  const page = await context.newPage();
  const localIssues = [];
  page.on('pageerror', (error) => localIssues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') localIssues.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) localIssues.push(`http ${response.status()}: ${response.url()}`);
  });
  const response = await page.goto(WEB_BASE + state.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1800);
  if (!response || response.status() >= 400) throw new Error(`${state.path} returned ${response?.status()}`);
  const from = new URL(page.url()).pathname + new URL(page.url()).search;
  if (state.action) await state.action(page);
  await page.waitForTimeout(700);
  const to = new URL(page.url()).pathname + new URL(page.url()).search;
  const dir = `${OUT}/${viewport.name}`;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${state.slug}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const row = {
    order: state.order,
    slug: state.slug,
    title: state.title,
    viewport: viewport.name,
    actor: state.email,
    from,
    to,
    action: state.actionLabel ?? null,
    file,
    issues: localIssues,
  };
  manifest.push(row);
  runtimeIssues.push(...localIssues.map((issue) => ({ slug: state.slug, viewport: viewport.name, issue })));
  console.log(`${viewport.name.padEnd(7)} ${state.slug.padEnd(34)} ${to}`);
  await context.close();
}

async function captureStates(browser, states) {
  for (const state of states) {
    for (const viewport of VIEWPORTS) {
      await openState(browser, viewport, state);
    }
  }
}

async function clickLast(page, role, name) {
  const locator = page.getByRole(role, { name }).last();
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  await locator.click();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const actionMatch = await createFutureMatch();
  const actionId = actionMatch.matchId;
  const browser = await chromium.launch({ headless: false });
  try {
    await captureStates(browser, [
      { order: 1, slug: '01-match-list', title: '개인매치 목록', path: '/matches', email: APPLICANT },
      { order: 2, slug: '02-create-sport', title: '매치 만들기 · 종목', path: '/matches/new/sport', email: HOST },
      { order: 3, slug: '03-create-info', title: '매치 만들기 · 기본 정보', path: '/matches/new', email: HOST },
      { order: 4, slug: '04-create-place-time', title: '매치 만들기 · 장소와 시간', path: '/matches/new/place-time', email: HOST },
      { order: 5, slug: '05-create-confirm', title: '매치 만들기 · 최종 확인', path: '/matches/new/confirm', email: HOST },
      { order: 6, slug: '06-guest-detail', title: '신청 전 매치 상세', path: `/matches/${actionId}`, email: APPLICANT },
      {
        order: 7,
        slug: '07-apply-dialog',
        title: '참가 신청 메시지',
        path: `/matches/${actionId}`,
        email: APPLICANT,
        actionLabel: '참가 신청 클릭',
        action: async (page) => clickLast(page, 'button', '참가 신청'),
      },
      { order: 8, slug: '08-pending-detail', title: '승인 대기 상세', path: `/matches/${REQUESTED}`, email: HOST },
      { order: 9, slug: '09-host-applications', title: '호스트 참가자 관리', path: `/matches/${PRIMARY}/applications`, email: HOST },
      {
        order: 10,
        slug: '10-approval-confirm',
        title: '참가 신청 승인 확인',
        path: `/matches/${PRIMARY}/applications`,
        email: HOST,
        actionLabel: '승인 클릭',
        action: async (page) => clickLast(page, 'button', '승인'),
      },
      { order: 11, slug: '11-approved-participant', title: '승인된 참가자 상세', path: `/matches/${APPROVED}`, email: HOST },
      {
        order: 12,
        slug: '12-approved-chat',
        title: '승인 후 매치 채팅',
        path: `/matches/${APPROVED}`,
        email: HOST,
        actionLabel: '채팅 클릭',
        action: async (page) => {
          await clickLast(page, 'button', '채팅');
          await page.waitForURL('**/chat/**', { timeout: 15_000 });
          await page.waitForTimeout(1200);
        },
      },
      { order: 13, slug: '13-host-edit', title: '호스트 매치 수정', path: `/matches/${actionId}/edit`, email: HOST },
      {
        order: 14,
        slug: '14-close-confirm',
        title: '모집 마감 확인',
        path: `/matches/${actionId}/edit`,
        email: HOST,
        actionLabel: '모집 마감 클릭',
        action: async (page) => clickLast(page, 'button', '모집 마감'),
      },
    ]);

    await api(`/matches/${actionId}/close`, { method: 'POST', email: HOST, data: { reason: 'visual_qa_close' } });
    await captureStates(browser, [
      { order: 15, slug: '15-closed-detail', title: '모집 마감 상세', path: `/matches/${actionId}`, email: HOST },
      { order: 16, slug: '16-reopen-control', title: '모집 다시 열기', path: `/matches/${actionId}/edit`, email: HOST },
    ]);
    await api(`/matches/${actionId}/reopen`, { method: 'POST', email: HOST, data: { reason: 'visual_qa_reopen' } });
    await captureStates(browser, [
      {
        order: 17,
        slug: '17-cancel-confirm',
        title: '매치 취소 확인',
        path: `/matches/${actionId}/edit`,
        email: HOST,
        actionLabel: '매치 취소 클릭',
        action: async (page) => clickLast(page, 'button', '매치 취소'),
      },
    ]);
    await api(`/matches/${actionId}/cancel`, { method: 'POST', email: HOST, data: { reason: 'visual_qa_cancel' } });
    await captureStates(browser, [
      { order: 18, slug: '18-cancelled-detail', title: '취소된 매치 상세', path: `/matches/${actionId}`, email: HOST },
      { order: 19, slug: '19-attendance', title: '경기 후 참여 여부 기록', path: `/matches/${APPROVED}/applications`, email: OWNER },
      {
        order: 20,
        slug: '20-complete-confirm',
        title: '경기 완료 확인',
        path: `/matches/${APPROVED}/applications`,
        email: OWNER,
        actionLabel: '참여 여부 확인하고 경기 완료 클릭',
        action: async (page) => clickLast(page, 'button', '참여 여부 확인하고 경기 완료'),
      },
    ]);

    const applications = await api(`/matches/${APPROVED}/applications`, { email: OWNER });
    const active = (applications.items ?? []).filter((item) => item.participantStatus === 'active' && item.participantId);
    await api(`/matches/${APPROVED}/complete`, {
      method: 'POST',
      email: OWNER,
      data: {
        participants: active.map((item) => ({ participantId: item.participantId, status: 'completed' })),
        reason: 'visual_qa_match_completed',
      },
    });

    await captureStates(browser, [
      { order: 21, slug: '21-completed-host-detail', title: '완료된 매치 · 호스트', path: `/matches/${APPROVED}`, email: OWNER },
      { order: 22, slug: '22-completed-participant-detail', title: '완료된 매치 · 참가자', path: `/matches/${APPROVED}`, email: HOST },
      { order: 23, slug: '23-my-joined-matches', title: '내 신청·참여 매치', path: '/my/matches/joined', email: HOST },
      { order: 24, slug: '24-my-created-matches', title: '내가 만든 매치', path: '/my/matches/created', email: OWNER },
      { order: 25, slug: '25-review-compose', title: '참여 후 리뷰 작성', path: `/my/reviews/match/${APPROVED}`, email: HOST },
      { order: 26, slug: '26-admin-match-list', title: '관리자 개인매치 목록', path: '/admin/matches', email: ADMIN },
      { order: 27, slug: '27-admin-match-detail', title: '관리자 개인매치 상세', path: `/admin/matches/${APPROVED}`, email: ADMIN },
    ]);
  } finally {
    await browser.close();
  }

  manifest.sort((a, b) => a.order - b.order || VIEWPORTS.findIndex((v) => v.name === a.viewport) - VIEWPORTS.findIndex((v) => v.name === b.viewport));
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    webBase: WEB_BASE,
    apiBase: API_BASE,
    screenshotCount: manifest.length,
    viewports: VIEWPORTS,
    states: [...new Map(manifest.map((item) => [item.slug, item.title])).entries()].map(([slug, title]) => ({ slug, title })),
    runtimeIssues,
    screenshots: manifest,
  }, null, 2) + '\n');
  console.log(`captured ${manifest.length} screenshots; runtime issues: ${runtimeIssues.length}`);
  if (runtimeIssues.length) process.exitCode = 2;
}

await main();
