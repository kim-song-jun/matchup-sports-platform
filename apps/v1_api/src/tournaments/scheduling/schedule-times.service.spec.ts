import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleTimesService } from './schedule-times.service';
import { CreateScheduleTimeDto, UpdateScheduleTimeDto } from './schedule-times.dto';
import { updateTournamentMatchInTx } from '../tournament-match-update';
import { assertFixtureScheduleKeepsStageOrder } from '../tournament-schedule-order';

jest.mock('../tournament-match-update', () => ({ updateTournamentMatchInTx: jest.fn() }));
jest.mock('../tournament-schedule-order', () => ({ assertFixtureScheduleKeepsStageOrder: jest.fn() }));
type ScheduledFixture = { id: string; tournamentId: string; startAt: Date; game: { state: string } | null; fieldId: string; placeName: string };

function setup(role: 'owner' | 'ops' | 'support' | null = 'ops', directorTournament?: string) {
  const rows: { id: string; tournamentId: string; scheduledAt: Date }[] = [];
  const logs: unknown[] = [];
  const fixtures: ScheduledFixture[] = [];
  const db = {
    v1AdminUser: { findUnique: jest.fn(async () => role ? { id: 'admin', userId: 'actor', adminRole: role, status: 'active', user: { accountStatus: 'active' } } : null) },
    v1Tournament: { findFirst: jest.fn(async () => ({ id: 't1', format: 'league_knockouts' })) },
    v1TournamentStaffAssignment: { findFirst: jest.fn(async (args: { where: { tournamentId?: string } }) =>
      directorTournament && (!args.where.tournamentId || args.where.tournamentId === directorTournament) ? { id: 'assignment', version: 1, tournamentId: directorTournament } : null) },
    v1TournamentScheduleTime: {
      findUnique: jest.fn(async ({ where }: { where: { tournamentId_scheduledAt: { tournamentId: string; scheduledAt: Date } } }) =>
        rows.find(row => row.tournamentId === where.tournamentId_scheduledAt.tournamentId && +row.scheduledAt === +where.tournamentId_scheduledAt.scheduledAt) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { scheduledAt: Date } }) => {
        const row = rows.find(item => item.id === where.id)!; row.scheduledAt = data.scheduledAt; return row;
      }),
      create: jest.fn(async ({ data }: { data: { tournamentId: string; scheduledAt: Date } }) => {
        const row = { id: 'from-existing-fixture', ...data }; rows.push(row); return row;
      }),
      findMany: jest.fn(async ({ where }: { where: { tournamentId: string } }) => rows.filter(row => row.tournamentId === where.tournamentId).sort((a, b) => +a.scheduledAt - +b.scheduledAt)),
      createMany: jest.fn(async ({ data }: { data: typeof rows }) => {
        const item = data[0];
        if (rows.some(row => row.tournamentId === item.tournamentId && +row.scheduledAt === +item.scheduledAt)) return { count: 0 };
        rows.push(item); return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { tournamentId_scheduledAt: { tournamentId: string; scheduledAt: Date } } }) => rows.find(row => row.tournamentId === where.tournamentId_scheduledAt.tournamentId && +row.scheduledAt === +where.tournamentId_scheduledAt.scheduledAt)!),
    },
    v1TeamMatch: {
      findMany: jest.fn(async ({ where }: { where: { tournamentId: string; startAt: Date } }) => fixtures.filter(row => row.tournamentId === where.tournamentId && +row.startAt === +where.startAt)),
      findFirst: jest.fn(async ({ where }: { where: { tournamentId: string; startAt: Date } }) => fixtures.find(row => row.tournamentId === where.tournamentId && +row.startAt === +where.startAt) ?? null),
    },
    v1AdminActionLog: { create: jest.fn(async (args: unknown) => { logs.push(args); return { id: 'log' }; }) },
    v1OperationAudit: { create: jest.fn(async (args: unknown) => { logs.push(args); return { id: 'audit' }; }) },
    $queryRaw: jest.fn(async () => []),
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db));
  const prisma = db as unknown as PrismaService;
  const service = new ScheduleTimesService(prisma, new AdminContextService(prisma));
  jest.mocked(updateTournamentMatchInTx).mockImplementation(async (_tx, input) => {
    const fixture = fixtures.find(row => row.id === input.teamMatchId)!;
    fixture.startAt = input.scheduledAt!;
    return {} as Awaited<ReturnType<typeof updateTournamentMatchInTx>>;
  });
  jest.mocked(assertFixtureScheduleKeepsStageOrder).mockReset();
  return { service, db, rows, logs, fixtures };
}
const user = { id: 'actor' } as never;

