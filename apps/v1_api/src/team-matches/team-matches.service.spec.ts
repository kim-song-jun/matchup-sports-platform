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
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock };
    v1TeamMatch: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1TeamMatchApplication: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    v1Sport: { findFirst: jest.Mock };
    v1Region: { findFirst: jest.Mock };
    v1Team: { findMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1TeamMembership: { findFirst: jest.fn(), findMany: jest.fn() },
      v1TeamMatch: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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
      $transaction: jest.fn(),
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
      undefined,
    );
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

    const updatedApp = applicationRow({ status: 'approved' });
    const updatedTm = teamMatchRow({ status: 'matched', approvedApplicantTeamId: 'team-applicant' });
    prisma.v1TeamMatchApplication.update.mockResolvedValue(updatedApp);
    prisma.v1TeamMatch.update.mockResolvedValue(updatedTm);
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValue({ count: 0 });
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

  it('approveApplication: 신청자가 없을 때 404 NOT_FOUND', async () => {
    prisma.v1TeamMatchApplication.findFirst.mockResolvedValue(null);

    await expect(
      service.approveApplication(manager, 'ghost-app', {}),
    ).rejects.toThrow(NotFoundException);
  });
});
