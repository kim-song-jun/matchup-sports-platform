/**
 * TEAM-002/004/005 membership role contracts across owner, manager, and member personas.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { setupAuthState, loginViaApi } from '../fixtures/auth';
import { addTeamMemberViaApi, createTeamViaApi } from '../fixtures/api-helpers';

const OWNER = TEST_PERSONAS.teamOwner.nickname;
const MANAGER = TEST_PERSONAS.teamManager.nickname;
const MEMBER = TEST_PERSONAS.teamMember.nickname;

type SeededTeam = {
  teamId: string;
  ownerUserId: string;
  managerUserId: string;
  memberUserId: string;
};

async function seedMembershipTeam(): Promise<SeededTeam> {
  const ownerTokens = await loginViaApi(OWNER);
  const managerTokens = await loginViaApi(MANAGER);
  const memberTokens = await loginViaApi(MEMBER);

  const ownerUserId = ownerTokens.user?.id;
  const managerUserId = managerTokens.user?.id;
  const memberUserId = memberTokens.user?.id;

  if (
    typeof ownerUserId !== 'string'
    || typeof managerUserId !== 'string'
    || typeof memberUserId !== 'string'
  ) {
    throw new Error('TEAM membership fixture requires persona user ids.');
  }

  const team = await createTeamViaApi(ownerTokens.accessToken, {
    name: `TEAM-E2E-${Date.now()}`,
    sportType: 'futsal',
    city: '서울',
    description: 'Team membership E2E fixture',
  });

  await addTeamMemberViaApi(ownerTokens.accessToken, team.id, managerUserId, 'manager');
  await addTeamMemberViaApi(ownerTokens.accessToken, team.id, memberUserId, 'member');

  return {
    teamId: team.id,
    ownerUserId,
    managerUserId,
    memberUserId,
  };
}

function memberRow(page: Page, userId: string) {
  return page.locator(`[data-testid="team-member-row-${userId}"]:visible`).first();
}

function visibleByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

async function expectActionHidden(container: Locator, name: RegExp) {
  await expect(container.getByRole('button', { name })).toHaveCount(0);
  await expect(container.getByRole('link', { name })).toHaveCount(0);
}

test.describe('TEAM membership role contracts', () => {
  test('TEAM-002-A owner는 멤버 관리 페이지에서 role과 owner 전용 메뉴를 본다', async ({ page }) => {
    const seeded = await seedMembershipTeam();

    await setupAuthState(page, OWNER);
    await page.goto(`/teams/${seeded.teamId}/members`);
    await page.waitForLoadState('networkidle');

    await expect(visibleByTestId(page, 'team-members-heading')).toBeVisible();
    await expect(memberRow(page, seeded.ownerUserId)).toContainText('팀장');
    await expect(memberRow(page, seeded.managerUserId)).toContainText('운영자');
    await expect(memberRow(page, seeded.memberUserId)).toContainText('멤버');

    await expect(page.locator(`[data-testid="team-member-menu-${seeded.ownerUserId}"]:visible`)).toHaveCount(0);
    await expect(visibleByTestId(page, `team-member-menu-${seeded.managerUserId}`)).toBeVisible();
    await expect(visibleByTestId(page, `team-member-menu-${seeded.memberUserId}`)).toBeVisible();
  });

  test('TEAM-002-B manager는 owner 전용 메뉴를 보지 못하고 /my/teams에는 지원된 CTA만 남는다', async ({ page }) => {
    const seeded = await seedMembershipTeam();

    await setupAuthState(page, MANAGER);
    await page.goto(`/teams/${seeded.teamId}/members`);
    await page.waitForLoadState('networkidle');

    await expect(visibleByTestId(page, 'team-members-heading')).toBeVisible();
    await expect(visibleByTestId(page, 'team-member-leave-self')).toBeVisible();
    await expect(page.getByRole('button', { name: /멤버 메뉴/ })).toHaveCount(0);

    await page.goto('/my/teams');
    await page.waitForLoadState('networkidle');

    const teamCard = visibleByTestId(page, `my-team-card-${seeded.teamId}`);
    await expect(teamCard).toBeVisible({ timeout: 10_000 });
    await expect(visibleByTestId(page, `my-team-role-${seeded.teamId}`)).toHaveText(/운영자/);
    await expect(visibleByTestId(page, `my-team-members-${seeded.teamId}`)).toHaveText('멤버 관리');
    await expectActionHidden(teamCard, /팀 정보 수정|팀 삭제|삭제|수정/);
  });

  test('TEAM-002-C member는 읽기/탈퇴 수준 표면만 보고 owner 전용 CTA는 보지 못한다', async ({ page }) => {
    const seeded = await seedMembershipTeam();

    await setupAuthState(page, MEMBER);
    await page.goto(`/teams/${seeded.teamId}/members`);
    await page.waitForLoadState('networkidle');

    await expect(visibleByTestId(page, 'team-members-heading')).toBeVisible();
    await expect(visibleByTestId(page, 'team-member-leave-self')).toBeVisible();
    await expect(page.getByRole('button', { name: /멤버 메뉴/ })).toHaveCount(0);

    await page.goto('/my/teams');
    await page.waitForLoadState('networkidle');

    const teamCard = visibleByTestId(page, `my-team-card-${seeded.teamId}`);
    await expect(teamCard).toBeVisible({ timeout: 10_000 });
    await expect(visibleByTestId(page, `my-team-role-${seeded.teamId}`)).toHaveText(/멤버/);
    await expect(visibleByTestId(page, `my-team-members-${seeded.teamId}`)).toHaveText('멤버 목록');
    await expectActionHidden(teamCard, /팀 정보 수정|팀 삭제|삭제|수정|멤버 관리/);
  });

  test('TEAM-004-A member self-leave 후 /my/teams 에서 팀 카드가 사라진다', async ({ page }) => {
    const seeded = await seedMembershipTeam();

    await setupAuthState(page, MEMBER);
    await page.goto(`/teams/${seeded.teamId}/members`);
    await page.waitForLoadState('networkidle');

    await visibleByTestId(page, 'team-member-leave-self').click();
    await page.getByRole('button', { name: '탈퇴하기' }).click();

    await expect(page).toHaveURL(/\/my\/teams$/, { timeout: 15_000 });
    await expect(page.locator(`[data-testid="my-team-card-${seeded.teamId}"]:visible`)).toHaveCount(0);
  });

  test('TEAM-005-A owner는 manager를 member로 변경하고 결과가 reload 후 유지된다', async ({ page }) => {
    const seeded = await seedMembershipTeam();

    await setupAuthState(page, OWNER);
    await page.goto(`/teams/${seeded.teamId}/members`);
    await page.waitForLoadState('networkidle');

    await visibleByTestId(page, `team-member-menu-${seeded.managerUserId}`).click();
    await visibleByTestId(page, `team-member-set-member-${seeded.managerUserId}`).click();
    await expect(page.getByText('역할이 변경되었어요')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(visibleByTestId(page, `team-member-role-${seeded.managerUserId}`)).toHaveText('멤버');
  });

  test('TEAM-005-B owner는 member를 remove하고 row가 사라진다', async ({ page }) => {
    const seeded = await seedMembershipTeam();

    await setupAuthState(page, OWNER);
    await page.goto(`/teams/${seeded.teamId}/members`);
    await page.waitForLoadState('networkidle');

    await visibleByTestId(page, `team-member-menu-${seeded.memberUserId}`).click();
    await visibleByTestId(page, `team-member-kick-${seeded.memberUserId}`).click();
    await page.getByRole('button', { name: '강퇴하기' }).click();

    await expect(page.locator(`[data-testid="team-member-row-${seeded.memberUserId}"]:visible`)).toHaveCount(0, { timeout: 10_000 });
  });
});
