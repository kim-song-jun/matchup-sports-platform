/**
 * TEAM-001 owner-centric contracts for team creation and supported surfaces.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { setupAuthState, loginViaApi, gotoWithWarmup } from '../fixtures/auth';
import { createTeamViaApi } from '../fixtures/api-helpers';

const OWNER = TEST_PERSONAS.teamOwner.nickname;

function uniqueTeamName() {
  return `E2E팀-${Date.now()}`;
}

function visibleByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

async function expectActionHidden(container: Locator, name: RegExp) {
  await expect(container.getByRole('button', { name })).toHaveCount(0);
  await expect(container.getByRole('link', { name })).toHaveCount(0);
}

test.describe('TEAM-001 팀 생성과 오너 반영', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, OWNER);
  });

  test('TEAM-001-A /teams/new 필수 필드가 노출된다', async ({ page }) => {
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#team-name:visible').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '풋살' }).first()).toBeVisible();
    await expect(page.locator('#team-city:visible').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '팀 등록하기' }).first()).toBeVisible();
  });

  test('TEAM-001-B 필수값 없이 제출하면 검증 메시지가 보인다', async ({ page }) => {
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '팀 등록하기' }).first().click();
    await expect(page.getByText(/팀명을|종목을|활동 지역을/).first()).toBeVisible({ timeout: 5_000 });
  });

  test('TEAM-001-C 팀 생성 후 목록/상세/내 팀에 반영되고 지원된 owner CTA만 보인다', async ({ page }) => {
    const teamName = uniqueTeamName();

    await gotoWithWarmup(page, '/teams/new', '/teams');
    await page.locator('#team-name:visible').first().fill(teamName);
    await page.getByRole('button', { name: '풋살' }).first().click();
    await page.locator('#team-city:visible').first().selectOption('서울');
    await page.getByRole('button', { name: '팀 등록하기' }).first().click();

    await expect(page).toHaveURL(/\/teams(?:\?|$)/, { timeout: 15_000 });

    const createdTeamLink = page.locator('a[href^="/teams/"]:visible').filter({ hasText: teamName }).first();
    await expect(createdTeamLink).toBeVisible({ timeout: 10_000 });
    await createdTeamLink.click();

    await expect(page).toHaveURL(/\/teams\/[^/]+$/, { timeout: 15_000 });
    const teamId = page.url().split('/').filter(Boolean).at(-1);
    expect(teamId).toBeTruthy();

    await expect(page.getByRole('heading', { name: teamName }).first()).toBeVisible();
    await expect(visibleByTestId(page, 'team-detail-members-link')).toBeVisible();
    await expect(page.getByText('팀 정보 수정')).toHaveCount(0);

    await page.goto('/my/teams');
    await page.waitForLoadState('networkidle');

    const teamCard = visibleByTestId(page, `my-team-card-${teamId}`);
    await expect(teamCard).toBeVisible({ timeout: 10_000 });
    await expect(visibleByTestId(page, `my-team-role-${teamId}`)).toHaveText(/팀장/);
    await expect(visibleByTestId(page, `my-team-detail-${teamId}`)).toBeVisible();
    await expect(visibleByTestId(page, `my-team-members-${teamId}`)).toHaveText('멤버 관리');
    await expectActionHidden(teamCard, /팀 정보 수정|팀 삭제|삭제|수정/);
  });

  test('TEAM-001-D supported surface에서는 unsupported edit/delete affordance가 숨겨진다', async ({ page }) => {
    const tokens = await loginViaApi(OWNER);
    const team = await createTeamViaApi(tokens.accessToken, {
      name: `TEAM-001-D-${Date.now()}`,
      sportType: 'futsal',
      city: '서울',
    });

    await page.goto('/my/teams');
    await page.waitForLoadState('networkidle');

    const teamCard = visibleByTestId(page, `my-team-card-${team.id}`);
    await expect(teamCard).toBeVisible({ timeout: 10_000 });
    await expectActionHidden(teamCard, /팀 정보 수정|팀 삭제|삭제|수정/);

    await teamCard.locator('[data-testid^="my-team-detail-"]:visible').first().click();
    await page.waitForLoadState('networkidle');

    await expect(visibleByTestId(page, 'team-detail-members-link')).toBeVisible();
    await expect(page.getByText('팀 정보 수정')).toHaveCount(0);
  });
});

test.describe('Team match create entry remains available to an owner', () => {
  test.beforeAll(async () => {
    const tokens = await loginViaApi(OWNER);
    await createTeamViaApi(tokens.accessToken, {
      name: `E2E매칭팀${Date.now()}`,
      sportType: 'soccer',
      city: '서울',
    });
  });

  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, OWNER);
  });

  test.fixme('TM-SMOKE-001 /team-matches/new에서 step 0 form이 열린다', async ({ page }) => {
    await page.goto('/team-matches/new');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('label:visible').filter({ hasText: '종목 선택' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '풋살' }).first()).toBeVisible();
  });
});
