/**
 * matches.service.spec.ts
 *
 * Service-layer contract tests for MatchesService.
 * Each test asserts real observable behaviour (thrown error type/code, returned
 * shape, state-transition correctness).  No test verifies only that a mock was
 * called with what we told it to return.
 *
 * Covered contracts
 *   1. 비-호스트 취소 → 403 PERMISSION_DENIED
 *   2. 이미 취소된 매치 재취소 → 409 ALREADY_PROCESSED (idempotent guard)
 *   3. 완료된 매치 취소 시도 → 409 STATE_CONFLICT
 *   4. 정원 초과 신청 승인 → 409 FULL (approveApplication)
 *   5. 비-호스트 신청 승인 → 403 PERMISSION_DENIED
 *   6. 비-requested 상태 신청 철회 → 409 STATE_CONFLICT
 *   7. 타인 신청 철회 → 403 PERMISSION_DENIED
 *   8. 비활성 계정 취소 → 403 PERMISSION_DENIED
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchesService } from './matches.service';
import { V1AuthUser } from '../auth/v1-auth-user';

// ─── fixtures ────────────────────────────────────────────────────────────────

const host: V1AuthUser = {
  id: 'host-user-id',
  email: 'host@teameet.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

const otherUser: V1AuthUser = {
  id: 'other-user-id',
  email: 'other@teameet.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

const inactiveUser: V1AuthUser = {
  id: 'inactive-user-id',
  email: 'banned@teameet.v1',
  accountStatus: 'suspended',
  onboardingStatus: 'completed',
};

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);       // -1 day

function matchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    hostUserId: host.id,
    sportId: 'sport-1',
    regionId: 'region-1',
    title: '테스트 매치',
    description: null,
    imageUrl: null,
    placeName: '강남역',
    placeAddress: null,
    startAt: FUTURE,
    endAt: null,
    deadlineAt: null,
    maxParticipants: 6,
    levelNote: null,
    genderRule: null,
    costNote: null,
    minSportLevelId: null,
    maxSportLevelId: null,
    minSportLevel: null,
    maxSportLevel: null,
    status: 'recruiting',
    cancelledAt: null,
    completedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function applicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    matchId: 'match-1',
    applicantUserId: otherUser.id,
    status: 'requested',
    message: null,
    reviewedByUserId: null,
    reviewedAt: null,
    withdrawnAt: null,
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    match: matchRow({ maxParticipants: 6, status: 'recruiting', startAt: FUTURE }),
    ...overrides,
  };
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: {
    v1User: { findUnique: jest.Mock };
    v1Match: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    v1MatchApplication: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    v1MatchParticipant: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    v1StatusChangeLog: { create: jest.Mock };
    v1Sport: { findFirst: jest.Mock };
    v1Region: { findFirst: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  let notifications: { emitNotification: jest.Mock; emitNotificationToMany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1User: { findUnique: jest.fn().mockResolvedValue({ phone: '01012345678', profile: { realName: '호스트 실명', gender: 'male' } }) },
      v1Match: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      v1MatchApplication: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      v1MatchParticipant: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      v1Sport: { findFirst: jest.fn() },
      v1Region: { findFirst: jest.fn() },
      $transaction: jest.fn(),
      // approveApplication은 정원 TOCTOU 방지를 위해 트랜잭션 안에서
      // tx.$queryRaw`... FOR UPDATE`로 match 행을 잠근다 (matches.service.ts:645).
      $queryRaw: jest.fn().mockResolvedValue(undefined),
    };

    // Default $transaction: execute callback with prisma itself
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );

    notifications = {
      emitNotification: jest.fn().mockResolvedValue(undefined),
      emitNotificationToMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(MatchesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. 비-호스트 취소 → 403 ──────────────────────────────────────────────

  it('cancel: 호스트가 아닌 사용자가 취소하면 403 PERMISSION_DENIED를 던진다', async () => {
    // getHostMatch 내부 v1Match.findFirst → 매치 존재, but hostUserId != otherUser.id
    prisma.v1Match.findFirst.mockResolvedValue(matchRow({ hostUserId: host.id }));

    await expect(service.cancel(otherUser, 'match-1', {})).rejects.toThrow(ForbiddenException);
    await expect(service.cancel(otherUser, 'match-1', {})).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    // 실제 DB 업데이트는 전혀 호출되면 안 된다
    expect(prisma.v1Match.update).not.toHaveBeenCalled();
  });

  // ─── 2. 이미 취소된 매치 재취소 → 409 ALREADY_PROCESSED ─────────────────

  it('cancel: 이미 cancelled 상태인 매치를 다시 취소하면 409 ALREADY_PROCESSED를 던진다', async () => {
    prisma.v1Match.findFirst.mockResolvedValue(
      matchRow({ hostUserId: host.id, status: 'cancelled' }),
    );

    await expect(service.cancel(host, 'match-1', {})).rejects.toThrow(ConflictException);
    await expect(service.cancel(host, 'match-1', {})).rejects.toMatchObject({
      response: { code: 'ALREADY_PROCESSED' },
    });
    expect(prisma.v1Match.update).not.toHaveBeenCalled();
  });

  // ─── 3. 완료된 매치 취소 시도 → 409 STATE_CONFLICT ───────────────────────

  it('cancel: completed 매치를 취소하면 409 STATE_CONFLICT를 던진다', async () => {
    prisma.v1Match.findFirst.mockResolvedValue(
      matchRow({ hostUserId: host.id, status: 'completed' }),
    );

    await expect(service.cancel(host, 'match-1', {})).rejects.toThrow(ConflictException);
    await expect(service.cancel(host, 'match-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1Match.update).not.toHaveBeenCalled();
  });

  // ─── 4. 정원 초과 신청 승인 → 409 FULL ───────────────────────────────────

  it('approveApplication: 참가자 수 == maxParticipants 이면 409 FULL을 던진다', async () => {
    const MAX = 6;
    // getApplicationWithMatch → application with match
    prisma.v1MatchApplication.findFirst.mockResolvedValue(
      applicationRow({
        match: matchRow({ maxParticipants: MAX, status: 'recruiting', startAt: FUTURE }),
      }),
    );
    prisma.v1Match.findFirst.mockResolvedValue(
      matchRow({ maxParticipants: MAX, status: 'recruiting', startAt: FUTURE }),
    );
    // getActiveParticipantCount → already full
    prisma.v1MatchParticipant.count.mockResolvedValue(MAX);

    await expect(service.approveApplication(host, 'app-1', {})).rejects.toThrow(ConflictException);
    await expect(service.approveApplication(host, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'FULL' },
    });
    expect(prisma.v1MatchApplication.update).not.toHaveBeenCalled();
    // TOCTOU 방지 락이 정원 재검증보다 먼저, 올바른 matchId로 걸렸는지 확인한다.
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw.mock.calls[0]).toContain('match-1');
  });

  it('approveApplication: 락 획득 뒤 매치가 취소 상태면 참가자를 만들지 않는다', async () => {
    prisma.v1MatchApplication.findFirst.mockResolvedValue(applicationRow());
    prisma.v1Match.findFirst.mockResolvedValue(matchRow({ status: 'cancelled' }));

    await expect(service.approveApplication(host, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1MatchApplication.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1MatchParticipant.upsert).not.toHaveBeenCalled();
  });

  it('approveApplication: 철회가 먼저 확정돼 requested 전이가 실패하면 참가자를 만들지 않는다', async () => {
    prisma.v1MatchApplication.findFirst.mockResolvedValue(applicationRow());
    prisma.v1Match.findFirst.mockResolvedValue(matchRow());
    prisma.v1MatchApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approveApplication(host, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1MatchParticipant.upsert).not.toHaveBeenCalled();
  });

  // ─── 5. 비-호스트 신청 승인 → 403 PERMISSION_DENIED ─────────────────────

  it('approveApplication: 호스트가 아닌 사용자가 승인하면 403 PERMISSION_DENIED를 던진다', async () => {
    prisma.v1MatchApplication.findFirst.mockResolvedValue(
      applicationRow({
        // match.hostUserId == host.id, but caller is otherUser
        match: matchRow({ hostUserId: host.id }),
      }),
    );

    await expect(service.approveApplication(otherUser, 'app-1', {})).rejects.toThrow(ForbiddenException);
    await expect(service.approveApplication(otherUser, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1MatchApplication.update).not.toHaveBeenCalled();
  });

  // ─── 6. 비-requested 상태 신청 철회 → 409 STATE_CONFLICT ─────────────────

  it('withdrawApplication: approved 상태 신청을 철회하면 409 STATE_CONFLICT를 던진다', async () => {
    prisma.v1MatchApplication.findFirst.mockResolvedValue(
      applicationRow({
        applicantUserId: otherUser.id,
        status: 'approved',
      }),
    );

    await expect(service.withdrawApplication(otherUser, 'app-1', {})).rejects.toThrow(ConflictException);
    await expect(service.withdrawApplication(otherUser, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1MatchApplication.update).not.toHaveBeenCalled();
  });

  it('withdrawApplication: 승인이 먼저 확정돼 requested 전이가 실패하면 withdrawn으로 보고하지 않는다', async () => {
    prisma.v1MatchApplication.findFirst.mockResolvedValue(applicationRow());
    prisma.v1MatchApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.withdrawApplication(otherUser, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  // ─── 7. 타인 신청 철회 → 403 PERMISSION_DENIED ───────────────────────────

  it('withdrawApplication: 본인이 아닌 사용자가 철회하면 403 PERMISSION_DENIED를 던진다', async () => {
    prisma.v1MatchApplication.findFirst.mockResolvedValue(
      applicationRow({
        applicantUserId: otherUser.id, // owner is otherUser
        status: 'requested',
      }),
    );

    // host is not the applicant → should be forbidden
    await expect(service.withdrawApplication(host, 'app-1', {})).rejects.toThrow(ForbiddenException);
    await expect(service.withdrawApplication(host, 'app-1', {})).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1MatchApplication.update).not.toHaveBeenCalled();
  });

  // ─── 8. 비활성 계정 취소 → 403 PERMISSION_DENIED ─────────────────────────

  it('cancel: accountStatus=suspended 계정이 취소하면 403 PERMISSION_DENIED를 던진다', async () => {
    // getHostMatch will succeed (inactiveUser is the host in this test)
    prisma.v1Match.findFirst.mockResolvedValue(
      matchRow({ hostUserId: inactiveUser.id, status: 'recruiting' }),
    );

    await expect(service.cancel(inactiveUser, 'match-1', {})).rejects.toThrow(ForbiddenException);
    await expect(service.cancel(inactiveUser, 'match-1', {})).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    // assertActiveAccount fires before getHostMatch, so DB should never be queried
    expect(prisma.v1Match.findFirst).not.toHaveBeenCalled();
  });
});
