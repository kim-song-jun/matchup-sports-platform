import { BadRequestException, ConflictException } from '@nestjs/common';
import { issueWithdrawalCancelToken } from './withdrawal-cancel-token';
import { WithdrawalRecoveryService } from './withdrawal-recovery.service';

type Row = { id: string; email: string | null; accountStatus: string; sessionEpoch: number };

/** One user row behind a transaction that only applies the writes the service makes. */
function setup(initial: Partial<Row> = {}) {
  const row: Row = { id: 'user-1', email: 'user@example.com', accountStatus: 'withdrawal_pending', sessionEpoch: 4, ...initial };
  const logs: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
    v1User: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === row.id ? { ...row } : null)),
      update: jest.fn(async ({ data }: { data: { accountStatus: string; sessionEpoch: { increment: number } } }) => {
        row.accountStatus = data.accountStatus;
        row.sessionEpoch += data.sessionEpoch.increment;
        return { id: row.id, email: row.email, sessionEpoch: row.sessionEpoch };
      }),
    },
    v1StatusChangeLog: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { logs.push(data); }) },
  };
  const prisma = { $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)) };
  const auth = { sessionResponse: jest.fn().mockResolvedValue({ session: { userId: row.id } }) };
  const service = new WithdrawalRecoveryService(prisma as never, auth as never);
  return { service, row, logs, tx, prisma, auth };
}

const tokenFor = (row: Pick<Row, 'id' | 'sessionEpoch'>, nowMs?: number) =>
  issueWithdrawalCancelToken(row.id, row.sessionEpoch, nowMs);

describe('WithdrawalRecoveryService.cancel', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('reactivates a withdrawal-pending account, logs the transition and signs it in under the new epoch', async () => {
    const { service, row, logs, auth } = setup();

    await service.cancel(tokenFor(row));

    expect(row).toMatchObject({ accountStatus: 'active', sessionEpoch: 5 });
    expect(logs).toEqual([
      expect.objectContaining({ targetType: 'user', targetId: 'user-1', fromStatus: 'withdrawal_pending', toStatus: 'active', actorType: 'user', actorUserId: 'user-1' }),
    ]);
    expect(auth.sessionResponse).toHaveBeenCalledWith('user-1', 'user@example.com', { sessionEpoch: 5 });
  });

  it('works once: the same token replayed is refused and signs nobody in again', async () => {
    const { service, row, logs, auth } = setup();
    const token = tokenFor(row);

    await service.cancel(token);
    await expect(service.cancel(token)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID' } });

    expect(logs).toHaveLength(1);
    expect(auth.sessionResponse).toHaveBeenCalledTimes(1);
  });

  it('refuses an expired token without opening a transaction', async () => {
    const { service, row, prisma } = setup();
    const token = tokenFor(row, Date.now() - 11 * 60_000);

    await expect(service.cancel(token)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.cancel(token)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a token the server did not sign', async () => {
    const { service, row, prisma } = setup();
    const [payload] = tokenFor(row).split('.');

    await expect(service.cancel(`${payload}.forged`)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 409 once the withdrawal was already processed into a deletion', async () => {
    const { service, row, logs, auth } = setup({ accountStatus: 'deleted' });

    const failure = service.cancel(tokenFor(row));

    await expect(failure).rejects.toBeInstanceOf(ConflictException);
    await expect(failure).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_ALREADY_PROCESSED' } });
    expect(row.accountStatus).toBe('deleted');
    expect(logs).toHaveLength(0);
    expect(auth.sessionResponse).not.toHaveBeenCalled();
  });

  it.each(['active', 'suspended', 'blocked'])('refuses a %s account — only a pending withdrawal can be taken back', async (accountStatus) => {
    const { service, row, logs } = setup({ accountStatus });

    await expect(service.cancel(tokenFor(row))).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID' } });
    expect(row.accountStatus).toBe(accountStatus);
    expect(logs).toHaveLength(0);
  });

  it('refuses a token issued before the session epoch moved (e.g. a password reset since)', async () => {
    const { service, row, logs } = setup({ sessionEpoch: 4 });
    const stale = issueWithdrawalCancelToken(row.id, 3);

    await expect(service.cancel(stale)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID' } });
    expect(row).toMatchObject({ accountStatus: 'withdrawal_pending', sessionEpoch: 4 });
    expect(logs).toHaveLength(0);
  });

  it('refuses a token for an account that no longer exists', async () => {
    const { service } = setup();

    await expect(service.cancel(issueWithdrawalCancelToken('someone-else', 4))).rejects.toMatchObject({
      response: { code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID' },
    });
  });

  it('locks the account row before it reads the status', async () => {
    const { service, row, tx } = setup();

    await service.cancel(tokenFor(row));

    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.v1User.findUnique.mock.invocationCallOrder[0]);
  });
});
