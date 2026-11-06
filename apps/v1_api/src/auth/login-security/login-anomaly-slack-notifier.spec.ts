import type { GameOperationClaim } from '../../jobs/v1-game-operations-worker.service';
import { LoginAnomalySlackNotifier, securityEnvironmentLabel } from './login-anomaly-slack-notifier';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';
const payload = {
  anomalyId: 'anomaly-1',
  startedAt: '2026-10-21T12:00:00.000Z',
  failedCount: 128,
  accountCount: 91,
  ipCount: 37,
  windowMinutes: 10,
};
const claim = (overrides: Partial<GameOperationClaim> = {}) =>
  ({ id: 'outbox-1', aggregateId: 'anomaly-1', payload, ...overrides }) as unknown as GameOperationClaim;

function notifier(overrides: Partial<ConstructorParameters<typeof LoginAnomalySlackNotifier>[0]> = {}) {
  const fetchFn = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  return {
    fetchFn,
    notifier: new LoginAnomalySlackNotifier({
      webhookUrl: WEBHOOK,
      frontendUrl: 'https://alpha.teameet.co.kr',
      environment: 'alpha',
      fetchFn: fetchFn as unknown as typeof fetch,
      ...overrides,
    }),
  };
}

describe('LoginAnomalySlackNotifier', () => {
  it('opens with the environment-tagged security line and carries the counts and the hub link', async () => {
    const { notifier: instance, fetchFn } = notifier();

    await instance.handler(claim(), {} as never);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    const message = JSON.parse(String(init.body));
    expect(message.text.split('\n')[0]).toBe('[보안] 로그인 실패 급증 (alpha)');
    expect(message.blocks[0]).toMatchObject({ type: 'header', text: { text: '[보안] 로그인 실패 급증 (alpha)' } });
    expect(JSON.stringify(message)).toContain('로그인 실패 128건');
    expect(JSON.stringify(message)).toContain('계정 91개');
    expect(JSON.stringify(message)).toContain('IP 37개');
    expect(JSON.stringify(message)).toContain('https://alpha.teameet.co.kr/admin/monitoring');
  });

  it.each([
    ['alpha', 'alpha'],
    ['production', 'prod'],
    [undefined, 'unknown'],
    ['staging', 'unknown'],
  ])('labels V1_PUSH_ENVIRONMENT=%s as %s', (value, label) => {
    expect(securityEnvironmentLabel(value)).toBe(label);
  });

  it.each([
    ['a missing webhook', { webhookUrl: undefined }],
    ['a non-Slack webhook host', { webhookUrl: 'https://example.com/services/T/B/X' }],
  ])('refuses %s instead of posting anywhere', async (_label, overrides) => {
    const { notifier: instance, fetchFn } = notifier(overrides);

    await expect(instance.handler(claim(), {} as never)).rejects.toThrow('SLACK_INQUIRY_WEBHOOK_URL must be a valid Slack Incoming Webhook URL');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws on a Slack-side failure so the outbox retry and poison policy applies', async () => {
    const { notifier: instance, fetchFn } = notifier();
    fetchFn.mockResolvedValue(new Response('rate_limited', { status: 429 }));

    await expect(instance.handler(claim(), {} as never)).rejects.toThrow('Slack security webhook failed (429)');
  });

  it('rejects a payload that does not belong to the claimed aggregate', async () => {
    const { notifier: instance, fetchFn } = notifier();

    await expect(instance.handler(claim({ aggregateId: 'someone-else' }), {} as never)).rejects.toThrow('aggregate mismatch');
    await expect(
      instance.handler(claim({ payload: { ...payload, failedCount: 'many' } as never }), {} as never),
    ).rejects.toThrow('failedCount must be a non-negative integer');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires an https frontend URL for the hub link outside localhost', async () => {
    const { notifier: instance } = notifier({ frontendUrl: 'http://alpha.teameet.co.kr' });

    await expect(instance.handler(claim(), {} as never)).rejects.toThrow('FRONTEND_URL must use HTTPS');
  });
});