describe('ScheduleTimesService', () => {
  const edit = { expectedScheduleTimeId: null as string | null, expectedScheduledAt: '2026-11-21T01:00:00Z', scheduledAt: '2026-11-21T02:00:00Z' };
  const fixture = (id: string, tournamentId = 't1'): ScheduledFixture => ({ id, tournamentId, startAt: new Date(edit.expectedScheduledAt), game: { state: 'SCHEDULED' }, fieldId: 'court-a', placeName: 'A구장' });

  it('moves the registered item and all its games while preserving courts and competition isolation', async () => {
    const { service, rows, fixtures } = setup();
    await service.create(user, 't1', { scheduledAt: edit.expectedScheduledAt });
    const originalId = rows[0].id;
    fixtures.push(fixture('first'), fixture('second'), fixture('other', 't2'));
    const command = { ...edit, expectedScheduleTimeId: originalId };
    const result = await service.update(user, 't1', command);
    expect(result.item?.id).toBe(originalId);
    expect(result.affectedFixtureCount).toBe(2);
    expect(rows[0].scheduledAt.toISOString()).toBe('2026-11-21T02:00:00.000Z');
    expect(fixtures.map(row => [row.startAt.toISOString(), row.fieldId, row.placeName])).toEqual([
      ['2026-11-21T02:00:00.000Z', 'court-a', 'A구장'], ['2026-11-21T02:00:00.000Z', 'court-a', 'A구장'],
      ['2026-11-21T01:00:00.000Z', 'court-a', 'A구장'],
    ]);
    expect(assertFixtureScheduleKeepsStageOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ movingTeamMatchIds: ['first', 'second'] }));
    await expect(service.update(user, 't1', command)).rejects.toMatchObject({ response: { code: 'SCHEDULE_TIME_STALE' } });
  });

  it('can rename an unused choice and a legacy fixture-only time', async () => {
    const unused = setup();
    await unused.service.create(user, 't1', { scheduledAt: edit.expectedScheduledAt });
    expect((await unused.service.update(user, 't1', { ...edit, expectedScheduleTimeId: unused.rows[0].id })).affectedFixtureCount).toBe(0);
    const legacy = setup(); legacy.fixtures.push(fixture('legacy'));
    expect((await legacy.service.update(user, 't1', { ...edit, expectedFixtureIds: ['legacy'] })).item?.scheduledAt.toISOString()).toBe('2026-11-21T02:00:00.000Z');
    expect(legacy.rows).toHaveLength(1);
  });

  it.each(['preset', 'fixture'])('rejects a destination already used by another %s without moving games', async kind => {
    const { service, fixtures, rows } = setup();
    await service.create(user, 't1', { scheduledAt: edit.expectedScheduledAt }); fixtures.push(fixture('first'));
    if (kind === 'preset') await service.create(user, 't1', { scheduledAt: edit.scheduledAt });
    else fixtures.push({ ...fixture('destination'), startAt: new Date(edit.scheduledAt) });
    await expect(service.update(user, 't1', { ...edit, expectedScheduleTimeId: rows[0].id })).rejects.toMatchObject({ response: { code: 'SCHEDULE_TIME_DUPLICATE' } });
    expect(fixtures[0].startAt.toISOString()).toBe('2026-11-21T01:00:00.000Z');
    expect(rows[0].scheduledAt.toISOString()).toBe('2026-11-21T01:00:00.000Z');
  });

  it.each(['LIVE', 'ENDED', 'CANCELLED'])('rejects the whole group if a game is %s', async state => {
    const { service, fixtures, rows } = setup();
    await service.create(user, 't1', { scheduledAt: edit.expectedScheduledAt }); fixtures.push(fixture('first'), { ...fixture('locked'), game: { state } });
    await expect(service.update(user, 't1', { ...edit, expectedScheduleTimeId: rows[0].id })).rejects.toMatchObject({ response: { code: 'SCHEDULE_TIME_FIXTURE_STARTED' } });
    expect(fixtures.every(row => +row.startAt === Date.parse(edit.expectedScheduledAt))).toBe(true);
    expect(+rows[0].scheduledAt).toBe(Date.parse(edit.expectedScheduledAt));
  });

  it('rechecks write permissions for support, other directors and league surfaces', async () => {
    await expect(setup('support').service.update(user, 't1', edit)).rejects.toThrow(ForbiddenException);
    await expect(setup(null, 't2').service.update(user, 't1', edit)).rejects.toThrow(ForbiddenException);
    await expect(setup(null, 't1').service.update(user, 't1', edit, 'league-matches')).rejects.toThrow(ForbiddenException);
  });

  it('does not let an old editor overwrite a different preset recreated at the same instant', async () => {
    const { service, rows } = setup();
    const first = await service.create(user, 't1', { scheduledAt: edit.expectedScheduledAt });
    const oldCommand = { ...edit, expectedScheduleTimeId: first.item.id };
    await service.update(user, 't1', oldCommand);
    const replacement = await service.create(user, 't1', { scheduledAt: edit.expectedScheduledAt });
    expect(replacement.item.id).not.toBe(first.item.id);
    await expect(service.update(user, 't1', { ...oldCommand, scheduledAt: '2026-11-21T03:00:00Z' })).rejects.toMatchObject({ response: { code: 'SCHEDULE_TIME_STALE' } });
    expect(rows.find(row => row.id === replacement.item.id)?.scheduledAt.toISOString()).toBe('2026-11-21T01:00:00.000Z');
  });

  it('pins legacy group membership instead of moving replacement games at a reused instant', async () => {
    const { service, fixtures } = setup(); fixtures.push(fixture('original'));
    const oldCommand = { ...edit, expectedFixtureIds: ['original'] };
    await service.update(user, 't1', oldCommand);
    fixtures.push(fixture('replacement'));
    await expect(service.update(user, 't1', { ...oldCommand, scheduledAt: '2026-11-21T03:00:00Z' })).rejects.toMatchObject({ response: { code: 'SCHEDULE_TIME_STALE' } });
    expect(fixtures.find(row => row.id === 'replacement')?.startAt.toISOString()).toBe('2026-11-21T01:00:00.000Z');
  });
  it('persists KST instants, lists by date and retries duplicate creation without duplicating rows/audit', async () => {
    const { service, rows, logs } = setup();
    const first = await service.create(user, 't1', { scheduledAt: '2026-11-21T10:00:00+09:00' });
    const replay = await service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' });
    expect(replay.item.id).toBe(first.item.id);
    await service.create(user, 't1', { scheduledAt: '2026-11-21T09:30:00+09:00' });
    expect((await service.list(user, 't1')).items.map(row => row.scheduledAt.toISOString())).toEqual(['2026-11-21T00:30:00.000Z', '2026-11-21T01:00:00.000Z']);
    expect(rows).toHaveLength(2); expect(logs).toHaveLength(2);
    expect((await service.list(user, 't2')).items).toEqual([]);
  });
  it('allows support reads but rejects writes without creating a time or audit', async () => {
    const { service, rows, logs } = setup('support');
    expect(await service.list(user, 't1')).toEqual({ items: [] });
    await expect(service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' })).rejects.toThrow(ForbiddenException);
    expect(rows).toHaveLength(0); expect(logs).toHaveLength(0);
  });
  it('allows only the assigned director tournament, including audit provenance', async () => {
    const { service, rows, logs } = setup(null, 't1');
    await service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' });
    await expect(service.create(user, 't2', { scheduledAt: '2026-11-21T01:00:00Z' })).rejects.toThrow(ForbiddenException);
    await expect(service.list(user, 't2')).rejects.toThrow(ForbiddenException);
    expect(rows).toHaveLength(1); expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ data: { actorUserId: 'actor', tournamentId: 't1' } });
  });
  it('rejects non-admins before returning times', async () => {
    const { service, db } = setup(null);
    await expect(service.list(user, 't1')).rejects.toThrow(ForbiddenException);
    expect(db.v1TournamentScheduleTime.findMany).not.toHaveBeenCalled();
  });
  it('stores league times with platform permissions and the league kind filter', async () => {
    const { service, db, rows, logs } = setup();
    db.v1Tournament.findFirst.mockResolvedValue({ id: 't1', format: 'league' });
    await service.create(user, 't1', { scheduledAt: '2026-11-21T10:00:00+09:00' }, 'league-matches');
    await service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' }, 'league-matches');
    expect((await service.list(user, 't1', 'league-matches')).items).toHaveLength(1);
    expect(rows).toHaveLength(1); expect(logs).toHaveLength(1);
    expect(db.v1Tournament.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      AND: [{ OR: [{ kind: 'regular_league' }] }, { id: 't1', deletedAt: null }],
    } }));
  });
  it('does not grant league time access to tournament directors and blocks support writes', async () => {
    const director = setup(null, 't1');
    await expect(director.service.list(user, 't1', 'league-matches')).rejects.toThrow(ForbiddenException);
    await expect(director.service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' }, 'league-matches')).rejects.toThrow(ForbiddenException);
    const support = setup('support');
    expect(await support.service.list(user, 't1', 'league-matches')).toEqual({ items: [] });
    await expect(support.service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' }, 'league-matches')).rejects.toThrow(ForbiddenException);
    expect(support.rows).toHaveLength(0);
  });
  it('rejects missing or unsupported tournaments without creating times', async () => {
    const { service, db, rows } = setup();
    db.v1Tournament.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' })).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    db.v1Tournament.findFirst.mockResolvedValueOnce({ id: 't1', format: 'knockout' });
    await expect(service.create(user, 't1', { scheduledAt: '2026-11-21T01:00:00Z' })).rejects.toMatchObject({ response: { code: 'SCHEDULE_TIMES_FORMAT_UNSUPPORTED' } });
    expect(rows).toHaveLength(0);
  });
});
describe('CreateScheduleTimeDto', () => {
  it('requires a timezone-qualified expected instant on updates and rejects UI-only keys', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    const valid = { expectedScheduleTimeId: '00000000-0000-4000-8000-000000000001', expectedScheduledAt: '2026-11-21T10:00:00+09:00', scheduledAt: '2026-11-21T11:00:00+09:00' };
    expect(await validate(plainToInstance(UpdateScheduleTimeDto, valid), options)).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateScheduleTimeDto, { ...valid, expectedScheduledAt: '2026-11-21T10:00' }), options)).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateScheduleTimeDto, { ...valid, draft: true }), options)).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateScheduleTimeDto, { ...valid, expectedScheduleTimeId: undefined }), options)).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateScheduleTimeDto, { ...valid, expectedScheduleTimeId: null }), options)).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateScheduleTimeDto, { ...valid, expectedScheduleTimeId: null, expectedFixtureIds: ['00000000-0000-4000-8000-000000000002'] }), options)).toHaveLength(0);
  });
  it.each(['2026-11-21', '2026-11-21T10:00', '2026-02-30T10:00:00+09:00', 'bad'])('rejects invalid or offset-free input %s', async scheduledAt => {
    expect((await validate(plainToInstance(CreateScheduleTimeDto, { scheduledAt }))).length).toBeGreaterThan(0);
  });
  it('accepts an explicit KST instant and rejects unknown fields', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(await validate(plainToInstance(CreateScheduleTimeDto, { scheduledAt: '2026-11-21T10:00:00+09:00' }), options)).toHaveLength(0);
    expect(await validate(plainToInstance(CreateScheduleTimeDto, { scheduledAt: '2026-11-21T10:00:00+09:00', venue: 'A구장' }), options)).not.toHaveLength(0);
  });
});
