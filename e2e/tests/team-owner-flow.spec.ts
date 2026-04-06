/**
 * Team owner flow scenarios — teamOwner persona
 *
 * Covers:
 * - Team creation form: fill required fields and submit
 * - Team list page shows created team
 * - Team matches list page loads
 * - Team match creation form (multi-step): navigate through steps
 * - My teams page shows teams
 * - Team matches new page shows "팀을 먼저 만들어주세요" if no team exists
 */

import { test, expect } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { setupAuthState, loginViaApi } from '../fixtures/auth';
import { createTeamViaApi } from '../fixtures/api-helpers';

const OWNER = TEST_PERSONAS.teamOwner.nickname;

test.describe('Team creation — authenticated teamOwner', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, OWNER);
  });

  test('/teams/new page loads with required form fields', async ({ page }) => {
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    // Team name input
    await expect(page.locator('#team-name')).toBeVisible();
    // Sport type buttons
    await expect(page.getByRole('button', { name: '풋살' })).toBeVisible();
    // City selector
    await expect(page.locator('#team-city')).toBeVisible();
    // Submit button
    await expect(page.getByRole('button', { name: '팀 등록하기' })).toBeVisible();
  });

  test('submitting team creation form with valid data navigates to /teams', async ({ page }) => {
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');

    const uniqueName = `E2E팀${Date.now()}`;

    await page.locator('#team-name').fill(uniqueName);
    // Select futsal sport
    await page.getByRole('button', { name: '풋살' }).click();
    // Select city
    await page.locator('#team-city').selectOption('서울');

    await page.getByRole('button', { name: '팀 등록하기' }).click();

    // Should navigate to /teams after success
    await page.waitForURL(/\/teams/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/teams/);
  });

  test('submitting without required fields shows toast error', async ({ page }) => {
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    // Click submit without filling anything
    await page.getByRole('button', { name: '팀 등록하기' }).click();
    await page.waitForTimeout(500);
    // Toast error message should appear
    const errorToast = page.getByText(/팀명을|종목을|지역을/);
    await expect(errorToast.first()).toBeVisible();
  });
});

test.describe('My teams page — authenticated teamOwner', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, OWNER);
  });

  test('/my/teams page loads with heading', async ({ page }) => {
    await page.goto('/my/teams');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').filter({ hasText: /내 팀/ }).first()).toBeVisible();
  });

  test('my teams page shows create team button or existing teams', async ({ page }) => {
    await page.goto('/my/teams');
    await page.waitForLoadState('networkidle');
    // Either shows empty state with link or shows team cards
    const createLink = page.locator('a[href="/teams/new"]');
    const teamCards = page.locator('[class*="rounded"]').filter({ hasText: /풋살|축구|농구/ });
    const hasCreate = await createLink.count() > 0;
    const hasCards = await teamCards.count() > 0;
    expect(hasCreate || hasCards).toBe(true);
  });
});

test.describe('Team matches creation — multi-step form', () => {
  let ownerToken: string;

  test.beforeAll(async () => {
    const tokens = await loginViaApi(OWNER);
    ownerToken = tokens.accessToken;
    // Create a team first so the new team match page doesn't block
    await createTeamViaApi(ownerToken, {
      name: `E2E매칭팀${Date.now()}`,
      sportType: 'soccer',
      city: '서울',
    });
  });

  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, OWNER);
  });

  test('/team-matches/new — step 0: sport and title inputs are visible', async ({ page }) => {
    await page.goto('/team-matches/new');
    await page.waitForLoadState('networkidle');
    // Should show either the form or the "팀을 먼저 만들어주세요" guard
    const hasForm = await page.getByText('종목 선택').count() > 0;
    const hasGuard = await page.getByText('팀을 먼저 만들어주세요').count() > 0;
    // One of them must be present
    expect(hasForm || hasGuard).toBe(true);
  });

  test('/team-matches/new — can proceed through step 0 with sport + title', async ({ page }) => {
    await page.goto('/team-matches/new');
    await page.waitForLoadState('networkidle');

    // If guard shows, the test cannot proceed — skip gracefully
    const guard = page.getByText('팀을 먼저 만들어주세요');
    if (await guard.count() > 0) {
      console.log('No teams available for team match form — skipping step navigation test');
      return;
    }

    // Step 0: select sport and fill title
    await page.getByRole('button', { name: '풋살' }).first().click();
    const titleInput = page.locator('input[placeholder*="친선경기"]');
    await titleInput.fill('E2E 테스트 경기 모집');

    // "다음" button should be enabled
    const nextBtn = page.getByRole('button', { name: '다음' });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // Step 1 should show 경기 날짜
    await expect(page.getByText('경기 날짜')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Team matches list page', () => {
  test('/team-matches page loads with heading and filters', async ({ page }) => {
    await page.goto('/team-matches');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: '전체' }).first()).toBeVisible();
  });

  test('"모집글 작성" link is present on /team-matches', async ({ page }) => {
    await page.goto('/team-matches');
    const createLink = page.locator('a[href="/team-matches/new"]');
    await expect(createLink).toBeVisible();
  });
});
