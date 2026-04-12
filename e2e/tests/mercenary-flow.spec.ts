/**
 * Mercenary lifecycle E2E
 *
 * Covers:
 * - host creates a mercenary post via UI and lands on detail
 * - the created post appears in list/team/my surfaces
 * - unauthenticated viewers are redirected to login from detail apply CTA
 * - applicant applies and sees pending state
 * - host accepts from detail management UI
 * - applicant sees accepted status in my applications
 */

import { expect, test, type Page } from '@playwright/test';
import { createTeamViaApi } from '../fixtures/api-helpers';
import { injectTokens, loginViaApi } from '../fixtures/auth';
import { TEST_PERSONAS } from '../fixtures/test-users';

const HOST_NICKNAME = TEST_PERSONAS.mercenaryHost.nickname;
const APPLICANT_NICKNAME = TEST_PERSONAS.sinaro.nickname;
const MATCH_DATE = '2026-12-15';
const VENUE_NAME = `용병E2E구장-${Date.now()}`;
const TEAM_NAME = `용병호스트E2E팀-${Date.now()}`;

let hostTeamId = '';
let createdPostId = '';

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, action: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }

      console.warn(`[mercenary-e2e] ${label} failed on attempt ${attempt}/${attempts}. Retrying...`);
      await waitFor(attempt * 1_000);
    }
  }

  throw lastError;
}

async function waitForTeamOption(page: Page, teamId: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.goto(`/mercenary/new?teamId=${teamId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const teamSelect = page.locator('#merc-team:visible').first();
    await expect(teamSelect).toBeVisible();

    const hasOption = await teamSelect.locator(`option[value="${teamId}"]`).count();
    if (hasOption > 0) {
      await teamSelect.selectOption(teamId);
      return;
    }

    await page.waitForTimeout(500 * (attempt + 1));
  }

  throw new Error(`Mercenary create form never loaded team option ${teamId}`);
}

async function authenticatePage(page: Page, nickname: string) {
  await withRetry(`authenticate ${nickname}`, async () => {
    const tokens = await loginViaApi(nickname);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await injectTokens(page, tokens);
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Mercenary lifecycle', () => {
  test.beforeAll(async () => {
    const hostTokens = await withRetry(`dev-login for ${HOST_NICKNAME}`, () => loginViaApi(HOST_NICKNAME));
    const team = await withRetry('create mercenary host team', () => createTeamViaApi(hostTokens.accessToken, {
      name: TEAM_NAME,
      sportType: 'soccer',
      city: '서울',
      description: 'Mercenary lifecycle E2E team',
    }));
    hostTeamId = team.id;
  });

  test('host creates a mercenary post and lands on detail', async ({ page }) => {
    await authenticatePage(page, HOST_NICKNAME);
    await waitForTeamOption(page, hostTeamId);

    await page.locator('#merc-match-date:visible').first().fill(MATCH_DATE);
    await page.locator('#merc-venue:visible').first().fill(VENUE_NAME);
    await page.getByRole('button', { name: '포지션 무관' }).click();
    await page.getByRole('button', { name: '고수' }).click();
    await page.locator('#merc-fee:visible').first().fill('0');
    await page.locator('#merc-notes:visible').first().fill('E2E mercenary lifecycle post');

    await Promise.all([
      page.waitForURL(/\/mercenary\/[^/?#]+$/, { timeout: 15_000 }),
      page.getByRole('button', { name: '상세로 등록하기' }).click(),
    ]);

    createdPostId = page.url().split('/mercenary/')[1]?.split(/[?#]/)[0] ?? '';
    expect(createdPostId).not.toBe('');

    await expect(page.getByRole('heading', { level: 1, name: TEAM_NAME })).toBeVisible();
    await expect(page.locator('p:visible').filter({ hasText: VENUE_NAME }).first()).toBeVisible();

    await page.goto('/mercenary');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByText(TEAM_NAME).first()).toBeVisible();

    await page.goto(`/teams/${hostTeamId}/mercenary`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByText(VENUE_NAME).first()).toBeVisible();

    await page.goto('/my/mercenary');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByText(TEAM_NAME).first()).toBeVisible();
  });

  test('public viewer is redirected to login from detail apply CTA', async ({ page }) => {
    test.skip(!createdPostId, 'Mercenary post was not created');

    await page.goto(`/mercenary/${createdPostId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 10_000 }),
      page.locator('button:has-text("로그인 후 신청"):visible').first().click(),
    ]);

    await expect(page).toHaveURL(/\/login/);
  });

  test('applicant applies and sees pending state', async ({ page }) => {
    test.skip(!createdPostId, 'Mercenary post was not created');

    await authenticatePage(page, APPLICANT_NICKNAME);
    await page.goto(`/mercenary/${createdPostId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.locator('button:has-text("신청하기"):visible').first()).toBeVisible();
    await page.locator('button:has-text("신청하기"):visible').first().click();

    await expect(page.locator('h2:has-text("내 신청 상태"):visible').first()).toBeVisible();
    await expect(page.locator('span:has-text("대기 중"):visible').first()).toBeVisible();
    await expect(page.locator('button:has-text("신청 취소"):visible').first()).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('button:has-text("신청 취소"):visible').first()).toBeVisible();
    await expect(page.locator('button:has-text("신청하기"):visible')).toHaveCount(0);
  });

  test('host approves the applicant from detail page', async ({ page }) => {
    test.skip(!createdPostId, 'Mercenary post was not created');

    await authenticatePage(page, HOST_NICKNAME);
    await page.goto(`/mercenary/${createdPostId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const applicantCard = page.locator('section').filter({ hasText: '지원 목록' }).locator('div.rounded-xl').filter({
      hasText: APPLICANT_NICKNAME,
    }).first();

    await expect(applicantCard).toBeVisible();
    await applicantCard.getByRole('button', { name: '승인' }).click();

    await expect(applicantCard.locator('span:has-text("승인됨"):visible').first()).toBeVisible();
    await expect(page.locator('text=모집 완료:visible').first()).toBeVisible();
  });

  test('applicant sees accepted status in my applications', async ({ page }) => {
    test.skip(!createdPostId, 'Mercenary post was not created');

    await authenticatePage(page, APPLICANT_NICKNAME);
    await page.goto('/my/mercenary');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByRole('tab', { name: '내 신청' }).click();
    await expect(page.getByText(TEAM_NAME).first()).toBeVisible();
    await expect(page.locator('span:has-text("승인됨"):visible').first()).toBeVisible();

    await page.goto(`/mercenary/${createdPostId}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('button:has-text("승인됨"):visible').first()).toBeVisible();
  });
});
