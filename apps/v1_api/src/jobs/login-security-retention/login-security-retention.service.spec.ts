import { createLoginSecurityFakePrisma } from '../../../test/helpers/login-security-fake-prisma';
import {
  LOGIN_SECURITY_RETENTION_SCAN_TYPE,
  LoginSecurityRetentionService,
  purgeLoginSecurityRecords,
  scheduleNextLoginSecurityRetentionScan,
} from './login-security-retention.service';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000);

describe('purgeLoginSecurityRecords', () => {
  it('deletes attempts older than 30 days and challenges expired more than 7 days ago, keeping everything newer', async () => {
    const { prisma, state } = createLoginSecurityFakePrisma();
    state.attempts.push(
      { id: 'old-attempt', createdAt: daysAgo(30.01) },
      { id: 'new-attempt', createdAt: daysAgo(29.99) },
    );
    state.challenges.push(
      { id: 'long-expired', expiresAt: daysAgo(7.01), usedAt: null },
      { id: 'recently-expired', expiresAt: daysAgo(6.99), usedAt: null },
      { id: 'still-live', expiresAt: new Date(NOW.getTime() + 60_000), usedAt: null },
      { id: 'used-but-recent', expiresAt: daysAgo(2), usedAt: daysAgo(2) },
    );

    const purged = await purgeLoginSecurityRecords(prisma as never, NOW);

    expect(purged).toEqual({ attempts: 1, challenges: 1 });
    expect(state.attempts.map((row) => row.id)).toEqual(['new-attempt']);
    expect(state.challenges.map((row) => row.id)).toEqual(['recently-expired', 'still-live', 'used-but-recent']);
  });
});

describe('login security retention scan chain', () => {
  it('books the next 6-hour slot once, however many workers ask', async () => {
    const { prisma, state } = createLoginSecurityFakePrisma();

    await scheduleNextLoginSecurityRetentionScan(prisma as never, NOW);
    await scheduleNextLoginSecurityRetentionScan(prisma as never, new Date(NOW.getTime() + 60_000));

    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({
      type: LOGIN_SECURITY_RETENTION_SCAN_TYPE,
      availableAt: new Date('2026-10-21T18:00:00.000Z'),
      businessKey: 'login-security-retention-scan:2026-10-21T18:00:00.000Z',
    });
  });

  it('keeps the chain alive even when the purge itself fails', async () => {
    const { prisma, state } = createLoginSecurityFakePrisma();
    const failingTx = {
      v1LoginAttempt: { deleteMany: jest.fn().mockRejectedValue(new Error('db down')) },
      v1LoginStepUpChallenge: { deleteMany: jest.fn() },
    };
    const service = new LoginSecurityRetentionService(prisma as never);

    await expect(service.scanHandler({} as never, failingTx as never)).rejects.toThrow('db down');

    expect(state.outbox.map((row) => row.type)).toEqual([LOGIN_SECURITY_RETENTION_SCAN_TYPE]);
  });
});
