import { Prisma } from '@prisma/client';
import {
  EMAIL_DELIVERY_FAILED_TYPE,
  EMAIL_FAILURE_ALERT_DELAY_MS,
  emailFailureErrorName,
  recordEmailDeliveryFailure,
  type EmailDeliveryFailedPayload,
} from './email-delivery-failure';

type OutboxRow = {
  id: string;
  businessKey: string;
  aggregateType: string;
  aggregateId: string;
  type: string;
  status: string;
  payload: EmailDeliveryFailedPayload;
  availableAt: Date;
};

/** The outbox table behind a transaction; business_key is unique like the real column. */
function setup() {
  const rows: OutboxRow[] = [];
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    v1OutboxEvent: {
      findUnique: jest.fn(async ({ where }: { where: { businessKey: string } }) => rows.find((row) => row.businessKey === where.businessKey) ?? null),
      create: jest.fn(async ({ data }: { data: Omit<OutboxRow, 'id' | 'status'> }) => {
        if (rows.some((row) => row.businessKey === data.businessKey)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
        }
        rows.push({ ...data, id: `outbox-${rows.length + 1}`, status: 'PENDING' });
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; status: string }; data: { payload: EmailDeliveryFailedPayload } }) => {
        const row = rows.find((candidate) => candidate.id === where.id && candidate.status === where.status);
        if (row) row.payload = data.payload;
        return { count: row ? 1 : 0 };
      }),
    },
  };
  const prisma = { $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)) };
  return { rows, prisma: prisma as never };
}

const sesError = (name = 'AccessDeniedException') => Object.assign(new Error('User: arn:aws:iam::1:user/x is not authorized to send to someone@example.com'), { name });
const at = (iso: string) => new Date(iso);

describe('recordEmailDeliveryFailure', () => {
  it('opens one outbox event on the first failure of a window, delayed so a burst is counted together', async () => {
    const { rows, prisma } = setup();
    const now = at('2026-10-31T10:20:30.000Z');

    await recordEmailDeliveryFailure(prisma, { purpose: 'password_reset', error: sesError(), now });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessKey: 'email-delivery-failed:2026-10-31T10:00:00.000Z',
      aggregateType: 'EMAIL_DELIVERY',
      aggregateId: '2026-10-31T10:00:00.000Z',
      type: EMAIL_DELIVERY_FAILED_TYPE,
      payload: { windowStart: '2026-10-31T10:00:00.000Z', failureCount: 1, errorName: 'AccessDeniedException', purposes: { password_reset: 1 } },
    });
    expect(rows[0].availableAt.getTime()).toBe(now.getTime() + EMAIL_FAILURE_ALERT_DELAY_MS);
  });

  it('folds further failures in the same window into that one event instead of opening another', async () => {
    const { rows, prisma } = setup();

    await recordEmailDeliveryFailure(prisma, { purpose: 'password_reset', error: sesError(), now: at('2026-10-31T10:01:00Z') });
    await recordEmailDeliveryFailure(prisma, { purpose: 'login_step_up', error: sesError('MessageRejected'), now: at('2026-10-31T10:30:00Z') });
    await recordEmailDeliveryFailure(prisma, { purpose: 'password_reset', error: sesError(), now: at('2026-10-31T10:59:59Z') });

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({
      windowStart: '2026-10-31T10:00:00.000Z',
      failureCount: 3,
      errorName: 'AccessDeniedException',
      purposes: { password_reset: 2, login_step_up: 1 },
    });
  });

  it('opens a new event once the hour rolls over', async () => {
    const { rows, prisma } = setup();

    await recordEmailDeliveryFailure(prisma, { purpose: 'verify', error: sesError(), now: at('2026-10-31T10:59:59Z') });
    await recordEmailDeliveryFailure(prisma, { purpose: 'verify', error: sesError(), now: at('2026-10-31T11:00:00Z') });

    expect(rows.map((row) => row.businessKey)).toEqual([
      'email-delivery-failed:2026-10-31T10:00:00.000Z',
      'email-delivery-failed:2026-10-31T11:00:00.000Z',
    ]);
  });

  it('leaves an event the worker already claimed untouched and does not open a second one for that window', async () => {
    const { rows, prisma } = setup();
    await recordEmailDeliveryFailure(prisma, { purpose: 'password_reset', error: sesError(), now: at('2026-10-31T10:01:00Z') });
    rows[0].status = 'PROCESSING';

    await recordEmailDeliveryFailure(prisma, { purpose: 'password_reset', error: sesError(), now: at('2026-10-31T10:05:00Z') });

    expect(rows).toHaveLength(1);
    expect(rows[0].payload.failureCount).toBe(1);
  });

  it('never stores the recipient, the error message or anything but identifiers and counts', async () => {
    const { rows, prisma } = setup();

    await recordEmailDeliveryFailure(prisma, { purpose: 'password_reset', error: sesError(), now: at('2026-10-31T10:01:00Z') });

    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain('someone@example.com');
    expect(stored).not.toContain('not authorized');
  });
});

describe('emailFailureErrorName', () => {
  it.each([
    [sesError('MessageRejected'), 'MessageRejected'],
    [sesError('CredentialsProviderError'), 'CredentialsProviderError'],
    [Object.assign(new Error('x'), { name: 'a@example.com failed' }), 'UnknownError'],
    [Object.assign(new Error('x'), { name: '' }), 'UnknownError'],
    ['plain string', 'UnknownError'],
    [undefined, 'UnknownError'],
  ])('keeps only a plain error class name: %p -> %s', (error, expected) => {
    expect(emailFailureErrorName(error)).toBe(expected);
  });
});
