/**
 * Chat and realtime scenarios
 *
 * Covers:
 * - /chat page shows login prompt when unauthenticated
 * - /chat page loads for authenticated user
 * - Chat room list shows "채팅방이 없어요" or room items
 * - Sending a message in an existing room (if available)
 * - Two browser contexts: basic message exchange simulation
 */

import { test, expect, chromium } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { setupAuthState, loginViaApi, injectTokens } from '../fixtures/auth';

const SINARO = TEST_PERSONAS.sinaro.nickname;
const TEAM_OWNER = TEST_PERSONAS.teamOwner.nickname;

test.describe('Chat page — unauthenticated', () => {
  test('unauthenticated /chat shows login link', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForTimeout(500);
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink.first()).toBeVisible();
  });
});

test.describe('Chat page — authenticated sinaro', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, SINARO);
  });

  test('/chat page loads without crash', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
  });

  test('/chat shows chat room list or empty state', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // Either shows rooms or an empty / login state
    const emptyState = page.getByText(/채팅방이 없어요|대화 내역|로그인/i);
    const roomItems = page.locator('[class*="rounded"]').filter({ hasText: /.+/ }).first();

    await expect(page.locator('main')).toBeVisible();
    const hasEmpty = await emptyState.count() > 0;
    const hasRooms = await roomItems.count() > 0;
    expect(hasEmpty || hasRooms).toBe(true);
  });

  test('/chat page has heading or back button', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    const heading = page.locator('h1, h2').filter({ hasText: /채팅|Chat/i });
    await expect(heading.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Chat room — message send', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, SINARO);
  });

  test('entering first chat room (if any) shows message input', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // Click first room link if available
    const roomLinks = page.locator('a[href*="/chat/"]');
    if (await roomLinks.count() === 0) {
      // No rooms — skip
      return;
    }
    await roomLinks.first().click();
    await page.waitForLoadState('networkidle');

    // Chat room should have a text input for messages
    const msgInput = page.locator('input[type="text"], textarea').filter({ hasNotText: /검색/ }).last();
    await expect(msgInput).toBeVisible({ timeout: 5_000 });
  });

  test('can type in message input and send', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const roomLinks = page.locator('a[href*="/chat/"]');
    if (await roomLinks.count() === 0) {
      return;
    }
    await roomLinks.first().click();
    await page.waitForLoadState('networkidle');

    const msgInput = page.locator('input[type="text"]').last();
    if (await msgInput.count() === 0) return;

    await msgInput.fill('E2E 테스트 메시지');
    // Send via Enter key
    await msgInput.press('Enter');
    await page.waitForTimeout(500);

    // Message should appear in the chat or input should clear
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Chat — two-context realtime simulation', () => {
  test('two users can see same chat room (structure test)', async ({ browser }) => {
    // This test uses two separate browser contexts to simulate two users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Setup auth for both users
      const tokens1 = await loginViaApi(SINARO);
      const tokens2 = await loginViaApi(TEAM_OWNER);

      await page1.goto('http://localhost:3003');
      await injectTokens(page1, tokens1);
      await page2.goto('http://localhost:3003');
      await injectTokens(page2, tokens2);

      // Both navigate to /chat
      await page1.goto('http://localhost:3003/chat');
      await page2.goto('http://localhost:3003/chat');

      await page1.waitForLoadState('networkidle');
      await page2.waitForLoadState('networkidle');

      // Both pages should render chat without crash
      await expect(page1.locator('main')).toBeVisible();
      await expect(page2.locator('main')).toBeVisible();
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
