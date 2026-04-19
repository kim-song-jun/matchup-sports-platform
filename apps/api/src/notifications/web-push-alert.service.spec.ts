import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebPushAlertService } from './web-push-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_ALERT_COUNT_THRESHOLD, PUSH_ALERT_CRON_DISABLED_ENV } from '../common/constants/ops';

// Replace global fetch with a jest mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockPrisma = {
  webPushFailureLog: {
    count: jest.fn(),
  },
};

function makeConfigService(webhookUrl?: string) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'OPS_ALERT_WEBHOOK_URL') return webhookUrl;
      return undefined;
    }),
  };
}

async function buildService(webhookUrl?: string): Promise<WebPushAlertService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      WebPushAlertService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ConfigService, useValue: makeConfigService(webhookUrl) },
    ],
  }).compile();

  const svc = module.get<WebPushAlertService>(WebPushAlertService);
  svc.onModuleInit();
  return svc;
}

describe('WebPushAlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[PUSH_ALERT_CRON_DISABLED_ENV];
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env[PUSH_ALERT_CRON_DISABLED_ENV];
  });

  describe('cron disabled env', () => {
    it('skips all DB queries when DISABLE_OPS_ALERT_CRON=true', async () => {
      process.env[PUSH_ALERT_CRON_DISABLED_ENV] = 'true';
      const svc = await buildService();

      await svc.checkAndAlert();

      expect(mockPrisma.webPushFailureLog.count).not.toHaveBeenCalled();
    });
  });

  describe('threshold not reached', () => {
    it('does not fire alert when failure count is below threshold', async () => {
      const belowThreshold = PUSH_ALERT_COUNT_THRESHOLD - 1;
      mockPrisma.webPushFailureLog.count
        .mockResolvedValueOnce(belowThreshold) // failureCount
        .mockResolvedValueOnce(0);             // ackedCount

      const svc = await buildService('https://hooks.slack.com/test');
      await svc.checkAndAlert();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('threshold reached, no ack', () => {
    it('fires Slack webhook when count >= threshold and no ack exists', async () => {
      mockPrisma.webPushFailureLog.count
        .mockResolvedValueOnce(PUSH_ALERT_COUNT_THRESHOLD)  // failureCount
        .mockResolvedValueOnce(0);                           // ackedCount (none)

      const webhookUrl = 'https://hooks.slack.com/services/test';
      const svc = await buildService(webhookUrl);
      await svc.checkAndAlert();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        }),
      );
      // Verify payload contains count but no userId
      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body) as { text: string };
      expect(body.text).toContain(`${PUSH_ALERT_COUNT_THRESHOLD}/5min`);
      expect(body.text).not.toMatch(/userId/i);
    });

    it('uses logger-only when OPS_ALERT_WEBHOOK_URL is not set', async () => {
      mockPrisma.webPushFailureLog.count
        .mockResolvedValueOnce(PUSH_ALERT_COUNT_THRESHOLD)
        .mockResolvedValueOnce(0);

      const svc = await buildService(undefined); // no webhook URL
      // Should not throw
      await expect(svc.checkAndAlert()).resolves.toBeUndefined();
      // fetch must not be called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('threshold reached, already acknowledged', () => {
    it('suppresses alert when ack exists in the current window', async () => {
      mockPrisma.webPushFailureLog.count
        .mockResolvedValueOnce(PUSH_ALERT_COUNT_THRESHOLD + 5) // failureCount — above threshold
        .mockResolvedValueOnce(1);                              // ackedCount — ack exists

      const svc = await buildService('https://hooks.slack.com/services/test');
      await svc.checkAndAlert();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('webhook delivery failure', () => {
    it('does not throw when fetch rejects', async () => {
      mockPrisma.webPushFailureLog.count
        .mockResolvedValueOnce(PUSH_ALERT_COUNT_THRESHOLD)
        .mockResolvedValueOnce(0);

      mockFetch.mockRejectedValue(new Error('network error'));

      const svc = await buildService('https://hooks.slack.com/services/test');
      await expect(svc.checkAndAlert()).resolves.toBeUndefined();
    });
  });
});
