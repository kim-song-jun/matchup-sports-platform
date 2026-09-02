/**
 * tournaments-read.service.spec.ts
 *
 * Contract tests for the consumer-facing tournament read service.
 * Verifies: public status filter (draft/cancelled excluded), cursor pagination,
 * 404 on hidden statuses, detail structure (groups/groupTeams/standings/fixtures/
 * result/announcements), and TBD team name fallback for unassigned fixture slots.
 * Asserts observable behaviour only — no mock-for-mock assertions.
 */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentStaffAccessService } from './staff/tournament-staff-access.service';
import { TournamentsReadService } from './tournaments-read.service';

const authUser = {
  id: 'user-1',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

function tournamentCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: '봄 풋살 대회',
    status: 'open',
    registrationDeadlineAt: null,
    scheduledAt: new Date('2026-07-01T09:00:00.000Z'),
    scheduledEndAt: null,
    venue: '서울 풋살장',
    coverImageUrl: '/uploads/tournaments/spring-cup.webp',
    teamCount: 8,
    entryFee: 60000,
    bankName: '국민은행',
    bankAccount: '123-456-789',
    bankHolder: '팀밋',
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    deletedAt: null,
    _count: { registrations: 3 },
    registrations: [{ status: 'awaiting_payment' }, { status: 'payment_checking' }],
    ...overrides,
  };
}

function fullTournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: '봄 풋살 대회',
    status: 'open',
    registrationDeadlineAt: null,
    // 기본값: 대진표 공개 완료 상태(대부분 테스트가 groups/fixtures 노출을 검증하므로).
    // 비공개 게이트 자체를 검증하는 테스트는 bracketPublishedAt: null로 override.
    bracketPublishedAt: new Date('2026-06-20T00:00:00.000Z'),
    scheduledAt: new Date('2026-07-01T09:00:00.000Z'),
    scheduledEndAt: null,
    venue: '서울 풋살장',
    parkingInfo: '지하 주차장 2시간 무료',
    coverImageUrl: '/uploads/tournaments/spring-cup.webp',
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 60000,
    rulesText: null,
    refundPolicyText: null,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    deletedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    _count: { registrations: 4 },
    registrations: [{ status: 'awaiting_payment' }],
    groups: [],
    fixtures: [],
    announcements: [],
    sponsors: [],
    ...overrides,
  };
}

/**
 * 상태 조건의 `OR` 절을 찾는다 — **위치가 아니라 모양으로** 찾는다.
 *
 * 조건이 `findTournamentOnSurface` 의 종류 조건과 `AND` 로 겹겹이 묶이므로 인덱스로 집으면
 * 헬퍼가 절을 하나 더 붙이는 날 조용히 깨진다. 실제로 이 스펙이 그렇게 한 번 깨졌다.
 */
function findStatusOr(node: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findStatusOr(item);
      if (found) return found;
    }
    return null;
  }
  if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.OR) && obj.OR.some((c) => c !== null && typeof c === 'object' && 'status' in c)) {
      return obj.OR as Array<Record<string, unknown>>;
    }
    for (const value of Object.values(obj)) {
      const found = findStatusOr(value);
      if (found) return found;
    }
  }
  return null;
}

/** 조건에 등장하는 모든 상태값. `{in: [...]}` 와 `'draft'` 두 모양을 다 편다. */
function statusesIn(or: Array<Record<string, unknown>>): string[] {
  return or.flatMap((clause) => {
    const status = clause.status;
    if (typeof status === 'string') return [status];
    const inList = (status as { in?: string[] } | undefined)?.in;
    return inList ?? [];
  });
}

