/**
 * tournament-reviews.service.spec.ts
 *
 * Contract tests for the tournament awards admin gate (security fix)
 * and the roster-only recipient enforcement.
 * Verifies: non-admin authenticated users get 403 on both listAwards (GET)
 * and setAwards (PUT), support-role admins cannot mutate via setAwards,
 * a legitimate admin can still read/write awards end-to-end, and setAwards
 * rejects recipients/teams that are not in the tournament roster
 * (400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation executed).
 * Forbidden/invalid paths verify "no DB mutation" as behaviour by asserting
 * the Prisma $transaction/deleteMany mocks were not invoked; success paths
 * assert persisted values and the admin audit log record.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { TournamentReviewsService } from './tournament-reviews.service';

const ownerAuthUser = {
  id: 'owner-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const supportAuthUser = {
  id: 'support-user-id',
  email: 'support@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const plainUser = {
  id: 'plain-user-id',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdminRecord = {
  id: 'owner-admin-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

function awardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'award-1',
    tournamentId: 'tournament-1',
    awardType: 'mvp',
    awardLabel: 'MVP',
    recipientName: '김철수',
    teamName: '레알마드리드',
    note: null,
    sortOrder: 0,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    tournamentId: 'tournament-1',
    authorUserId: 'plain-user-id',
    teamName: '레알마드리드',
    rating: 5,
    comment: '좋은 대회였어요',
    photoUrls: [],
    hiddenAt: null,
    hiddenReason: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    author: { id: 'plain-user-id', profile: { nickname: '김철수', profileImageUrl: null } },
    ...overrides,
  };
}

/** confirmed 등록 2건 — '레알마드리드'(김철수·이영희), '바르셀로나'(박지성) */
const confirmedRegistrationRows = [
  {
    team: { name: '레알마드리드' },
    players: [{ realName: '김철수' }, { realName: '이영희' }],
  },
  {
    team: { name: '바르셀로나' },
    players: [{ realName: '박지성' }],
  },
];

describe('TournamentReviewsService — awards admin gate', () => {
  let service: TournamentReviewsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentAward: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    v1TournamentRegistration: { findMany: jest.Mock };
    v1TournamentReview: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentAward: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      v1TournamentRegistration: { findMany: jest.fn() },
      v1TournamentReview: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      $transaction: jest.fn(),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentReviewsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAwards (GET) ───────────────────────────────────────────────────

  it('listAwards: non-admin authenticated user → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.listAwards(plainUser, 'tournament-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentAward.findMany).not.toHaveBeenCalled();
  });

  it('listAwards: support admin can read (read-only gate)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    const result = await service.listAwards(supportAuthUser, 'tournament-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'award-1', awardType: 'mvp' });
  });

  it('listAwards: owner admin can read', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAward.findMany.mockResolvedValue([]);

    const result = await service.listAwards(ownerAuthUser, 'tournament-1');

    expect(result).toEqual([]);
  });

  // ─── setAwards (PUT) ────────────────────────────────────────────────────

  it('setAwards: non-admin authenticated user → 403 PERMISSION_DENIED, no data mutated', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.setAwards(plainUser, 'tournament-1', { awards: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Tournament.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: support admin cannot mutate → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.setAwards(supportAuthUser, 'tournament-1', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: owner admin replaces awards and returns the updated list', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    const result = await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp',
          awardLabel: 'MVP',
          recipientName: '김철수',
          teamName: '레알마드리드',
        },
      ],
    });

    expect(prisma.v1TournamentAward.deleteMany).toHaveBeenCalledWith({
      where: { tournamentId: 'tournament-1' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ awardType: 'mvp', recipientName: '김철수' });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.awards_replace',
          targetType: 'tournament',
          targetId: 'tournament-1',
        }),
      }),
    );
  });

  it('setAwards: 다른 팀 소속 수상자 + 팀명 조합 → 400, DB 무변경 (교차 검증)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    await expect(
      service.setAwards(ownerAuthUser, 'tournament-1', {
        awards: [
          {
            awardType: 'mvp',
            awardLabel: 'MVP',
            recipientName: '김철수', // 레알마드리드 소속
            teamName: '바르셀로나', // 다른 참가 팀
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: 공백 섞인 수상자·팀명은 trim된 값으로 검증·저장된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp',
          awardLabel: 'MVP',
          recipientName: '  김철수  ',
          teamName: ' 레알마드리드 ',
        },
      ],
    });

    expect(prisma.v1TournamentAward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientName: '김철수',
          teamName: '레알마드리드',
        }),
      }),
    );
  });

  it('setAwards: unknown tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(
      service.setAwards(ownerAuthUser, 'ghost', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── setAwards 로스터 전용 강제 ─────────────────────────────────────────

  it('setAwards: recipient not in tournament roster → 400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    const attempt = service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        { awardType: 'mvp', awardLabel: 'MVP', recipientName: '외부인' },
      ],
    });

    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
  });

  it('setAwards: teamName not among confirmed registrations → 400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    await expect(
      service.setAwards(ownerAuthUser, 'tournament-1', {
        awards: [
          {
            awardType: 'mvp',
            awardLabel: 'MVP',
            recipientName: '김철수',
            teamName: '미참가팀',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
  });

  it('setAwards: roster recipient without teamName passes validation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(
      awardRow({ recipientName: '이영희', teamName: null }),
    );
    prisma.v1TournamentAward.findMany.mockResolvedValue([
      awardRow({ recipientName: '이영희', teamName: null }),
    ]);

    const result = await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [{ awardType: 'mvp', awardLabel: 'MVP', recipientName: '이영희' }],
    });

    expect(result[0]).toMatchObject({ recipientName: '이영희', teamName: null });
  });

  it('setAwards: roster is scoped to confirmed registrations of the tournament', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [{ awardType: 'mvp', awardLabel: 'MVP', recipientName: '김철수' }],
    });

    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1', status: 'confirmed' },
      }),
    );
  });
});

