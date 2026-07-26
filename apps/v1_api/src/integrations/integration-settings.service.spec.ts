/**
 * integration-settings.service.spec.ts
 *
 * Contract tests for the admin-editable integration key store: DB-first / env-fallback
 * priority, masked read shape (no raw key ever leaves getMasked()), PATCH semantics
 * (undefined = untouched, "" = clear back to env fallback, non-empty = set), and the
 * audit log recorded on update() (field-changed-only, never the raw key value).
 */
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationSettingsService } from './integration-settings.service';

const ownerAdmin = { id: 'owner-admin-id', userId: 'owner-user-id', adminRole: 'owner' as const, status: 'active' as const };

describe('IntegrationSettingsService', () => {
  let service: IntegrationSettingsService;
  let prisma: {
    v1IntegrationSettings: { findUnique: jest.Mock; upsert: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let adminContext: { logAdminAction: jest.Mock };
  const originalEnv = { ...process.env };

  beforeEach(() => {
    prisma = {
      v1IntegrationSettings: { findUnique: jest.fn(), upsert: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext = {
      logAdminAction: jest.fn((admin, input, tx) => tx.v1AdminActionLog.create({ data: input })),
    };
    service = new IntegrationSettingsService(prisma as unknown as PrismaService, adminContext as never);
    delete process.env.KAKAO_REST_API_KEY;
    delete process.env.NEXT_PUBLIC_KAKAO_MAPS_JS_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  describe('read priority: DB row > env var > none', () => {
    it('no DB row, no env var → null', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      expect(await service.getKakaoRestApiKey()).toBeNull();
    });

    it('no DB row, env var set → falls back to env var', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      process.env.KAKAO_REST_API_KEY = 'env-rest-key';
      expect(await service.getKakaoRestApiKey()).toBe('env-rest-key');
    });

    it('DB row set → DB value wins over env var', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue({ kakaoRestApiKey: 'admin-rest-key', kakaoMapsJsKey: null, updatedAt: new Date() });
      process.env.KAKAO_REST_API_KEY = 'env-rest-key';
      expect(await service.getKakaoRestApiKey()).toBe('admin-rest-key');
    });

    it('JS key follows the same DB > env priority independently of the REST key', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue({ kakaoRestApiKey: null, kakaoMapsJsKey: 'admin-js-key', updatedAt: new Date() });
      process.env.NEXT_PUBLIC_KAKAO_MAPS_JS_KEY = 'env-js-key';
      expect(await service.getKakaoMapsJsKey()).toBe('admin-js-key');
    });
  });

  describe('getMasked()', () => {
    it('never exposes the raw key — only a 4-char suffix behind a mask', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue({
        kakaoRestApiKey: 'super-secret-rest-key-1234',
        kakaoMapsJsKey: 'super-secret-js-key-5678',
        updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      });

      const masked = await service.getMasked();

      expect(masked.kakaoRestApiKey).toBe('••••1234');
      expect(masked.kakaoMapsJsKey).toBe('••••5678');
      expect(masked.kakaoRestApiKey).not.toContain('super-secret');
      expect(masked.kakaoRestApiKeySource).toBe('admin');
    });

    it('no DB row but env var present → reports source "env" and does not mask the (unread) env value', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      process.env.KAKAO_REST_API_KEY = 'env-rest-key';

      const masked = await service.getMasked();

      expect(masked.kakaoRestApiKey).toBeNull();
      expect(masked.kakaoRestApiKeySource).toBe('env');
    });

    it('neither DB row nor env var → source "none"', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      const masked = await service.getMasked();
      expect(masked.kakaoRestApiKeySource).toBe('none');
      expect(masked.kakaoMapsJsKeySource).toBe('none');
    });
  });

  describe('update()', () => {
    it('non-empty value → upserts the trimmed key and records the editor admin', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, { kakaoRestApiKey: '  new-rest-key  ' });

      expect(prisma.v1IntegrationSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          create: expect.objectContaining({ id: 'singleton', updatedByAdminUserId: 'owner-admin-id', kakaoRestApiKey: 'new-rest-key' }),
          update: expect.objectContaining({ updatedByAdminUserId: 'owner-admin-id', kakaoRestApiKey: 'new-rest-key' }),
        }),
      );
    });

    it('empty string → clears the DB key (falls back to env var again)', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, { kakaoRestApiKey: '' });

      expect(prisma.v1IntegrationSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ kakaoRestApiKey: null }) }),
      );
    });

    it('field omitted (undefined) → does not touch that key at all', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, { kakaoMapsJsKey: 'js-only-update' });

      const updateArg = prisma.v1IntegrationSettings.upsert.mock.calls[0][0].update;
      expect(updateArg).not.toHaveProperty('kakaoRestApiKey');
      expect(updateArg.kakaoMapsJsKey).toBe('js-only-update');
    });

    it('records an audit log entry naming which fields changed, never the raw key value', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, { kakaoRestApiKey: 'super-secret-rest-key' });

      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        ownerAdmin,
        expect.objectContaining({
          action: 'integration_settings.update',
          targetType: 'integration_settings',
          targetId: 'singleton',
          afterJson: { kakaoRestApiKey: 'set' },
        }),
        prisma,
      );
      const [, auditInput] = adminContext.logAdminAction.mock.calls[0];
      expect(JSON.stringify(auditInput)).not.toContain('super-secret-rest-key');
    });

    it('clearing a key logs "cleared" rather than "set"', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, { kakaoMapsJsKey: '' });

      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        ownerAdmin,
        expect.objectContaining({ afterJson: { kakaoMapsJsKey: 'cleared' } }),
        prisma,
      );
    });

    it('no fields present in the DTO → does not write an audit log', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, {});

      expect(adminContext.logAdminAction).not.toHaveBeenCalled();
    });

    it('runs the upsert and the audit log inside the same transaction', async () => {
      prisma.v1IntegrationSettings.findUnique.mockResolvedValue(null);
      await service.update(ownerAdmin, { kakaoRestApiKey: 'new-rest-key' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'integration_settings.update' }) }),
      );
    });
  });
});
