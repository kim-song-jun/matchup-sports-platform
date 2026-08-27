import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { ProfileService } from './profile.service';

const user = {
  id: 'user-1',
  email: 'old@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('ProfileService identity binding', () => {
  it('clears stale verification assertions and synchronizes the password login key when email changes', async () => {
    const profile = {
      displayName: '테스트 사용자',
      nickname: '테스트닉',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
      updatedAt: new Date(),
    };
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          email: user.email,
          phone: '01011112222',
          authIdentities: [{ provider: 'email', passwordHash: 'hash' }],
          profile,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      v1AuthIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1UserProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(profile),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
      v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    const service = new ProfileService(prisma as unknown as PrismaService);

    await service.updateMe(user, {
      displayName: profile.displayName,
      nickname: profile.nickname,
      email: 'new@teameet.test',
      // 번호는 그대로 둔다 — 번호 변경은 본인인증 증명을 요구하므로 아래 별도 describe 에서 다룬다.
      phone: '01011112222',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
    });

    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        email: 'new@teameet.test',
        phone: '01011112222',
        emailVerifiedAt: null,
      },
    });
    expect(prisma.v1AuthIdentity.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, provider: 'email', status: 'active' },
      data: { email: 'new@teameet.test', providerUserKey: 'new@teameet.test' },
    });
  });
});

describe('ProfileService settings theme preference', () => {
  function buildPrisma(overrides: {
    updateResolvedTheme?: 'light' | 'dark' | 'system';
    findUniqueResolvedTheme?: 'light' | 'dark' | 'system';
  } = {}) {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({ themePreference: overrides.findUniqueResolvedTheme ?? 'light' }),
        update: jest.fn().mockResolvedValue({ themePreference: overrides.updateResolvedTheme ?? 'dark' }),
      },
      v1UserProfile: {
        findUnique: jest.fn().mockResolvedValue({ nickname: '테스트닉' }),
      },
      v1NotificationPreference: {
        upsert: jest.fn().mockResolvedValue({
          activityEnabled: true,
          marketingEnabled: false,
          updatedAt: new Date('2026-08-10T00:00:00Z'),
        }),
        findUnique: jest.fn().mockResolvedValue({
          activityEnabled: true,
          matchEnabled: true,
          teamEnabled: true,
          teamMatchEnabled: true,
          chatEnabled: true,
          noticeEnabled: true,
          marketingEnabled: false,
          updatedAt: new Date('2026-08-01T00:00:00Z'),
        }),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    return prisma;
  }

  it('persists an explicit theme choice and echoes it back without touching notifications', async () => {
    const prisma = buildPrisma({ updateResolvedTheme: 'dark' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    const result = await service.updateSettings(user, { theme: 'dark' });

    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { themePreference: 'dark' },
    });
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
    expect(result.theme).toBe('dark');
  });

  // Copilot 리뷰 지적: 테마만 바꾸는 요청에서 알림설정 row에 불필요한 write(upsert)가
  // 나가면 @updatedAt만 갱신되는 무의미한 쓰기가 발생한다 — 읽기만 해야 한다.
  it('테마만 바꿀 때는 알림설정 row에 쓰지 않고 읽기만 한다', async () => {
    const prisma = buildPrisma({ updateResolvedTheme: 'dark' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await service.updateSettings(user, { theme: 'dark' });

    expect(prisma.v1NotificationPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.v1NotificationPreference.findUnique).toHaveBeenCalledWith({ where: { userId: user.id } });
  });

  it('leaves the stored theme untouched and echoes the current value when the request omits theme', async () => {
    const prisma = buildPrisma({ findUniqueResolvedTheme: 'system' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    const result = await service.updateSettings(user, { notifications: { chatEnabled: false } });

    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1User.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      select: { themePreference: true },
    });
    expect(result.theme).toBe('system');
  });

  // Copilot 리뷰 지적: ThemeProvider가 앱 루트에서 GET /me/settings를 상시 호출하게
  // 되면서, settings()가 upsert(update:{})로 알림설정을 읽으면 요청마다 불필요한
  // UPDATE(@updatedAt 갱신 포함)가 발생한다 — GET은 순수 읽기여야 한다.
  it('settings() GET은 알림설정 row에 절대 쓰지 않는다', async () => {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          email: user.email,
          phone: null,
          accountStatus: 'active',
          themePreference: 'dark',
          authIdentities: [{ provider: 'email', passwordHash: 'hash' }],
          profile: { nickname: '테스트닉' },
        }),
      },
      v1NotificationPreference: {
        upsert: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new ProfileService(prisma as unknown as PrismaService);

    const result = await service.settings(user);

    expect(prisma.v1NotificationPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.v1NotificationPreference.findUnique).toHaveBeenCalledWith({ where: { userId: user.id } });
    expect(result.theme).toBe('dark');
    // row가 아직 없는 사용자 — 기본값(전부 켜짐, marketing만 꺼짐)이 write 없이 그대로 응답된다.
    expect(result.notifications).toMatchObject({ matchEnabled: true, marketingEnabled: false });
  });
});

