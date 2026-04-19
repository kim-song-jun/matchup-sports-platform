import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as supertest from 'supertest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushService } from './web-push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HostThrottlerGuard } from '../common/guards/host-throttler.guard';

const DEFAULT_PREFS = {
  id: null,
  matchEnabled: true,
  teamEnabled: true,
  chatEnabled: true,
  paymentEnabled: true,
  teamApplicationEnabled: true,
  matchCompletedEnabled: true,
  eloChangedEnabled: true,
  chatMessageEnabled: true,
};

const mockNotificationsService = {
  findMine: jest.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
  getUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
  markAllRead: jest.fn().mockResolvedValue({ count: 0 }),
  markRead: jest.fn().mockResolvedValue({}),
  getPreferences: jest.fn().mockResolvedValue(DEFAULT_PREFS),
  updatePreferences: jest.fn().mockResolvedValue({ ...DEFAULT_PREFS, id: 'pref-1' }),
};

const mockWebPushService = {
  getPublicKey: jest.fn().mockReturnValue('vapid-test-key'),
  subscribe: jest.fn().mockResolvedValue({}),
  unsubscribe: jest.fn().mockResolvedValue({}),
};

// Bypass JwtAuthGuard for most tests; individual tests override with mock user
const mockJwtAuthGuard = {
  canActivate: jest.fn().mockImplementation((ctx) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 'user-1' };
    return true;
  }),
};

describe('NotificationsController', () => {
  let app: INestApplication;
  let request: supertest.Agent;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ limit: 1000, ttl: 60_000 }] }),
      ],
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WebPushService, useValue: mockWebPushService },
        { provide: APP_GUARD, useClass: HostThrottlerGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    request = supertest.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore default mock behavior after each test
    mockJwtAuthGuard.canActivate.mockImplementation((ctx) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { id: 'user-1' };
      return true;
    });
    mockNotificationsService.getPreferences.mockResolvedValue(DEFAULT_PREFS);
    mockNotificationsService.updatePreferences.mockResolvedValue({ ...DEFAULT_PREFS, id: 'pref-1' });
  });

  // ── GET /notifications/preferences ──────────────────────────────────────────

  describe('GET /notifications/preferences', () => {
    it('returns 403 when guard denies (no valid JWT)', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      const res = await request.get('/notifications/preferences');
      // NestJS returns 403 when canActivate returns false (guard rejects without throwing)
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('returns 200 with all 8 preference fields (defaults all true)', async () => {
      const res = await request.get('/notifications/preferences');
      expect(res.status).toBe(HttpStatus.OK);
      const body = res.body as typeof DEFAULT_PREFS;
      expect(body.matchEnabled).toBe(true);
      expect(body.teamEnabled).toBe(true);
      expect(body.chatEnabled).toBe(true);
      expect(body.paymentEnabled).toBe(true);
      expect(body.teamApplicationEnabled).toBe(true);
      expect(body.matchCompletedEnabled).toBe(true);
      expect(body.eloChangedEnabled).toBe(true);
      expect(body.chatMessageEnabled).toBe(true);
      expect(mockNotificationsService.getPreferences).toHaveBeenCalledWith('user-1');
    });
  });

  // ── PATCH /notifications/preferences ────────────────────────────────────────

  describe('PATCH /notifications/preferences', () => {
    it('returns 403 when guard denies (no valid JWT)', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      const res = await request
        .patch('/notifications/preferences')
        .send({ chatMessageEnabled: false });
      // NestJS returns 403 when canActivate returns false
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('returns 200 with updated preferences on valid body', async () => {
      const updated = { ...DEFAULT_PREFS, id: 'pref-1', chatMessageEnabled: false };
      mockNotificationsService.updatePreferences.mockResolvedValueOnce(updated);

      const res = await request
        .patch('/notifications/preferences')
        .send({ chatMessageEnabled: false });

      expect(res.status).toBe(HttpStatus.OK);
      expect((res.body as typeof updated).chatMessageEnabled).toBe(false);
      expect(mockNotificationsService.updatePreferences).toHaveBeenCalledWith('user-1', {
        chatMessageEnabled: false,
      });
    });

    it('returns 400 when a field is not boolean', async () => {
      const res = await request
        .patch('/notifications/preferences')
        .send({ chatMessageEnabled: 'yes' });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when unknown field sent (forbidNonWhitelisted)', async () => {
      const res = await request
        .patch('/notifications/preferences')
        .send({ unknownField: true });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 200 when partial fields sent (only changed fields)', async () => {
      const updated = { ...DEFAULT_PREFS, id: 'pref-1', eloChangedEnabled: false };
      mockNotificationsService.updatePreferences.mockResolvedValueOnce(updated);

      const res = await request
        .patch('/notifications/preferences')
        .send({ eloChangedEnabled: false });

      expect(res.status).toBe(HttpStatus.OK);
      expect((res.body as typeof updated).eloChangedEnabled).toBe(false);
    });
  });
});
