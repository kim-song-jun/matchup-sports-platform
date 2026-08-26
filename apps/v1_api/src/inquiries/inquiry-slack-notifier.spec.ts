import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
import { InquirySlackNotifier } from './inquiry-slack-notifier';

const claim: GameOperationClaim = {
  id: 'outbox-1',
  businessKey: 'inquiry:inquiry-1:slack-created',
  aggregateType: 'INQUIRY',
  aggregateId: 'inquiry-1',
  revisionId: null,
  type: 'INQUIRY_SLACK_NOTIFICATION',
  payload: {
    inquiryId: 'inquiry-1',
    category: 'payment_refund',
    title: '참가비 환불 문의',
    relatedType: 'tournament',
    relatedId: 'tournament-1',
    createdAt: '2026-08-26T06:30:00.000Z',
  },
  attempts: 0,
  retryGeneration: 0,
  version: 0,
  leaseOwner: 'worker-1',
  leaseUntil: new Date('2026-08-26T06:31:00.000Z'),
};

describe('InquirySlackNotifier', () => {
  it('posts a non-PII Block Kit message with the environment admin link', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    const notifier = new InquirySlackNotifier({
      webhookUrl: 'https://hooks.slack.com/services/T000/B000/secret',
      frontendUrl: 'https://alpha.teameet.co.kr',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await notifier.handler(claim, {} as never);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const message = JSON.parse(String(init.body));
    expect(message.text).toContain('참가비 환불 문의');
    expect(message.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'actions' }),
    ]));
    expect(JSON.stringify(message)).toContain(
      'https://alpha.teameet.co.kr/admin/inquiries/inquiry-1',
    );
    expect(JSON.stringify(message)).not.toContain('문의 본문');
    expect(JSON.stringify(message)).not.toContain('user@teameet.test');
  });

  it('throws on a Slack rejection so the outbox worker retries it', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate_limited' });
    const notifier = new InquirySlackNotifier({
      webhookUrl: 'https://hooks.slack.com/services/T000/B000/secret',
      frontendUrl: 'https://teameet.co.kr',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(notifier.handler(claim, {} as never)).rejects.toThrow(
      'Slack inquiry webhook failed (429)',
    );
  });

  it('fails only this outbox event when the webhook configuration is missing', async () => {
    const fetchFn = jest.fn();
    const notifier = new InquirySlackNotifier({
      frontendUrl: 'https://teameet.co.kr',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(notifier.handler(claim, {} as never)).rejects.toThrow(
      'SLACK_INQUIRY_WEBHOOK_URL',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
