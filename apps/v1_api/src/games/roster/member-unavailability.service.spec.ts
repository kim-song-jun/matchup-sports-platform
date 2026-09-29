import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../../prisma/prisma.service';
import { TeamUnavailabilityQueryDto } from './dto/team-game-roster.dto';
import { MemberUnavailabilityService } from './member-unavailability.service';

// Prisma where 의 스칼라 비교만 해석하는 가짜 DB. 모르는 연산자는 던져 조건이 조용히 무시되지 않게 한다.
type Row = Record<string, unknown>;
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (condition === null || typeof condition !== 'object' || condition instanceof Date) return same(value, condition);
    return Object.entries(condition as Row).every(([op, operand]) => {
      const left = (value as Date).getTime?.();
      const right = (operand as Date).getTime?.();
      switch (op) {
        case 'in':
          return (operand as unknown[]).some((item) => same(value, item));
        case 'lte':
          return left <= right;
        case 'lt':
          return left < right;
        case 'gte':
          return left >= right;
        case 'gt':
          return left > right;
        default:
          throw new Error(`fake prisma: unsupported operator ${op}`);
      }
    });
  });
}
function findMany(rows: readonly Row[], args: { where: Row; orderBy?: Row[]; select?: Record<string, boolean> }): Row[] {
  const found = rows.filter((row) => matchesWhere(row, args.where));
  for (const order of [...(args.orderBy ?? [])].reverse()) {
    const [field, direction] = Object.entries(order)[0]!;
    found.sort((a, b) => {
      const [x, y] = [a[field], b[field]].map((v) => (v instanceof Date ? v.getTime() : (v as string)));
      return (x! < y! ? -1 : x! > y! ? 1 : 0) * (direction === 'desc' ? -1 : 1);
    });
  }
  const select = args.select;
  if (select === undefined) return found;
  return found.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
}

const T0 = new Date('2026-10-03T00:00:00.000Z');
const T1 = new Date('2026-10-10T00:00:00.000Z');
const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

function period(overrides: Row & { id: string; userId: string }): Row {
  return {
    teamId: 'team-A',
    startsAt: T0,
    endsAt: T1,
    reason: 'INJURY',
    actorUserId: 'mgr',
    actorRole: 'TEAM_MANAGER',
    createdAt: T0,
    revokedAt: null,
    revokedByUserId: null,
    ...overrides,
  };
}

