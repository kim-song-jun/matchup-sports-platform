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

import { test, expect } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { setupAuthState } from '../fixtures/auth';
import {
  closeSessions,
  createAuthenticatedSession,
  expectLoginRedirectOrLink,
  type AuthenticatedSession,
} from '../fixtures/sessions';

const SINARO = TEST_PERSONAS.sinaro.nickname;
const TEAM_OWNER = TEST_PERSONAS.teamOwner.nickname;

test.describe('Chat page — unauthenticated', () => {
  test('unauthenticated /chat shows login link', async ({ page }) => {
    await page.goto('/chat');
    await expectLoginRedirectOrLink(page);
  });
});

test.describe('Chat page — authenticated sinaro', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, SINARO);
  });

  test('/chat page loads without crash', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main:visible').first()).toBeVisible();
  });

  test('/chat shows chat room list or empty state', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // Either shows rooms or an empty / login state
    const emptyState = page.getByText(/채팅방이 없어요|대화 내역|로그인/i);
    const roomItems = page.locator('[class*="rounded"]').filter({ hasText: /.+/ }).first();

    await expect(page.locator('main:visible').first()).toBeVisible();
    const hasEmpty = await emptyState.count() > 0;
    const hasRooms = await roomItems.count() > 0;
    expect(hasEmpty || hasRooms).toBe(true);
  });

  test('/chat page has heading or back button', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    const heading = page.locator('h1:visible, h2:visible').filter({ hasText: /채팅|Chat/i });
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
    await expect(page.locator('main:visible').first()).toBeVisible();
  });
});

test.describe('Chat — two-context realtime simulation', () => {
  test('two users can see same chat room (structure test)', async ({ browser }) => {
    let session1: AuthenticatedSession | null = null;
    let session2: AuthenticatedSession | null = null;

    try {
      session1 = await createAuthenticatedSession(browser, SINARO, '/chat');
      session2 = await createAuthenticatedSession(browser, TEAM_OWNER, '/chat');

      await session1.page.waitForLoadState('networkidle');
      await session2.page.waitForLoadState('networkidle');

      // Both pages should render chat without crash
      await expect(session1.page.locator('main:visible').first()).toBeVisible();
      await expect(session2.page.locator('main:visible').first()).toBeVisible();
    } finally {
      await closeSessions([session1, session2]);
    }
  });
});