describe('TournamentReviewsService — review hide moderation', () => {
  let service: TournamentReviewsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1TournamentReview: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1TournamentReview: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      $transaction: jest.fn(),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentReviewsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listReviews (공개) — 숨김 리뷰 제외 ───────────────────────────────

  it('listReviews: where절에 hiddenAt: null이 포함되어 숨김 리뷰가 목록/카운트에서 제외된다', async () => {
    prisma.v1TournamentReview.findMany.mockResolvedValue([reviewRow()]);
    prisma.v1TournamentReview.count.mockResolvedValue(1);

    const result = await service.listReviews('tournament-1');

    expect(prisma.v1TournamentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 'tournament-1', hiddenAt: null }),
      }),
    );
    expect(prisma.v1TournamentReview.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hiddenAt: null }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('hiddenAt');
  });

  // ─── listReviewsAdmin ───────────────────────────────────────────────────

  it('listReviewsAdmin: non-admin authenticated user → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.listReviewsAdmin(plainUser, 'tournament-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.v1TournamentReview.findMany).not.toHaveBeenCalled();
  });

  it('listReviewsAdmin: 숨김 리뷰도 포함해 조회하고 hiddenAt/hiddenReason을 반환한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    const hidden = reviewRow({
      id: 'review-2',
      hiddenAt: new Date('2026-07-13T00:00:00.000Z'),
      hiddenReason: '부적절한 표현',
    });
    prisma.v1TournamentReview.findMany.mockResolvedValue([reviewRow(), hidden]);
    prisma.v1TournamentReview.count.mockResolvedValue(2);

    const result = await service.listReviewsAdmin(supportAuthUser, 'tournament-1');

    expect(prisma.v1TournamentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1' },
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ hiddenAt: null, hiddenReason: null });
    expect(result.items[1]).toMatchObject({
      hiddenAt: '2026-07-13T00:00:00.000Z',
      hiddenReason: '부적절한 표현',
    });
  });

  // ─── hideReview ─────────────────────────────────────────────────────────

  it('hideReview: non-admin authenticated user → 403, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.hideReview(plainUser, 'tournament-1', 'review-1', {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.v1TournamentReview.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hideReview: support admin cannot mutate → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.hideReview(supportAuthUser, 'tournament-1', 'review-1', {}),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hideReview: 다른 대회 소속이거나 존재하지 않는 리뷰 → 404 REVIEW_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);

    await expect(
      service.hideReview(ownerAuthUser, 'tournament-1', 'ghost-review', {}),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });
    expect(prisma.v1TournamentReview.findFirst).toHaveBeenCalledWith({
      where: { id: 'ghost-review', tournamentId: 'tournament-1' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hideReview: owner admin이 리뷰를 숨기고 감사 로그를 남긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(reviewRow());
    prisma.v1TournamentReview.update.mockResolvedValue(
      reviewRow({ hiddenAt: new Date(), hiddenReason: '욕설 포함' }),
    );

    const result = await service.hideReview(ownerAuthUser, 'tournament-1', 'review-1', {
      reason: '욕설 포함',
    });

    expect(result).toEqual({ alreadyHidden: false });
    expect(prisma.v1TournamentReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-1' },
        data: expect.objectContaining({ hiddenReason: '욕설 포함' }),
      }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.review_hide',
          targetType: 'tournament_review',
          targetId: 'review-1',
          reason: '욕설 포함',
        }),
      }),
    );
  });

  it('hideReview: 이미 숨김 상태면 alreadyHidden: true를 반환하고 재-mutation하지 않는다 (멱등)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(
      reviewRow({ hiddenAt: new Date('2026-07-01T00:00:00.000Z'), hiddenReason: '기존 사유' }),
    );

    const result = await service.hideReview(ownerAuthUser, 'tournament-1', 'review-1', {});

    expect(result).toEqual({ alreadyHidden: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentReview.update).not.toHaveBeenCalled();
  });

  // ─── unhideReview ───────────────────────────────────────────────────────

  it('unhideReview: non-admin authenticated user → 403, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.unhideReview(plainUser, 'tournament-1', 'review-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unhideReview: 존재하지 않는 리뷰 → 404 REVIEW_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);

    await expect(
      service.unhideReview(ownerAuthUser, 'tournament-1', 'ghost-review'),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unhideReview: owner admin이 숨김을 해제하고 감사 로그를 남긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(
      reviewRow({ hiddenAt: new Date('2026-07-01T00:00:00.000Z'), hiddenReason: '기존 사유' }),
    );
    prisma.v1TournamentReview.update.mockResolvedValue(reviewRow());

    const result = await service.unhideReview(ownerAuthUser, 'tournament-1', 'review-1');

    expect(result).toEqual({ alreadyVisible: false });
    expect(prisma.v1TournamentReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-1' },
        data: { hiddenAt: null, hiddenReason: null },
      }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.review_unhide',
          targetType: 'tournament_review',
          targetId: 'review-1',
        }),
      }),
    );
  });

  it('unhideReview: 이미 노출 중이면 alreadyVisible: true를 반환하고 재-mutation하지 않는다 (멱등)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(reviewRow({ hiddenAt: null }));

    const result = await service.unhideReview(ownerAuthUser, 'tournament-1', 'review-1');

    expect(result).toEqual({ alreadyVisible: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentReview.update).not.toHaveBeenCalled();
  });
});
