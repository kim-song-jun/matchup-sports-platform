import type { GameOperationClaim } from '../../jobs/v1-game-operations-worker.service';
import { EmailDeliveryFailureSlackNotifier } from './email-delivery-failure-slack-notifier';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';
const payload = {
  windowStart: '2026-10-31T10:00:00.000Z',
  failureCount: 14,
  errorName: 'AccessDeniedException',
  purposes: { password_reset: 9, login_step_up: 5 },
};
const claim = (overrides: Partial<GameOperationClaim> = {}) =>
  ({ id: 'outbox-1', aggregateId: payload.windowStart, payload, ...overrides }) as unknown as GameOperationClaim;

function notifier(overrides: Partial<ConstructorParameters<typeof EmailDeliveryFailureSlackNotifier>[0]> = {}) {
  const fetchFn = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  return {
    fetchFn,
    notifier: new EmailDeliveryFailureSlackNotifier({
      webhookUrl: WEBHOOK,
      environment: 'prod',
      fetchFn: fetchFn as unknown as typeof fetch,
      ...overrides,
    }),
  };
}

describe('EmailDeliveryFailureSlackNotifier', () => {
  it('names the environment, the failure count, the SES error and the purposes', async () => {
    const { notifier: instance, fetchFn } = notifier();

    await instance.handler(claim(), {} as never);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    const message = JSON.parse(String(init.body));
    expect(message.text.split('\n')[0]).toBe('[메일] 인증 메일 발송 실패 (prod)');
    const flat = JSON.stringify(message);
    expect(flat).toContain('발송 실패 14건');
    expect(flat).toContain('SES 오류 AccessDeniedException');
    expect(flat).toContain('비밀번호 재설정 9건');
    expect(flat).toContain('로그인 추가 인증 5건');
    expect(flat).not.toContain('이메일 인증 ');
  });

  it('refuses a missing or non-Slack webhook instead of posting anywhere', async () => {
    const missing = notifier({ webhookUrl: undefined });
    await expect(missing.notifier.handler(claim(), {} as never)).rejects.toThrow('SLACK_INQUIRY_WEBHOOK_URL must be a valid Slack Incoming Webhook URL');
    const foreign = notifier({ webhookUrl: 'https://example.com/services/T/B/X' });
    await expect(foreign.notifier.handler(claim(), {} as never)).rejects.toThrow('must be a valid Slack Incoming Webhook URL');
    expect(missing.fetchFn).not.toHaveBeenCalled();
    expect(foreign.fetchFn).not.toHaveBeenCalled();
  });

  it('throws on a Slack-side failure so the outbox retry and poison policy applies', async () => {
    const { notifier: instance, fetchFn } = notifier();
    fetchFn.mockResolvedValue(new Response('rate_limited', { status: 429 }));

    await expect(instance.handler(claim(), {} as never)).rejects.toThrow('Slack email-delivery webhook failed (429)');
  });

  it.each([
    ['a payload for another window', { aggregateId: '2026-10-31T09:00:00.000Z' }, 'does not match outbox'],
    ['a zero failure count', { payload: { ...payload, failureCount: 0 } }, 'failureCount must be a positive integer'],
    ['a missing error name', { payload: { ...payload, errorName: '' } }, 'errorName must be a non-empty string'],
    ['a non-numeric purpose count', { payload: { ...payload, purposes: { password_reset: 'many' } } }, 'purposes.password_reset must be a positive integer'],
    ['a non-object payload', { payload: 'oops' }, 'Invalid email delivery payload'],
  ])('rejects %s without posting', async (_label, overrides, error) => {
    const { notifier: instance, fetchFn } = notifier();

    await expect(instance.handler(claim(overrides as Partial<GameOperationClaim>), {} as never)).rejects.toThrow(error);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
