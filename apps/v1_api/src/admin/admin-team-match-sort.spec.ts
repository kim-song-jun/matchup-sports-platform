/**
 * Sort / region filter / cursor contract of AdminService.listTeamMatches.
 * The fake findMany below evaluates the where/orderBy the service builds against in-memory rows
 * (equality, gt/lt, in, null, OR/AND), so paging assertions break if the keyset condition is wrong.
 */
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

type Row = { id: string; createdAt: Date; startAt: Date | null; regionId: string | null; status: string };
type Cond = Record<string, unknown>;

const admin = { id: 'admin-user-id', email: 'a@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function matches(row: Row, where: Cond): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Cond[]).some((c) => matches(row, c));
    if (key === 'AND') return (expected as Cond[]).every((c) => matches(row, c));
    const value = (row as unknown as Cond)[key];
    if (expected === null) return value === null;
    if (expected instanceof Date) return value instanceof Date && value.getTime() === expected.getTime();
    if (typeof expected === 'object') {
      return Object.entries(expected as Cond).every(([op, operand]) => {
        if (op === 'in') return (operand as unknown[]).includes(value);
        if (value === null || value === undefined) return false;
        const left = value instanceof Date ? value.getTime() : (value as string);
        const right = operand instanceof Date ? operand.getTime() : (operand as string);
        if (op === 'gt') return left > right;
        if (op === 'lt') return left < right;
        throw new Error(`unsupported operator ${op}`);
      });
    }
    return value === expected;
  });
}

function compare(a: Row, b: Row, order: Cond): number {
  const [key, spec] = Object.entries(order)[0] as [keyof Row, string | { sort: string; nulls?: string }];
  const dir = typeof spec === 'string' ? spec : spec.sort;
  const av = a[key], bv = b[key];
  if (av === null || bv === null) {
    if (av === bv) return 0;
    // `nulls: 'last'` regardless of direction
    return av === null ? 1 : -1;
  }
  const x = av instanceof Date ? av.getTime() : av;
  const y = bv instanceof Date ? bv.getTime() : bv;
  const raw = x < y ? -1 : x > y ? 1 : 0;
  return dir === 'asc' ? raw : -raw;
}

const d = (iso: string) => new Date(`2026-11-${iso}:00:00.000Z`);

