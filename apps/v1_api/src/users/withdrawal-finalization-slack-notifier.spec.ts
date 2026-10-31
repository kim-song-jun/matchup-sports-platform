import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
import { WithdrawalFinalizationSlackNotifier } from './withdrawal-finalization-slack-notifier';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';
const RUN_AT = '2026-11-30T12:00:00.000Z';
const payload = {
  runAt: RUN_AT,
  finalizedCount: 3,
  skipped: [
    { userId: 'user-admin', reason: 'active_admin' },
    { userId: 'user-nolog', reason: 'no_request_log' },
  ],
};
const claim = (overrides: Partial<GameOperationClaim> = {}) =>
  ({ id: 'outbox-1', aggregateId: RUN_AT, payload, ...overrides }) as unknown as GameOperationClaim;

function notifier(overrides: Partial<ConstructorParameters<typeof WithdrawalFinalizationSlackNotifier>[0]> = {}) {
  const fetchFn = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  return {
    fetchFn,
    notifier: new WithdrawalFinalizationSlackNotifier({
      webhookUrl: WEBHOOK,
      environment: 'prod',
      fetchFn: fetchFn as unknown as typeof fetch,
      ...overrides,
    }),
  };
}

async function sentMessage(instance: WithdrawalFinalizationSlackNotifier, fetchFn: jest.Mock, claimed = claim()) {
  await instance.handler(claimed, {} as never);
  const [, init] = fetchFn.mock.calls[0];
  return JSON.parse(String(init.body));
}

describe('WithdrawalFinalizationSlackNotifier', () => {
  it('names the environment, how many were deleted, and each account that needs a person with its reason', async () => {
    const { notifier: instance, fetchFn } = notifier();

    const message = await sentMessage(instance, fetchFn);

    expect(fetchFn.mock.calls[0][0]).toBe(WEBHOOK);
    expect(message.text.split('\n')[0]).toBe('[탈퇴] 30일이 지난 계정 삭제 (prod)');
    const flat = JSON.stringify(message);
    expect(flat).toContain('삭제 3건');
    expect(flat).toContain('사람이 확인할 계정 2건');
    expect(flat).toContain('user-admin — 운영자 권한이 남아 있어요');
    expect(flat).toContain('user-nolog — 탈퇴 신청 기록이 없어요');
  });

  it('has no list of accounts when nothing was skipped', async () => {
    const { notifier: instance, fetchFn } = notifier();

    const message = await sentMessage(instance, fetchFn, claim({ payload: { ...payload, skipped: [] } as never }));

    const flat = JSON.stringify(message);
    expect(flat).toContain('삭제 3건');
    expect(flat).not.toContain('사람이 확인할');
    expect(flat).not.toContain('건너뛴 계정');
  });

  it('lists at most twenty accounts and counts the rest', async () => {
    const { notifier: instance, fetchFn } = notifier();
    const skipped = Array.from({ length: 25 }, (_, index) => ({ userId: `user-${index}`, reason: 'team_authority' }));

    const message = await sentMessage(instance, fetchFn, claim({ payload: { ...payload, finalizedCount: 0, skipped } as never }));

    const flat = JSON.stringify(message);
    expect(flat).toContain('user-19');
    expect(flat).not.toContain('user-20');
    expect(flat).toContain('그 밖에 5건');
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

    await expect(instance.handler(claim(), {} as never)).rejects.toThrow('Slack withdrawal-finalization webhook failed (429)');
  });

  it.each([
    ['a payload that is not an object', { payload: 'nope' }],
    ['a run time that does not match the outbox row', { aggregateId: '2026-01-01T00:00:00.000Z' }],
    ['a negative count', { payload: { ...payload, finalizedCount: -1 } }],
    ['skipped that is not a list', { payload: { ...payload, skipped: 'u1' } }],
    ['an unknown reason', { payload: { ...payload, skipped: [{ userId: 'u1', reason: 'because' }] } }],
    ['an entry without an id', { payload: { ...payload, skipped: [{ reason: 'active_admin' }] } }],
  ])('rejects %s without posting', async (_name, overrides) => {
    const { notifier: instance, fetchFn } = notifier();

    await expect(instance.handler(claim(overrides as Partial<GameOperationClaim>), {} as never)).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
