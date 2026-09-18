import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
});