describe('ProfileService phone change proof gate', () => {
  const OLD_PHONE = '01011112222';
  const NEW_PHONE = '01033334444';

  function buildPrisma() {
    const profile = {
      displayName: '테스트 사용자',
      nickname: '테스트닉',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
      updatedAt: new Date(),
    };
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          email: user.email,
          phone: OLD_PHONE,
          authIdentities: [{ provider: 'email', passwordHash: 'hash' }],
          profile,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      v1AuthIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1UserProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(profile),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
      v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    return { prisma, profile };
  }

  function payload(phone: string, phoneProofToken?: string) {
    return {
      displayName: '테스트 사용자',
      nickname: '테스트닉',
      email: user.email,
      phone,
      phoneProofToken,
      profileImageUrl: null,
      birthDate: null,
      gender: 'male' as const,
    };
  }

  const originalSecret = process.env.V1_SESSION_SECRET;

  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'test-proof-secret';
    delete process.env.V1_PHONE_VERIFICATION_DISABLED;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = originalSecret;
    delete process.env.V1_PHONE_VERIFICATION_DISABLED;
  });

  it('증명 없이 번호를 바꾸려 하면 400 PHONE_NOT_VERIFIED 로 막고 아무것도 저장하지 않는다', async () => {
    const { prisma } = buildPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.updateMe(user, payload(NEW_PHONE))).rejects.toMatchObject({
      response: { code: 'PHONE_NOT_VERIFIED' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
  });

  it('다른 번호로 발급된 증명은 거부한다 (토큰 재사용 차단)', async () => {
    const { prisma } = buildPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);
    const tokenForOtherPhone = issuePhoneProofToken('01099998888');

    await expect(service.updateMe(user, payload(NEW_PHONE, tokenForOtherPhone))).rejects.toMatchObject({
      response: { code: 'PHONE_NOT_VERIFIED' },
    });
    expect(prisma.v1User.update).not.toHaveBeenCalled();
  });

  it('유효한 증명이면 번호를 바꾸고 phoneVerifiedAt 을 새로 세운다 (인증 직후 미인증으로 떨어지지 않음)', async () => {
    const { prisma } = buildPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);

    await service.updateMe(user, payload(NEW_PHONE, issuePhoneProofToken(NEW_PHONE)));

    expect(prisma.v1User.update).toHaveBeenCalledTimes(1);
    const data = prisma.v1User.update.mock.calls[0][0].data;
    expect(data.phone).toBe(NEW_PHONE);
    expect(data.phoneVerifiedAt).toBeInstanceOf(Date);
  });

  it('번호를 바꾸지 않는 저장은 증명 없이 통과하고 phoneVerifiedAt 을 건드리지 않는다', async () => {
    const { prisma } = buildPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);

    await service.updateMe(user, payload(OLD_PHONE));

    expect(prisma.v1User.update).toHaveBeenCalledTimes(1);
    expect(prisma.v1User.update.mock.calls[0][0].data).not.toHaveProperty('phoneVerifiedAt');
  });

  it('인증 강제가 꺼진 환경(V1_PHONE_VERIFICATION_DISABLED=true)에서는 증명 없이 바꾸되 미인증으로 떨어뜨린다', async () => {
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'true';
    const { prisma } = buildPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);

    await service.updateMe(user, payload(NEW_PHONE));

    expect(prisma.v1User.update.mock.calls[0][0].data.phoneVerifiedAt).toBeNull();
  });
});

