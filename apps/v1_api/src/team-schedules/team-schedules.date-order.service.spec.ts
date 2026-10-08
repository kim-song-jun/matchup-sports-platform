import { Test } from '@nestjs/testing';
import { V1ScheduleState, V1ScheduleType, V1ScheduleVisibility } from '@prisma/client';
import type { V1TeamSchedule } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateScheduleDto, UpdateScheduleDto } from './dto/team-schedule.dto';
import { TeamSchedulesService } from './team-schedules.service';

const manager: V1AuthUser = {
  id: 'manager-1', email: null, accountStatus: 'active', onboardingStatus: 'completed',
};
const createDto: CreateScheduleDto = {
  title: 'Training', type: V1ScheduleType.TRAINING, timezone: 'Asia/Seoul',
  startAt: '2026-10-08T10:00:00+09:00', endAt: '2026-10-08T11:00:00+09:00',
};
const reversedPatch: UpdateScheduleDto = { expectedVersion: 0, endAt: '2026-10-08T09:00:00+09:00' };

async function setup(overrides: Partial<V1TeamSchedule> = {}) {
  const schedule: V1TeamSchedule = {
    id: 'schedule-1', teamId: 'team-1', teamMatchId: null, title: createDto.title,
    type: V1ScheduleType.TRAINING, startAt: new Date(createDto.startAt), endAt: new Date(createDto.endAt),
    timezone: createDto.timezone, capacity: null, rsvpDeadlineAt: null,
    visibility: V1ScheduleVisibility.TEAM, state: V1ScheduleState.SCHEDULED, version: 0,
    cancelReason: null, createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
  const tx = {
    $queryRaw: jest.fn(async (_sql: TemplateStringsArray, ..._values: unknown[]) => [{ id: 'locked-row' }]),
    $executeRaw: jest.fn(async (_sql: TemplateStringsArray, ..._values: unknown[]) => 1),
    v1TeamSchedule: {
      create: jest.fn().mockResolvedValue(schedule),
      findUniqueOrThrow: jest.fn().mockResolvedValue(schedule),
    },
    v1OutboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    v1IdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'record-1' }),
      delete: jest.fn().mockResolvedValue({ id: 'expired-record' }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const module = await Test.createTestingModule({
    providers: [TeamSchedulesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get(TeamSchedulesService), tx, prisma, schedule };
}

function expectNoDataWrites(tx: Awaited<ReturnType<typeof setup>>['tx']) {
  expect(tx.v1TeamSchedule.create).not.toHaveBeenCalled();
  expect(tx.v1OutboxEvent.createMany).not.toHaveBeenCalled();
  expect(tx.v1IdempotencyRecord.create).not.toHaveBeenCalled();
  expect(tx.$executeRaw.mock.calls.filter(([sql]) => /\b(?:UPDATE|INSERT|DELETE)\b/i.test(sql.join('')))).toHaveLength(0);
}

describe('TeamSchedulesService date order', () => {
  it.each([
    ['reversed', '2026-10-08T09:00:00+09:00'],
    ['equal instant with a different offset', '2026-10-08T01:00:00Z'],
    ['unparseable', 'invalid-date'],
  ])('rejects a %s create end before schedule, notice or result writes', async (_case, endAt) => {
    // Given an active manager and a fresh idempotency key.
    const { service, tx } = await setup();
    // When the create's end does not follow its start.
    const operation = service.create(manager, 'team-1', { ...createDto, endAt }, 'create-key');
    // Then the domain error reaches the caller and no data is written.
    await expect(operation).rejects.toMatchObject({
      status: 422, response: { code: 'SCHEDULE_INVALID_TIME_RANGE' },
    });
    expectNoDataWrites(tx);
  });

  it.each([
    { startAt: '2026-10-08T10:00:00+09:00', endAt: '2026-10-08T09:00:00+09:00' },
    { startAt: '2026-10-08T10:00:00+09:00', endAt: '2026-10-08T01:00:00Z' },
    { endAt: '2026-10-08T09:00:00+09:00' },
    { endAt: '2026-10-08T10:00:00+09:00' },
    { startAt: '2026-10-08T12:00:00+09:00' },
    { startAt: '2026-10-08T11:00:00+09:00' },
    { startAt: 'invalid-date' },
  ])('rejects an invalid effective PATCH range %j without SQL mutations', async (patch) => {
    // Given the persisted 10:00–11:00 schedule and current version.
    const { service, tx } = await setup();
    // When supplied dates are combined with the persisted dates.
    const operation = service.update(manager, 'team-1', 'schedule-1', { expectedVersion: 0, ...patch }, 'patch-key');
    // Then no schedule, attendance, notice or idempotency result is written.
    await expect(operation).rejects.toMatchObject({
      status: 422, response: { code: 'SCHEDULE_INVALID_TIME_RANGE' },
    });
    expectNoDataWrites(tx);
  });

  it('creates a valid overnight schedule with the actual parsed dates', async () => {
    // Given a next-day end whose clock time is earlier than the start.
    const dto = { ...createDto, startAt: '2026-10-08T23:00:00+09:00', endAt: '2026-10-09T01:00:00+09:00' };
    const { service, tx } = await setup({ startAt: new Date(dto.startAt), endAt: new Date(dto.endAt) });
    // When the manager creates it.
    const response = await service.create(manager, 'team-1', dto, 'create-key');
    // Then the valid instants, notice and idempotency result are persisted.
    expect(response).toMatchObject({ startAt: new Date(dto.startAt), endAt: new Date(dto.endAt), replayed: false });
    expect(tx.v1TeamSchedule.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      startAt: new Date(dto.startAt), endAt: new Date(dto.endAt),
    }) });
    expect(tx.v1OutboxEvent.createMany).toHaveBeenCalledTimes(1);
    expect(tx.v1IdempotencyRecord.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { patch: { endAt: '2026-10-09T01:00:00+09:00' }, startAt: createDto.startAt, endAt: '2026-10-09T01:00:00+09:00' },
    { patch: { startAt: '2026-10-07T23:00:00+09:00' }, startAt: '2026-10-07T23:00:00+09:00', endAt: createDto.endAt },
    { patch: { title: 'Renamed training' }, startAt: createDto.startAt, endAt: createDto.endAt },
    { patch: { startAt: '2026-10-08T23:00:00+09:00', endAt: '2026-10-09T01:00:00+09:00' },
      startAt: '2026-10-08T23:00:00+09:00', endAt: '2026-10-09T01:00:00+09:00' },
  ])('persists a valid effective PATCH range %j using bound SQL parameters', async ({ patch, startAt, endAt }) => {
    // Given a current schedule and valid complete, partial or date-omitting patch.
    const { service, tx, schedule } = await setup();
    tx.v1TeamSchedule.findUniqueOrThrow.mockResolvedValueOnce(schedule).mockResolvedValue({
      ...schedule, ...patch, startAt: new Date(startAt), endAt: new Date(endAt), version: 1,
    });
    // When the manager applies the patch.
    const response = await service.update(manager, 'team-1', 'schedule-1', { expectedVersion: 0, ...patch }, 'patch-key');
    // Then SQL binds the effective dates and the caller sees the updated entity.
    expect(response).toMatchObject({ startAt: new Date(startAt), endAt: new Date(endAt), version: 1, replayed: false });
    expect(tx.$executeRaw).toHaveBeenNthCalledWith(2, expect.anything(),
      patch.title ?? schedule.title, new Date(startAt), new Date(endAt), null, null, 'TEAM', 'schedule-1', 0);
    expect(tx.v1IdempotencyRecord.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { version: 1, state: V1ScheduleState.SCHEDULED, code: 'VERSION_CONFLICT' },
    { version: 1, state: V1ScheduleState.CANCELLED, code: 'VERSION_CONFLICT' },
    { version: 0, state: V1ScheduleState.COMPLETED, code: 'SCHEDULE_TERMINAL' },
  ])('preserves version/state precedence over invalid dates %j', async ({ code, ...overrides }) => {
    // Given a stale or terminal schedule.
    const { service, tx } = await setup(overrides);
    // When the invalid date patch is attempted.
    const operation = service.update(manager, 'team-1', 'schedule-1', reversedPatch, 'patch-key');
    // Then the existing gate wins and prevents data writes.
    await expect(operation).rejects.toMatchObject({ status: 409, response: { code } });
    expectNoDataWrites(tx);
  });

  it('checks the active account before starting an invalid PATCH transaction', async () => {
    // Given a suspended account.
    const { service, tx, prisma } = await setup();
    // When it submits an invalid patch.
    const operation = service.update({ ...manager, accountStatus: 'suspended' }, 'team-1', 'schedule-1', reversedPatch, 'patch-key');
    // Then account denial precedes any transaction or date validation.
    await expect(operation).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoDataWrites(tx);
  });

  it('checks management permission before validating an invalid PATCH range', async () => {
    // Given an active team but no owner/manager membership.
    const { service, tx } = await setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'team-1' }]).mockResolvedValueOnce([]);
    // When the account submits an invalid patch.
    const operation = service.update(manager, 'team-1', 'schedule-1', reversedPatch, 'patch-key');
    // Then the existing permission denial wins with no writes.
    await expect(operation).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expectNoDataWrites(tx);
  });

  it('replays a committed PATCH before validating its historical invalid range', async () => {
    // Given a committed pre-fix idempotency response for these same dates.
    const { service, tx } = await setup();
    tx.v1IdempotencyRecord.findUnique.mockResolvedValue({
      payloadHash: canonicalGameCommandPayloadHash({ dto: reversedPatch }),
      responseBody: { id: 'schedule-1', version: 1 }, expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    // When the same command is retried.
    const response = await service.update(manager, 'team-1', 'schedule-1', reversedPatch, 'patch-key');
    // Then replay stays authoritative without checking or mutating the schedule.
    expect(response).toEqual({ id: 'schedule-1', version: 1, replayed: true });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expectNoDataWrites(tx);
  });

  it('preserves idempotency payload conflict before invalid date validation', async () => {
    // Given the key was used with a different command.
    const { service, tx } = await setup();
    tx.v1IdempotencyRecord.findUnique.mockResolvedValue({
      payloadHash: 'different-payload', responseBody: {}, expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    // When a reversed-date patch uses that key.
    const operation = service.update(manager, 'team-1', 'schedule-1', reversedPatch, 'patch-key');
    // Then idempotency conflict wins with no mutation.
    await expect(operation).rejects.toMatchObject({ status: 409, response: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' } });
    expectNoDataWrites(tx);
  });

  it('checks the active account before starting an invalid create transaction', async () => {
    // Given a suspended account and a reversed-date command.
    const { service, tx, prisma } = await setup();
    const dto = { ...createDto, endAt: reversedPatch.endAt ?? createDto.endAt };
    // When the account creates a schedule.
    const operation = service.create({ ...manager, accountStatus: 'suspended' }, 'team-1', dto, 'create-key');
    // Then account denial wins without a transaction or data writes.
    await expect(operation).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoDataWrites(tx);
  });

  it('checks management permission before validating an invalid create range', async () => {
    // Given an active team but no owner/manager membership.
    const { service, tx } = await setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'team-1' }]).mockResolvedValueOnce([]);
    // When the account creates a reversed-date schedule.
    const operation = service.create(manager, 'team-1', { ...createDto, endAt: '2026-10-08T09:00:00+09:00' }, 'create-key');
    // Then permission denial wins without any schedule or notice writes.
    await expect(operation).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expectNoDataWrites(tx);
  });

  it('replays a committed create before validating its historical invalid range', async () => {
    // Given a committed pre-fix result for the same reversed-date command.
    const { service, tx } = await setup();
    const dto = { ...createDto, endAt: '2026-10-08T09:00:00+09:00' };
    tx.v1IdempotencyRecord.findUnique.mockResolvedValue({
      payloadHash: canonicalGameCommandPayloadHash({ actorUserId: manager.id, teamId: 'team-1', dto }),
      responseBody: { id: 'schedule-1', version: 0 }, expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    // When the create is retried with its original key.
    const response = await service.create(manager, 'team-1', dto, 'create-key');
    // Then replay remains authoritative without permission or data queries.
    expect(response).toEqual({ id: 'schedule-1', version: 0, replayed: true });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expectNoDataWrites(tx);
  });
});
