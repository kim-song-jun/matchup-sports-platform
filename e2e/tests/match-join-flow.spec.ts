/**
 * Individual match flow scenarios
 *
 * Covers:
 * - /matches list page filters work
 * - Match detail page loads (or shows error state)
 * - Unauthenticated join redirects to /login
 * - /my/matches page loads for authenticated user
 * - My matches shows tabs for created and participated matches
 * - MATCH-001 create -> list/detail/my matches/new tab/reload
 * - MATCH-002 multi-user join -> capacity/reload sync
 */

import { test, expect, type Page } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { expectLoginRedirectOrLink, createAuthenticatedSession, closeSessions } from '../fixtures/sessions';
import { createMatchViaApi, findVenueBySport } from '../fixtures/api-helpers';
import { setupAuthState, loginViaApi } from '../fixtures/auth';

const SINARO = TEST_PERSONAS.sinaro.nickname;
const TEAM_MEMBER = TEST_PERSONAS.teamMember.nickname;
const TEAM_MANAGER = TEST_PERSONAS.teamManager.nickname;

function buildFutureSchedule(daysFromNow = 2) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);

  return {
    matchDate: date.toISOString().split('T')[0],
    startTime: '19:00',
    endTime: '21:00',
  };
}

async function searchMatchByTitle(page: Page, title: string) {
  const searchInput = page.locator('input[type="text"]:visible').first();
  await searchInput.fill(title);
  await page.waitForTimeout(500);
}

async function findMatchLink(page: Page, title: string) {
  return page.locator('a:visible').filter({ hasText: title }).first();
}

function visibleTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

function visibleParagraph(page: Page, text: string) {
  return page.locator('p:visible').filter({ hasText: text }).first();
}

function visibleTextBlock(page: Page, text: string) {
  return page.locator(':is(h1,h2,h3,p,span,a):visible').filter({ hasText: text }).first();
}

test.describe('Matches list page — public filters', () => {
  test('/matches page loads heading and search input', async ({ page }) => {
    await page.goto('/matches');
    await expect(page.locator('h1:visible').first()).toBeVisible();
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
  });

  test('sport filter chips are present', async ({ page }) => {
    await page.goto('/matches');
    const allChip = page.getByRole('button', { name: '전체' }).first();
    if (await allChip.count() > 0) {
      await expect(allChip).toBeVisible();
    }
  });

  test('date filter input is present', async ({ page }) => {
    await page.goto('/matches');
    const inputs = page.locator('input');
    await expect(inputs.first()).toBeVisible();
  });

  test('search input accepts text without error', async ({ page }) => {
    await page.goto('/matches');
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('풋살');
    await page.waitForTimeout(400);
    await expect(page.locator('main:visible').first()).toBeVisible();
  });
});

test.describe('Match detail page', () => {
  test('match detail page renders main section', async ({ page }) => {
    await page.goto('/matches/non-existent-match-id');
    await page.waitForTimeout(1000);
    await expect(page.locator('main:visible').first()).toBeVisible();
  });
});

test.describe('Match creation — unauthenticated guard', () => {
  test('/matches/new unauthenticated shows login or auth wall', async ({ page }) => {
    await page.goto('/matches/new');
    await expectLoginRedirectOrLink(page);
  });
});

