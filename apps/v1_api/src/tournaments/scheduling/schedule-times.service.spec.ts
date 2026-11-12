import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleTimesService } from './schedule-times.service';
import { CreateScheduleTimeDto } from './schedule-times.dto';

function setup(role: 'owner' | 'ops' | 'support' | null = 'ops', directorTournament?: string) {
  const rows: { id: string; tournamentId: string; scheduledAt: Date }[] = [];
  const logs: unknown[] = [];
  const db = {
    v1AdminUser: { findUnique: jest.fn(async () => role ? { id: 'admin', userId: 'actor', adminRole: role, status: 'active', user: { accountStatus: 'active' } } : null) },
    v1Tournament: { findFirst: jest.fn(async () => ({ id: 't1', format: 'league_knockouts' })) },
    v1TournamentStaffAssignment: { findFirst: jest.fn(async (args: { where: { tournamentId?: string } }) =>
      directorTournament && (!args.where.tournamentId || args.where.tournamentId === directorTournament) ? { id: 'assignment', version: 1, tournamentId: directorTournament } : null) },
    v1TournamentScheduleTime: {
      findMany: jest.fn(async ({ where }: { where: { tournamentId: string } }) => rows.filter(row => row.tournamentId === where.tournamentId).sort((a, b) => +a.scheduledAt - +b.scheduledAt)),
      createMany: jest.fn(async ({ data }: { data: typeof rows }) => {
        const item = data[0];
        if (rows.some(row => row.tournamentId === item.tournamentId && +row.scheduledAt === +item.scheduledAt)) return { count: 0 };
        rows.push(item); return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { tournamentId_scheduledAt: { tournamentId: string; scheduledAt: Date } } }) => rows.find(row => row.tournamentId === where.tournamentId_scheduledAt.tournamentId && +row.scheduledAt === +where.tournamentId_scheduledAt.scheduledAt)!),
    },
    v1AdminActionLog: { create: jest.fn(async (args: unknown) => { logs.push(args); return { id: 'log' }; }) },
    v1OperationAudit: { create: jest.fn(async (args: unknown) => { logs.push(args); return { id: 'audit' }; }) },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db));
  const prisma = db as unknown as PrismaService;
  const service = new ScheduleTimesService(prisma, new AdminContextService(prisma));
  return { service, db, rows, logs };
}
const user = { id: 'actor' } as never;

describe('ScheduleTimesService', () => {
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
  it.each(['2026-11-21', '2026-11-21T10:00', '2026-02-30T10:00:00+09:00', 'bad'])('rejects invalid or offset-free input %s', async scheduledAt => {
    expect((await validate(plainToInstance(CreateScheduleTimeDto, { scheduledAt }))).length).toBeGreaterThan(0);
  });
  it('accepts an explicit KST instant and rejects unknown fields', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(await validate(plainToInstance(CreateScheduleTimeDto, { scheduledAt: '2026-11-21T10:00:00+09:00' }), options)).toHaveLength(0);
    expect(await validate(plainToInstance(CreateScheduleTimeDto, { scheduledAt: '2026-11-21T10:00:00+09:00', venue: 'A구장' }), options)).not.toHaveLength(0);
  });
});