describe('AdminService.listTeamMatches sort / region / cursor', () => {
  let service: AdminService;
  let rows: Row[];
  const regions = [
    { id: 'seoul', parentId: null },
    { id: 'seongdong', parentId: 'seoul' },
    { id: 'busan', parentId: null },
  ];

  beforeEach(async () => {
    // Several rows share one startAt and one createdAt, and three have no startAt.
    rows = [
      { id: 'a', createdAt: d('01T01'), startAt: d('10T05'), regionId: 'seongdong', status: 'recruiting' },
      { id: 'b', createdAt: d('01T01'), startAt: d('10T05'), regionId: 'busan', status: 'recruiting' },
      { id: 'c', createdAt: d('02T01'), startAt: d('10T05'), regionId: 'seongdong', status: 'recruiting' },
      { id: 'd', createdAt: d('03T01'), startAt: d('09T05'), regionId: 'seoul', status: 'recruiting' },
      { id: 'e', createdAt: d('04T01'), startAt: null, regionId: 'busan', status: 'recruiting' },
      { id: 'f', createdAt: d('05T01'), startAt: null, regionId: 'seongdong', status: 'recruiting' },
      { id: 'g', createdAt: d('06T01'), startAt: null, regionId: null, status: 'recruiting' },
      { id: 'h', createdAt: d('07T01'), startAt: d('12T05'), regionId: 'busan', status: 'recruiting' },
    ];
    const prisma = {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue({ id: 'ar', userId: admin.id, adminRole: 'owner', status: 'active', user: { accountStatus: 'active' } }) },
      v1Region: {
        findMany: jest.fn(async ({ where }: { where: Cond }) => regions.filter((r) => matches(r as never, where))),
      },
      v1TeamMatch: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
        findMany: jest.fn(async ({ where, orderBy, take, skip }: { where: Cond; orderBy: Cond[]; take: number; skip?: number }) => {
          const sorted = rows
            .filter((r) => matches(r, where))
            .sort((a, b) => orderBy.map((o) => compare(a, b, o)).find((n) => n !== 0) ?? 0);
          return sorted.slice(skip ?? 0, (skip ?? 0) + take).map((r) => ({
            ...r,
            title: r.id,
            platformManaged: false,
            hostTeamId: null,
            hostTeam: null,
            approvedApplicantTeamId: null,
            approvedApplicantTeam: null,
            applications: [],
            sport: { name: '풋살' },
            region: r.regionId ? { id: r.regionId, name: `name-${r.regionId}` } : null,
            league: null,
            tournament: null,
            _count: { applications: 0 },
          }));
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  const ids = (r: { items: Array<{ teamMatchId: string }> }) => r.items.map((i) => i.teamMatchId);

  async function walk(sort: 'created_desc' | 'start_asc' | 'start_desc', limit: number, regionId?: string) {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const result = await service.listTeamMatches(admin, { sort, limit, cursor, regionId });
      seen.push(...ids(result));
      if (!result.pageInfo.hasNext) return seen;
      cursor = result.pageInfo.nextCursor ?? undefined;
    }
    throw new Error('cursor never terminated');
  }

  it('created_desc (default) orders newest first with id as tie-breaker', async () => {
    expect(ids(await service.listTeamMatches(admin, {}))).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
  });

  it('start_asc puts earliest first and null startAt last', async () => {
    expect(ids(await service.listTeamMatches(admin, { sort: 'start_asc' }))).toEqual(['d', 'a', 'b', 'c', 'h', 'e', 'f', 'g']);
  });

  it('start_desc puts latest first and still keeps null startAt last', async () => {
    expect(ids(await service.listTeamMatches(admin, { sort: 'start_desc' }))).toEqual(['h', 'c', 'b', 'a', 'd', 'g', 'f', 'e']);
  });

  it.each(['created_desc', 'start_asc', 'start_desc'] as const)('%s: cursor paging with limit 3 neither drops nor repeats rows', async (sort) => {
    const full = ids(await service.listTeamMatches(admin, { sort, limit: 50 }));
    const paged = await walk(sort, 3);
    expect(paged).toEqual(full);
    expect(new Set(paged).size).toBe(rows.length);
  });

  it.each(['start_asc', 'start_desc'] as const)('%s: a page boundary inside the null-startAt block continues correctly', async (sort) => {
    const full = ids(await service.listTeamMatches(admin, { sort, limit: 50 }));
    // limit 6 ends the first page on the first null row; limit 7 on the second.
    expect(await walk(sort, 6)).toEqual(full);
    expect(await walk(sort, 7)).toEqual(full);
  });

  it('page mode uses the same order as cursor mode', async () => {
    const p1 = await service.listTeamMatches(admin, { sort: 'start_asc', limit: 3, page: 1 });
    const p2 = await service.listTeamMatches(admin, { sort: 'start_asc', limit: 3, page: 2 });
    const p3 = await service.listTeamMatches(admin, { sort: 'start_asc', limit: 3, page: 3 });
    expect([...ids(p1), ...ids(p2), ...ids(p3)]).toEqual(await walk('start_asc', 3));
  });

  it('regionId keeps only that region and excludes the others; a parent region includes its children', async () => {
    expect((await walk('created_desc', 50, 'busan')).sort()).toEqual(['b', 'e', 'h']);
    expect((await walk('created_desc', 50, 'seongdong')).sort()).toEqual(['a', 'c', 'f']);
    expect((await walk('created_desc', 50, 'seoul')).sort()).toEqual(['a', 'c', 'd', 'f']);
  });

  it('regionId combines with start sort and cursor paging', async () => {
    const full = ids(await service.listTeamMatches(admin, { sort: 'start_asc', regionId: 'busan', limit: 50 }));
    expect(full).toEqual(['b', 'h', 'e']);
    expect(await walk('start_asc', 2, 'busan')).toEqual(full);
  });

  it('the q search OR is not overwritten by the cursor condition', async () => {
    const result = await service.listTeamMatches(admin, { q: 'x', cursor: 'a', sort: 'start_asc' });
    // No row titles match "x" in the fake (it only evaluates our where); the point is the call must carry both.
    const call = (service as unknown as { prisma: { v1TeamMatch: { findMany: jest.Mock } } }).prisma.v1TeamMatch.findMany.mock.calls[0][0] as { where: Cond };
    expect(call.where.OR).toBeDefined();
    expect(call.where.AND).toBeDefined();
    expect(result.items).toBeDefined();
  });

  it('row exposes region and an unknown cursor is rejected', async () => {
    const result = await service.listTeamMatches(admin, { limit: 50 });
    expect(result.items.find((i) => i.teamMatchId === 'a')?.region).toEqual({ regionId: 'seongdong', name: 'name-seongdong' });
    expect(result.items.find((i) => i.teamMatchId === 'g')?.region).toBeNull();
    await expect(service.listTeamMatches(admin, { cursor: 'missing' })).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
  });
});
