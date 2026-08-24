/**
 * team-matches.service.spec.ts
 *
 * Service-layer contract tests for TeamMatchesService.
 * Each test asserts real observable behaviour: guard throws, state transitions,
 * eligibility rules, idempotent no-ops, approveApplication side-effects.
 * No mock-verifying-mock (assertions never just mirror what we told the mock to return).
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GamesService } from '../games/games.service';
import { TeamMatchesService } from './team-matches.service';
import { V1AuthUser } from '../auth/v1-auth-user';

// ─── fixtures ────────────────────────────────────────────────────────────────

const manager: V1AuthUser = {
  id: 'manager-user',
  email: 'm@teameet.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

const suspended: V1AuthUser = {
  id: 'suspended-user',
  email: 's@teameet.v1',
  accountStatus: 'suspended',
  onboardingStatus: 'completed',
};

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

function teamMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tm-1',
    hostTeamId: 'team-host',
    createdByUserId: manager.id,
    sportId: 'sport-1',
    regionId: 'region-1',
    title: '풋살 상대팀 모집',
    description: null,
    imageUrl: null,
    placeName: '잠실 풋살장',
    placeAddress: null,
    startAt: FUTURE,
    endAt: null,
    deadlineAt: null,
    formatNote: null,
    matchFormat: null,
    matchStyle: [],
    uniformColor: null,
    genderRule: null,
    costNote: null,
    status: 'recruiting',
    approvedApplicantTeamId: null,
    leagueId: null,
    cancelledAt: null,
    minSportLevelId: null,
    maxSportLevelId: null,
    minSportLevel: null,
    maxSportLevel: null,
    deletedAt: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function applicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    teamMatchId: 'tm-1',
    applicantTeamId: 'team-applicant',
    appliedByUserId: 'applicant-user',
    status: 'requested',
    message: null,
    reviewedByUserId: null,
    reviewedAt: null,
    withdrawnAt: null,
    createdAt: new Date('2026-06-02T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
    ...overrides,
  };
}

function applicationWithTeamMatch(appOverrides: Record<string, unknown> = {}, tmOverrides: Record<string, unknown> = {}) {
  return {
    ...applicationRow(appOverrides),
    teamMatch: teamMatchRow(tmOverrides),
  };
}

// ─── test setup ──────────────────────────────────────────────────────────────

describe('TeamMatchesService', () => {
  let service: TeamMatchesService;
  let prisma: {
    v1User: { findUnique: jest.Mock };
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock };
    v1TeamMatch: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1TeamMatchApplication: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    // 매치 ↔ 팀일정 연동(레인 schedule): create()/approveApplication()/cancel()/update()가 같은
    // 트랜잭션 안에서 team-schedules.service.ts의 평문 함수(createTeamMatchScheduleInTx 등)를
    // 호출하며 이 tx 프록시(=prisma 목)를 그대로 넘긴다. v1TeamSchedule 델리게이트가 없으면
    // "Cannot read properties of undefined"로 깨진다.
    v1TeamSchedule: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
    v1Sport: { findFirst: jest.Mock };
    v1Region: { findFirst: jest.Mock };
    v1Team: { findFirst: jest.Mock; findMany: jest.Mock };
    v1Game: { findUnique: jest.Mock };
    v1GameSide: { update: jest.Mock };
    v1GameParticipant: { createMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock; createMany: jest.Mock };
    v1PostEventReview: { findMany: jest.Mock };
    v1IdempotencyRecord: { findFirst: jest.Mock };
    v1CompetitionConfigVersion: { findFirst: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };
  let games: { createFromSourceInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1User: { findUnique: jest.fn().mockResolvedValue({ phone: '01012345678', profile: { realName: '매니저 실명', gender: 'male' } }) },
      v1TeamMembership: { findFirst: jest.fn(), findMany: jest.fn() },
      v1TeamMatch: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      v1TeamSchedule: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1TeamMatchApplication: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      v1Sport: { findFirst: jest.fn() },
      v1Region: { findFirst: jest.fn() },
      v1Team: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-applicant',
          name: 'Applicant Team',
          memberships: [],
        }),
        findMany: jest.fn(),
      },
      v1Game: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'game-1',
          sides: [{ id: 'side-away', sideKey: 'AWAY', teamId: null }],
          lineups: [{ id: 'lineup-away', sideId: 'side-away', revision: 1 }],
        }),
      },
      v1GameSide: { update: jest.fn().mockResolvedValue({}) },
      v1GameParticipant: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1StatusChangeLog: { create: jest.fn(), createMany: jest.fn() },
      v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
      v1IdempotencyRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      v1CompetitionConfigVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'config-1' }) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };

    // Default: $transaction executes the callback with the same prisma proxy
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );

    notifications = {
      emitNotification: jest.fn().mockResolvedValue(undefined),
      emitToManyDeferred: jest.fn(),
    };
    games = {
      createFromSourceInTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamMatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: GamesService, useValue: games },
      ],
    }).compile();

    service = module.get(TeamMatchesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── #3 최근 장소 조회 ──────────────────────────────────────────────────────

  it('recentVenues: owner/manager 권한 없는 사용자는 403 PERMISSION_DENIED (조회 자체 미실행)', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null); // not a manager

    await expect(service.recentVenues(manager, 'team-host')).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TeamMatch.findMany).not.toHaveBeenCalled();
  });

  it('recentVenues: 이 팀이 호스트인 팀매치만 최신순으로 조회하고 placeName을 애플리케이션에서 dedup한다', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    // 같은 placeName이 여러 행(가장 최근 것이 먼저)으로 섞여 와도 최초 1개만 남아야 한다 —
    // Prisma `distinct` + `orderBy: createdAt`은 Postgres DISTINCT ON 규칙상
    // orderBy가 distinct 필드로 시작하지 않으면 의도한 순서를 보장 못 해 서비스가
    // 직접 dedup한다(회귀 방지).
    prisma.v1TeamMatch.findMany.mockResolvedValue([
      { placeName: '풋살파크 강서', placeAddress: '서울 강서구' },
      { placeName: '풋살파크 강서', placeAddress: '서울 강서구(구주소)' },
      { placeName: '잠실 풋살장', placeAddress: null },
    ]);

    await expect(service.recentVenues(manager, 'team-host')).resolves.toEqual({
      items: [
        { placeName: '풋살파크 강서', addressText: '서울 강서구' },
        { placeName: '잠실 풋살장', addressText: null },
      ],
    });
    expect(prisma.v1TeamMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostTeamId: 'team-host', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    );
  });

  it('recentVenues: 앞뒤 공백만 다른 레거시 값은 trim 후 같은 장소로 dedup되고, 공백뿐인 값은 제외한다', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatch.findMany.mockResolvedValue([
      { placeName: '  ', placeAddress: null }, // 공백뿐 — 제외
      { placeName: '풋살파크 강서 ', placeAddress: '주소1' }, // trim 전 다른 문자열
      { placeName: '풋살파크 강서', placeAddress: '주소2' }, // trim 후 위와 동일 장소
    ]);

    await expect(service.recentVenues(manager, 'team-host')).resolves.toEqual({
      items: [{ placeName: '풋살파크 강서', addressText: '주소1' }],
    });
  });

  // ─── create: guard tests ───────────────────────────────────────────────────

  it('create: 정지된 계정은 403 PERMISSION_DENIED', async () => {
    // assertActiveAccount throws before any DB call
    await expect(
      service.create(suspended, {
        hostTeamId: 'team-host',
        sportId: 'sport-1',
        regionId: 'region-1',
        title: '풋살 상대팀 모집',
        startsAt: FUTURE.toISOString(),
        manualPlaceName: '잠실',
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1TeamMembership.findFirst).not.toHaveBeenCalled();
  });

  it('create: owner/manager 권한 없는 사용자는 403 PERMISSION_DENIED', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null); // not a manager
    await expect(
      service.create(manager, {
        hostTeamId: 'team-host',
        sportId: 'sport-1',
        regionId: 'region-1',
        title: '풋살 상대팀 모집',
        startsAt: FUTURE.toISOString(),
        manualPlaceName: '잠실',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create: host team 종목과 다른 종목은 400 VALIDATION_FAILED', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      team: { sportId: 'sport-football' },
    });

    await expect(
      service.create(manager, {
        hostTeamId: 'team-host',
        sportId: 'sport-futsal',
        regionId: 'region-1',
        title: '다른 종목 팀매치',
        startsAt: FUTURE.toISOString(),
        manualPlaceName: '잠실',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_FAILED',
        details: { field: 'sportId' },
      },
    });
    expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
  });

  it('create: 신청 마감시간을 v1_team_matches에 저장한다', async () => {
    const deadlineAt = new Date(FUTURE.getTime() - 24 * 60 * 60 * 1000);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      team: { sportId: 'sport-1' },
    });
    prisma.v1Sport.findFirst.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    prisma.v1Region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.v1Team.findFirst.mockResolvedValue({
      id: 'team-host',
      name: 'Host Team',
      memberships: [{ id: 'mem-1', userId: manager.id, role: 'owner', user: { profile: { nickname: '매니저', displayName: null } } }],
    });
    prisma.v1TeamMatch.create.mockResolvedValue(teamMatchRow({ deadlineAt }));
    prisma.v1StatusChangeLog.create.mockResolvedValue({});
    games.createFromSourceInTransaction.mockResolvedValue({
      gameId: 'game-1',
      sourceType: 'TEAM_MATCH',
      sourceId: 'tm-1',
      competitionConfigVersionId: 'config-1',
      state: 'SCHEDULED',
      version: 0,
    });

    await service.create(manager, {
      hostTeamId: 'team-host',
      sportId: 'sport-1',
      regionId: 'region-1',
      title: '마감시간 저장 팀매치',
      startsAt: FUTURE.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      manualPlaceName: '잠실',
    });

    expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deadlineAt }),
    });
  });

  // Copilot 리뷰 finding(PR #295): matchFormat/matchStyle/uniformColor를 dto 값 그대로
  // (trim 없이) 저장하면 공백뿐인 문자열이 남아, "구조화 필드가 채워져 있다"는 잘못된
  // 판정(hasStructuredConditions)으로 이어질 수 있다. 저장 직전에 항상 trim되는지 검증한다.
  it('create: matchFormat/matchStyle/uniformColor 공백을 trim하고, 공백뿐인 항목은 제거한다', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      team: { sportId: 'sport-1' },
    });
    prisma.v1Sport.findFirst.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    prisma.v1Region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.v1Team.findFirst.mockResolvedValue({
      id: 'team-host',
      name: 'Host Team',
      memberships: [{ id: 'mem-1', userId: manager.id, role: 'owner', user: { profile: { nickname: '매니저', displayName: null } } }],
    });
    prisma.v1TeamMatch.create.mockResolvedValue(teamMatchRow());
    prisma.v1StatusChangeLog.create.mockResolvedValue({});
    games.createFromSourceInTransaction.mockResolvedValue({
      gameId: 'game-1',
      sourceType: 'TEAM_MATCH',
      sourceId: 'tm-1',
      competitionConfigVersionId: 'config-1',
      state: 'SCHEDULED',
      version: 0,
    });

    await service.create(manager, {
      hostTeamId: 'team-host',
      sportId: 'sport-1',
      regionId: 'region-1',
      title: '경기조건 trim 검증 팀매치',
      startsAt: FUTURE.toISOString(),
      manualPlaceName: '잠실',
      matchFormat: '  6:6  ',
      matchStyle: ['  친선  ', '   ', '매너 중시'],
      uniformColor: '  ',
    });

    expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchFormat: '6:6',
        matchStyle: ['친선', '매너 중시'],
        uniformColor: null,
      }),
    });
  });

  it('update: host team 종목과 다른 종목으로 변경할 수 없다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ hostTeam: { sportId: 'sport-football' } }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      team: { sportId: 'sport-football' },
    });

    await expect(
      service.update(manager, 'tm-1', {
        hostTeamId: 'team-host',
        sportId: 'sport-futsal',
        regionId: 'region-1',
        title: '종목 변경 시도',
        startsAt: FUTURE.toISOString(),
        manualPlaceName: '잠실',
        version: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_FAILED',
        details: { field: 'sportId' },
      },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  // ─── cancel: 상태 머신 ────────────────────────────────────────────────────

  it('update: Game이 핀한 TeamMatch 종목을 바꾸면 409 COMPETITION_CONFIG_IMMUTABLE', async () => {
    // hostTeam.sportId는 시도하는 dto.sportId('sport-2')와 일치시켜, host-team 불일치
    // 체크(먼저 발화)를 통과시키고 순수하게 pin 불변식만 검증한다.
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatchRow({ hostTeam: { sportId: 'sport-2' } }));
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(
      service.update(manager, 'tm-1', {
        hostTeamId: 'team-host',
        sportId: 'sport-2',
        regionId: 'region-1',
        title: '풀살 상대팀 모집',
        startsAt: FUTURE.toISOString(),
        manualPlaceName: '잠실',
        version: teamMatchRow().updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'COMPETITION_CONFIG_IMMUTABLE' },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('cancel: 이미 취소된 팀매치 재취소 → 409 ALREADY_PROCESSED', async () => {
    // getManageableTeamMatch: team match exists + membership exists
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'cancelled' }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(service.cancel(manager, 'tm-1', {})).rejects.toMatchObject({
      status: 409,
      response: { code: 'ALREADY_PROCESSED' },
    });
    // Must not touch DB for the actual update
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('cancel: 완료된 팀매치 취소 → 409 STATE_CONFLICT', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'completed' }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(service.cancel(manager, 'tm-1', {})).rejects.toMatchObject({
      status: 409,
      response: { code: 'STATE_CONFLICT' },
    });
  });

  it('cancel: 과거 startAt(recruiting인데 만료) → 409 STATE_CONFLICT', async () => {
    // getApiStatus returns 'expired' when startAt < now, even if status='recruiting'
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'recruiting', startAt: PAST }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(service.cancel(manager, 'tm-1', {})).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('cancel: 리그 대진(leagueId 有)은 호스트 팀이 직접 취소할 수 없다 → 409 LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ leagueId: 'league-1', status: 'matched', approvedApplicantTeamId: 'team-applicant' }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(service.cancel(manager, 'tm-1', { reason: '일정 변경' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN' },
    });
    // 취소 전이·신청 일괄 거절 어느 쪽도 실행되면 안 된다
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatchApplication.updateMany).not.toHaveBeenCalled();
  });

  // ─── myTeamMatches: status 필터 + 정렬 결정성 ──────────────────────────────

  it('myTeamMatches: 매치 상태 필터(cancelled)가 DB 쿼리에 실제로 적용된다', async () => {
    prisma.v1TeamMembership.findMany.mockResolvedValue([{ teamId: 'team-host', role: 'owner' }]);
    prisma.v1TeamMatch.findMany.mockResolvedValue([]);

    await service.myTeamMatches(manager, { status: 'cancelled' });

    const args = prisma.v1TeamMatch.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('cancelled');
  });

  it('myTeamMatches: expired는 DB status가 아니라 startAt 과거 조건으로 매핑된다 (list()와 동일)', async () => {
    prisma.v1TeamMembership.findMany.mockResolvedValue([{ teamId: 'team-host', role: 'owner' }]);
    prisma.v1TeamMatch.findMany.mockResolvedValue([]);

    await service.myTeamMatches(manager, { status: 'expired' });

    const args = prisma.v1TeamMatch.findMany.mock.calls[0][0];
    expect(args.where.status).toBeUndefined();
    expect(args.where.startAt.lt).toBeInstanceOf(Date);
  });

  it('myTeamMatches: 신청 상태 필터(requested)는 내 신청 상태로 걸리고 hosted 분기를 제외한다', async () => {
    prisma.v1TeamMembership.findMany.mockResolvedValue([{ teamId: 'team-applicant', role: 'owner' }]);
    prisma.v1TeamMatch.findMany.mockResolvedValue([]);

    await service.myTeamMatches(manager, { status: 'requested' });

    const args = prisma.v1TeamMatch.findMany.mock.calls[0][0];
    // 호스트 매치에는 "내 신청"이 없으므로 hostTeamId 분기가 있으면 안 된다
    expect(args.where.OR).toEqual([
      {
        applications: {
          some: expect.objectContaining({ status: 'requested' }),
        },
      },
    ]);
    // 노출되는 신청도 필터 상태와 일치해야 한다
    expect(args.include.applications.where.status).toBe('requested');
  });

  it('list/myTeamMatches: cursor 페이지네이션 orderBy가 유일 tie-breaker(id)로 끝난다', async () => {
    // 리그 일괄 생성 행은 startAt·createdAt이 동일할 수 있어 tie-breaker 없이는
    // 페이지 경계에서 행이 누락/중복된다.
    prisma.v1TeamMatch.findMany.mockResolvedValue([]);
    await service.list(null, {});
    await service.list(null, { sort: 'latest' });

    prisma.v1TeamMembership.findMany.mockResolvedValue([{ teamId: 'team-host', role: 'owner' }]);
    await service.myTeamMatches(manager, {});

    for (const [args] of prisma.v1TeamMatch.findMany.mock.calls) {
      expect(args.orderBy.at(-1)).toEqual({ id: 'desc' });
    }
  });

  it('close: 모집 중 팀매치를 closed로 전환하고 pending 신청을 expired 처리한다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'recruiting', startAt: FUTURE }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatch.update.mockResolvedValue(teamMatchRow({ status: 'closed' }));
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValue({ count: 2 });
    prisma.v1StatusChangeLog.create.mockResolvedValue({});

    const result = await service.close(manager, 'tm-1', { reason: '모집 완료' });

    expect(result.status).toBe('closed');
    expect(result.expiredApplications).toBe(2);
    expect(prisma.v1TeamMatchApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamMatchId: 'tm-1', status: 'requested' }),
        data: expect.objectContaining({ status: 'expired' }),
      }),
    );
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'team_match_closed',
      'tm-1',
      expect.any(String),
    );
  });

  it('reopen: closed 팀매치를 recruiting으로 되돌린다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'closed', startAt: FUTURE }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatch.update.mockResolvedValue(teamMatchRow({ status: 'recruiting' }));
    prisma.v1StatusChangeLog.create.mockResolvedValue({});

    const result = await service.reopen(manager, 'tm-1', { reason: '추가 모집' });

    expect(result.status).toBe('recruiting');
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'recruiting' }) }),
    );
  });

  it('edit: 모집 상태여도 시작 시간이 지났으면 수정 잠금 상태로 내려준다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'recruiting', startAt: PAST }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    const result = await service.edit(manager, 'tm-1');

    expect(result.editable).toBe(false);
    expect(result.lockedReason).toBe('expired');
    expect(result.status).toBe('expired');
  });

  // ─── withdrawApplication: 상태 머신 ───────────────────────────────────────

  it('withdrawApplication: requested가 아닌 신청 취소 → 409 ALREADY_PROCESSED', async () => {
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(
      applicationWithTeamMatch({ status: 'withdrawn' }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' }); // can manage applicant team

    await expect(
      service.withdrawApplication(manager, 'app-1', {}),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ALREADY_PROCESSED' },
    });
    expect(prisma.v1TeamMatchApplication.update).not.toHaveBeenCalled();
  });

  // ─── approveApplication: 승인 후 매칭 상태 전이 ───────────────────────────

  it('approveApplication: 승인 성공 시 teamMatchStatus가 matched로 반환', async () => {
    const app = applicationWithTeamMatch({ status: 'requested' }, { status: 'recruiting', startAt: FUTURE });
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(app);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    const updatedTm = teamMatchRow({ status: 'matched', approvedApplicantTeamId: 'team-applicant' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatchRow());
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.v1TeamMatch.update.mockResolvedValue(updatedTm);
    prisma.v1StatusChangeLog.createMany.mockResolvedValue({ count: 2 });

    const result = await service.approveApplication(manager, 'app-1', {});

    expect(result.status).toBe('approved');
    expect(result.teamMatchStatus).toBe('matched');
    expect(result.approvedApplicantTeamId).toBe('team-applicant');
    // 서비스가 실제로 status='matched'를 update에 전달하는지 검증(stub 반환값 echo 방지)
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'matched' }) }),
    );
  });

  it('approveApplication: 락을 기다리는 동안 다른 상대팀이 매칭되면 두 번째 승인을 거부한다', async () => {
    const app = applicationWithTeamMatch({ status: 'requested' }, { status: 'recruiting', startAt: FUTURE });
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(app);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'matched', approvedApplicantTeamId: 'other-team' }),
    );

    await expect(service.approveApplication(manager, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1TeamMatchApplication.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('approveApplication: 이미 approved 상태 신청 재승인 → 409 STATE_CONFLICT', async () => {
    const app = applicationWithTeamMatch({ status: 'approved' }, { status: 'recruiting', startAt: FUTURE });
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(app);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(
      service.approveApplication(manager, 'app-1', {}),
    ).rejects.toMatchObject({ status: 409 });
    // Transaction should not start
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('approveApplication: 팀매치가 이미 matched 상태 → 409 STATE_CONFLICT', async () => {
    // startAt is future but team match status is already 'matched'
    const app = applicationWithTeamMatch({ status: 'requested' }, { status: 'matched', startAt: FUTURE });
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(app);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(
      service.approveApplication(manager, 'app-1', {}),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('approveApplication: 신청 마감시간이 지난 팀매치는 승인하지 않는다', async () => {
    const app = applicationWithTeamMatch(
      { status: 'requested' },
      { status: 'recruiting', startAt: FUTURE, deadlineAt: PAST },
    );
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(app);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    await expect(service.approveApplication(manager, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('approveApplication: 다른 대기 신청을 자동 거절하면 상태 로그와 알림을 남긴다', async () => {
    const app = applicationWithTeamMatch({ status: 'requested' }, { status: 'recruiting', startAt: FUTURE });
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(app);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatchRow());
    prisma.v1TeamMatchApplication.findMany.mockResolvedValue([
      { id: 'app-other', applicantTeamId: 'team-other' },
    ]);
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    prisma.v1TeamMatch.update.mockResolvedValue(teamMatchRow({ status: 'matched', approvedApplicantTeamId: 'team-applicant' }));
    prisma.v1StatusChangeLog.createMany.mockResolvedValue({ count: 3 });

    await service.approveApplication(manager, 'app-1', {});

    expect(prisma.v1StatusChangeLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          targetId: 'app-other',
          fromStatus: 'requested',
          toStatus: 'rejected',
          reason: 'another_team_match_application_approved',
        }),
      ]),
    });
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'team_match_application_rejected',
      'tm-1',
      expect.stringContaining('상대팀이 확정'),
    );
  });

  // ─── getApiStatus: expired 분기 ───────────────────────────────────────────

  it('detail: startAt이 과거면 getApiStatus가 expired를 반환 (NOT_FOUND_OR_ARCHIVED 전이 없음)', async () => {
    // The recruiting + past startAt match should be visible as "expired", not 404.
    const teamMatch = {
      ...teamMatchRow({ status: 'recruiting', startAt: PAST }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: manager.id,
        status: 'active',
        profile: null,
        trustScore: null,
        memberships: [],
      },
      approvedApplicantTeam: null,
      applications: [],
    };
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatch);
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(null, 'tm-1');
    expect(result.status).toBe('expired');
  });

  // Task 17: the result-entry/approval screens call `/games/:gameId/...` and
  // have no other route to learn the Game id for a team match — detail() must
  // surface it.
  it('detail: 연결된 Game이 있으면 gameId를 응답에 포함한다', async () => {
    const teamMatch = {
      ...teamMatchRow({ status: 'matched', startAt: FUTURE }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: manager.id,
        status: 'active',
        profile: null,
        trustScore: null,
        memberships: [],
      },
      approvedApplicantTeam: null,
      applications: [],
      game: { id: 'game-abc' },
    };
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatch);
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(null, 'tm-1');
    expect(result.gameId).toBe('game-abc');
  });

  it('detail: 연결된 Game이 없으면 gameId는 null이다', async () => {
    const teamMatch = {
      ...teamMatchRow({ status: 'recruiting', startAt: FUTURE }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: manager.id,
        status: 'active',
        profile: null,
        trustScore: null,
        memberships: [],
      },
      approvedApplicantTeam: null,
      applications: [],
      game: null,
    };
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatch);
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(null, 'tm-1');
    expect(result.gameId).toBeNull();
  });

  it('detail: 호스트팀 일반 멤버는 신청 관리 권한이 없으므로 host_team 상태가 아니다', async () => {
    const teamMatch = {
      ...teamMatchRow({ status: 'recruiting', startAt: FUTURE }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: 'owner-user',
        status: 'active',
        profile: null,
        trustScore: null,
        memberships: [{ id: 'mem-1', userId: manager.id, role: 'member', status: 'active' }],
      },
      approvedApplicantTeam: null,
      applications: [],
    };
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatch);
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.state).toBe('none');
    expect(result.viewer.manageableHostTeam).toBe(false);
  });

  // 후기 자격은 역할을 안 가린다(reviews.service.ts resolveReviewerTeams: 두 팀의 active 멤버
  // 전원). 그런데 `viewer.state` 는 host 팀 owner/manager 에게만 'host_team' 을, 신청서를 낸
  // 한 사람에게만 'approved' 를 준다 — 바로 위 테스트가 그 사실을 고정하고 있다. 그래서 화면이
  // state 로 후기 진입점을 게이팅하면 양 팀 일반 팀원이 통째로 잘려 나간다. participantMember 는
  // 그 판정을 위해 따로 내려주는 값이라, state 와 독립적으로 계약을 고정한다.
  function detailRowWithOpponent(hostMemberships: unknown[], applicantMemberships: unknown[], opponent: boolean) {
    return {
      ...teamMatchRow({ status: 'completed', startAt: FUTURE }),
      approvedApplicantTeamId: opponent ? 'team-applicant' : null,
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: 'owner-user',
        status: 'active',
        profile: null,
        trustScore: null,
        memberships: hostMemberships,
      },
      approvedApplicantTeam: opponent
        ? { id: 'team-applicant', name: '신청팀', memberships: applicantMemberships }
        : null,
      applications: [],
    };
  }

  it('detail: 호스트팀 일반 멤버도 상대가 확정된 경기에서는 참가팀 소속으로 표시된다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      detailRowWithOpponent([{ id: 'mem-1', userId: manager.id, role: 'member', status: 'active' }], [], true),
    );
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.state).toBe('none');
    expect(result.viewer.manageableHostTeam).toBe(false);
    expect(result.viewer.participantMember).toBe(true);
  });

  it('detail: 신청팀 일반 멤버도 참가팀 소속으로 표시된다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      detailRowWithOpponent([], [{ userId: manager.id, role: 'member', status: 'active' }], true),
    );
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.participantMember).toBe(true);
  });

  // 결과 승인 게이트(2026-08-24). 화면은 예전에 `state === 'approved'` 로 "상대팀 담당자"를
  // 판정했는데, 그 값은 **신청서를 낸 사람 한 명**에게만 붙는다. 리그 대진은 운영자가 신청서를
  // 대신 만들기 때문에 상대팀의 owner 도 manager 도 승인 화면에 닿지 못했고, 결과가
  // SUBMITTED 에서 멈춰 순위표가 갱신되지 않았다(alpha 실측: 원정팀 owner 의 state 가 'none').
  // 그래서 아래 두 테스트는 **state 와 무관하게** 멤버십 역할만으로 갈리는 것을 고정한다 —
  // applications 를 비워 둔 채(= 신청서를 낸 적 없는 사용자) 판정이 나오는 것이 핵심이다.
  it('detail: 신청팀 owner/manager 는 신청서를 직접 내지 않았어도 결과 승인 권한이 있다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      detailRowWithOpponent([], [{ userId: manager.id, role: 'manager', status: 'active' }], true),
    );
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.state).toBe('none');
    expect(result.viewer.manageableOpponentTeam).toBe(true);
    expect(result.viewer.manageableHostTeam).toBe(false);
  });

  it('detail: 신청팀 일반 멤버는 결과 승인 권한이 없다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      detailRowWithOpponent([], [{ userId: manager.id, role: 'member', status: 'active' }], true),
    );
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.manageableOpponentTeam).toBe(false);
  });

  it('detail: 어느 팀에도 속하지 않으면 참가팀 소속이 아니다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(detailRowWithOpponent([], [], true));
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.participantMember).toBe(false);
  });

  // 상대가 확정되기 전에는 후기 대상 자체가 없다 — 소속만으로 열어 주면 안 된다.
  it('detail: 상대팀이 확정되지 않았으면 호스트팀 멤버여도 참가팀 소속이 아니다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      detailRowWithOpponent([{ id: 'mem-1', userId: manager.id, role: 'member', status: 'active' }], [], false),
    );
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(manager, 'tm-1');

    expect(result.viewer.participantMember).toBe(false);
  });

  it('approveApplication: 신청자가 없을 때 404 NOT_FOUND', async () => {
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(null);

    await expect(
      service.approveApplication(manager, 'ghost-app', {}),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── 팀신뢰점수 live 재계산 (후속과제: 캐시가 72시간 경과만으로 안 갱신되는 문제) ──────

  const OLD_SUBMITTED_AT = new Date(Date.now() - 100 * 60 * 60 * 1000); // 100h ago (>72h reveal window)

  /**
   * targetTeamId/reviewerTeamId in-필터로 팀별 candidate 리뷰를 되돌려주는 v1PostEventReview mock.
   *
   * reviewerTeamId를 행마다 지정할 수 있다 — 신뢰점수 집계가 "팀 평균 1표"라서, 같은 상대팀이 여러
   * 경기에서 준 평점은 몇 건이든 1표로 접힌다. 평가한 팀 수가 등급을 정하므로(3팀 이상 verified)
   * 등급을 다루는 케이스는 평가팀을 서로 다르게 줘야 한다. 생략하면 기존처럼 단일 상대팀으로 채운다.
   */
  function mockPostEventReviewsByTeam(
    reviewsByTeam: Record<string, Array<{ sourceId: string; rating: number; reviewerTeamId?: string }>>,
  ) {
    prisma.v1PostEventReview.findMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      const where = args.where as { targetTeamId?: { in: string[] }; reviewerTeamId?: { in: string[] } };
      if (where.targetTeamId) {
        const teamIds = where.targetTeamId.in;
        const rows = teamIds.flatMap((teamId) =>
          (reviewsByTeam[teamId] ?? []).map((review) => ({
            targetTeamId: teamId,
            sourceId: review.sourceId,
            reviewerTeamId: review.reviewerTeamId ?? `opponent-of-${teamId}`,
            rating: review.rating,
            submittedAt: OLD_SUBMITTED_AT,
          })),
        );
        return Promise.resolve(rows);
      }
      if (where.reviewerTeamId) {
        return Promise.resolve([]); // no reciprocal reviews needed — reveal is via 72h elapsed
      }
      return Promise.resolve([]);
    });
  }

  it('list: 캐시된 trustState(sample)와 다른 live 재계산 값(verified)을 반환한다', async () => {
    // 서로 다른 3개 팀이 평가 → 3표 → verified. (같은 팀이 3경기에서 준 것이면 팀 평균 1표로 접혀
    // estimated가 되므로, 등급을 검증하려면 평가팀을 나눠야 한다.)
    mockPostEventReviewsByTeam({
      'team-host': [
        { sourceId: 'tm-a', rating: 5, reviewerTeamId: 'rival-1' },
        { sourceId: 'tm-b', rating: 5, reviewerTeamId: 'rival-2' },
        { sourceId: 'tm-c', rating: 5, reviewerTeamId: 'rival-3' },
      ],
    });
    prisma.v1TeamMatch.findMany.mockResolvedValue([
      {
        ...teamMatchRow({ hostTeamId: 'team-host' }),
        sport: { id: 'sport-1', name: '풋살' },
        region: { id: 'region-1', name: '서울' },
        minSportLevel: null,
        maxSportLevel: null,
        hostTeam: {
          id: 'team-host',
          name: '호스트팀',
          ownerUserId: manager.id,
          status: 'active',
          profile: null,
          trustScore: { trustState: 'sample' }, // stale cache — DB never re-aggregated
          memberships: [],
        },
        approvedApplicantTeam: null,
        applications: [],
      },
    ]);

    const result = await service.list(null, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].hostTeam.trustState).toBe('verified');
  });

  it('applications: 신청 팀이 2개 이상일 때 배치 크로스토크 없이 각 팀의 live 값을 정확히 매핑한다', async () => {
    // A팀은 서로 다른 3개 팀에게 평가받아 3표(verified), B팀은 1팀 1표(estimated).
    mockPostEventReviewsByTeam({
      'team-applicant-a': [
        { sourceId: 'tm-x', rating: 5, reviewerTeamId: 'rival-1' },
        { sourceId: 'tm-y', rating: 5, reviewerTeamId: 'rival-2' },
        { sourceId: 'tm-z', rating: 5, reviewerTeamId: 'rival-3' },
      ],
      'team-applicant-b': [{ sourceId: 'tm-w', rating: 2 }],
    });
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatchRow({ status: 'recruiting' }));
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatchApplication.findMany.mockResolvedValue([
      applicationRow({
        id: 'app-a',
        applicantTeamId: 'team-applicant-a',
        applicantTeam: {
          id: 'team-applicant-a',
          name: 'A팀',
          profile: null,
          trustScore: { trustState: 'sample', mannerScore: null, matchCount: 7 },
        },
        appliedByUser: { id: 'user-a', profile: { nickname: '에이', displayName: null, profileImageUrl: null } },
      }),
      applicationRow({
        id: 'app-b',
        applicantTeamId: 'team-applicant-b',
        applicantTeam: {
          id: 'team-applicant-b',
          name: 'B팀',
          profile: null,
          trustScore: { trustState: 'sample', mannerScore: null, matchCount: 2 },
        },
        appliedByUser: { id: 'user-b', profile: { nickname: '비', displayName: null, profileImageUrl: null } },
      }),
    ]);

    const result = await service.applications(manager, 'tm-1', {});

    const teamA = result.items.find((item) => item.applicantTeam.teamId === 'team-applicant-a');
    const teamB = result.items.find((item) => item.applicantTeam.teamId === 'team-applicant-b');

    // A팀은 3건 만점 리뷰 → verified/5점. B팀은 1건 낮은 점수 리뷰 → estimated/2점.
    // A팀의 값이 B팀에 섞여 들어가면(크로스토크) 이 assertion이 깨진다.
    expect(teamA?.applicantTeam.trustState).toBe('verified');
    expect(teamA?.applicantTeam.score).toBe(5);
    expect(teamA?.applicantTeam.matchCount).toBe(7); // matchCount는 스코프 밖 — 기존 캐시값 유지
    expect(teamB?.applicantTeam.trustState).toBe('estimated');
    expect(teamB?.applicantTeam.score).toBe(2);
    expect(teamB?.applicantTeam.matchCount).toBe(2);
  });

  // ─── getPublicTeamMatch: hostTeam.trustScore를 노출하지 않는 경로는 live 재계산을 건너뛴다 ──

  it('applicationEligibility: 응답이 hostTeam.trustScore를 쓰지 않으므로 live 재계산 쿼리를 건너뛴다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue({
      ...teamMatchRow({ status: 'recruiting', startAt: FUTURE, hostTeamId: 'team-host' }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: 'owner-user',
        status: 'active',
        profile: null,
        trustScore: { trustState: 'sample' }, // 쓰이지 않아야 하는 값
        memberships: [],
      },
      approvedApplicantTeam: null,
      applications: [],
    });
    prisma.v1Team.findMany.mockResolvedValue([
      { id: 'team-applicant', name: '신청팀', memberships: [{ role: 'manager' }] },
    ]);

    const result = await service.applicationEligibility(manager, 'tm-1', {});

    expect(result.teams[0].eligible).toBe(true);
    // computeRevealedTeamTrustBatch가 실행되면 v1PostEventReview.findMany가 최소 1회 호출된다.
    // eligibility 응답은 hostTeam.trustScore를 전혀 노출하지 않으므로 이 쿼리 자체가 없어야 한다 —
    // includeTrust 플래그를 되돌리면(항상 재계산) 이 assertion이 깨진다.
    expect(prisma.v1PostEventReview.findMany).not.toHaveBeenCalled();
  });

  it('createApplication: 신청 제출 성공 경로는 hostTeam.trustScore를 쓰지 않으므로 live 재계산 쿼리를 건너뛴다', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-applicant' }); // assertCanManageTeam(applicantTeamId)
    prisma.v1TeamMatch.findFirst.mockResolvedValue({
      ...teamMatchRow({ status: 'recruiting', startAt: FUTURE, hostTeamId: 'team-host' }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: 'owner-user',
        status: 'active',
        profile: null,
        trustScore: { trustState: 'sample' }, // 쓰이지 않아야 하는 값
        memberships: [],
      },
      approvedApplicantTeam: null,
      applications: [],
    });
    prisma.v1TeamMatchApplication.create.mockResolvedValue({
      id: 'app-new',
      teamMatchId: 'tm-1',
      applicantTeamId: 'team-applicant',
      status: 'requested',
    });
    prisma.v1StatusChangeLog.create.mockResolvedValue({});

    const result = await service.createApplication(manager, 'tm-1', { applicantTeamId: 'team-applicant' });

    expect(result.status).toBe('requested');
    // 신청 제출(POST)은 쓰기 경로의 critical path다 — 응답에 노출되지 않는 hostTeam 신뢰점수를 위해
    // 추가 쿼리를 태우면 안 된다.
    expect(prisma.v1PostEventReview.findMany).not.toHaveBeenCalled();
  });

  it('createApplication: 신청 마감시간이 지나면 새 신청을 거부한다', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-applicant' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue({
      ...teamMatchRow({ status: 'recruiting', startAt: FUTURE, deadlineAt: PAST }),
      hostTeam: { id: 'team-host', memberships: [], trustScore: null },
      applications: [],
    });

    await expect(
      service.createApplication(manager, 'tm-1', { applicantTeamId: 'team-applicant' }),
    ).rejects.toMatchObject({ response: { code: 'NOT_RECRUITING' } });
    expect(prisma.v1TeamMatchApplication.create).not.toHaveBeenCalled();
  });

  it('withdrawApplication: 승인과 경쟁해 requested 전이가 실패하면 취소 성공으로 보고하지 않는다', async () => {
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(applicationWithTeamMatch());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.withdrawApplication(manager, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'ALREADY_PROCESSED' },
    });
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('rejectApplication: 신청 취소와 경쟁해 requested 전이가 실패하면 거절 성공으로 보고하지 않는다', async () => {
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(applicationWithTeamMatch());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rejectApplication(manager, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('detail(getPublicTeamMatch): 단일 조회도 캐시가 아닌 live 재계산된 hostTeam trustState를 반환한다', async () => {
    mockPostEventReviewsByTeam({
      'team-host': [{ sourceId: 'tm-a', rating: 4 }],
    });
    const teamMatch = {
      ...teamMatchRow({ status: 'recruiting', startAt: FUTURE, hostTeamId: 'team-host' }),
      sport: { id: 'sport-1', name: '풋살' },
      region: { id: 'region-1', name: '서울' },
      minSportLevel: null,
      maxSportLevel: null,
      hostTeam: {
        id: 'team-host',
        name: '호스트팀',
        ownerUserId: manager.id,
        status: 'active',
        profile: null,
        trustScore: { trustState: 'sample' }, // stale cache
        memberships: [],
      },
      approvedApplicantTeam: null,
      applications: [],
    };
    prisma.v1TeamMatch.findFirst.mockResolvedValue(teamMatch);
    prisma.v1Team.findMany.mockResolvedValue([]);

    const result = await service.detail(null, 'tm-1');

    expect(result.hostTeam.trustState).toBe('estimated');
  });
});