function fake(input: { periods: Row[]; memberships?: Row[]; admins?: Record<string, 'owner' | 'ops' | 'support'> }) {
  const memberships: Row[] = input.memberships ?? [
    { teamId: 'team-A', userId: 'a-owner', role: 'owner', status: 'active' },
    { teamId: 'team-A', userId: 'a1', role: 'member', status: 'active' },
    { teamId: 'team-A', userId: 'a2', role: 'member', status: 'active' },
    { teamId: 'team-A', userId: 'gone', role: 'member', status: 'left' },
    { teamId: 'team-B', userId: 'b1', role: 'member', status: 'active' },
  ];
  const tx = {
    v1Team: { findFirst: jest.fn(async ({ where }: { where: Row }) => (['team-A', 'team-B'].includes(where.id as string) ? { id: where.id } : null)) },
    v1TeamMembership: {
      findUnique: jest.fn(async ({ where }: { where: { teamId_userId: Row } }) =>
        memberships.find((row) => matchesWhere(row, where.teamId_userId)) ?? null,
      ),
      findMany: jest.fn(async (args: { where: Row; select?: Record<string, boolean> }) => findMany(memberships, args)),
    },
    v1AdminUser: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        const adminRole = input.admins?.[where.userId];
        return adminRole === undefined ? null : { adminRole, status: 'active', revokedAt: null, user: { accountStatus: 'active' } };
      }),
    },
    v1TeamMemberUnavailability: {
      findMany: jest.fn(async (args: { where: Row; orderBy?: Row[]; select?: Record<string, boolean> }) => findMany(input.periods, args)),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)) };
  return new MemberUnavailabilityService(prisma as unknown as PrismaService);
}
const viewer = (id: string) => ({ id, email: `${id}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' }) as const;
const userIdsAt = async (service: MemberUnavailabilityService, activeAt?: Date) =>
  (await service.listActive(viewer('a1'), 'team-A', activeAt?.toISOString())).items.map((item) => item.userId);

describe('MemberUnavailabilityService.listActive — 팀 단위 결장 조회', () => {
  it('activeAt 은 [startsAt, endsAt) — 시작 시각은 들어가고 끝 시각은 빠진다', async () => {
    const service = fake({ periods: [period({ id: 'p1', userId: 'a1' })] });
    expect(await userIdsAt(service, ms(T0, -1))).toEqual([]);
    expect(await userIdsAt(service, T0)).toEqual(['a1']);
    expect(await userIdsAt(service, ms(T1, -1))).toEqual(['a1']);
    expect(await userIdsAt(service, T1)).toEqual([]);
  });

  it('취소한 기간·다른 팀·팀을 떠난 사람은 빼고, 계약 필드만 먼저 시작한 순으로 싣는다', async () => {
    const service = fake({
      periods: [
        period({ id: 'late', userId: 'a1', startsAt: ms(T0, 3_600_000), reason: null }),
        period({ id: 'early', userId: 'a1', actorUserId: 'ops', actorRole: 'ADMIN' }),
        period({ id: 'revoked', userId: 'a2', revokedAt: T0, revokedByUserId: 'mgr' }),
        period({ id: 'other-team', userId: 'b1', teamId: 'team-B' }),
        period({ id: 'left-member', userId: 'gone' }),
      ],
    });
    const { items } = await service.listActive(viewer('a-owner'), 'team-A', ms(T0, 7_200_000).toISOString());
    expect(items).toEqual([
      { id: 'early', userId: 'a1', reason: 'INJURY', startsAt: T0, endsAt: T1, actorRole: 'ADMIN' },
      { id: 'late', userId: 'a1', reason: null, startsAt: ms(T0, 3_600_000), endsAt: T1, actorRole: 'TEAM_MANAGER' },
    ]);
  });

  it('activeAt 이 없으면 지금을 덮는 기간만 싣는다', async () => {
    const now = new Date();
    const service = fake({
      periods: [
        period({ id: 'now', userId: 'a1', startsAt: ms(now, -3_600_000), endsAt: ms(now, 3_600_000) }),
        period({ id: 'future', userId: 'a2', startsAt: ms(now, 86_400_000), endsAt: ms(now, 172_800_000) }),
        period({ id: 'past', userId: 'a2', startsAt: ms(now, -172_800_000), endsAt: ms(now, -86_400_000) }),
      ],
    });
    expect(await userIdsAt(service)).toEqual(['a1']);
  });

  it('읽기 권한은 멤버별 결장 조회와 같다 — 활성 팀원·플랫폼 어드민(support 포함)만, 떠난 사람·팀 밖은 403', async () => {
    const service = fake({ periods: [period({ id: 'p1', userId: 'a1' })], admins: { support: 'support', ops: 'ops' } });
    for (const id of ['a-owner', 'a2', 'ops', 'support']) {
      const { items } = await service.listActive(viewer(id), 'team-A', T0.toISOString());
      expect(items.map((item) => item.id)).toEqual(['p1']);
    }
    for (const id of ['gone', 'b1', 'outsider']) {
      await expect(service.listActive(viewer(id), 'team-A', T0.toISOString())).rejects.toMatchObject({
        status: 403,
        response: { code: 'PERMISSION_DENIED' },
      });
    }
    await expect(service.listActive(viewer('ops'), 'team-missing')).rejects.toMatchObject({
      status: 404,
      response: { code: 'TEAM_NOT_FOUND' },
    });
  });
});

describe('TeamUnavailabilityQueryDto', () => {
  const errorsOf = async (query: Record<string, unknown>) =>
    (await validate(plainToInstance(TeamUnavailabilityQueryDto, query))).map((error) => error.property);

  it('activeAt 은 선택이고, 있으면 실제로 있는 날짜의 ISO 8601 이어야 한다', async () => {
    expect(await errorsOf({})).toEqual([]);
    expect(await errorsOf({ activeAt: '2026-10-03T19:00:00+09:00' })).toEqual([]);
    for (const activeAt of ['tomorrow', '2026-02-30T00:00:00Z', '1759449600000']) {
      expect(await errorsOf({ activeAt })).toEqual(['activeAt']);
    }
  });
});
