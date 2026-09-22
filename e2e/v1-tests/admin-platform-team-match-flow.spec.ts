import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loginAs } from './helpers/auth';
import { apiGet, apiPost, unwrap, type SuccessEnvelope } from './helpers/v1-http';
import { personas } from './personas';

type Sport = { id: string; name: string };
type Region = { id: string; name: string; children?: Region[] };
type ManageableTeam = {
  teamId: string;
  name: string;
  sport: { sportId: string; name: string };
  canManage: boolean;
  canCreateTeamMatch: boolean;
};
type CreatedRecruitment = { teamMatchId: string; status: string };
type TeamMatchList = { items: Array<{ teamMatchId: string; title: string; platformManaged: boolean }> };
type Application = { applicationId: string; status: string; applicantTeamId: string };

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots/task149-admin-team-match-condition-parity');

function screenshotPath(viewport: string, state: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, `${viewport}-${state}.png`);
}

function futureIso(days: number, hour: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

test.describe('[admin → team manager] 플랫폼 팀매치 실제 모집·신청 플로우', () => {
  test('관리자 모집이 공개 목록에 나오고 팀 관리자가 실제 신청하면 관리자에게 접수된다', async ({ page }) => {
    // owner seed 팀은 러닝 종목이고 활성 경기 설정이 없어 서버가 모집 생성을 거부한다.
    // 풋살 활성 경기 설정과 팀 관리 권한을 모두 가진 host persona로 실제 신청 계약을 검증한다.
    const ownerEmail = personas.host.email;
    const adminEmail = personas.admin.email;
    const teamsResult = await apiGet(page.request, '/api/v1/me/teams', {
      email: ownerEmail,
      params: { permission: 'manage_team' },
    });
    expect(teamsResult.status).toBe(200);
    const teams = unwrap<{ items: ManageableTeam[] }>(teamsResult).items;
    const applicantTeam = teams.find((team) => team.canManage && team.canCreateTeamMatch);
    expect(applicantTeam, '신청 가능한 실제 seed 팀이 필요합니다.').toBeTruthy();

    const [sportsResult, regionsResult] = await Promise.all([
      apiGet(page.request, '/api/v1/master/sports', { email: adminEmail }),
      apiGet(page.request, '/api/v1/master/regions', { email: adminEmail }),
    ]);
    expect(sportsResult.status).toBe(200);
    expect(regionsResult.status).toBe(200);
    const sports = unwrap<{ sports: Sport[] }>(sportsResult).sports;
    const regions = unwrap<{ regions: Region[] }>(regionsResult).regions;
    const sport = sports.find((item) => item.id === applicantTeam!.sport.sportId);
    const district = regions.flatMap((region) => region.children ?? []).find(Boolean);
    expect(sport, '신청 팀과 같은 활성 종목이 필요합니다.').toBeTruthy();
    expect(district, '2단계 활성 지역이 필요합니다.').toBeTruthy();

    const title = `실제 신청 검증 ${Date.now()}`;
    const commandId = randomUUID();
    const createResult = await apiPost(page.request, '/api/v1/admin/team-matches', {
      email: adminEmail,
      data: {
        clientCommandId: commandId,
        sportId: sport!.id,
        regionId: district!.id,
        title,
        description: '관리자가 열고 팀 운영진이 신청하는 실제 API·DB 흐름을 검증합니다.',
        startsAt: futureIso(14, 10),
        endsAt: futureIso(14, 12),
        deadlineAt: futureIso(10, 10),
        manualPlaceName: 'Teameet 실전 검증 구장',
        addressText: '서울특별시 QA로 149',
        costNote: '참가비 없음',
        rulesText: '안전 수칙 준수 · 친선 경기',
      },
    });
    expect(createResult.status).toBe(201);
    const created = unwrap<CreatedRecruitment>(createResult);
    expect(created.status).toBe('recruiting');

    const listResult = await apiGet(page.request, '/api/v1/team-matches', {
      email: ownerEmail,
      params: { query: title, limit: '20' },
    });
    expect(listResult.status).toBe(200);
    const listed = unwrap<TeamMatchList>(listResult).items.find((item) => item.teamMatchId === created.teamMatchId);
    expect(listed).toMatchObject({ title, platformManaged: true });

    await loginAs(page, ownerEmail);
    await page.goto(`/team-matches?q=${encodeURIComponent(title)}`, { waitUntil: 'domcontentloaded' });
    const card = page.locator(`a[href="/team-matches/${created.teamMatchId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(title);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/team-matches/${created.teamMatchId}$`));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Teameet 운영', { exact: true }).first()).toBeVisible();

    const applyButton = page.getByRole('button', { name: `${applicantTeam!.name}으로 신청`, exact: true }).first();
    await expect(applyButton).toBeVisible();
    const applyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/team-matches/${created.teamMatchId}/applications`) &&
        response.request().method() === 'POST',
    );
    await applyButton.click();
    const applyResponse = await applyResponsePromise;
    expect(applyResponse.status()).toBe(201);
    const applyBody = (await applyResponse.json()) as SuccessEnvelope<Application>;
    expect(applyBody.data).toMatchObject({ status: 'requested', applicantTeamId: applicantTeam!.teamId });
    await expect(page.getByText('신청을 접수했어요', { exact: true })).toBeVisible();

    await loginAs(page, adminEmail);
    await page.goto(`/admin/team-matches/${created.teamMatchId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '팀매치 상세' })).toBeVisible();
    const applications = page.getByRole('region', { name: '참가팀 신청' });
    await expect(applications).toContainText(applicantTeam!.name);
    await expect(applications).toContainText('1건');
    await expect(applications).toContainText('신청');
  });
  test('관리자 모집 폼이 일반 팀매치 조건을 같은 입력 구조로 제공한다', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedApiRequests: string[] = [];
    const projectName = testInfo.project.name;
    const capture = async (state: 'empty' | 'filled') => {
      if (projectName === 'desktop') {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({ path: screenshotPath('desktop', `form-${state}`), fullPage: true });
        await page.setViewportSize({ width: 834, height: 1112 });
        await page.screenshot({ path: screenshotPath('tablet', `form-${state}`), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 900 });
      } else {
        await page.screenshot({ path: screenshotPath('mobile', `form-${state}`), fullPage: true });
      }
    };
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      if (request.url().includes('/api/')) failedApiRequests.push(`${request.method()} ${request.url()}`);
    });
    await page.route('**/api/v1/uploads', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        json: { status: 'success', data: { urls: ['/mock/generated/futsal-rooftop.webp'] }, timestamp: new Date().toISOString() },
      });
    });

    await loginAs(page, personas.admin.email);
    await page.goto('/admin/team-matches/new', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: '팀매치 모집 만들기' })).toBeVisible();

    await expect(page.getByLabel('대표 이미지')).toHaveAttribute('type', 'file');
    await expect(page.getByLabel('실력등급')).toBeVisible();
    await expect(page.getByLabel('경기방식')).toBeVisible();
    await expect(page.getByLabel('유니폼 색상')).toBeVisible();
    await expect(page.getByLabel('성별 조건')).toBeVisible();
    await expect(page.getByLabel('총비용')).toBeVisible();
    await expect(page.getByLabel('상대팀 부담금')).toBeVisible();
    await expect(page.getByText('비워두면 경기 시작 전까지 신청을 받아요.')).toBeVisible();
    await capture('empty');

    await expect.poll(() => page.getByLabel('종목').locator('option').count()).toBeGreaterThan(1);
    await expect.poll(() => page.getByLabel('지역').locator('option').count()).toBeGreaterThan(1);
    await page.getByLabel('종목').selectOption({ index: 1 });
    await page.getByLabel('지역').selectOption({ index: 1 });
    await page.getByLabel('매치 제목').fill('관리자 조건 동등성 검증');
    await page.getByLabel('모집 안내 (선택)').fill('일반 팀매치와 같은 조건으로 두 참가팀을 모집합니다.');
    await page.getByLabel('대표 이미지').setInputFiles(path.resolve(process.cwd(), 'apps/v1_web/public/mock/generated/futsal-rooftop.webp'));
    await expect(page.getByRole('img', { name: '대표 이미지 미리보기' })).toBeVisible();
    await page.getByLabel('실력등급').selectOption('intermediate');
    await page.getByLabel('경기방식').fill('5:5');
    await page.getByLabel('유니폼 색상').fill('파랑');
    await page.getByLabel('총비용').fill('90000');
    await page.getByLabel('상대팀 부담금').fill('30000');
    await page.getByLabel('친선').check();
    await page.getByLabel('매너 중시').check();
    await page.getByLabel('경기 장소').fill('Teameet 검증 구장');
    await page.getByLabel('상세 주소 (선택)').fill('서울특별시 송파구 올림픽로 25');
    const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const deadline = new Date(start.getTime() - 4 * 24 * 60 * 60 * 1000);
    const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel('경기 시작').fill(localDateTime(start));
    await page.getByLabel('경기 종료 (선택)').fill(localDateTime(end));
    await page.getByLabel('신청 마감').fill(localDateTime(deadline));
    await expect(page.getByRole('button', { name: '팀 신청 모집 시작하기' })).toBeEnabled();
    await capture('filled');

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(failedApiRequests).toEqual([]);
  });

  test('관리자 상세에서 저장된 전체 경기 조건을 확인한다', async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    await page.route('**/api/v1/admin/team-matches/visual-condition-parity', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          status: 'success',
          timestamp: new Date().toISOString(),
          data: {
            teamMatchId: 'visual-condition-parity',
            title: '잠실 주말 친선전',
            hostTeamId: null,
            hostTeamName: null,
            league: null,
            tournament: null,
            sportName: '풋살',
            sportCode: 'futsal',
            startAt: '2026-10-10T10:00:00.000Z',
            endAt: '2026-10-10T12:00:00.000Z',
            deadlineAt: '2026-10-06T10:00:00.000Z',
            status: 'recruiting',
            createdAt: '2026-09-21T00:00:00.000Z',
            description: '일반 팀매치와 같은 조건으로 참가할 두 팀을 모집합니다.',
            imageUrl: '/mock/generated/futsal-rooftop.webp',
            levelLabel: '중급',
            regionName: '서울 송파구',
            placeName: 'Teameet 검증 구장',
            placeAddress: '서울특별시 송파구 올림픽로 25',
            approvedApplicantTeamId: null,
            approvedApplicantTeamName: null,
            createdByUserId: 'admin-user',
            createdByName: '운영자',
            hasGame: false,
            matchFormat: '5:5',
            formatNote: null,
            matchStyle: ['친선', '매너 중시'],
            genderRule: '성별 무관',
            uniformColor: '파랑',
            costNote: '총 90,000원 · 상대팀 30,000원',
            applicationCount: 0,
            applications: [],
          },
        },
      });
    });

    await loginAs(page, personas.admin.email);
    await page.goto('/admin/team-matches/visual-condition-parity', { waitUntil: 'networkidle' });
    const conditions = page.getByRole('region', { name: '경기 조건' });
    await expect(conditions).toContainText('중급');
    await expect(conditions).toContainText('5:5');
    await expect(conditions).toContainText('총 90,000원 · 상대팀 30,000원');
    await expect(page.getByRole('img', { name: '잠실 주말 친선전 대표 이미지' })).toBeVisible();

    if (projectName === 'desktop') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: screenshotPath('desktop', 'detail'), fullPage: true });
      await page.setViewportSize({ width: 834, height: 1112 });
      await page.screenshot({ path: screenshotPath('tablet', 'detail'), fullPage: true });
    } else {
      await page.screenshot({ path: screenshotPath('mobile', 'detail'), fullPage: true });
    }

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
  test('팀 배정 뒤에도 공개 목록에 플랫폼 주관 출처와 실제 양 팀을 표시한다', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));

    const items = [
      {
        id: 'platform-open',
        teamMatchId: 'platform-open',
        title: 'Teameet 주말 풋살 모집',
        descriptionPreview: '플랫폼이 두 팀의 신청을 받아 연결하는 팀매치입니다.',
        imageUrl: '/mock/generated/futsal-rooftop.webp',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        levelLabel: '중급',
        regionName: '서울 송파구',
        region: { regionId: 'region-songpa', name: '서울 송파구' },
        placeName: '잠실 풋살장',
        place: { name: '잠실 풋살장', addressText: '서울 송파구 올림픽로' },
        startsAt: '2026-10-10T10:00:00.000Z',
        deadlineAt: '2026-10-06T10:00:00.000Z',
        capacityText: '상대 0/2팀',
        status: 'recruiting',
        displayState: 'recruiting',
        platformManaged: true,
        hostTeam: null,
        approvedOpponentTeam: null,
        costNote: '총 90,000원 · 상대팀 30,000원',
        matchFormat: '5:5',
        matchStyle: ['친선', '매너 중시'],
        uniformColor: '파랑',
        genderRule: '성별 무관',
        viewerState: 'none',
      },
      {
        id: 'platform-assigned',
        teamMatchId: 'platform-assigned',
        title: 'Teameet 배정 완료 팀매치',
        descriptionPreview: '두 팀 배정 후에도 플랫폼 주관 출처가 유지됩니다.',
        imageUrl: '/mock/generated/team-huddle.webp',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        levelLabel: '중급',
        regionName: '서울 마포구',
        region: { regionId: 'region-mapo', name: '서울 마포구' },
        placeName: '마포 풋살파크',
        place: { name: '마포 풋살파크', addressText: '서울 마포구 월드컵로' },
        startsAt: '2026-10-11T10:00:00.000Z',
        deadlineAt: '2026-10-07T10:00:00.000Z',
        capacityText: '2/2팀',
        status: 'matched',
        displayState: 'matched',
        platformManaged: true,
        hostTeam: { teamId: 'team-home', name: '홈 유나이티드', logoUrl: null, trustState: 'none', mannerScore: null, wins: 0 },
        approvedOpponentTeam: { teamId: 'team-away', name: '어웨이 FC' },
        costNote: '총 120,000원 · 상대팀 60,000원',
        matchFormat: '5:5',
        matchStyle: ['친선'],
        uniformColor: '검정',
        genderRule: '성별 무관',
        viewerState: 'none',
      },
    ];

    await page.route('**/api/v1/team-matches**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          status: 'success',
          data: { items, pageInfo: { nextCursor: null, hasNext: false } },
          timestamp: new Date().toISOString(),
        },
      });
    });

    await loginAs(page, personas.admin.email);
    await page.goto('/team-matches', { waitUntil: 'networkidle' });
    const interceptedPayload = await page.evaluate(async () => (await fetch('/api/v1/team-matches')).json());
    expect(interceptedPayload.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ teamMatchId: 'platform-open', platformManaged: true })]));

    const openCard = page.locator('a[href="/team-matches/platform-open"]');
    const assignedCard = page.locator('a[href="/team-matches/platform-assigned"]');
    await expect(openCard).toContainText('플랫폼 주관');
    await expect(openCard).toContainText('Teameet 운영');
    await expect(openCard).toContainText('상대 모집 중');
    await expect(assignedCard).toContainText('플랫폼 주관');
    await expect(assignedCard).toContainText('홈 유나이티드 vs 어웨이 FC');
    await expect(assignedCard).toContainText('신청 마감');

    if (testInfo.project.name === 'desktop') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: screenshotPath('desktop', 'public-list-provenance'), fullPage: true });
      await page.setViewportSize({ width: 834, height: 1112 });
      await page.screenshot({ path: screenshotPath('tablet', 'public-list-provenance'), fullPage: true });
    } else {
      await page.screenshot({ path: screenshotPath('mobile', 'public-list-provenance'), fullPage: true });
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
  test('팀 배정 완료 공개 목록에서 실제 상세로 진입해 플랫폼 주관과 양 팀 조건을 표시한다', async ({ page }, testInfo) => {
    const adminEmail = personas.admin.email;
    const homeOwnerEmail = personas.host.email;
    const awayOwnerEmail = personas.owner.email;
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));

    const [homeTeamsResult, sportsResult, regionsResult] = await Promise.all([
      apiGet(page.request, '/api/v1/me/teams', { email: homeOwnerEmail, params: { permission: 'manage_team' } }),
      apiGet(page.request, '/api/v1/master/sports', { email: adminEmail }),
      apiGet(page.request, '/api/v1/master/regions', { email: adminEmail }),
    ]);
    expect(homeTeamsResult.status).toBe(200);
    expect(sportsResult.status).toBe(200);
    expect(regionsResult.status).toBe(200);

    const homeTeam = unwrap<{ items: ManageableTeam[] }>(homeTeamsResult).items.find(
      (team) => team.canManage && team.canCreateTeamMatch,
    );
    expect(homeTeam, '홈팀으로 배정할 실제 seed 팀이 필요합니다.').toBeTruthy();

    const sports = unwrap<{ sports: Sport[] }>(sportsResult).sports;
    const regions = unwrap<{ regions: Region[] }>(regionsResult).regions;
    const sport = sports.find((item) => item.id === homeTeam!.sport.sportId);
    const district = regions.flatMap((region) => region.children ?? []).find(Boolean);
    expect(sport).toBeTruthy();
    expect(district).toBeTruthy();

    const projectOffset = testInfo.project.name === 'desktop' ? 1 : 0;
    const title = `플랫폼 배정 완료 상세 ${testInfo.project.name} ${Date.now()}`;
    const awayTeamName = `상세 검증 원정팀 ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;
    const awayTeamResult = await apiPost(page.request, '/api/v1/teams', {
      email: awayOwnerEmail,
      data: {
        sportId: sport!.id,
        regionId: district!.id,
        name: awayTeamName,
        introduction: '플랫폼 배정 완료 공개 상세 캡처용 원정팀입니다.',
        activityTypes: ['team_match'],
        genderRule: '성별 무관',
        joinPolicy: 'approval_required',
      },
    });
    expect(awayTeamResult.status).toBe(201);
    const awayTeamId = unwrap<{ teamId: string }>(awayTeamResult).teamId;
    const awayTeam = { teamId: awayTeamId, name: awayTeamName };

    const createCommandId = randomUUID();
    const createResult = await apiPost(page.request, '/api/v1/admin/team-matches', {
      email: adminEmail,
      data: {
        clientCommandId: createCommandId,
        sportId: sport!.id,
        regionId: district!.id,
        title,
        description: '관리자가 두 팀을 배정한 뒤에도 공개 상세에서 플랫폼 주관 출처와 실제 경기 조건을 확인합니다.',
        startsAt: futureIso(21 + projectOffset, 10),
        endsAt: futureIso(21 + projectOffset, 12),
        deadlineAt: futureIso(15 + projectOffset, 10),
        manualPlaceName: '마포 풋살파크',
        addressText: '서울 마포구 월드컵로',
        costNote: '총 120,000원 · 상대팀 60,000원',
        rulesText: '친선 경기 · 페어플레이 준수',
        matchFormat: '5:5',
        matchStyle: ['친선'],
        uniformColor: '검정',
        genderRule: '성별 무관',
      },
    });
    expect(createResult.status).toBe(201);
    const created = unwrap<CreatedRecruitment>(createResult);

    const [homeApplicationResult, awayApplicationResult] = await Promise.all([
      apiPost(page.request, `/api/v1/team-matches/${created.teamMatchId}/applications`, {
        email: homeOwnerEmail,
        data: { applicantTeamId: homeTeam!.teamId, message: '홈팀 배정을 신청합니다.' },
      }),
      apiPost(page.request, `/api/v1/team-matches/${created.teamMatchId}/applications`, {
        email: awayOwnerEmail,
        data: { applicantTeamId: awayTeam!.teamId, message: '원정팀 배정을 신청합니다.' },
      }),
    ]);
    expect(homeApplicationResult.status).toBe(201);
    expect(awayApplicationResult.status).toBe(201);
    const homeApplication = unwrap<Application>(homeApplicationResult);
    const awayApplication = unwrap<Application>(awayApplicationResult);

    await loginAs(page, adminEmail);
    await page.goto(`/admin/team-matches/${created.teamMatchId}`, { waitUntil: 'domcontentloaded' });
    const homeApplicationRow = page.getByRole('listitem').filter({ hasText: homeTeam!.name });
    const awayApplicationRow = page.getByRole('listitem').filter({ hasText: awayTeam!.name });
    const firstApprovalResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/v1/admin/team-matches/${created.teamMatchId}/applications/${homeApplication.applicationId}/approve`),
    );
    await homeApplicationRow.getByRole('button', { name: '승인', exact: true }).click();
    expect((await firstApprovalResponse).status()).toBe(201);
    await expect(homeApplicationRow.getByText('승인', { exact: true })).toBeVisible();
    const secondApprovalResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/v1/admin/team-matches/${created.teamMatchId}/applications/${awayApplication.applicationId}/approve`),
    );
    await awayApplicationRow.getByRole('button', { name: '승인하고 매치 확정' }).click();
    expect((await secondApprovalResponse).status()).toBe(201);
    await expect(page.getByRole('status')).toContainText('두 번째 팀을 승인해 매치를 확정했어요.');

    await page.goto(`/team-matches?q=${encodeURIComponent(title)}`, { waitUntil: 'domcontentloaded' });
    const assignedCard = page.locator(`a[href="/team-matches/${created.teamMatchId}"]`);
    await expect(assignedCard).toBeVisible();
    await expect(assignedCard).toContainText('플랫폼 주관');
    await expect(assignedCard).toContainText(homeTeam!.name);
    await expect(assignedCard).toContainText(awayTeam!.name);
    await assignedCard.scrollIntoViewIfNeeded();
    if (testInfo.project.name === 'mobile') {
      const detailHref = await assignedCard.getAttribute('href');
      expect(detailHref).toBe(`/team-matches/${created.teamMatchId}`);
      await page.goto(detailHref!, { waitUntil: 'domcontentloaded' });
    } else {
      await assignedCard.click();
    }

    await expect(page).toHaveURL(new RegExp(`/team-matches/${created.teamMatchId}$`));
    if (testInfo.project.name === 'desktop') {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(page.locator('.tm-host-team-card:visible').getByText('플랫폼 주관', { exact: true })).toBeVisible();
    await expect(page.getByText(homeTeam!.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(awayTeam!.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('120,000', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('60,000', { exact: true }).first()).toBeVisible();

    if (testInfo.project.name === 'desktop') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: screenshotPath('desktop', 'public-detail-provenance'), fullPage: true });
      await page.setViewportSize({ width: 834, height: 1112 });
      await page.screenshot({ path: screenshotPath('tablet', 'public-detail-provenance'), fullPage: true });
    } else {
      await page.screenshot({ path: screenshotPath('mobile', 'public-detail-provenance'), fullPage: true });
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
