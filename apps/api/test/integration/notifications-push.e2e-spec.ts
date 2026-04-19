import { INestApplication } from '@nestjs/common';
import { PrismaClient, NotificationType } from '@prisma/client';
import * as supertest from 'supertest';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { WebPushService } from '../../src/notifications/web-push.service';

// ---------------------------------------------------------------------------
// Integration tests: WebPush behaviour within NotificationsService.create()
// C10 requirement — Task 74 review fix
// ---------------------------------------------------------------------------

describe('Notifications Push Integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;
  let notificationsService: NotificationsService;
  let webPushService: WebPushService;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    closeApp = testApp.close;

    notificationsService = app.get(NotificationsService);
    webPushService = app.get(WebPushService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  // ── Case A ─────────────────────────────────────────────────────────────────
  // VAPID env not set → WebPushService.isEnabled=false → sendToUser no-op,
  // but the notification row is still persisted and returned.

  describe('Case A: VAPID keys absent (default CI env)', () => {
    let sendToUserSpy: jest.SpyInstance;

    beforeEach(() => {
      sendToUserSpy = jest.spyOn(webPushService, 'sendToUser');
    });

    afterEach(() => {
      sendToUserSpy.mockRestore();
    });

    it('notification row is created even when webPushService is disabled', async () => {
      // Ensure isEnabled reflects env state (no VAPID keys set in CI)
      expect(webPushService.isEnabled).toBe(false);

      // Create a user via dev-login so a User row exists
      const agent = supertest.agent(app.getHttpServer());
      const token = await devLoginToken(agent, 'push_test_user_a');
      expect(token).toBeTruthy();

      // Retrieve the userId from the DB
      const user = await prisma.user.findFirst({ where: { nickname: 'push_test_user_a' } });
      expect(user).not.toBeNull();
      const userId = user!.id;

      const result = await notificationsService.create({
        userId,
        type: NotificationType.match_completed,
        title: '매치 완료',
        body: '매치가 종료됐어요',
      });

      // Notification row must be created
      expect(result).not.toBeNull();
      expect(result!.title).toBe('매치 완료');

      const row = await prisma.notification.findFirst({ where: { userId } });
      expect(row).not.toBeNull();

      // sendToUser should be called (fire-and-forget, even if disabled internally it returns early)
      expect(sendToUserSpy).toHaveBeenCalledWith(userId, { title: '매치 완료', body: '매치가 종료됐어요' });
    });
  });

  // ── Case B ─────────────────────────────────────────────────────────────────
  // NotificationPreference.matchCompletedEnabled=false → create returns null,
  // no DB row, webPushService.sendToUser never called.

  describe('Case B: matchCompletedEnabled=false suppresses create', () => {
    let sendToUserSpy: jest.SpyInstance;

    beforeEach(() => {
      sendToUserSpy = jest.spyOn(webPushService, 'sendToUser');
    });

    afterEach(() => {
      sendToUserSpy.mockRestore();
    });

    it('returns null and does not call sendToUser when granular pref is disabled', async () => {
      const agent = supertest.agent(app.getHttpServer());
      await devLoginToken(agent, 'push_test_user_b');

      const user = await prisma.user.findFirst({ where: { nickname: 'push_test_user_b' } });
      expect(user).not.toBeNull();
      const userId = user!.id;

      // Insert preference row with matchCompletedEnabled=false
      await prisma.notificationPreference.create({
        data: {
          userId,
          matchEnabled: true,
          teamEnabled: true,
          chatEnabled: true,
          paymentEnabled: true,
          teamApplicationEnabled: true,
          matchCompletedEnabled: false,
          eloChangedEnabled: true,
          chatMessageEnabled: true,
        },
      });

      const result = await notificationsService.create({
        userId,
        type: NotificationType.match_completed,
        title: '매치 완료',
        body: '매치가 종료됐어요',
      });

      expect(result).toBeNull();

      const row = await prisma.notification.findFirst({ where: { userId } });
      expect(row).toBeNull();

      // sendToUser must never be called when notification is suppressed
      expect(sendToUserSpy).not.toHaveBeenCalled();
    });
  });
});
