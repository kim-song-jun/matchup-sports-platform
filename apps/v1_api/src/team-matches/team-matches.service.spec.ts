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
    formatNote: null,
    genderRule: null,
    costNote: null,
    status: 'recruiting',
    approvedApplicantTeamId: null,
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
    v1Sport: { findFirst: jest.Mock };
    v1Region: { findFirst: jest.Mock };
    v1Team: { findMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock; createMany: jest.Mock };
    v1PostEventReview: { findMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1User: { findUnique: jest.fn().mockResolvedValue({ phone: '01012345678', profile: { realName: '매니저 실명', gender: 'male' } }) },
      v1TeamMembership: { findFirst: jest.fn(), findMany: jest.fn() },
      v1TeamMatch: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      v1TeamMatchApplication: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      v1Sport: { findFirst: jest.fn() },
      v1Region: { findFirst: jest.fn() },
      v1Team: { findMany: jest.fn() },
      v1StatusChangeLog: { create: jest.fn(), createMany: jest.fn() },
      v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue(undefined),
    };

    // Default: $transaction executes the callback with the same prisma proxy
    const p = prisma as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    notifications = {
      emitNotification: jest.fn().mockResolvedValue(undefined),
      emitToManyDeferred: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamMatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TeamMatchesService);
  });

  afterEach(() => jest.clearAllMocks());

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

  // ─── cancel: 상태 머신 ────────────────────────────────────────────────────

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

  it('complete: matched 팀매치를 completed로 전환하고 양 팀 운영자에게 알림을 보낸다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(
      teamMatchRow({ status: 'matched', startAt: PAST, approvedApplicantTeamId: 'team-applicant' }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.v1TeamMatch.update.mockResolvedValue(teamMatchRow({ status: 'completed', completedAt: new Date() }));
    prisma.v1StatusChangeLog.create.mockResolvedValue({});

    const result = await service.complete(manager, 'tm-1', { note: '경기 완료' });

    expect(result.status).toBe('completed');
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }) }),
    );
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'team_match_completed',
      'tm-1',
      '"풋살 상대팀 모집" 팀매치 리뷰를 남겨보세요.',
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

  it('approveApplication: 신청자가 없을 때 404 NOT_FOUND', async () => {
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(null);

    await expect(
      service.approveApplication(manager, 'ghost-app', {}),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── 팀신뢰점수 live 재계산 (후속과제: 캐시가 72시간 경과만으로 안 갱신되는 문제) ──────

  const OLD_SUBMITTED_AT = new Date(Date.now() - 100 * 60 * 60 * 1000); // 100h ago (>72h reveal window)

  /** targetTeamId/reviewerTeamId in-필터로 팀별 candidate 리뷰를 되돌려주는 v1PostEventReview mock. */
  function mockPostEventReviewsByTeam(reviewsByTeam: Record<string, Array<{ sourceId: string; rating: number }>>) {
    prisma.v1PostEventReview.findMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      const where = args.where as { targetTeamId?: { in: string[] }; reviewerTeamId?: { in: string[] } };
      if (where.targetTeamId) {
        const teamIds = where.targetTeamId.in;
        const rows = teamIds.flatMap((teamId) =>
          (reviewsByTeam[teamId] ?? []).map((review) => ({
            targetTeamId: teamId,
            sourceId: review.sourceId,
            reviewerTeamId: `opponent-of-${teamId}`,
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
    mockPostEventReviewsByTeam({
      'team-host': [
        { sourceId: 'tm-a', rating: 5 },
        { sourceId: 'tm-b', rating: 5 },
        { sourceId: 'tm-c', rating: 5 },
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
    mockPostEventReviewsByTeam({
      'team-applicant-a': [
        { sourceId: 'tm-x', rating: 5 },
        { sourceId: 'tm-y', rating: 5 },
        { sourceId: 'tm-z', rating: 5 },
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