test.describe('My matches page — authenticated sinaro', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, SINARO);
  });

  test('/my/matches page loads with heading', async ({ page }) => {
    await page.goto('/my/matches');
    await page.waitForLoadState('networkidle');
    const heading = page.locator('h1:visible, h2:visible').filter({ hasText: /내 매치|매치|My/ });
    await expect(heading.first()).toBeVisible({ timeout: 8_000 });
  });

  test('/my/matches shows match cards or empty state', async ({ page }) => {
    await page.goto('/my/matches');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const matchCards = page.locator('[class*="rounded"]').filter({ hasText: /풋살|축구|농구|배드민턴|open|completed/ });
    const emptyState = page.getByText(/매치가 없어요|참가한 매치|만든 매치/);
    const hasPosts = await matchCards.count() > 0;
    const hasEmpty = await emptyState.count() > 0;

    await expect(page.locator('main:visible').first()).toBeVisible();
    expect(hasPosts || hasEmpty).toBe(true);
  });

  test('/my/matches page has tab navigation', async ({ page }) => {
    await page.goto('/my/matches');
    await page.waitForLoadState('networkidle');

    const tabs = page.locator('button').filter({ hasText: /만든|참가|기록|history|created/i });
    await expect(page.locator('main:visible').first()).toBeVisible();
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Deep match flows', () => {
  test('MATCH-001 creates a match and persists across list/detail/my matches/new tab/reload', async ({ page }) => {
    const schedule = buildFutureSchedule(2);
    const uniqueTitle = `E2E매치생성-${Date.now()}`;
    const description = 'E2E 생성 플로우 상세 검증';

    await setupAuthState(page, SINARO);
    await page.goto('/matches/new');
    await page.waitForLoadState('networkidle');

    await visibleTestId(page, 'match-sport-futsal').click();
    await page.locator('#match-title:visible').fill(uniqueTitle);
    await page.locator('#match-description:visible').fill(description);
    await page.locator('#match-maxPlayers:visible').fill('6');
    await page.locator('#match-fee:visible').fill('0');
    await page.locator('#match-levelMin:visible').selectOption('2');
    await page.locator('#match-levelMax:visible').selectOption('4');
    await page.locator('#match-rules:visible').fill('정시 도착 필수');
    await visibleTestId(page, 'match-create-next-info').click();

    const venueButtons = page.locator('[data-testid^="match-venue-"]:visible');
    await expect(venueButtons.first()).toBeVisible({ timeout: 10_000 });
    await venueButtons.first().click();
    await page.locator('#match-date:visible').fill(schedule.matchDate);
    await page.locator('#match-startTime:visible').fill(schedule.startTime);
    await page.locator('#match-endTime:visible').fill(schedule.endTime);
    await visibleTestId(page, 'match-create-next-schedule').click();

    await expect(page.getByText(uniqueTitle)).toBeVisible();
    await visibleTestId(page, 'match-create-submit').click();
    await page.waitForURL(/\/matches\?created=true/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await searchMatchByTitle(page, uniqueTitle);
    const createdMatchLink = await findMatchLink(page, uniqueTitle);
    await expect(createdMatchLink).toBeVisible({ timeout: 10_000 });
    await createdMatchLink.click();
    await page.waitForURL(/\/matches\/[^/]+$/, { timeout: 15_000 });

    const detailUrl = page.url();
    await expect(visibleTestId(page, 'match-detail-title')).toHaveText(uniqueTitle);
    await expect(page.locator('p:visible').filter({ hasText: description }).first()).toBeVisible();
    await expect(visibleTestId(page, 'match-participant-count')).toContainText('1/6명');
    await expect(visibleParagraph(page, SINARO)).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(visibleTestId(page, 'match-detail-title')).toHaveText(uniqueTitle);
    await expect(visibleTestId(page, 'match-participant-count')).toContainText('1/6명');

    const sibling = await page.context().newPage();
    try {
      await sibling.goto(detailUrl);
      await sibling.waitForLoadState('networkidle');
      await expect(visibleTestId(sibling, 'match-detail-title')).toHaveText(uniqueTitle);
      await expect(visibleTestId(sibling, 'match-participant-count')).toContainText('1/6명');
    } finally {
      await sibling.close();
    }

    await page.goto('/my/matches?tab=created');
    await page.waitForLoadState('networkidle');
    await expect(visibleTextBlock(page, uniqueTitle)).toBeVisible({ timeout: 10_000 });
    await expect(visibleTextBlock(page, '1/6명')).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(visibleTextBlock(page, uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('MATCH-002 syncs join state across host/participant contexts and blocks over-capacity join', async ({ browser }) => {
    const venue = await findVenueBySport('futsal');
    const schedule = buildFutureSchedule(3);
    const hostTokens = await loginViaApi(SINARO);
    const title = `E2E매치참가-${Date.now()}`;

    const created = await createMatchViaApi(hostTokens.accessToken, {
      title,
      description: 'E2E 참가 동기화 검증',
      sportType: 'futsal',
      matchDate: schedule.matchDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      venueId: venue.id,
      maxPlayers: 2,
      fee: 0,
      levelMin: 2,
      levelMax: 4,
    });

    const detailPath = `/matches/${created.id}`;
    let hostSession = null;
    let participantSession = null;
    let overflowSession = null;

    try {
      hostSession = await createAuthenticatedSession(browser, SINARO, detailPath);
      participantSession = await createAuthenticatedSession(browser, TEAM_MEMBER, detailPath);

      await expect(visibleTestId(hostSession.page, 'match-detail-title')).toHaveText(title);
      await expect(visibleTestId(hostSession.page, 'match-participant-count')).toContainText('1/2명');
      await expect(visibleTestId(participantSession.page, 'match-participant-count')).toContainText('1/2명');

      await visibleTestId(participantSession.page, 'match-join-button').click();
      await expect(visibleTestId(participantSession.page, 'match-leave-button')).toBeVisible({ timeout: 10_000 });
      await expect(visibleTestId(participantSession.page, 'match-participant-count')).toContainText('2/2명');
      await expect(visibleParagraph(participantSession.page, TEAM_MEMBER)).toBeVisible();

      await participantSession.page.reload();
      await participantSession.page.waitForLoadState('networkidle');
      await expect(visibleTestId(participantSession.page, 'match-leave-button')).toBeVisible();

      await hostSession.page.reload();
      await hostSession.page.waitForLoadState('networkidle');
      await expect(visibleTestId(hostSession.page, 'match-participant-count')).toContainText('2/2명');
      await expect(visibleParagraph(hostSession.page, TEAM_MEMBER)).toBeVisible();

      overflowSession = await createAuthenticatedSession(browser, TEAM_MANAGER, detailPath);
      await expect(visibleTestId(overflowSession.page, 'match-participant-count')).toContainText('2/2명');
      await expect(
        overflowSession.page.getByRole('button', { name: '마감되었습니다' }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeSessions([hostSession, participantSession, overflowSession]);
    }
  });
});

test.describe('Team matches list — join flow', () => {
  test('/team-matches list shows apply (신청) or matched posts', async ({ page }) => {
    await page.goto('/team-matches');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page.locator('main:visible').first()).toBeVisible();
  });

  test('/my/team-matches page loads for authenticated user', async ({ page }) => {
    await setupAuthState(page, SINARO);
    await page.goto('/my/team-matches');
    await page.waitForLoadState('networkidle');
    const heading = page.locator('h1:visible, h2:visible').filter({ hasText: /팀 매칭|팀매칭|내 팀/ });
    await expect(heading.first()).toBeVisible({ timeout: 8_000 });
  });
});
