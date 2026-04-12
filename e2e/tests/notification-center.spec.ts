import { test, expect, type Browser, type BrowserContext, Page } from '@playwright/test';
import { confirmPaymentViaApi, createMatchViaApi, findVenueBySport, joinMatchViaApi, preparePaymentViaApi } from '../fixtures/api-helpers';
import { gotoWithWarmup, loginViaApi } from '../fixtures/auth';
import { createPersistedContext } from '../fixtures/sessions';
import { TEST_PERSONAS } from '../fixtures/test-users';

const HOST = TEST_PERSONAS.teamOwner.nickname;
const JOINER = TEST_PERSONAS.sinaro.nickname;
const NOTIFICATION_APPEAR_TIMEOUT = 30_000;
const NOTIFICATION_NAVIGATION_TIMEOUT = 60_000;
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openAuthenticatedContext(
  browser: Browser,
  personaKey: keyof typeof TEST_PERSONAS,
) {
  return createPersistedContext(browser, personaKey);
}

async function openAuthenticatedPage(context: BrowserContext, targetPath: string) {
  const page = await context.newPage();
  await gotoWithWarmup(page, targetPath);
  return page;
}

async function freshAccessToken(nickname: string) {
  return (await loginViaApi(nickname)).accessToken;
}

async function bringTabToFront(page: Page) {
  await page.bringToFront();
  await page.waitForTimeout(100);
}

function notificationCard(page: Page, pattern: RegExp | string) {
  return page.locator('[data-testid^="notification-card-"]:visible').filter({ hasText: pattern }).first();
}

async function clickNotificationAndWaitForUrl(page: Page, pattern: RegExp, card: ReturnType<typeof notificationCard>) {
  await card.click();
  await expect(page).toHaveURL(pattern, { timeout: NOTIFICATION_NAVIGATION_TIMEOUT });
}

test.describe('Notification center realtime', () => {
  test('same user tabs receive match-created notification and open its deep link', async ({ browser }) => {
    test.slow();
    const venue = await findVenueBySport('futsal');
    const context = await openAuthenticatedContext(browser, 'teamOwner');
    const uniqueTitle = `E2E 알림 매치 ${Date.now()}`;

    try {
      await openAuthenticatedPage(context, '/matches');
      const inboxTab = await openAuthenticatedPage(context, '/notifications');

      const created = await createMatchViaApi(await freshAccessToken(HOST), {
        title: uniqueTitle,
        sportType: 'futsal',
        matchDate: '2026-12-14',
        startTime: '19:00',
        endTime: '21:00',
        venueId: venue.id,
        maxPlayers: 10,
        fee: 0,
      });

      await bringTabToFront(inboxTab);
      const card = notificationCard(inboxTab, uniqueTitle);
      await expect(card).toBeVisible({ timeout: NOTIFICATION_APPEAR_TIMEOUT });
      await expect(card.getByTestId('notification-unread-dot')).toBeVisible();

      await clickNotificationAndWaitForUrl(inboxTab, new RegExp(`/matches/${created.id}$`), card);
    } finally {
      await context.close();
    }
  });

  test('player-joined notification syncs read state across host tabs', async ({ browser }) => {
    test.slow();
    const venue = await findVenueBySport('futsal');
    const hostContext = await openAuthenticatedContext(browser, 'teamOwner');
    const uniqueTitle = `E2E 참가 알림 ${Date.now()}`;

    try {
      const hostInbox = await openAuthenticatedPage(hostContext, '/notifications');
      const hostMirror = await openAuthenticatedPage(hostContext, '/notifications');

      const created = await createMatchViaApi(await freshAccessToken(HOST), {
        title: uniqueTitle,
        sportType: 'futsal',
        matchDate: '2026-12-15',
        startTime: '20:00',
        endTime: '22:00',
        venueId: venue.id,
        maxPlayers: 10,
        fee: 0,
      });

      await joinMatchViaApi(await freshAccessToken(JOINER), created.id);

      const joinPattern = new RegExp(`새 참가 신청[\\s\\S]*${escapeRegExp(uniqueTitle)}`);
      const inboxCard = notificationCard(hostInbox, joinPattern);
      await bringTabToFront(hostInbox);
      await expect(inboxCard).toBeVisible({ timeout: NOTIFICATION_APPEAR_TIMEOUT });
      await expect(inboxCard.getByTestId('notification-unread-dot')).toBeVisible();
      await clickNotificationAndWaitForUrl(hostInbox, new RegExp(`/matches/${created.id}$`), inboxCard);

      const mirrorCard = notificationCard(hostMirror, joinPattern);
      await bringTabToFront(hostMirror);
      await expect(mirrorCard).toBeVisible({ timeout: NOTIFICATION_APPEAR_TIMEOUT });
      await expect(mirrorCard.getByTestId('notification-unread-dot')).toHaveCount(0, { timeout: NOTIFICATION_APPEAR_TIMEOUT });
    } finally {
      await hostContext.close();
    }
  });

  test('payment-confirmed notification opens the payment detail route', async ({ browser }) => {
    test.slow();
    const venue = await findVenueBySport('futsal');
    const joinerContext = await openAuthenticatedContext(browser, 'sinaro');
    const uniqueTitle = `E2E 결제 알림 ${Date.now()}`;

    try {
      const joinerInbox = await openAuthenticatedPage(joinerContext, '/notifications');
      const created = await createMatchViaApi(await freshAccessToken(HOST), {
        title: uniqueTitle,
        sportType: 'futsal',
        matchDate: '2026-12-16',
        startTime: '20:00',
        endTime: '22:00',
        venueId: venue.id,
        maxPlayers: 10,
        fee: 12000,
      });

      const participant = await joinMatchViaApi(await freshAccessToken(JOINER), created.id);
      const prepared = await preparePaymentViaApi(await freshAccessToken(JOINER), {
        participantId: participant.id,
        amount: 12000,
      });

      await confirmPaymentViaApi(await freshAccessToken(JOINER), {
        orderId: prepared.orderId,
      });

      const paymentPattern = new RegExp(`결제가 완료되었어요[\\s\\S]*${escapeRegExp(uniqueTitle)}`);
      const paymentCard = notificationCard(joinerInbox, paymentPattern);

      await bringTabToFront(joinerInbox);
      await expect(paymentCard).toBeVisible({ timeout: NOTIFICATION_APPEAR_TIMEOUT });
      await clickNotificationAndWaitForUrl(joinerInbox, new RegExp(`/payments/${prepared.paymentId}$`), paymentCard);
    } finally {
      await joinerContext.close();
    }
  });
});