describe('ProfileService activitySummary', () => {
  it('mannerScore를 V1UserReputationSummary 캐시 대신 v1PostEventReview를 매번 live로 재집계한다 (reveal 필터 적용)', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // revealed: 상대(reviewer-a)가 반대 방향 리뷰를 이미 제출해서 즉시 공개됨
      const revealedReview = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId: user.id,
        rating: 5,
        submittedAt: now,
      };
      // hidden: 방금 제출됐고(72시간 미경과) 상대도 아직 제출 안 함 — 아직 비공개, 평균 계산에서 제외돼야 함
      const hiddenReview = {
        sourceId: 'source-b',
        reviewerUserId: 'reviewer-b',
        targetUserId: user.id,
        rating: 1,
        submittedAt: now,
      };
      const reverseReview = { sourceId: 'source-a', reviewerUserId: user.id, targetUserId: 'reviewer-a' };

      const findMany = jest
        .fn()
        .mockResolvedValueOnce([revealedReview, hiddenReview])
        .mockResolvedValueOnce([reverseReview]);

      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team-1' }]) },
        v1PostEventReview: { findMany },
        v1MatchParticipant: {
          count: jest.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(2),
        },
        v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      // sourceType='match' — 대회 개인 후기(tournament_fixture)는 V1UserReputationSummary의
      // tournament_* 컬럼에 따로 집계되므로 이 헤드라인 평점 모집단에 섞이면 안 된다.
      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: { targetUserId: user.id, targetType: 'user', status: 'submitted', sourceType: 'match' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
      });
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { reviewerUserId: user.id, sourceType: 'match', sourceId: { in: ['source-a', 'source-b'] }, status: 'submitted' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true },
      });
      expect(result.totals).toEqual({ activityCount: 7, teamCount: 1, mannerScore: 5 });
      expect(result.monthly).toEqual({ matchCount: 2, mannerScore: 5, winRate: null });
    } finally {
      jest.useRealTimers();
    }
  });

  it('상대가 반대 방향 리뷰를 제출하지 않았고 72시간도 경과하지 않은 리뷰는 제외한다 (전부 비공개)', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      const hiddenReview = {
        sourceId: 'source-c',
        reviewerUserId: 'reviewer-c',
        targetUserId: user.id,
        rating: 3,
        submittedAt: now,
      };
      const findMany = jest.fn().mockResolvedValueOnce([hiddenReview]).mockResolvedValueOnce([]);
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany },
        v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
        v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(result.totals.mannerScore).toBeNull();
      expect(result.monthly.mannerScore).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('72시간이 경과했지만 그 이후 새 리뷰 이벤트가 전혀 없었던 리뷰도 캐시 갱신 트리거 없이 매 요청마다 포함된다', async () => {
    // 이번 수정의 핵심 시나리오: 캐시(V1UserReputationSummary)는 submitPersonalReview/submitTeamReview
    // 안에서만 갱신되므로, 리뷰 R 하나를 받은 뒤 새 리뷰가 전혀 없으면 R이 72시간 경과로 reveal 가능해져도
    // 캐시는 영원히 갱신 안 될 수 있다. 이 메서드는 캐시를 읽지 않고 매번 live로 재계산하므로 정상 반영돼야 한다.
    const submittedAt = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-08-15T12:00:00Z'); // submittedAt으로부터 72시간 훨씬 이상 경과
    jest.useFakeTimers().setSystemTime(now);

    try {
      const staleRevealedReview = {
        sourceId: 'source-stale',
        reviewerUserId: 'reviewer-stale',
        targetUserId: user.id,
        rating: 4,
        submittedAt,
      };
      // reverse 조회 결과는 비어있음 — 상대가 끝까지 반대 방향 리뷰를 제출하지 않았지만, 시간 경과만으로 공개됨
      const findMany = jest.fn().mockResolvedValueOnce([staleRevealedReview]).mockResolvedValueOnce([]);
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany },
        v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
        v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(result.totals.mannerScore).toBe(4);
      expect(result.monthly.mannerScore).toBe(4);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ProfileService tournament appearance aggregation', () => {
  const now = new Date('2026-08-15T12:00:00Z');
  const monthStart = new Date('2026-08-01T00:00:00Z');

  // countTournamentAppearances()가 읽는 shape을 그대로 흉내낸다: participantId로 연결된
  // V1GameResultParticipant 행 각각이 하나의 resultRevision(+game)에 속한다.
  function gameResultRow(config: {
    gameId: string;
    revisionId: string;
    currentOfficialRevisionId: string | null;
    officialAt: Date | null;
    tournamentId?: string | null;
  }) {
    // sourceType 은 select 에 없다 — where 가 이미 TOURNAMENT_FIXTURE 로 좁히므로
    // 서비스가 그 필드를 읽지 않는다(위 TEAM_MATCH 테스트가 where 쪽을 검증한다).
    const tournamentId = config.tournamentId === undefined ? `${config.gameId}-tournament` : config.tournamentId;
    return {
      resultRevision: {
        id: config.revisionId,
        gameId: config.gameId,
        officialAt: config.officialAt,
        game: {
          currentOfficialRevisionId: config.currentOfficialRevisionId,
          tournamentFixture: tournamentId === null ? null : { tournamentId },
        },
      },
    };
  }

  it('activitySummary(): 신원 연결이 없으면 대회 출전 쿼리를 건너뛰고 레거시 매치 수만 반환한다', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const gameResultParticipantFindMany = jest.fn();
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
        v1MatchParticipant: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1) },
        v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
        v1GameResultParticipant: { findMany: gameResultParticipantFindMany },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(gameResultParticipantFindMany).not.toHaveBeenCalled();
      expect(result.totals.activityCount).toBe(3);
      expect(result.monthly.matchCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('activitySummary(): 현재 공식 리비전 + officialAt 있는 대회 출전만 세어 레거시 매치 수에 더한다', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const rows = [
        // 현재 공식 리비전 + 이번 달 → total, monthly 모두 카운트
        gameResultRow({
          gameId: 'game-1',
          revisionId: 'revision-1-current',
          currentOfficialRevisionId: 'revision-1-current',
          officialAt: new Date('2026-08-10T00:00:00Z'),
        }),
        // 정정으로 superseded된(구) 리비전 — game.currentOfficialRevisionId가 다른 값을 가리키므로 제외
        gameResultRow({
          gameId: 'game-2',
          revisionId: 'revision-2-old',
          currentOfficialRevisionId: 'revision-2-new',
          officialAt: new Date('2026-08-11T00:00:00Z'),
        }),
        // officialAt이 아직 없는(미확정) 리비전 — 제외
        gameResultRow({
          gameId: 'game-3',
          revisionId: 'revision-3-current',
          currentOfficialRevisionId: 'revision-3-current',
          officialAt: null,
        }),
        // 현재 공식 리비전이지만 지난달 경기 — total에는 포함, monthly에서는 제외
        gameResultRow({
          gameId: 'game-4',
          revisionId: 'revision-4-current',
          currentOfficialRevisionId: 'revision-4-current',
          officialAt: new Date('2026-07-20T00:00:00Z'),
        }),
      ];
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
        v1MatchParticipant: { count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0) },
        v1ParticipantIdentityLinkCurrent: {
          findMany: jest.fn().mockResolvedValue([{ participantId: 'participant-1' }]),
        },
        v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(rows) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      // total: game-1, game-4 (2건) — game-2(superseded), game-3(officialAt null)는 제외
      expect(result.totals.activityCount).toBe(2);
      // monthly: game-1만 (1건) — game-4는 지난달
      expect(result.monthly.matchCount).toBe(1);
      expect(prisma.v1GameResultParticipant.findMany).toHaveBeenCalledWith({
        where: {
          participantId: { in: ['participant-1'] },
          resultRevision: {
            officialAt: { not: null },
            game: { sourceType: 'TOURNAMENT_FIXTURE' },
          },
        },
        select: {
          resultRevision: {
            select: {
              id: true,
              gameId: true,
              officialAt: true,
              game: {
                select: {
                  currentOfficialRevisionId: true,
                  tournamentFixture: { select: { tournamentId: true } },
                },
              },
            },
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('activitySummary(): TEAM_MATCH(팀 매치) 결과가 섞이지 않도록 쿼리에서 sourceType 을 제한한다', async () => {
    // 레거시 2자 승인 API(identity-link-requests + attest)는 sourceType 검사 없이
    // TEAM_MATCH 게임 참가자에도 identity link 를 걸 수 있다 — "대회 경기 출전 수"는
    // TOURNAMENT_FIXTURE 만 세어야 한다(확정 계약). 걸러내는 주체가 DB(where)이므로
    // 이 테스트는 "그 필터가 쿼리에 실려 나가는가"를 본다 — 필터를 빼면 TEAM_MATCH 행이
    // 그대로 합산되고 이 단언이 깨진다.
    jest.useFakeTimers().setSystemTime(now);
    try {
      const rows = [
        gameResultRow({
          gameId: 'game-tournament',
          revisionId: 'revision-tournament-current',
          currentOfficialRevisionId: 'revision-tournament-current',
          officialAt: new Date('2026-08-10T00:00:00Z'),
        }),
      ];
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
        v1MatchParticipant: { count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0) },
        v1ParticipantIdentityLinkCurrent: {
          findMany: jest.fn().mockResolvedValue([{ participantId: 'participant-1' }]),
        },
        v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(rows) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(result.totals.activityCount).toBe(1);
      expect(result.monthly.matchCount).toBe(1);
      expect(prisma.v1GameResultParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resultRevision: { officialAt: { not: null }, game: { sourceType: 'TOURNAMENT_FIXTURE' } },
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('activitySummary(): 같은 gameId가 여러 participant 행으로 잡혀도 gameId 기준으로 한 번만 센다', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const rows = [
        gameResultRow({
          gameId: 'game-1',
          revisionId: 'revision-1-current',
          currentOfficialRevisionId: 'revision-1-current',
          officialAt: new Date('2026-08-10T00:00:00Z'),
        }),
        // 로스터 교체 등으로 같은 게임에 두 번째 participant 행이 잡혀도 gameId가 같으면 1건으로 처리
        gameResultRow({
          gameId: 'game-1',
          revisionId: 'revision-1-current',
          currentOfficialRevisionId: 'revision-1-current',
          officialAt: new Date('2026-08-10T00:00:00Z'),
        }),
      ];
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
        v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
        v1ParticipantIdentityLinkCurrent: {
          findMany: jest.fn().mockResolvedValue([
            { participantId: 'participant-1' },
            { participantId: 'participant-2' },
          ]),
        },
        v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(rows) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(result.totals.activityCount).toBe(1);
      expect(result.monthly.matchCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('publicProfile(): 대회 출전 수가 동의 게이트 없이 레거시 매치 수에 합산된다', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const targetUserId = 'user-public-tournament';
      const baseUser = {
        id: targetUserId,
        deletedAt: null,
        accountStatus: 'active',
        profile: { nickname: '대회러' },
        reputationSummary: { trustState: 'sample', mannerScore: null, reviewCount: 0 },
      };
      const rows = [
        gameResultRow({
          gameId: 'game-1',
          revisionId: 'revision-1-current',
          currentOfficialRevisionId: 'revision-1-current',
          officialAt: new Date('2026-08-10T00:00:00Z'),
        }),
      ];
      const prisma = {
        // Task 155: publicProfile() 이 선수 카드를 함께 만든다 -- 카드 입력을 목에 두지
        // 않으면 이 스펙이 검증하는 것과 무관한 이유로 죽는다. null 은 '카드는 만들어지되
        // 아무 능력치도 열리지 않는' 최소 상태다.
        v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
        v1User: { findFirst: jest.fn().mockResolvedValue(baseUser) },
        v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
        v1TeamMembership: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
        v1ParticipantIdentityLinkCurrent: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ participantId: 'participant-1', linkId: 'link-1', userId: targetUserId }]),
        },
        v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(rows) },
        // Task 154 P2: publicProfile 이 최근 활동(경기별 상세)을 위해 동의를 **조회하게** 됐다.
        // 그래서 "동의를 호출하지 않는다"는 예전 단언은 더 이상 계약을 정확히 표현하지 않는다 --
        // 진짜 계약은 "출전 **횟수** 집계가 동의에 좌우되지 않는다" 이므로, 호출 여부(mechanism)
        // 대신 결과(outcome)로 검증한다: 동의를 REVOKED 로 두고도 matchCount 가 그대로인지 본다.
        // 이 편이 예전 단언보다 강하다 -- 구현이 동의를 조회하든 말든 집계가 흔들리면 잡힌다.
        v1UserRecordConsent: {
          // Task 155: 선수 카드가 동의 상태를 findUnique 로 읽는다(이 스펙의 findMany 와 별개 경로).
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([{ userId: targetUserId, state: 'REVOKED' }]),
        },
        v1ParticipantConsentSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
        v1GameParticipant: { findUnique: jest.fn().mockResolvedValue(null) },
        v1GameSide: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      // 동의가 REVOKED 인데도 출전 **횟수**는 그대로다 -- 이 집계는 게이트 대상이 아니다
      // (사용자 결정: 총계 숫자 하나는 개별 경기 상세와 노출 수준이 다르다).
      expect(result.activitySummary.totals.matchCount).toBe(1);
      expect(result.activitySummary.monthly.matchCount).toBe(1);
      // 반대로 경기별 상세(최근 활동)는 같은 REVOKED 에 막혀야 한다 -- 두 노출 수준이
      // 실제로 분리돼 있음을 여기서 함께 고정한다.
      expect(result.recentActivity).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * alpha 실측(2026-08-24)에서 잡은 회귀. bio 는 DB 에 저장됐는데 `toProfilePayload` 가
 * 그 필드를 안 실어 보내서, `PATCH /me/profile` 응답과 `GET /me/profile` 둘 다 값을
 * 돌려주지 않았다. 프론트는 그 응답으로 캐시를 갱신하고 편집 폼 초깃값을 채우므로,
 * **저장 직후 편집 화면에 다시 들어가면 방금 쓴 소개가 비어 보였다**(DB 엔 남아 있는데).
 *
 * 공개 프로필에는 별도 경로로 나갔기 때문에 "저장은 됐다"는 착시가 생겨 더 늦게 발견된다.
 */
describe('ProfileService 내 프로필 응답의 bio 왕복', () => {
  function buildMePrisma(bio: string | null) {
    return {
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
      v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'a@b.test',
          phone: null,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          accountStatus: 'active',
          onboardingStatus: 'completed',
          themePreference: 'system',
          profile: {
            nickname: '테스트닉',
            displayName: null,
            realName: null,
            profileImageUrl: null,
            birthDate: null,
            gender: 'male',
            bio,
          },
          regions: [],
          sportPreferences: [],
          reputationSummary: null,
          authIdentities: [],
        }),
      },
    };
  }

  const authUser = {
    id: 'user-1',
    email: 'a@b.test',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  } as never;

  it('저장한 bio 를 응답으로 다시 돌려준다', async () => {
    const service = new ProfileService(buildMePrisma('풋살 좋아하는 미드필더예요.') as never);
    const result = await service.me(authUser);
    expect(result.profile.bio).toBe('풋살 좋아하는 미드필더예요.');
  });

  it('bio 가 없으면 키를 빼지 않고 null 로 내려준다', async () => {
    // undefined 로 새면 JSON 직렬화에서 키 자체가 사라져, 클라이언트가 "필드를 모르는
    // 옛 서버"와 "값이 비어 있음"을 구분하지 못한다.
    const service = new ProfileService(buildMePrisma(null) as never);
    const result = await service.me(authUser);
    expect(result.profile).toHaveProperty('bio');
    expect(result.profile.bio).toBeNull();
  });
});

describe('ProfileService public profile moderation', () => {
  it('queries only publicly available account states', async () => {
    const prisma = {
      v1User: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.publicProfile(null, 'blocked-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.v1User.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'blocked-user',
        deletedAt: null,
        accountStatus: 'active',
      },
      include: { profile: true, reputationSummary: true },
    });
  });
});

describe('ProfileService public profile activity summary (reveal filtering)', () => {
  const targetUserId = 'user-public-1';
  const baseUser = {
    id: targetUserId,
    deletedAt: null,
    accountStatus: 'active',
    profile: { nickname: '테스트' },
    reputationSummary: { trustState: 'sample', mannerScore: null, reviewCount: 5 },
  };

  // where.targetType 존재 여부로 candidates 쿼리(전체 기간 또는 이번 달 한정)와 reverse 쿼리를 구분하고,
  // candidates 쿼리는 where.submittedAt 존재 여부로 "전체 기간(totals)"과 "이번 달(monthly)"을 구분한다.
  // 각 테스트는 한쪽 candidates를 빈 배열로 둬서 그쪽의 reverse 호출 자체가 발생하지 않도록 해 순서 의존을 없앤다.
  function buildPrisma(config: {
    allTimeCandidates?: unknown[];
    monthlyCandidates?: unknown[];
    reverse?: unknown[];
  } = {}) {
    const allTimeCandidates = config.allTimeCandidates ?? [];
    const monthlyCandidates = config.monthlyCandidates ?? [];
    const reverse = config.reverse ?? [];

    const findMany = jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
      const { where } = args;
      if ('targetType' in where) {
        return Promise.resolve(where.submittedAt ? monthlyCandidates : allTimeCandidates);
      }
      return Promise.resolve(reverse);
    });

    return {
      v1User: { findFirst: jest.fn().mockResolvedValue(baseUser) },
      v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
      v1TeamMembership: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      v1PostEventReview: { findMany },
      v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
      // Task 154 P2: 연결이 0개면 최근 활동 조회는 즉시 null 로 끝나지만, 방어적으로 둔다.
      v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      // Task 155: publicProfile() 이 선수 카드도 함께 만든다. 이 describe 가 검증하는 것은
      // 후기 reveal 필터라 카드는 무관하지만, 입력이 없으면 카드 계산에서 죽는다.
      // null 은 '카드는 만들어지되 아무 능력치도 열리지 않는' 최소 상태다.
      v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
      v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
    };
  }

  it('totals.reviewCount는 캐시(V1UserReputationSummary) 대신 reveal 필터를 통과한 리뷰만 live로 재계산해 반환한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // revealed-by-partner: 상대가 반대 방향 리뷰를 제출해서 즉시 공개됨
      const revealedByPartner = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId,
        rating: 5,
        submittedAt: now,
      };
      // hidden: 방금 제출됐고 상대도 아직 제출 안 함 — 72시간 미경과라 아직 비공개, count에서 제외돼야 함
      const hidden = {
        sourceId: 'source-b',
        reviewerUserId: 'reviewer-b',
        targetUserId,
        rating: 1,
        submittedAt: now,
      };
      const reverse = [{ sourceId: 'source-a', reviewerUserId: targetUserId, targetUserId: 'reviewer-a' }];

      const prisma = buildPrisma({ allTimeCandidates: [revealedByPartner, hidden], reverse });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.totals.reviewCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('72시간이 경과했지만 그 이후 새 리뷰 이벤트가 전혀 없었던 리뷰도 totals.reviewCount에 포함된다 (캐시 갱신 트리거 부재 대응)', async () => {
    const submittedAt = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-08-15T12:00:00Z'); // 72시간 훨씬 이상 경과
    jest.useFakeTimers().setSystemTime(now);

    try {
      const staleRevealed = {
        sourceId: 'source-stale',
        reviewerUserId: 'reviewer-stale',
        targetUserId,
        rating: 4,
        submittedAt,
      };
      // reverse가 비어있어도(상대가 끝까지 반대 방향 리뷰를 제출하지 않아도) 시간 경과만으로 공개돼야 한다
      const prisma = buildPrisma({ allTimeCandidates: [staleRevealed], reverse: [] });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.totals.reviewCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('monthly.reviewCount는 이번 달 제출된 리뷰 중 아직 공개(reveal)되지 않은 리뷰를 제외한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // revealed: 상대(reviewer-a)가 이미 반대 방향 리뷰를 제출해서 즉시 공개됨
      const revealedReview = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId,
        submittedAt: now,
      };
      // hidden: 방금 제출됐고(72시간 미경과) 상대도 아직 제출 안 함 — 아직 비공개
      const hiddenReview = {
        sourceId: 'source-b',
        reviewerUserId: 'reviewer-b',
        targetUserId,
        submittedAt: now,
      };
      const reverseReview = { sourceId: 'source-a', reviewerUserId: targetUserId, targetUserId: 'reviewer-a' };

      const prisma = buildPrisma({
        monthlyCandidates: [revealedReview, hiddenReview],
        reverse: [reverseReview],
      });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.monthly.reviewCount).toBe(1);
      expect(prisma.v1PostEventReview.findMany).toHaveBeenCalledWith({
        // 월별 개수도 헤드라인 평점과 같은 모집단(개인 매치)이어야 한다 — 한쪽만 대회 후기를
        // 더하면 "이번 달 3건인데 누적은 1건" 같은 어긋난 숫자가 한 화면에 함께 나온다.
        where: { reviewerUserId: targetUserId, sourceType: 'match', sourceId: { in: ['source-a', 'source-b'] }, status: 'submitted' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reputation.mannerScore/reviewCount는 캐시(reputationSummary) 값이 아니라 reveal 필터를 통과한 live 재계산 값을 반환한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // baseUser.reputationSummary(캐시)는 reviewCount: 5, mannerScore: null — 이번 테스트는 이 캐시값이
      // 무시되고 live 재계산 결과(revealed 리뷰 1건, 평점 5)가 반환되는지 검증한다.
      const revealedByPartner = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId,
        rating: 5,
        submittedAt: now,
      };
      const reverse = [{ sourceId: 'source-a', reviewerUserId: targetUserId, targetUserId: 'reviewer-a' }];
      const prisma = buildPrisma({ allTimeCandidates: [revealedByPartner], reverse });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.reputation.reviewCount).toBe(1);
      expect(result.reputation.mannerScore).toBe(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('같은 대회에서 두 경기를 뛰면 경기 수는 2, 대회 수는 1로 센다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // 한 대회(tournament-1)에서 두 경기, 다른 대회(tournament-2)에서 한 경기.
      // 경기 수만 보면 3인데 대회 수는 2여야 한다 -- 두 값이 같은 카운터에서 나오므로
      // 여기서 갈라지지 않으면 "대회 수"가 사실상 경기 수의 복사본이 된다.
      function row(gameId: string, tournamentId: string) {
        return {
          resultRevision: {
            id: `${gameId}-revision`,
            gameId,
            officialAt: now,
            game: {
              currentOfficialRevisionId: `${gameId}-revision`,
              tournamentFixture: { tournamentId },
            },
          },
        };
      }
      const prisma = {
        // 카드 입력(v1UserReputationSummary/v1UserRecordConsent)은 buildPrisma() 가 이미 준다.
        ...buildPrisma(),
        v1ParticipantIdentityLinkCurrent: {
          // linkId/userId 는 최근 활동 조회(loadParticipantConsentEligibility)가 select 한다.
          findMany: jest
            .fn()
            .mockResolvedValue([{ participantId: 'participant-1', linkId: 'link-1', userId: targetUserId }]),
        },
        // Task 154 P2: 최근 활동은 동의 게이트를 탄다. 이 스펙의 관심사는 출전 수 집계이므로
        // 동의 없음(=최근 활동 null)으로 두고 집계만 본다.
        // Task 155: 선수 카드는 동의 상태를 findUnique 로 읽는다(참가자 스냅샷용 findMany 와 별개 경로).
        v1UserRecordConsent: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        v1ParticipantConsentSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
        v1GameResultParticipant: {
          findMany: jest.fn().mockResolvedValue([
            row('game-1', 'tournament-1'),
            row('game-2', 'tournament-1'),
            row('game-3', 'tournament-2'),
          ]),
        },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.totals).toMatchObject({ matchCount: 3, tournamentCount: 2 });
      expect(result.activitySummary.monthly).toMatchObject({ matchCount: 3, tournamentCount: 2 });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ProfileService withdrawal admin lockout', () => {
  function createPrisma(activeAdmin: { id: string } | null) {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({ accountStatus: 'active' }),
        update: jest.fn().mockResolvedValue({
          id: user.id,
          accountStatus: 'withdrawal_pending',
          updatedAt: new Date('2026-07-19T00:00:00.000Z'),
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(activeAdmin ? { status: 'active' } : null),
      },
      v1MatchParticipant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      v1TeamMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        // 탈퇴 시 남은 일반 멤버십을 left 로 정리한다.
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      v1Team: { update: jest.fn().mockResolvedValue({}) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    return prisma;
  }

  // 순서가 뒤집히면(정리 → 멤버십 off) 그 사이에 다른 트랜잭션이 이 사람을 대회 명단에
  // 추가할 수 있고, 그러면 탈퇴한 사람이 명단에 활성으로 남는다 — 2026-08-03 유령 명단
  // 사고와 같은 상태다. 명단 추가 경로는 멤버십 행을 FOR UPDATE 로 잡지만, 정리가 먼저
  // 돌면 그 시점엔 아무도 그 행을 잠그지 않아 lock 이 아무것도 막지 못한다.
  it('탈퇴는 멤버십을 먼저 끄고 그다음 대회 명단을 정리한다', async () => {
    const prisma = createPrisma(null);
    prisma.v1TeamMembership.findMany.mockResolvedValue([{ id: 'membership-1', teamId: 'team-1' }]);
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([{ id: 'player-1' }]);
    prisma.v1TournamentPlayer.updateMany.mockResolvedValue({ count: 1 });

    const order: string[] = [];
    prisma.v1TeamMembership.update.mockImplementation(async () => {
      order.push('membership-off');
      return {};
    });
    prisma.v1TournamentPlayer.updateMany.mockImplementation(async () => {
      order.push('roster-cleanup');
      return { count: 1 };
    });

    const service = new ProfileService(prisma as unknown as PrismaService);
    await service.withdrawalRequest(user, { reason: 'leave' });

    expect(order).toEqual(['membership-off', 'roster-cleanup']);
  });

  it('fails closed with a stable error before mutating an active admin account', async () => {
    const prisma = createPrisma({ id: 'admin-record-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);
    const request = service.withdrawalRequest(user, { reason: 'leave' });

    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request).rejects.toMatchObject({
      response: { code: 'ADMIN_WITHDRAWAL_FORBIDDEN' },
    });
    expect(prisma.v1AdminUser.findUnique).toHaveBeenCalledWith({
      where: { userId: user.id },
      select: { status: true },
    });
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('allows a non-admin active user to request withdrawal after the locked-state check', async () => {
    const prisma = createPrisma(null);
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).resolves.toMatchObject({
      userId: user.id,
      accountStatus: 'withdrawal_pending',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { accountStatus: 'withdrawal_pending' },
    });
  });

  it('rejects when the transaction-time account status is no longer active', async () => {
    const prisma = createPrisma(null);
    prisma.v1User.findUnique.mockResolvedValue({ accountStatus: 'suspended' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'stale auth' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1AdminUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('진행 중인 매치가 있으면 409 WITHDRAWAL_BLOCKED_ACTIVE_MATCH — 트랜잭션 진입 전 차단, soft-delete된 매치는 제외 조회', async () => {
    const prisma = createPrisma(null);
    prisma.v1MatchParticipant.findFirst.mockResolvedValue({ id: 'participant-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'WITHDRAWAL_BLOCKED_ACTIVE_MATCH' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1MatchParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          match: expect.objectContaining({ deletedAt: null }),
        }),
      }),
    );
  });

  it('운영 중인 팀(owner/manager)이 있으면 409 WITHDRAWAL_BLOCKED_TEAM_AUTHORITY — 트랜잭션 진입 전 차단, soft-delete/비활성 팀은 제외 조회', async () => {
    const prisma = createPrisma(null);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'membership-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'WITHDRAWAL_BLOCKED_TEAM_AUTHORITY' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          team: { status: 'active', deletedAt: null },
        }),
      }),
    );
  });
});

describe('ProfileService logout — 웹 푸시 구독 정리', () => {
  // 로그아웃이 서버 쪽 V1PushSubscription row 를 지우지 않으면, 로그아웃한 계정 앞으로
  // 오는 알림(채팅 원문 포함)이 그 기기에 계속 도착하고, 같은 기기에 다음에 로그인한
  // 사용자는 서버 구독이 없는데도 브라우저 pushManager 구독이 남아 '켜짐'으로 보인다.
  function createPrisma() {
    return {
      v1PushSubscription: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  it('인증된 사용자로 로그아웃하면 그 사용자의 모든 웹 푸시 구독을 지운다', async () => {
    const prisma = createPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.logout(user)).resolves.toEqual({ ok: true });

    expect(prisma.v1PushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
  });

  it('세션이 이미 무효라 사용자를 식별할 수 없어도(OptionalV1AuthGuard 결과 undefined) 에러 없이 성공한다', async () => {
    const prisma = createPrisma();
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.logout(undefined)).resolves.toEqual({ ok: true });

    expect(prisma.v1PushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