describe('TournamentsReadService', () => {
  let service: TournamentsReadService;
  let prisma: {
    v1Tournament: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    // 참가팀 식별 정보 통일 정책(fix/v1-publish)의 운영자·스태프 우회는
    // TournamentStaffAccessService(실제 구현)를 그대로 배선하므로, 그게 의존하는
    // v1AdminUser/v1TournamentStaffAssignment도 이 같은 fake PrismaService 위에
    // 함께 둔다 — mock-for-mock이 아니라 실제 decideTournamentStaffAccess 정책을
    // 거치는 계약 테스트로 만들기 위함(PublicTournamentRecordsService 스펙과 동일 패턴).
    v1AdminUser: {
      findUnique: jest.Mock;
    };
    v1TournamentStaffAssignment: {
      findMany: jest.Mock;
    };
    v1TournamentOverallStanding: {
      findMany: jest.Mock;
    };
    v1TournamentFixture: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      v1Tournament: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      v1TournamentStaffAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      v1TournamentOverallStanding: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      v1TournamentFixture: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsReadService,
        TournamentStaffAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentsReadService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ─────────────────────────────────────────────────────────────────────

  it('list: returns items with confirmedCount and pageInfo', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([tournamentCard()]);

    const result = await service.list({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'tournament-1',
      sportId: 'sport-1',
      sport: { code: 'futsal', name: '풋살' },
      status: 'open',
      confirmedCount: 3,
      pendingPaymentCount: 2,
      entryFee: 60000,
    });
    expect(result.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  /**
   * **계약이 바뀌었다(2026-09-01 사용자 확정 A안).** 예전엔 `draft` 를 종류와 무관하게 걸렀는데,
   * 정규 리그의 `draft` 는 **"예정"** 이고 사용자에게 보여야 하는 상태다. 대회의 `draft`
   * (운영자 준비 중)는 **그대로 감춘다** — 그 둘을 한 조건 안에서 가른다.
   *
   * `cancelled` 는 **어느 쪽에도 없다.** 그건 이번 변경과 무관하고, 넓어지면 안 되는 자리다.
   */
  it('list: 리그의 draft 만 열고 대회의 draft·cancelled 는 계속 막는다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({});

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    const or = findStatusOr(callArgs.where);
    expect(or).not.toBeNull();

    // 리그 절 — 이것만 draft 를 연다.
    expect(or).toEqual(
      expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]),
    );

    // 대회 절 — 종류 조건이 없는 쪽. 여기엔 draft 가 없어야 한다.
    const tournamentClause = or!.find((clause) => !('kind' in clause)) as {
      status: { in: string[] };
    };
    expect(tournamentClause.status.in).toEqual(
      expect.arrayContaining(['open', 'closed', 'in_progress', 'completed']),
    );
    expect(tournamentClause.status.in).not.toContain('draft');

    // cancelled 는 조건 전체 어디에도 없다.
    expect(statusesIn(or!)).not.toContain('cancelled');
  });

  /**
   * **`?status=draft` 는 리그로 좁혀서만 적용된다.**
   *
   * 사용자 확정 칩은 *전체 · 진행 중 · 준비 중 · 종료* 인데, "준비 중"(draft)은 정규 리그에만
   * 있는 개념이다. 대회의 `draft` 는 운영자 준비 중이라 계속 감춘다(사용자 명시).
   *
   * ⚠️ **이 분리가 없으면 `?status=draft` 한 줄로 대회 비공개가 통째로 열린다.** 지금까지는
   * DTO 가 `draft` 를 400 으로 막아 줘서 안 샜는데(실측 확인), 칩을 만들려면 그 방어를
   * 푸는 것이라 **서비스가 대신 막아야 한다.**
   */
  it('list: status=draft 는 정규 리그로 좁혀 적용된다 — 대회 draft 는 여전히 안 나온다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ status: 'draft' } as never);

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    // 종류 조건 없이 status 만 걸리면 대회 draft 가 함께 나온다 — 그렇게 되면 안 된다.
    expect(callArgs.where.status).toBeUndefined();
    expect(callArgs.where.AND).toEqual(
      expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]),
    );
  });

  /**
   * **`kind` 없이 `status=draft` 가 오면 어떻게 되나** — 정해서 여기 박는다.
   *
   * 답: **400 이 아니라 빈 결과다.** 그리고 그 안전성은 **구조적**이다 —
   * `kind` 기본값이 `tournament` 라 surface 조건이 `OR[{regular_tournament},{null}]` 인데,
   * 거기에 `AND {kind: regular_league}` 가 겹치면 **만족하는 행이 존재할 수 없다.**
   * 즉 "막는 코드" 가 따로 있는 게 아니라 **조건이 서로 모순이라 새어나올 수가 없다.**
   *
   * 400 으로 막지 않는 이유: 다른 필터도 같은 성질이다(예: 대회 탭에서 리그 전용 종목을
   * 고르면 400 이 아니라 빈 목록이다). 여기만 예외로 400 을 내면 교차 필터마다 규칙이
   * 갈린다.
   */
  it('list: kind 없이 status=draft 면 빈 결과가 된다 — 대회 draft 가 샐 수 없는 구조다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ status: 'draft' } as never);

    const where = prisma.v1Tournament.findMany.mock.calls[0][0].where;
    // 기본 surface(대회 + kind=null)와 리그 한정 절이 **함께** 걸려 있다 → 모순.
    expect(where.OR).toEqual(
      expect.arrayContaining([{ kind: 'regular_tournament' }, { kind: null }]),
    );
    expect(where.AND).toEqual(
      expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]),
    );
  });

  it('list: kind=tournament + status=draft 도 같은 모순이다 — 대회 draft 는 어떤 조합으로도 안 나온다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ kind: 'tournament', status: 'draft' } as never);

    const where = prisma.v1Tournament.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]),
    );
    expect(where.OR).toEqual(
      expect.arrayContaining([{ kind: 'regular_tournament' }, { kind: null }]),
    );
  });

  it('list: kind=league + status=draft 는 정상적으로 리그 예정만 담는다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ kind: 'league', status: 'draft' } as never);

    const where = prisma.v1Tournament.findMany.mock.calls[0][0].where;
    expect(where.kind).toBe('regular_league');
    expect(where.AND).toEqual(
      expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]),
    );
  });

  it('대조군: draft 가 아닌 status 는 종전대로 그대로 전달된다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ status: 'in_progress' } as never);

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('in_progress');
  });

  it('list: status filter narrowing is forwarded as exact string', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ status: 'in_progress' });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('in_progress');
  });

  it('list: cursor pagination — hasNext=true when rows exceed limit', async () => {
    const rows = [
      tournamentCard({ id: 't-1' }),
      tournamentCard({ id: 't-2' }),
      tournamentCard({ id: 't-3' }),
    ];
    prisma.v1Tournament.findMany.mockResolvedValue(rows);

    const result = await service.list({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({ hasNext: true, nextCursor: 't-2' });
  });

  it('list: cursor argument is forwarded to Prisma with skip:1', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ cursor: 'cursor-id', limit: 10 });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.cursor).toEqual({ id: 'cursor-id' });
    expect(callArgs.skip).toBe(1);
  });

  it('list: sportId filter is forwarded as sportId UUID condition', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ sportId: 'sport-uuid-1' });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.sportId).toBe('sport-uuid-1');
  });

  it('list: no sportId → sportId condition absent from where', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({});

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.sportId).toBeUndefined();
  });

  // ─── list — 페이지 번호(데스크톱) ────────────────────────────────────────────

  it('list: page=3 → skip=(page-1)*limit, cursor 는 쓰지 않는다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ page: 3, limit: 20 });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(40);
    expect(callArgs.cursor).toBeUndefined();
  });

  it('list: page 와 cursor 가 함께 오면 page 가 이긴다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ page: 2, cursor: 'cursor-id', limit: 10 });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    expect(callArgs.cursor).toBeUndefined();
  });

  it('list: page 요청이면 전체 건수를 세어 totalPages/hasPrev 를 채운다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([tournamentCard({ id: 't-1' })]);
    prisma.v1Tournament.count.mockResolvedValue(42);

    const result = await service.list({ page: 2, limit: 20 });

    expect(prisma.v1Tournament.count).toHaveBeenCalledTimes(1);
    expect(result.pageInfo).toMatchObject({ page: 2, total: 42, totalPages: 3, hasPrev: true });
  });

  it('list: 커서(무한 스크롤) 요청에는 COUNT 를 돌리지 않는다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ cursor: 'cursor-id', limit: 20 });

    expect(prisma.v1Tournament.count).not.toHaveBeenCalled();
  });

  it('list: 커서 요청의 pageInfo 는 예전과 같은 두 필드만 갖는다', async () => {
    // 통합 스펙(`test/integration/health.e2e-spec.ts`)이 이 응답 모양을 통째로 비교한다 —
    // total 을 세지도 않고 `total: 0` 을 실어 보내면 "전체 0건"이라는 거짓말이 된다.
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    const result = await service.list({});

    expect(result.pageInfo).toEqual({ nextCursor: null, hasNext: false });
  });

  it('list: COUNT 필터는 목록 필터와 같은 where 를 쓴다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);
    prisma.v1Tournament.count.mockResolvedValue(0);

    await service.list({ page: 1, sportId: 'sport-uuid-1', status: 'in_progress' });

    const listWhere = prisma.v1Tournament.findMany.mock.calls[0][0].where;
    const countWhere = prisma.v1Tournament.count.mock.calls[0][0].where;
    expect(countWhere).toEqual(listWhere);
  });

  it('list: 정렬은 createdAt 동률을 id 로 깨서 페이지 경계가 흔들리지 않게 한다', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ page: 1 });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  // ─── get — not found / hidden ────────────────────────────────────────────────

  it('get: tournament not found → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(service.get('ghost')).rejects.toThrow(NotFoundException);
    await expect(service.get('ghost2')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
  });

  /**
   * **상세 화면은 통합 순위를 항상 함께 부른다.** 상세만 열고 여기를 닫으면 화면이 열리자마자
   * 순위 섹션이 에러가 된다 — 실측(2026-09-01)에서 진행 리그는 상세·일정·통합순위가 다 200
   * 인데 **예정 리그만 상세·통합순위가 404** 였다.
   *
   * 이 게이트가 있는 자리는 정확히 셋(목록·상세·통합순위)이고 **셋이 같은 조건이어야 한다.**
   * 하나라도 좁으면 그 경로만 죽는다.
   */
  it('getOverallStandings: 목록·상세와 같은 조건이다 — 한 화면이 부르는 경로는 하나가 아니다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await service.getOverallStandings('t-1').catch(() => {});

    const callArgs = prisma.v1Tournament.findFirst.mock.calls[0][0];
    const or = findStatusOr(callArgs.where);
    expect(or).not.toBeNull();

    expect(or).toEqual(expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]));

    // 대조군 — 대회의 draft 는 통합 순위에서도 계속 막힌다.
    const tournamentClause = or!.find((clause) => !('kind' in clause)) as {
      status: { in: string[] };
    };
    expect(tournamentClause.status.in).not.toContain('draft');
    expect(statusesIn(or!)).not.toContain('cancelled');
  });

  it('get: 목록과 같은 조건 — 리그 draft 는 열리고 대회 draft·cancelled 는 막힌다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await service.get('t-1').catch(() => {});

    const callArgs = prisma.v1Tournament.findFirst.mock.calls[0][0];
    const or = findStatusOr(callArgs.where);
    expect(or).not.toBeNull();

    // **목록과 같은 조건이어야 한다.** 상세만 좁으면 목록에 뜬 카드를 눌러서 못 연다.
    expect(or).toEqual(expect.arrayContaining([{ kind: 'regular_league', status: 'draft' }]));

    const tournamentClause = or!.find((clause) => !('kind' in clause)) as {
      status: { in: string[] };
    };
    expect(tournamentClause.status.in).toEqual(
      expect.arrayContaining(['open', 'in_progress', 'completed']),
    );
    expect(tournamentClause.status.in).not.toContain('draft');
    expect(statusesIn(or!)).not.toContain('cancelled');
  });

  it('get: public detail only includes published public announcements', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await service.get('t-1').catch(() => {});

    const callArgs = prisma.v1Tournament.findFirst.mock.calls[0][0];
    expect(callArgs.include.announcements.where).toEqual({
      audience: 'public',
      publishedAt: { not: null },
    });
  });

  // ─── get — detail shape ──────────────────────────────────────────────────────

  it('get: returns full detail with groups, fixtures, announcements', async () => {
    // status를 명시적으로 모집 마감 이후로 둔다 — 이 테스트는 groups/fixtures의 팀명
    // "직렬화 형태"를 검증하는 것이 목적이고, 모집 중(open) 팀명 비공개 정책은
    // 아래 "참가팀 식별 정보 통일 정책" describe 블록에서 별도로 검증한다. 기본값
    // (fullTournamentRow의 status: 'open')을 그대로 두면 이 테스트가 검증하려는
    // 팀명이 정책에 의해 null로 가려져 목적과 다른 이유로 실패한다.
    const row = fullTournamentRow({
      status: 'closed',
      groups: [
        {
          id: 'group-1',
          name: 'A조',
          phase: 'group',
          sortOrder: 0,
          groupTeams: [
            {
              id: 'gt-1',
              registrationId: 'reg-1',
              sortOrder: 0,
              registration: {
                team: { id: 'team-1', name: 'FC 서울', profile: { logoUrl: '/uploads/teams/fc-seoul.png' } },
              },
            },
          ],
          standings: [
            {
              registrationId: 'reg-1',
              position: 1,
              points: 9,
              wins: 3,
              draws: 0,
              losses: 0,
              goalsFor: 10,
              goalsAgainst: 2,
              recalculatedAt: new Date('2026-06-14T00:00:00Z'),
              registration: {
                team: { id: 'team-1', name: 'FC 서울', profile: { logoUrl: '/uploads/teams/fc-seoul.png' } },
              },
            },
          ],
        },
      ],
      fixtures: [
        {
          id: 'fixture-1',
          groupId: 'group-1',
          round: 'group',
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: new Date('2026-07-01T10:00:00Z'),
          venue: null,
          status: 'scheduled',
          homeRegistrationId: 'reg-1',
          awayRegistrationId: null,
          homeRegistration: {
            team: { id: 'team-1', name: 'FC 서울', profile: { logoUrl: '/uploads/teams/fc-seoul.png' } },
          },
          awayRegistration: null,
          videos: [],
          result: null,
        },
      ],
      announcements: [
        {
          id: 'ann-1',
          title: '경기 일정 공지',
          body: '7월 1일 오전 10시 시작',
          category: 'venue',
          audience: 'public',
          publishedAt: new Date('2026-06-10T00:00:00Z'),
          createdAt: new Date('2026-06-10T00:00:00Z'),
          updatedAt: new Date('2026-06-10T00:00:00Z'),
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result).toMatchObject({
      id: 'tournament-1',
      sportId: 'sport-1',
      sport: { code: 'futsal', name: '풋살' },
      coverImageUrl: '/uploads/tournaments/spring-cup.webp',
      parkingInfo: '지하 주차장 2시간 무료',
      confirmedCount: 4,
      pendingPaymentCount: 1,
    });
    expect(result).not.toHaveProperty('bankName');
    expect(result).not.toHaveProperty('bankAccount');
    expect(result).not.toHaveProperty('bankHolder');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupTeams[0]).toMatchObject({
      teamName: 'FC 서울',
    });
    expect(result.groups[0].standings[0]).toMatchObject({
      teamName: 'FC 서울',
      teamLogoUrl: '/uploads/teams/fc-seoul.png',
      position: 1,
      points: 9,
    });
    expect(result.fixtures[0]).toMatchObject({
      homeTeamId: 'team-1',
      homeTeamName: 'FC 서울',
      homeTeamLogoUrl: '/uploads/teams/fc-seoul.png',
      awayTeamId: null,
      awayTeamName: 'TBD',
      awayTeamLogoUrl: null,
      result: null,
    });
    expect(result.announcements[0]).toMatchObject({
      id: 'ann-1',
      title: '경기 일정 공지',
      category: 'venue',
    });
  });

  // ─── bracket publish gate (Task 109 Track 6) ────────────────────────────────

  it('get: bracketPublishedAt=null → groups/fixtures hidden, other fields still returned', async () => {
    const row = fullTournamentRow({
      bracketPublishedAt: null,
      groups: [
        {
          id: 'group-1',
          name: 'A조',
          phase: 'group',
          sortOrder: 0,
          groupTeams: [],
          standings: [],
        },
      ],
      fixtures: [
        {
          id: 'fixture-1',
          groupId: 'group-1',
          round: 'group',
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: null,
          venue: null,
          status: 'scheduled',
          homeRegistrationId: 'reg-1',
          awayRegistrationId: null,
          homeRegistration: { team: { id: 'team-1', name: 'FC 서울' } },
          awayRegistration: null,
          videos: [],
          result: null,
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.groups).toEqual([]);
    expect(result.fixtures).toEqual([]);
    expect(result.bracketPublishedAt).toBeNull();
    // 대진표만 게이트 — 나머지 대회 정보는 그대로 노출.
    expect(result).toMatchObject({ id: 'tournament-1', title: '봄 풋살 대회', confirmedCount: 4 });
  });

  it('get: bracketPublishedAt set → groups/fixtures included and ISO-serialized', async () => {
    const publishedAt = new Date('2026-06-20T00:00:00.000Z');
    const row = fullTournamentRow({
      bracketPublishedAt: publishedAt,
      groups: [
        {
          id: 'group-1',
          name: 'A조',
          phase: 'group',
          sortOrder: 0,
          groupTeams: [],
          standings: [],
        },
      ],
      fixtures: [],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.bracketPublishedAt).toBe(publishedAt.toISOString());
    expect(result.groups).toHaveLength(1);
  });

  it('get: returns public participant teams and filters to active registration statuses (status=closed, post-recruiting)', async () => {
    const row = fullTournamentRow({
      status: 'closed',
      registrations: [
        {
          id: 'reg-confirmed',
          status: 'confirmed',
          confirmedAt: new Date('2026-06-20T00:00:00Z'),
          team: {
            id: 'team-confirmed',
            name: '확정 FC',
            profile: { logoUrl: 'https://cdn.teammeet.test/teams/confirmed-logo.png' },
            region: { name: '서울 강남구' },
          },
        },
        {
          id: 'reg-waitlisted',
          status: 'waitlisted',
          confirmedAt: null,
          team: { id: 'team-waitlisted', name: '대기 FC', profile: null, region: null },
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.participantTeams).toEqual([
      {
        registrationId: 'reg-confirmed',
        teamId: 'team-confirmed',
        teamName: '확정 FC',
        teamLogoUrl: 'https://cdn.teammeet.test/teams/confirmed-logo.png',
        teamRegionName: '서울 강남구',
        status: 'confirmed',
        confirmedAt: '2026-06-20T00:00:00.000Z',
      },
      {
        registrationId: 'reg-waitlisted',
        teamId: 'team-waitlisted',
        teamName: '대기 FC',
        teamLogoUrl: null,
        teamRegionName: null,
        status: 'waitlisted',
        confirmedAt: null,
      },
    ]);

    const callArgs = prisma.v1Tournament.findFirst.mock.calls[0][0];
    // Merged registration lifecycle: 결제 진행(awaiting_payment/payment_checking/paid) 팀도 공개 참가팀에 포함.
    expect(callArgs.include.registrations.where.status.in).toEqual([
      'confirmed',
      'waitlisted',
      'awaiting_payment',
      'payment_checking',
      'paid',
    ]);
    expect(callArgs.include.registrations.where.status.in).not.toContain('draft');
    expect(callArgs.include.registrations.where.status.in).not.toContain('cancelled');
  });

  // ─── participant privacy during recruiting (open) ───────────────────────────

  it('get: status=open → participantTeams hidden but confirmedCount stays exact', async () => {
    const row = fullTournamentRow({
      status: 'open',
      _count: { registrations: 4 },
      registrations: [
        {
          id: 'reg-confirmed',
          status: 'confirmed',
          confirmedAt: new Date('2026-06-20T00:00:00Z'),
          team: {
            id: 'team-confirmed',
            name: '확정 FC',
            profile: { logoUrl: 'https://cdn.teammeet.test/teams/confirmed-logo.png' },
            region: { name: '서울 강남구' },
          },
        },
        {
          id: 'reg-waitlisted',
          status: 'waitlisted',
          confirmedAt: null,
          team: { id: 'team-waitlisted', name: '대기 FC', profile: null, region: null },
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.participantTeams).toEqual([]);
    // 모집 중에도 확정 인원수는 그대로 노출 — "그냥 다 숨겨버리는" 구현이면 이 값도 0이 되어 잡힌다.
    expect(result.confirmedCount).toBe(4);
  });

  it.each(['closed', 'in_progress', 'completed'] as const)(
    'get: status=%s → participantTeams remains public (regression, unaffected by the open-only privacy gate)',
    async (status) => {
      const row = fullTournamentRow({
        status,
        registrations: [
          {
            id: 'reg-confirmed',
            status: 'confirmed',
            confirmedAt: new Date('2026-06-20T00:00:00Z'),
            team: {
              id: 'team-confirmed',
              name: '확정 FC',
              profile: { logoUrl: 'https://cdn.teammeet.test/teams/confirmed-logo.png' },
              region: { name: '서울 강남구' },
            },
          },
          {
            id: 'reg-waitlisted',
            status: 'waitlisted',
            confirmedAt: null,
            team: { id: 'team-waitlisted', name: '대기 FC', profile: null, region: null },
          },
        ],
      });
      prisma.v1Tournament.findFirst.mockResolvedValue(row);

      const result = await service.get('tournament-1');

      expect(result.participantTeams.map((team: { teamName: string }) => team.teamName)).toEqual([
        '확정 FC',
        '대기 FC',
      ]);
    },
  );

  // ─── groups/fixtures 팀 식별 정보 통일 정책 (fix/v1-publish) ────────────────────
  // participantTeams만 감추던 모집 중(open) 게이트를 groups/fixtures 안의 팀명·로고·
  // 팀ID에도 동일하게 적용한다 — 대진표가 공개돼도(구조는 보여도) 모집 중이면 그 안의
  // 팀 식별 정보는 가려야 "모집 마감 후 공개" 문구와 어긋나지 않는다. tournamentId는
  // UUID 형태여야 한다 — decideTournamentStaffAccess가 stable-id 검증을 하므로
  // 'tournament-1' 같은 임의 문자열은 스태프 우회 케이스를 전부 INVALID_INPUT으로
  // 잘못 거부한다(실제 정책이 아니라 id 형태 때문에 실패하는 거짓 결과를 피하려는 것).
  describe('groups/fixtures 팀 식별 정보 통일 정책', () => {
    const TOURNAMENT_UUID = 'b2000000-0000-4000-8000-000000000001';

    function openRowWithNamedGroupsAndFixtures(overrides: Record<string, unknown> = {}) {
      return fullTournamentRow({
        id: TOURNAMENT_UUID,
        status: 'open',
        groups: [
          {
            id: 'group-1',
            name: 'A조',
            phase: 'group',
            sortOrder: 0,
            advanceCount: 2,
            groupTeams: [
              {
                id: 'gt-1',
                registrationId: 'reg-1',
                sortOrder: 0,
                registration: {
                  team: { id: 'team-1', name: 'FC 서울', profile: { logoUrl: '/uploads/teams/fc-seoul.png' } },
                },
              },
            ],
            standings: [
              {
                registrationId: 'reg-1',
                position: 1,
                points: 3,
                wins: 1,
                draws: 0,
                losses: 0,
                goalsFor: 2,
                goalsAgainst: 0,
                recalculatedAt: new Date('2026-06-14T00:00:00Z'),
                registration: {
                  team: { id: 'team-1', name: 'FC 서울', profile: { logoUrl: '/uploads/teams/fc-seoul.png' } },
                },
              },
            ],
          },
        ],
        fixtures: [
          {
            id: 'fixture-1',
            groupId: 'group-1',
            round: 'group',
            fixtureNumber: 1,
            legNumber: 1,
            scheduledAt: new Date('2026-07-01T10:00:00Z'),
            venue: '1경기장',
            status: 'scheduled',
            homeRegistrationId: 'reg-1',
            awayRegistrationId: 'reg-2',
            homeRegistration: {
              team: { id: 'team-1', name: 'FC 서울', profile: { logoUrl: '/uploads/teams/fc-seoul.png' } },
            },
            awayRegistration: {
              team: { id: 'team-2', name: '부산 SC', profile: null },
            },
            videos: [],
            result: null,
          },
        ],
        ...overrides,
      });
    }

    it('관전자(비로그인)에게는 모집 중 groups/fixtures 팀명·로고·팀ID가 가려진다', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(openRowWithNamedGroupsAndFixtures());

      const result = await service.get(TOURNAMENT_UUID);

      expect(result.groups[0].groupTeams[0]).toMatchObject({
        teamId: null,
        teamName: null,
        teamLogoUrl: null,
      });
      expect(result.groups[0].standings[0]).toMatchObject({
        teamId: null,
        teamName: null,
        teamLogoUrl: null,
        // 성적 집계는 팀 식별 정보와 무관하게 그대로 노출 — 정직한 비공개.
        points: 3,
        wins: 1,
      });
      expect(result.fixtures[0]).toMatchObject({
        homeTeamId: null,
        homeTeamName: null,
        homeTeamLogoUrl: null,
        awayTeamId: null,
        awayTeamName: null,
        awayTeamLogoUrl: null,
      });
    });

    it('팀명은 가려도 조 수·팀 수·경기 일정 같은 구조/집계는 유지된다 — 없는 척하지 않는다', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(openRowWithNamedGroupsAndFixtures());

      const result = await service.get(TOURNAMENT_UUID);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].name).toBe('A조');
      expect(result.groups[0].groupTeams).toHaveLength(1);
      expect(result.fixtures).toHaveLength(1);
      expect(result.fixtures[0].scheduledAt).toBe(new Date('2026-07-01T10:00:00Z').toISOString());
      expect(result.fixtures[0].venue).toBe('1경기장');
      expect(result.fixtures[0].homeRegistrationId).toBe('reg-1');
      expect(result.fixtures[0].awayRegistrationId).toBe('reg-2');
    });

    it('로그인했지만 이 대회 스태프가 아닌 사용자에게도 그대로 가려진다', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(openRowWithNamedGroupsAndFixtures());
      // v1TournamentStaffAssignment.findMany는 beforeEach 기본값([])을 그대로 사용 —
      // 이 대회에 배정이 전혀 없는 로그인 사용자.

      const result = await service.get(TOURNAMENT_UUID, authUser);

      expect(result.groups[0].groupTeams[0].teamName).toBeNull();
      expect(result.fixtures[0].homeTeamName).toBeNull();
    });

    it('대회 운영진(TOURNAMENT_DIRECTOR)에게는 모집 중에도 groups/fixtures 팀명이 그대로 보인다', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(openRowWithNamedGroupsAndFixtures());
      prisma.v1TournamentStaffAssignment.findMany.mockResolvedValue([
        {
          id: 'assignment-1',
          tournamentId: TOURNAMENT_UUID,
          role: 'TOURNAMENT_DIRECTOR',
          fieldId: null,
          version: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          revokedAt: null,
          fixtureScopes: [],
        },
      ]);

      const result = await service.get(TOURNAMENT_UUID, authUser);

      expect(result.groups[0].groupTeams[0]).toMatchObject({ teamId: 'team-1', teamName: 'FC 서울' });
      expect(result.fixtures[0]).toMatchObject({ homeTeamName: 'FC 서울', awayTeamName: '부산 SC' });
      // participantTeams도 같은 우회를 받는다 — 정책이 통일됐으므로 한쪽만 우회되면 안 된다.
      expect(prisma.v1TournamentStaffAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tournamentId: TOURNAMENT_UUID, userId: authUser.id } }),
      );
    });

    it('특정 fixture/field로만 배정된 FIELD_OPERATOR는 대회 전체 조회에서는 우회 대상이 아니다 — least-privilege, 새 로직 아님', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(openRowWithNamedGroupsAndFixtures());
      prisma.v1TournamentStaffAssignment.findMany.mockResolvedValue([
        {
          id: 'assignment-1',
          tournamentId: TOURNAMENT_UUID,
          role: 'FIELD_OPERATOR',
          fieldId: null,
          version: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          revokedAt: null,
          // 이 스태프는 특정 경기에만 배정됨(UUID 형태 — decideTournamentStaffAccess의
          // stable-id 검증 대상) — 이 조회는 fixtureId를 전혀 넘기지 않는(대회 전체
          // 상세) resource이므로 FIXTURE_SCOPE_REQUIRED로 거부된다.
          fixtureScopes: [{ fixtureId: 'b2000000-0000-4000-8000-000000000099' }],
        },
      ]);

      const result = await service.get(TOURNAMENT_UUID, authUser);

      expect(result.fixtures[0].homeTeamName).toBeNull();
    });

    it('모집이 끝나면(closed) 관전자에게도 groups/fixtures 팀명이 다시 공개된다', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(
        openRowWithNamedGroupsAndFixtures({ status: 'closed' }),
      );

      const result = await service.get(TOURNAMENT_UUID);

      expect(result.groups[0].groupTeams[0].teamName).toBe('FC 서울');
      expect(result.fixtures[0]).toMatchObject({ homeTeamName: 'FC 서울', awayTeamName: '부산 SC' });
    });
  });

  it('get: includes active tournament-scoped sponsor and event data', async () => {
    const row = fullTournamentRow({
      sponsors: [
        {
          id: 'sponsor-main',
          tournamentId: 'tournament-1',
          name: '서울 스포츠랩',
          description: '풋살 장비 파트너',
          logoUrl: 'https://cdn.teammeet.test/sponsors/sportslab.png',
          websiteUrl: 'https://sportslab.example.com',
          instagramUrl: 'https://instagram.com/sportslab',
          benefitText: '리뷰 참여자 3팀에게 풋살공 제공',
          boothText: '본부석 옆 체험 부스 운영',
          eventTitle: '매너 리뷰 이벤트',
          eventDescription: '상대팀 리뷰를 남긴 참가팀 중 추첨으로 협찬품을 지급해요.',
          eventResultText: null,
          sortOrder: 10,
          isActive: true,
          createdAt: new Date('2026-06-12T00:00:00.000Z'),
          updatedAt: new Date('2026-06-12T00:00:00.000Z'),
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.sponsors).toEqual([
      {
        id: 'sponsor-main',
        name: '서울 스포츠랩',
        description: '풋살 장비 파트너',
        logoUrl: 'https://cdn.teammeet.test/sponsors/sportslab.png',
        websiteUrl: 'https://sportslab.example.com',
        instagramUrl: 'https://instagram.com/sportslab',
        benefitText: '리뷰 참여자 3팀에게 풋살공 제공',
        boothText: '본부석 옆 체험 부스 운영',
        eventTitle: '매너 리뷰 이벤트',
        eventDescription: '상대팀 리뷰를 남긴 참가팀 중 추첨으로 협찬품을 지급해요.',
        eventResultText: null,
        sortOrder: 10,
      },
    ]);

    const callArgs = prisma.v1Tournament.findFirst.mock.calls[0][0];
    expect(callArgs.include.sponsors).toMatchObject({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  // R3 §4-3단계: 이 결과는 이제 레거시 V1TournamentFixtureResult가 아니라
  // V1Game.currentOfficialRevision(신규 경로)에서 조립된다 -- fixture.result는 더 이상
  // 읽지 않는다. note는 신규 리비전에 대응 컬럼이 없어 항상 null이고(재현 불가 필드),
  // playerId 없는 골의 playerName은 레거시가 남긴 자유 텍스트("대타 선수")를 보존하지
  // 못하고 고정 플레이스홀더로 대체된다(참가자를 특정할 수 없을 때의 신규 경로 한계).
  it('get: fixture with official result(신규 경로) is serialized correctly', async () => {
    // status='closed' — 위 "returns full detail" 테스트와 동일한 이유(팀명 비공개
    // 정책과 무관하게 result 조립 로직만 검증).
    const row = fullTournamentRow({
      status: 'closed',
      fixtures: [
        {
          id: 'fixture-2',
          groupId: null,
          round: 'final',
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: new Date('2026-07-01T16:00:00Z'),
          venue: '결승 구장',
          status: 'completed',
          homeRegistrationId: 'reg-1',
          awayRegistrationId: 'reg-2',
          homeRegistration: { team: { id: 'team-1', name: 'FC 서울' } },
          awayRegistration: { team: { id: 'team-2', name: '부산 아이파크' } },
          videos: [],
          result: null,
          game: {
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            participants: [{ id: 'player-1', sideId: 'side-home', displayNameSnapshot: '홍길동' }],
            events: [
              {
                id: 'goal-1',
                type: 'GOAL',
                sideId: 'side-home',
                participantId: 'player-1',
                clockMs: 45 * 60_000,
                reversesEventId: null,
              },
              {
                id: 'goal-2',
                type: 'GOAL',
                sideId: 'side-away',
                participantId: null,
                clockMs: 10 * 60_000,
                reversesEventId: null,
              },
            ],
            currentOfficialRevision: {
              id: 'revision-fixture-2',
              state: 'OFFICIAL',
              score: { regulation: { home: 3, away: 2 }, penalty: null, goals: [], incomplete: false },
              officialAt: new Date('2026-07-01T17:30:00Z'),
              createdAt: new Date('2026-07-01T17:30:00Z'),
              updatedAt: new Date('2026-07-01T17:30:00Z'),
            },
          },
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.fixtures[0]).toMatchObject({
      homeTeamName: 'FC 서울',
      awayTeamName: '부산 아이파크',
      result: {
        homeScore: 3,
        awayScore: 2,
        hasPenalty: false,
        note: null,
        recordedAt: '2026-07-01T17:30:00.000Z',
        goals: [
          { id: 'goal-1', team: 'home', playerId: 'player-1', playerName: '홍길동', minute: 45 },
          { id: 'goal-2', team: 'away', playerId: null, playerName: '선수 정보 없음', minute: 10 },
        ],
      },
    });
  });

  it('get: DateTime fields are serialized as ISO strings', async () => {
    const scheduledDate = new Date('2026-07-01T09:00:00.000Z');
    const scheduledEndDate = new Date('2026-07-02T09:00:00.000Z');
    const row = fullTournamentRow({ scheduledAt: scheduledDate, scheduledEndAt: scheduledEndDate });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.scheduledAt).toBe(scheduledDate.toISOString());
    expect(result.scheduledEndAt).toBe(scheduledEndDate.toISOString());
    expect(result.createdAt).toBe(new Date('2026-06-01T00:00:00.000Z').toISOString());
  });

  // ─── getOverallStandings (Task 8, §6.2) ──────────────────────────────────────

  describe('getOverallStandings', () => {
    const tournamentId = 'tournament-1';

    beforeEach(() => {
      prisma.v1Tournament.findFirst.mockResolvedValue({
        id: tournamentId,
        competitionConfig: { tieBreak: { points: { win: 3, draw: 1, loss: 0 } } },
      });
      prisma.v1TournamentOverallStanding.findMany.mockResolvedValue([
        {
          registrationId: 'reg-1',
          position: 1,
          points: 18,
          wins: 6,
          draws: 0,
          losses: 1,
          goalsFor: 22,
          goalsAgainst: 9,
          fairPlayPoints: 3,
          recalculatedAt: new Date('2026-08-17T10:00:00.000Z'),
          registration: {
            team: { name: 'FC 서울' },
            // 실제 select에는 없는 필드지만, 이후 실수로 select를 넓혀도 응답에
            // 새지 않는지 방어적으로 검증하기 위해 mock에 PII를 함께 심어 둔다.
            appliedByUser: {
              profile: { realName: '홍길동', phone: '010-1234-5678', birthDate: '1990-01-01' },
            },
          },
        },
        {
          registrationId: 'reg-2',
          position: 2,
          points: 10,
          wins: 3,
          draws: 1,
          losses: 3,
          goalsFor: 12,
          goalsAgainst: 15,
          fairPlayPoints: 5,
          recalculatedAt: new Date('2026-08-17T10:00:00.000Z'),
          registration: { team: { name: 'FC 부산' } },
        },
      ]);
      prisma.v1TournamentFixture.findMany.mockResolvedValue([
        {
          homeRegistrationId: 'reg-1',
          awayRegistrationId: 'reg-2',
          game: { currentOfficialRevision: { state: 'OFFICIAL' } },
          result: null,
        },
        {
          homeRegistrationId: 'reg-1',
          awayRegistrationId: 'reg-2',
          game: null,
          result: null,
        },
      ]);
    });

    it('통합 순위·진행률·매직넘버를 반환한다', async () => {
      const result = await service.getOverallStandings(tournamentId);

      expect(result.standings).toHaveLength(2);
      expect(result.standings[0]).toMatchObject({
        registrationId: 'reg-1',
        teamName: 'FC 서울',
        position: 1,
        points: 18,
      });
      expect(result.standings[1]).toMatchObject({ registrationId: 'reg-2', teamName: 'FC 부산' });
      expect(result.progress).toEqual({ total: 2, played: 1, remaining: 1, percent: 50 });
      // 2위(reg-2) 최대 = 10 + 1(잔여) * 3(승점) = 13, 1위(reg-1) 현재 18 → 확정
      expect(result.magicNumber).toEqual({ registrationId: 'reg-1', value: 0, clinched: true });
      expect(result.recalculatedAt).toBe('2026-08-17T10:00:00.000Z');
    });

    it('대회를 찾을 수 없으면 404 TOURNAMENT_NOT_FOUND를 던진다', async () => {
      prisma.v1Tournament.findFirst.mockResolvedValue(null);

      await expect(service.getOverallStandings('ghost')).rejects.toMatchObject({
        response: { code: 'TOURNAMENT_NOT_FOUND' },
      });
    });

    it('통합 순위 응답에 선수 개인정보가 포함되지 않는다', async () => {
      const result = await service.getOverallStandings(tournamentId);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('realName');
      expect(serialized).not.toContain('birthDate');
      expect(serialized).not.toContain('phone');
    });
  });
});
