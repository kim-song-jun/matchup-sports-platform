import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  OUTBOX_RETENTION_SCAN_TYPE,
  OutboxRetentionService,
  pruneCompletedOutboxEvents,
} from '../../src/jobs/outbox-retention/outbox-retention.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';

type Status = 'PENDING' | 'RETRY' | 'PROCESSING' | 'POISONED' | 'COMPLETED';

const keyPrefix = `outbox-retention-spec:${randomUUID()}:`;

describe('completed outbox retention', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE business_key LIKE ${`${keyPrefix}%`}`;
    await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE type = ${OUTBOX_RETENTION_SCAN_TYPE}`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deletes only COMPLETED rows of prunable types past 30 days and keeps every other row', async () => {
    const doomed = [
      await insertEvent({ name: 'old-scan', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 40 }),
      await insertEvent({ name: 'old-inquiry', type: 'INQUIRY_SLACK_NOTIFICATION', status: 'COMPLETED', availableDaysAgo: 45 }),
    ];
    const kept = [
      await insertEvent({ name: 'recent-scan', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 10 }),
      await insertEvent({ name: 'recent-inquiry', type: 'INQUIRY_SLACK_NOTIFICATION', status: 'COMPLETED', availableDaysAgo: 29 }),
      // Scheduled long ago but completed recently: the completion time decides.
      await insertEvent({
        name: 'late-completed', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 40, updatedDaysAgo: 5,
      }),
      await insertEvent({ name: 'old-pending', type: 'LINEUP_REMINDER_SCAN', status: 'PENDING', availableDaysAgo: 40 }),
      await insertEvent({ name: 'old-retry', type: 'INQUIRY_SLACK_NOTIFICATION', status: 'RETRY', availableDaysAgo: 40 }),
      await insertEvent({ name: 'old-processing', type: 'LINEUP_REMINDER_SCAN', status: 'PROCESSING', availableDaysAgo: 40 }),
      await insertEvent({ name: 'old-poisoned', type: 'INQUIRY_SLACK_NOTIFICATION', status: 'POISONED', availableDaysAgo: 40 }),
      // Manual reminders can re-insert the same key and dedupe notifications by row id.
      await insertEvent({ name: 'old-rsvp-reminder', type: 'SCHEDULE_RSVP_DEADLINE_REMINDER', status: 'COMPLETED', availableDaysAgo: 400 }),
      await insertEvent({
        name: 'old-recruitment-reminder', type: 'SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER', status: 'COMPLETED', availableDaysAgo: 400,
      }),
      // A schedule restored by a fixture edit can be cancelled again under the same key.
      await insertEvent({
        name: 'old-schedule-cancelled', type: 'SCHEDULE_CANCELLED_NOTIFICATION', status: 'COMPLETED', availableDaysAgo: 400,
      }),
      await insertEvent({ name: 'old-video-cleanup', type: 'VIDEO_UPLOAD_CLEANUP', status: 'COMPLETED', availableDaysAgo: 400 }),
      await insertEvent({ name: 'old-official', type: 'GAME_RESULT_OFFICIAL', status: 'COMPLETED', availableDaysAgo: 400 }),
    ];

    // Each integration file runs on its own cloned database, so these are the only rows.
    await expect(pruneCompletedOutboxEvents(prisma)).resolves.toBe(doomed.length);
    expect(await remainingKeys()).toEqual([...kept].sort());
  });

  it('deletes at most batchSize × maxBatches rows per call, oldest first', async () => {
    await insertEvent({ name: 'oldest', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 1_000 });
    await insertEvent({ name: 'older', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 999 });
    const newest = await insertEvent({ name: 'newest', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 998 });

    await expect(pruneCompletedOutboxEvents(prisma, { batchSize: 1, maxBatches: 2 })).resolves.toBe(2);
    expect(await remainingKeys()).toEqual([newest]);

    await expect(pruneCompletedOutboxEvents(prisma, { batchSize: 1, maxBatches: 2 })).resolves.toBe(1);
    expect(await remainingKeys()).toEqual([]);
  });

  it('runs as a worker job: completes its claim, schedules the next hourly slot, and prunes', async () => {
    const scan = await insertEvent({ name: 'due-scan', type: OUTBOX_RETENTION_SCAN_TYPE, status: 'PENDING', availableDaysAgo: 0 });
    const stale = await insertEvent({ name: 'stale', type: 'LINEUP_REMINDER_SCAN', status: 'COMPLETED', availableDaysAgo: 1_000 });
    const worker = new V1GameOperationsWorkerService(prisma);
    worker.registerHandler(OUTBOX_RETENTION_SCAN_TYPE, new OutboxRetentionService(prisma).scanHandler);
    const startedAt = Date.now();

    await expect(worker.processOne()).resolves.toBe(true);

    const rows = await prisma.v1OutboxEvent.findMany({
      where: { type: OUTBOX_RETENTION_SCAN_TYPE },
      select: { businessKey: true, status: true, availableAt: true },
    });
    expect(rows.find((row) => row.businessKey === scan)?.status).toBe('COMPLETED');
    const next = rows.filter((row) => row.status === 'PENDING');
    expect(next).toHaveLength(1);
    expect(next[0].businessKey).toBe(`outbox-retention-scan:${next[0].availableAt.toISOString()}`);
    expect(next[0].availableAt.getTime() % 3_600_000).toBe(0);
    expect(next[0].availableAt.getTime()).toBeGreaterThan(startedAt);
    expect(next[0].availableAt.getTime()).toBeLessThanOrEqual(startedAt + 2 * 3_600_000);
    expect(await remainingKeys()).not.toContain(stale);
  });

  async function insertEvent(options: {
    name: string;
    type: string;
    status: Status;
    availableDaysAgo: number;
    updatedDaysAgo?: number;
  }): Promise<string> {
    const businessKey = `${keyPrefix}${options.name}`;
    const updatedDaysAgo = options.updatedDaysAgo ?? options.availableDaysAgo;
    const processing = options.status === 'PROCESSING';
    // Floor to milliseconds so a due row is never stored later than the next claim's clock.
    await prisma.$executeRaw`
      INSERT INTO v1_outbox_events (
        id, business_key, aggregate_type, aggregate_id, type, payload, available_at,
        lease_owner, lease_until, attempts, retry_generation, version, status, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${businessKey}, 'OUTBOX_RETENTION_SPEC', ${options.name}, ${options.type}, '{}'::jsonb,
        date_trunc('milliseconds', CURRENT_TIMESTAMP) - (${options.availableDaysAgo}::int * INTERVAL '1 day') - INTERVAL '1 second',
        ${processing ? 'retention-spec-owner' : null},
        ${processing ? new Date(Date.now() + 30_000) : null},
        ${options.status === 'POISONED' ? 6 : 1}, 0, 0, ${options.status}::"V1OutboxStatus",
        date_trunc('milliseconds', CURRENT_TIMESTAMP) - (${options.availableDaysAgo}::int * INTERVAL '1 day'),
        date_trunc('milliseconds', CURRENT_TIMESTAMP) - (${updatedDaysAgo}::int * INTERVAL '1 day')
      )
    `;
    return businessKey;
  }

  async function remainingKeys(): Promise<string[]> {
    const rows = await prisma.v1OutboxEvent.findMany({
      where: { businessKey: { startsWith: keyPrefix } },
      select: { businessKey: true },
    });
    return rows.map((row) => row.businessKey).sort();
  }
});
