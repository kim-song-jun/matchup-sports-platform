import { ForbiddenException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reviewer@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const sourceId = '00000000-0000-4000-8000-000000000010';
const targetUserId = '00000000-0000-4000-8000-000000000002';
const submittedAt = new Date('2026-06-02T12:00:00.000Z');

const teamSourceId = '00000000-0000-4000-8000-000000000030';
const hostTeamId = '00000000-0000-4000-8000-000000000031';
const awayTeamId = '00000000-0000-4000-8000-000000000032';

// 팀 후기 권한 개방(2026-08-12) 회귀 테스트용 페르소나 — 전원 hostTeam 소속이고 역할만 다르다
const memberAId = '00000000-0000-4000-8000-000000000041';
const memberBId = '00000000-0000-4000-8000-000000000042';
const leaderId = '00000000-0000-4000-8000-000000000043';
const outsiderId = '00000000-0000-4000-8000-000000000044';

describe('ReviewsService', () => {
  it('tournamentId pending 필터는 해당 대회의 fixture 후기만 조회한다', async () => {
    const tournamentId = '00000000-0000-4000-8000-000000000099';
    const tournamentFixtureReviews = {
      pending: jest.fn().mockResolvedValue([
        {
          sourceType: 'tournament_fixture',
          sourceId,
          remainingCount: 2,
          completedAtSort: submittedAt.getTime(),
        },
      ]),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService({} as never, tournamentFixtureReviews as never, adminContextStub());

    await expect(service.list(user, { tab: 'pending', tournamentId, limit: 20 })).resolves.toEqual({
      items: [{ sourceType: 'tournament_fixture', sourceId, remainingCount: 2 }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
    expect(tournamentFixtureReviews.pending).toHaveBeenCalledWith(user, 20, tournamentId);
  });

  it('returns an idempotent duplicate response when personal review create hits the unique constraint', async () => {
    const existingReview = {
      id: 'review-1',
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUser: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } },
      targetTeam: null,
      reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
      reviewerTeam: null,
      rating: 5,
      tags: [{ tagCode: 'manner', labelSnapshot: '매너가 좋아요', createdAt: submittedAt }],
      status: 'submitted',
      submittedAt,
    };
    const prisma = {
      v1Match: {
        findUnique: jest.fn().mockResolvedValue({
          id: sourceId,
          title: '성수 풋살파크 개인 매치',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          participants: [
            { userId: user.id, user: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } } },
            { userId: targetUserId, user: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } } },
          ],
        }),
      },
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(existingReview),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: {
          create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        },
      })),
    };
    const tournamentFixtureReviews = {
      pending: jest.fn(),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    await expect(service.submit(user, {
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUserId,
      rating: 5,
      tagCodes: ['manner'],
    })).resolves.toMatchObject({
      alreadySubmitted: true,
      review: {
        reviewId: 'review-1',
        targetUser: { userId: targetUserId, name: '민준' },
        rating: 5,
      },
    });
    expect(prisma.v1PostEventReview.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { reviewerUserId: user.id, sourceType: 'match', sourceId, targetUserId },
    }));
  });

  it('submitPersonalReview: 리뷰 생성 시 매치의 sportId를 스냅샷으로 저장한다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      id: 'review-2',
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUser: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } },
      targetTeam: null,
      reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
      reviewerTeam: null,
      rating: 5,
      sportId: 'sport-futsal',
      tags: [],
      status: 'submitted',
      submittedAt,
    });
    const prisma = {
      v1Match: {
        findUnique: jest.fn().mockResolvedValue({
          id: sourceId,
          title: '성수 풋살파크 개인 매치',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          sportId: 'sport-futsal',
          participants: [
            { userId: user.id, user: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } } },
            { userId: targetUserId, user: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } } },
          ],
        }),
      },
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: {
          create: createMock,
          findMany: jest.fn().mockResolvedValue([]),
        },
        v1UserReputationSummary: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      })),
    };
    const tournamentFixtureReviews = {
      pending: jest.fn(),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    await service.submit(user, {
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUserId,
      rating: 5,
      tagCodes: ['manner'],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sportId: 'sport-futsal' }) }),
    );
  });

  it('submitTeamReview: 리뷰 생성 시 팀 매치의 sportId를 스냅샷으로 저장한다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      id: 'review-3',
      sourceType: 'team_match',
      sourceId: teamSourceId,
      targetType: 'team',
      targetUser: null,
      targetTeam: { id: awayTeamId, name: '원정팀', profile: { logoUrl: null } },
      reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
      reviewerTeam: { id: hostTeamId, name: '홈팀', profile: { logoUrl: null } },
      rating: 5,
      sportId: 'sport-futsal',
      tags: [],
      status: 'submitted',
      submittedAt,
    });
    const prisma = {
      v1TeamMatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: teamSourceId,
          title: '성수 풋살파크 팀 매치',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          sportId: 'sport-futsal',
          hostTeamId,
          approvedApplicantTeamId: awayTeamId,
          hostTeam: { id: hostTeamId, name: '홈팀', profile: { logoUrl: null } },
          approvedApplicantTeam: { id: awayTeamId, name: '원정팀', profile: { logoUrl: null } },
        }),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: hostTeamId, role: 'manager', team: { name: '홈팀' } },
        ]),
      },
      v1PostEventReview: {
        // 겸직(양 팀 멤버) 지원 이후 teamMatchSource 는 대상별 기존 후기를 한 번에 조회한다.
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // 라인업이 없는 팀 매치 — 이 케이스는 팀 후기의 sportId 스냅샷만 본다.
      v1Game: { findUnique: jest.fn().mockResolvedValue(null) },
      v1GameParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      v1User: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: {
          create: createMock,
          findMany: jest.fn().mockResolvedValue([]),
        },
        v1TeamMatch: {
          count: jest.fn().mockResolvedValue(1),
        },
        v1TeamTrustScore: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      })),
    };
    const tournamentFixtureReviews = {
      pending: jest.fn(),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    await service.submit(user, {
      sourceType: 'team_match',
      sourceId: teamSourceId,
      targetType: 'team',
      targetTeamId: awayTeamId,
      rating: 5,
      tagCodes: ['manner'],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sportId: 'sport-futsal',
          sourceType: 'team_match',
          reviewerTeamId: hostTeamId,
          targetTeamId: awayTeamId,
        }),
      }),
    );
  });

  describe('대회 개인 후기(tournament_fixture · targetType=user) 수용', () => {
    const tournamentFixtureId = '00000000-0000-4000-8000-000000000050';

    function stubTournamentService() {
      return {
        pending: jest.fn(),
        source: jest.fn(),
        sourceSummaries: jest.fn(),
        submit: jest.fn().mockResolvedValue({ review: null, alreadySubmitted: false }),
      };
    }

    it('개인 대상 후기를 400으로 막지 않고 대상 정보를 그대로 대회 서비스에 넘긴다', async () => {
      const tournamentFixtureReviews = stubTournamentService();
      const service = new ReviewsService({} as never, tournamentFixtureReviews as never, adminContextStub());

      await service.submit(user, {
        sourceType: 'tournament_fixture',
        sourceId: tournamentFixtureId,
        targetType: 'user',
        targetUserId,
        rating: 5,
        tagCodes: ['manner'],
      });

      // targetType/targetUserId가 떨어지면 대회 서비스가 팀 후기로 오인해 엉뚱한 행을 만든다.
      expect(tournamentFixtureReviews.submit).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ sourceId: tournamentFixtureId, targetType: 'user', targetUserId }),
        ['manner'],
      );
    });

    it('대상 두 종류를 함께 보내면 400으로 막는다', async () => {
      const tournamentFixtureReviews = stubTournamentService();
      const service = new ReviewsService({} as never, tournamentFixtureReviews as never, adminContextStub());

      await expect(service.submit(user, {
        sourceType: 'tournament_fixture',
        sourceId: tournamentFixtureId,
        targetType: 'user',
        targetUserId,
        targetTeamId: hostTeamId,
        rating: 5,
        tagCodes: ['manner'],
      })).rejects.toMatchObject({ response: { code: 'INVALID_TOURNAMENT_FIXTURE_REVIEW_TARGET' } });
      expect(tournamentFixtureReviews.submit).not.toHaveBeenCalled();
    });

    // 팀 매치도 라인업(V1GameParticipant.userId)을 근거로 개인 대상 후기를 받는다.
    // 단 shape는 여전히 배타적이어야 한다 — targetUserId와 targetTeamId를 함께 보내면 거부.
    it('팀 매치 개인 후기는 targetUserId 단독일 때만 받는다', async () => {
      const service = new ReviewsService({} as never, stubTournamentService() as never, adminContextStub());

      await expect(service.submit(user, {
        sourceType: 'team_match',
        sourceId: teamSourceId,
        targetType: 'user',
        targetUserId,
        targetTeamId: hostTeamId,
        rating: 5,
        tagCodes: ['manner'],
      })).rejects.toMatchObject({ response: { code: 'INVALID_TEAM_MATCH_REVIEW_TARGET' } });
    });
  });

  describe('recalculateUserReputation', () => {
    // 개인 매치와 팀매치는 둘 다 "함께 뛴 상대의 평가"라 같이 센다. 대회 개인 후기만 제외 —
    // 한 대회에서 상대 로스터 전원에게 수십 건이 들어와 평균을 통째로 덮으므로 tournament_*
    // 컬럼에 따로 쌓는다. mock은 where와 무관하게 고정값을 주므로 인자 단언으로만 잡을 수 있다.
    it('개인 매치와 팀매치 후기를 mannerScore 집계에 넣고, 대회 후기는 제외한다', async () => {
      const findManyMock = jest.fn().mockResolvedValue([]);
      const prisma = {
        v1PostEventReview: { findMany: findManyMock },
        v1UserReputationSummary: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const tournamentFixtureReviews = { pending: jest.fn(), source: jest.fn(), submit: jest.fn(), sourceSummaries: jest.fn() };
      const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

      await service['recalculateUserReputation'](prisma as never, 'x');

      const where = findManyMock.mock.calls[0][0].where as { sourceType: { in: string[] } };
      expect(where).toMatchObject({ targetUserId: 'x', targetType: 'user' });
      expect(where.sourceType.in).toEqual(expect.arrayContaining(['match', 'team_match']));
      expect(where.sourceType.in).not.toContain('tournament_fixture');
    });

    it('공개되지 않은(상대 미제출+72시간 미경과) 리뷰는 mannerScore 집계에서 제외한다', async () => {
      const now = new Date('2026-07-19T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const findManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            { sourceId: 'm1', reviewerUserId: 'a', targetUserId: 'x', rating: 5, submittedAt: new Date('2026-07-18T00:00:00Z') }, // 상대 미제출, 24시간 경과 — 비공개
            { sourceId: 'm2', reviewerUserId: 'b', targetUserId: 'x', rating: 1, submittedAt: new Date('2026-07-19T00:00:00Z') }, // 상대 제출됨 — 공개
          ])
          .mockResolvedValueOnce([{ sourceId: 'm2', reviewerUserId: 'x', targetUserId: 'b' }]);
        const upsertMock = jest.fn().mockResolvedValue({});
        const prisma = {
          v1PostEventReview: { findMany: findManyMock },
          v1UserReputationSummary: { upsert: upsertMock },
        };
        const tournamentFixtureReviews = { pending: jest.fn(), source: jest.fn(), submit: jest.fn(), sourceSummaries: jest.fn() };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

        await service['recalculateUserReputation'](prisma as never, 'x');

        expect(upsertMock).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({ reviewCount: 1, mannerScore: expect.objectContaining({}) }),
          }),
        );
        const upsertCall = upsertMock.mock.calls[0][0];
        // Prisma.Decimal#toString()은 후행 0을 제거하므로(예: "1") toFixed(2)로 정밀도를 검증한다
        expect(upsertCall.update.mannerScore.toFixed(2)).toBe('1.00'); // m2 리뷰(1점)만 반영
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('recalculateTeamTrust', () => {
    it('sourceType=team_match 리뷰만 팀신뢰점수 집계에 반영한다(대회후기는 별도 경로에서 집계)', async () => {
      const now = new Date('2026-07-19T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const findManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            { sourceId: 'tm1', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 5, submittedAt: new Date('2026-07-19T00:00:00Z') },
          ])
          .mockResolvedValueOnce([{ sourceId: 'tm1', reviewerTeamId: 'team-x', targetTeamId: 'team-a' }]);
        const upsertMock = jest.fn().mockResolvedValue({});
        const prisma = {
          v1PostEventReview: { findMany: findManyMock },
          v1TeamMatch: { count: jest.fn().mockResolvedValue(1) },
          v1TeamTrustScore: { upsert: upsertMock },
        };
        const tournamentFixtureReviews = { pending: jest.fn(), source: jest.fn(), submit: jest.fn(), sourceSummaries: jest.fn() };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

        await service['recalculateTeamTrust'](prisma as never, 'team-x');

        expect(findManyMock).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            where: expect.objectContaining({
              targetTeamId: 'team-x',
              targetType: 'team',
              status: 'submitted',
              sourceType: 'team_match',
            }),
          }),
        );
        // reverse-lookup은 candidates.reviewerTeamId(상대팀)가 아니라 targetTeamId(자기 자신, 'team-x')로 조회해야 한다.
        // 이 assertion이 없으면 reviewerTeamId를 잘못 사용하는 회귀(regression)를 잡지 못한다(두 번째 findMany mock이
        // where 인자와 무관하게 고정값을 반환하므로).
        expect(findManyMock).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            where: expect.objectContaining({
              reviewerTeamId: { in: ['team-x'] },
            }),
          }),
        );
        const upsertCall = upsertMock.mock.calls[0][0];
        expect(upsertCall.update.mannerScore.toFixed(2)).toBe('5.00');
        expect(upsertCall.update.trustState).toBe('estimated');
      } finally {
        jest.useRealTimers();
      }
    });

    it('공개되지 않은(상대 미제출+72시간 미경과) team_match 리뷰는 팀신뢰점수 집계에서 제외한다', async () => {
      const now = new Date('2026-07-19T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const findManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            { sourceId: 'tm1', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 5, submittedAt: new Date('2026-07-18T00:00:00Z') }, // 상대(team-x) 미제출, 24시간 경과 — 비공개
            { sourceId: 'tm2', reviewerTeamId: 'team-b', targetTeamId: 'team-x', rating: 1, submittedAt: new Date('2026-07-19T00:00:00Z') }, // 상대(team-x) 제출됨 — 공개
          ])
          .mockResolvedValueOnce([{ sourceId: 'tm2', reviewerTeamId: 'team-x', targetTeamId: 'team-b' }]);
        const upsertMock = jest.fn().mockResolvedValue({});
        const prisma = {
          v1PostEventReview: { findMany: findManyMock },
          v1TeamMatch: { count: jest.fn().mockResolvedValue(2) },
          v1TeamTrustScore: { upsert: upsertMock },
        };
        const tournamentFixtureReviews = { pending: jest.fn(), source: jest.fn(), submit: jest.fn(), sourceSummaries: jest.fn() };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

        await service['recalculateTeamTrust'](prisma as never, 'team-x');

        expect(findManyMock).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            where: expect.objectContaining({
              reviewerTeamId: { in: ['team-x'] },
            }),
          }),
        );
        const upsertCall = upsertMock.mock.calls[0][0];
        // tm1(상대 미제출·72시간 미경과)은 제외되고 tm2(1점)만 반영되어야 한다
        expect(upsertCall.update.mannerScore.toFixed(2)).toBe('1.00');
        expect(upsertCall.update.trustState).toBe('estimated');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('received', () => {
    const tournamentReceivedReview = (submittedAtValue: Date) => ({
      id: 'review-tournament-received',
      sourceType: 'tournament_fixture',
      sourceId: 'fixture-1',
      sourceGroupId: 'tournament-1',
      targetType: 'user',
      targetUserId: user.id,
      targetTeamId: null,
      targetUser: { id: user.id, profile: { nickname: '받은 선수', profileImageUrl: null } },
      targetTeam: null,
      reviewerUserId: targetUserId,
      reviewerTeamId: awayTeamId,
      reviewerUser: { id: targetUserId, profile: { nickname: '보낸 선수', profileImageUrl: '/secret.png' } },
      reviewerTeam: { id: awayTeamId, name: '상대 팀', profile: { logoUrl: '/secret-team.png' } },
      sportId: 'sport-futsal',
      rating: 5,
      tags: [{ tagCode: 'manner', labelSnapshot: '매너가 좋아요', createdAt: submittedAtValue }],
      status: 'submitted',
      submittedAt: submittedAtValue,
    });

    it('상호 제출된 대회 개인 리뷰를 즉시 익명으로 반환한다', async () => {
      const now = new Date('2026-08-14T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      try {
        const candidate = tournamentReceivedReview(new Date('2026-08-14T11:00:00.000Z'));
        const findMany = jest.fn()
          .mockResolvedValueOnce([candidate])
          .mockResolvedValueOnce([{
            sourceType: 'tournament_fixture',
            sourceId: 'fixture-2',
            sourceGroupId: 'tournament-1',
            reviewerUserId: user.id,
            targetUserId,
          }]);
        const prisma = {
          v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
          v1PostEventReview: { findMany },
        };
        const service = new ReviewsService(prisma as never, {} as never, adminContextStub());

        const result = await service.received(user, { limit: 20 });

        expect(result.items).toEqual([
          expect.objectContaining({
            reviewId: candidate.id,
            anonymous: true,
            reviewerUser: null,
            reviewerTeam: null,
            submittedAt: null,
            rating: 5,
          }),
        ]);
      } finally {
        jest.useRealTimers();
      }
    });

    // 팀매치 후기는 "받은 후기" 목록 필터에서 빠져 있었다 — 쓸 수는 있는데 받은 사람은
    // 내용을 영영 못 보고 매너 점수 집계로만 반영됐다. 같은 성격의 대회 경기 후기는 익명으로
    // 보이던 것과 어긋난다. 아래 두 케이스가 노출과 reveal 짝 판정을 함께 고정한다.
    const teamMatchReceivedReview = (submittedAtValue: Date) => ({
      ...tournamentReceivedReview(submittedAtValue),
      id: 'review-team-match-received',
      sourceType: 'team_match',
      sourceId: 'team-match-1',
      sourceGroupId: null,
    });

    it('상호 제출된 팀매치 개인 리뷰도 즉시 익명으로 반환한다', async () => {
      const now = new Date('2026-08-14T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      try {
        const candidate = teamMatchReceivedReview(new Date('2026-08-14T11:00:00.000Z'));
        const findMany = jest.fn()
          .mockResolvedValueOnce([candidate])
          // 같은 팀매치에서 내가 상대를 평가한 행 — 짝이 성립해 72시간을 기다리지 않는다.
          .mockResolvedValueOnce([{
            sourceType: 'team_match',
            sourceId: 'team-match-1',
            sourceGroupId: null,
            reviewerUserId: user.id,
            targetUserId,
          }]);
        const prisma = {
          v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
          v1PostEventReview: { findMany },
        };
        const service = new ReviewsService(prisma as never, {} as never, adminContextStub());

        const result = await service.received(user, { limit: 20 });

        expect(result.items).toEqual([
          expect.objectContaining({ reviewId: candidate.id, anonymous: true, reviewerUser: null, rating: 5 }),
        ]);
        // mock 은 where 를 무시하고 값을 돌려주므로, 조회 조건 자체를 단언하지 않으면 필터를
        // 되돌려도 이 테스트가 통과한다(가짜 통과). team_match 가 조회 대상에서 빠지는 순간
        // 받은 사람은 다시 내용을 못 보게 되므로 그 지점을 직접 고정한다.
        const where = (findMany.mock.calls[0][0] as { where: { OR: Array<{ sourceType?: { in: string[] } }> } }).where;
        const sourceTypeFilter = where.OR.find((clause) => clause.sourceType)?.sourceType?.in ?? [];
        expect(sourceTypeFilter).toEqual(expect.arrayContaining(['team_match', 'tournament_fixture', 'match']));
      } finally {
        jest.useRealTimers();
      }
    });

    it('상대가 아직 안 쓴 팀매치 리뷰는 72시간 전까지 숨긴다', async () => {
      const now = new Date('2026-08-14T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      try {
        const prisma = {
          v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
          v1PostEventReview: {
            findMany: jest.fn()
              .mockResolvedValueOnce([teamMatchReceivedReview(new Date('2026-08-14T11:00:00.000Z'))])
              .mockResolvedValueOnce([]),
          },
        };
        const service = new ReviewsService(prisma as never, {} as never, adminContextStub());

        await expect(service.received(user, { limit: 20 })).resolves.toEqual({
          items: [],
          pageInfo: { nextCursor: null, hasNext: false },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('상대가 제출하지 않았고 72시간 전인 대회 리뷰는 받은 목록에서 숨긴다', async () => {
      const now = new Date('2026-08-14T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      try {
        const prisma = {
          v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
          v1PostEventReview: {
            findMany: jest.fn()
              .mockResolvedValueOnce([tournamentReceivedReview(new Date('2026-08-14T11:00:00.000Z'))])
              .mockResolvedValueOnce([]),
          },
        };
        const service = new ReviewsService(prisma as never, {} as never, adminContextStub());

        await expect(service.received(user, { limit: 20 })).resolves.toEqual({
          items: [],
          pageInfo: { nextCursor: null, hasNext: false },
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('receivedSummary', () => {
    it('sportId가 없는(레거시) 리뷰는 집계에서 제외하고, 공개되지 않은 리뷰도 제외한다', async () => {
      const now = new Date('2026-08-01T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const findManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            // 대상 x가 받은 리뷰들
            { id: 'r1', sourceId: 'm1', reviewerUserId: 'a', targetUserId: 'x', rating: 5, sportId: 'futsal', submittedAt: new Date('2026-07-30T00:00:00Z'), tags: [{ tagCode: 'manner', labelSnapshot: '매너가 좋아요' }] },
            { id: 'r2', sourceId: 'm2', reviewerUserId: 'b', targetUserId: 'x', rating: 3, sportId: null, submittedAt: new Date('2026-07-01T00:00:00Z'), tags: [] }, // 레거시(sportId null) — 집계 제외
            { id: 'r3', sourceId: 'm3', reviewerUserId: 'c', targetUserId: 'x', rating: 4, sportId: 'futsal', submittedAt: new Date('2026-07-31T23:00:00Z'), tags: [] }, // 71시간 미만, 상대도 미제출 — 비공개
          ])
          .mockResolvedValueOnce([
            // x가 쓴 리뷰들(reverse pair 확인용) — r1의 짝(a→x)에 대응하는 x→a가 존재해야 즉시 공개
            { sourceId: 'm1', reviewerUserId: 'x', targetUserId: 'a' },
          ]);

        const prisma = {
          v1PostEventReview: {
            findMany: findManyMock,
          },
        };
        const tournamentFixtureReviews = {
          pending: jest.fn(),
          source: jest.fn(),
          submit: jest.fn(),
          sourceSummaries: jest.fn(),
        };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

        const result = await service.receivedSummary(
          { id: 'x', email: 'x@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed' },
          { targetType: 'user' },
        );

        expect(result.bySport).toEqual([
          { sportId: 'futsal', ratingAvg: 5, ratingCount: 1, tagRates: [{ tagCode: 'manner', label: '매너가 좋아요', rate: 1, count: 1 }] },
        ]);
        expect(findManyMock).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('team 타깃: 상대 팀이 이미 반대 방향 리뷰를 제출했으면 72시간 이내여도 즉시 공개한다', async () => {
      const submittedAt = new Date('2026-08-01T00:00:00Z');
      const now = new Date('2026-08-01T01:00:00Z'); // 72시간 미경과
      jest.useFakeTimers().setSystemTime(now);

      try {
        const reviewFindManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            // team-a(개인 user-p가 제출)가 team-x로부터 받은 리뷰
            { sourceId: 'tm1', reviewerUserId: 'user-p', reviewerTeamId: 'team-a', targetUserId: null, targetTeamId: 'team-x', rating: 5, sportId: 'futsal', submittedAt, tags: [] },
          ])
          .mockResolvedValueOnce([
            // team-x가 team-a에게 이미 제출한 반대 방향 리뷰(reverseTeamReviews select 형태)
            { sourceId: 'tm1', reviewerTeamId: 'team-x', targetTeamId: 'team-a' },
          ]);

        const prisma = {
          v1PostEventReview: { findMany: reviewFindManyMock },
          v1TeamMembership: {
            findMany: jest.fn().mockResolvedValue([{ teamId: 'team-a' }]),
          },
        };
        const tournamentFixtureReviews = {
          pending: jest.fn(),
          source: jest.fn(),
          submit: jest.fn(),
          sourceSummaries: jest.fn(),
        };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

        const result = await service.receivedSummary(
          { id: 'user-p', email: 'user-p@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed' },
          { targetType: 'team' },
        );

        expect(result.bySport).toEqual([
          { sportId: 'futsal', ratingAvg: 5, ratingCount: 1, tagRates: [] },
        ]);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // 상대 "팀" 후기는 팀장·운영진(owner/manager)만 쓴다 — 대회 경기 경로와 같은 규칙이다.
  //
  // 이력: 773f211f(2026-08-13)가 팀 후기를 "참가팀 active 멤버 전원"으로 열었으나, 바로 다음 날
  // 279adcc8(2026-08-14) "대회 경기 리뷰를 역할별로 노출"이 대회 경로를 역할별로 다시 갈랐다 —
  // owner/manager는 상대팀과 상대 선수를, member는 상대 선수만 평가한다(시나리오 V1-14-008).
  // team_match만 그 갱신에서 빠져 8/13 상태로 남아 있었다. 여기서 되돌리는 게 아니라 뒤처진
  // 경로를 현행 규칙에 맞추는 것이다.
  //
  // 8/13이 풀려던 문제(팀장이 안 쓰면 그 경기가 통째로 평가 공백)는 그대로 유효하고, 이제는
  // 팀원이 상대 "선수" 후기를 쓰는 것으로 메워진다(아래 describe).
  // 중복 방지 단위가 팀이 아니라 사람이라는 점은 그대로다.
  describe('팀 후기 작성 권한 — 팀장·운영진', () => {
    it('일반 멤버(role=member)는 상대팀 후기를 쓸 수 없다', async () => {
      const { prisma, createMock } = teamMatchWorld([{ userId: memberAId, teamId: hostTeamId, role: 'member' }]);
      const service = makeService(prisma);

      const error = await service.submit(authUser(memberAId), teamReviewDto(5)).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        code: 'TEAM_REVIEW_ROLE_REQUIRED',
        message: '상대팀 후기는 팀장·운영진만 작성할 수 있어요.',
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('운영진(role=manager)은 상대팀 후기를 제출할 수 있다', async () => {
      const { prisma, createMock } = teamMatchWorld([{ userId: memberAId, teamId: hostTeamId, role: 'manager' }]);
      const service = makeService(prisma);

      const result = await service.submit(authUser(memberAId), teamReviewDto(5));

      expect(result.alreadySubmitted).toBe(false);
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          reviewerUserId: memberAId,
          reviewerTeamId: hostTeamId,
          targetTeamId: awayTeamId,
          sourceType: 'team_match',
        }),
      }));
    });

    it('같은 팀의 팀장·운영진이 각각 제출하면 두 건 모두 저장된다', async () => {
      const { prisma, createMock, reviewRows } = teamMatchWorld([
        { userId: memberAId, teamId: hostTeamId, role: 'owner' },
        { userId: memberBId, teamId: hostTeamId, role: 'manager' },
      ]);
      const service = makeService(prisma);

      const first = await service.submit(authUser(memberAId), teamReviewDto(5));
      // 중복 판정이 팀 기준이면 여기서 A의 후기가 "내 후기"로 잡혀 alreadySubmitted=true가 된다.
      const second = await service.submit(authUser(memberBId), teamReviewDto(1));

      expect(first.alreadySubmitted).toBe(false);
      expect(second.alreadySubmitted).toBe(false);
      expect(createMock).toHaveBeenCalledTimes(2);
      expect(reviewRows.map((row) => row.reviewerUserId)).toEqual([memberAId, memberBId]);
      expect(first.review.reviewId).not.toBe(second.review.reviewId);
    });

    it('같은 사람이 같은 상대팀에 다시 제출하면 기존 후기를 alreadySubmitted로 돌려준다', async () => {
      const { prisma, createMock } = teamMatchWorld([{ userId: memberAId, teamId: hostTeamId, role: 'owner' }]);
      const service = makeService(prisma);

      const first = await service.submit(authUser(memberAId), teamReviewDto(5));
      const second = await service.submit(authUser(memberAId), teamReviewDto(1));

      expect(second.alreadySubmitted).toBe(true);
      expect(second.review.reviewId).toBe(first.review.reviewId);
      expect(second.review.rating).toBe(5); // 재제출 값(1점)이 덮어쓰지 않는다
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('참가팀 소속이 아니면 NOT_TEAM_MEMBER로 거부한다', async () => {
      const { prisma, createMock } = teamMatchWorld([{ userId: memberAId, teamId: hostTeamId, role: 'member' }]);
      const service = makeService(prisma);

      const error = await service.submit(authUser(outsiderId), teamReviewDto(5)).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        code: 'NOT_TEAM_MEMBER',
        message: '참가팀 소속만 후기를 쓸 수 있어요.',
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('팀장이 이미 쓴 경기가 다른 운영진의 pending 목록에는 그대로 남는다', async () => {
      const { prisma } = teamMatchWorld(
        [
          { userId: leaderId, teamId: hostTeamId, role: 'owner' },
          { userId: memberAId, teamId: hostTeamId, role: 'manager' },
        ],
        // 팀장이 이미 제출한 후기 1건
        [{
          id: 'review-leader',
          reviewerUserId: leaderId,
          reviewerTeamId: hostTeamId,
          sourceType: 'team_match',
          sourceId: teamSourceId,
          targetType: 'team',
          targetTeamId: awayTeamId,
          targetUserId: null,
          rating: 5,
          status: 'submitted',
          submittedAt,
        }],
      );
      const service = makeService(prisma);

      const leaderPending = await service['pendingTeamReviews'](authUser(leaderId), 20);
      const managerPending = await service['pendingTeamReviews'](authUser(memberAId), 20);

      // 팀장 본인은 이미 썼으므로 목록에서 빠진다(= mock이 무조건 빈 목록을 주는 게 아님을 함께 보장)
      expect(leaderPending).toEqual([]);
      expect(managerPending).toHaveLength(1);
      expect(managerPending[0]).toMatchObject({
        sourceId: teamSourceId,
        state: 'ready',
        reviewedCount: 0,
        remainingCount: 1,
        targetTeam: { teamId: awayTeamId },
      });
    });

    // 팀 후기를 팀장·운영진으로 좁힌 뒤 남는 위험: 일반 팀원의 pending 목록에 "1건 남음"이 계속
    // 뜨는데 작성 화면엔 쓸 대상이 하나도 없는 상태. 목록의 카운트도 역할을 반영해야 한다.
    it('라인업이 없는 팀 매치는 일반 팀원의 pending 목록에서 빠진다', async () => {
      const { prisma } = teamMatchWorld([{ userId: memberAId, teamId: hostTeamId, role: 'member' }]);
      const service = makeService(prisma);

      await expect(service['pendingTeamReviews'](authUser(memberAId), 20)).resolves.toEqual([]);
    });
  });

  // 일반 팀원이 팀 매치에서 쓰는 후기는 "상대했던 선수"다. 근거는 그 경기 라인업에 실린
  // 연동 팀원(V1GameParticipant.userId)뿐이며, 게스트·미제출 라인업은 대상이 되지 않는다.
  describe('팀 매치 상대 선수 후기 — 역할 무관', () => {
    const opponentA = 'away-player-a';
    const opponentB = 'away-player-b';

    it('일반 멤버도 상대팀 라인업의 선수를 대상으로 받는다 (팀 대상은 빠진다)', async () => {
      const { prisma } = teamMatchWorld(
        [{ userId: memberAId, teamId: hostTeamId, role: 'member' }],
        [],
        [opponentA, opponentB],
      );
      const service = makeService(prisma);

      const source = await service.source(authUser(memberAId), { sourceType: 'team_match', sourceId: teamSourceId });

      expect(source.targets.map((target) => target.targetType)).toEqual(['user', 'user']);
      expect(source.targets.map((target) => target.targetUserId)).toEqual([opponentA, opponentB]);
    });

    it('팀장에게는 상대 팀과 상대 선수가 모두 대상으로 나온다', async () => {
      const { prisma } = teamMatchWorld(
        [{ userId: leaderId, teamId: hostTeamId, role: 'owner' }],
        [],
        [opponentA],
      );
      const service = makeService(prisma);

      const source = await service.source(authUser(leaderId), { sourceType: 'team_match', sourceId: teamSourceId });

      expect(source.targets.map((target) => target.targetType)).toEqual(['team', 'user']);
      expect(source.targets[0].targetTeamId).toBe(awayTeamId);
      expect(source.targets[1].targetUserId).toBe(opponentA);
    });

    it('일반 멤버가 상대 선수 후기를 제출하면 저장되고 개인 평판이 갱신된다', async () => {
      const { prisma, createMock, userReputationUpsert } = teamMatchWorld(
        [{ userId: memberAId, teamId: hostTeamId, role: 'member' }],
        [],
        [opponentA],
      );
      const service = makeService(prisma);

      const result = await service.submit(authUser(memberAId), {
        sourceType: 'team_match',
        sourceId: teamSourceId,
        targetType: 'user',
        targetUserId: opponentA,
        rating: 4,
        tagCodes: ['manner'],
      });

      expect(result.alreadySubmitted).toBe(false);
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          reviewerUserId: memberAId,
          reviewerTeamId: hostTeamId,
          sourceType: 'team_match',
          targetType: 'user',
          targetUserId: opponentA,
        }),
      }));
      expect(userReputationUpsert).toHaveBeenCalled();
    });

    it('라인업에 없는 사람은 대상이 아니다', async () => {
      const { prisma, createMock } = teamMatchWorld(
        [{ userId: memberAId, teamId: hostTeamId, role: 'member' }],
        [],
        [opponentA],
      );
      const service = makeService(prisma);

      const error = await service.submit(authUser(memberAId), {
        sourceType: 'team_match',
        sourceId: teamSourceId,
        targetType: 'user',
        targetUserId: 'never-played',
        rating: 4,
        tagCodes: ['manner'],
      }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'TARGET_NOT_REVIEWABLE' });
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('recalculateTeamTrust — 팀 평균 1표 환산', () => {
    it('A팀 3명(평균 2점) + B팀 1명(5점) → 3.5점, reviewCount는 팀 수(2)', async () => {
      const now = new Date('2026-07-19T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const revealed = new Date('2026-07-10T00:00:00Z'); // 72시간 경과 — 되평가 없이도 공개
        const update = await runTeamTrust(
          [
            // reviewerUserId는 집계 select에 없지만, 세 건이 "서로 다른 사람"임을 문서화하기 위해 남긴다
            { sourceId: 'tm1', reviewerUserId: 'a1', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 1, submittedAt: revealed },
            { sourceId: 'tm1', reviewerUserId: 'a2', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 2, submittedAt: revealed },
            { sourceId: 'tm1', reviewerUserId: 'a3', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 3, submittedAt: revealed },
            { sourceId: 'tm2', reviewerUserId: 'b1', reviewerTeamId: 'team-b', targetTeamId: 'team-x', rating: 5, submittedAt: revealed },
          ],
          [],
        );

        // 원시 평균이면 (1+2+3+5)/4 = 2.75가 나온다 — 두 방식이 이 숫자로 구분된다
        expect(update.mannerScore?.toFixed(2)).toBe('3.50');
        // 원시 건수(4건)로 세면 verified가 되지만, 팀 수(2)로 세므로 estimated에 머문다
        expect(update.trustState).toBe('estimated');
      } finally {
        jest.useRealTimers();
      }
    });

    it('상대팀에서 한 명만 되평가해도 그 경기의 팀 후기 전체가 공개된다(reveal은 팀 단위)', async () => {
      const now = new Date('2026-07-19T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const oneHourAgo = new Date('2026-07-18T23:00:00Z'); // 72시간 폴백 미경과
        const update = await runTeamTrust(
          [
            { sourceId: 'tm1', reviewerUserId: 'a1', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 4, submittedAt: oneHourAgo },
            { sourceId: 'tm1', reviewerUserId: 'a2', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 2, submittedAt: oneHourAgo },
          ],
          // team-x 쪽에서 단 한 명이 team-a를 평가한 행. 사람 단위로 판정하면 a1·a2 각자를 평가한
          // 사람이 있어야 열리는 셈이 되어 둘 다 비공개(none/null)가 된다.
          [{ sourceId: 'tm1', reviewerTeamId: 'team-x', targetTeamId: 'team-a' }],
        );

        expect(update.mannerScore?.toFixed(2)).toBe('3.00'); // (4+2)/2, 한 팀이므로 1표
        expect(update.trustState).toBe('estimated');
      } finally {
        jest.useRealTimers();
      }
    });

    it('같은 팀 안에서 제출 시각이 갈려도 팀 기여분이 통째로 공개된다(부분 공개 금지)', async () => {
      const now = new Date('2026-07-19T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const update = await runTeamTrust(
          [
            { sourceId: 'tm1', reviewerUserId: 'a1', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 5, submittedAt: new Date('2026-07-15T16:00:00Z') }, // 80시간 전
            { sourceId: 'tm1', reviewerUserId: 'a2', reviewerTeamId: 'team-a', targetTeamId: 'team-x', rating: 1, submittedAt: new Date('2026-07-18T23:00:00Z') }, // 1시간 전
          ],
          [],
        );

        // 행 단위로 72시간을 재면 5점만 공개돼 5.00이 된다 — 그룹 최초 제출 시각 기준이면 3.00
        expect(update.mannerScore?.toFixed(2)).toBe('3.00');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});


/**
 * 숨김/복구 경로만 AdminContextService 를 쓴다. 나머지 케이스는 이 스텁을 건드리지 않으므로
 * 호출되면 그 자체가 회귀 신호가 되도록 명시적으로 실패시킨다.
 */
function adminContextStub() {
  return {
    getMutationAdmin: jest.fn(async () => { throw new Error('adminContext 를 기대하지 않은 경로에서 호출했다'); }),
    logAdminAction: jest.fn(),
  } as never;
}

// 경기 후기에는 숨김 경로가 아예 없었다 — 스키마의 V1PostEventReviewStatus 에 hidden 이
// 있는데도 그 값을 쓰는 코드가 0건이라, 악의적 후기를 어드민조차 내릴 수 없었다.
describe('ReviewsService — 어드민 후기 숨김', () => {
  const adminRecord = { id: 'admin-1', role: 'ops' };

  function makeWorld(reviewRow: FakeRow | null) {
    const update = jest.fn().mockResolvedValue({});
    const upsert = jest.fn().mockResolvedValue({});
    const logAdminAction = jest.fn();
    const prisma = {
      v1PostEventReview: {
        findUnique: jest.fn().mockResolvedValue(reviewRow),
        findMany: jest.fn().mockResolvedValue([]),
        update,
      },
      v1UserReputationSummary: { upsert },
      v1TeamTrustScore: { upsert },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({
        v1PostEventReview: { update, findMany: jest.fn().mockResolvedValue([]) },
        v1UserReputationSummary: { upsert },
        v1TeamTrustScore: { upsert },
        v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
      })),
    };
    const adminContext = {
      getMutationAdmin: jest.fn().mockResolvedValue(adminRecord),
      logAdminAction,
    };
    const service = new ReviewsService(prisma as never, {} as never, adminContext as never);
    return { service, prisma, update, upsert, adminContext, logAdminAction };
  }

  const submittedReview = {
    id: 'review-1',
    status: 'submitted',
    sourceType: 'match',
    targetType: 'user',
    targetUserId: 'target-user',
    targetTeamId: null,
  };

  it('숨기면 status 를 hidden 으로 바꾸고 대상의 평판을 다시 계산한다', async () => {
    const { service, update, upsert, logAdminAction } = makeWorld(submittedReview);

    await expect(service.hideReview(user, 'review-1', { reason: '욕설' })).resolves.toEqual({ alreadyHidden: false });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'review-1' },
      data: expect.objectContaining({ status: 'hidden' }),
    }));
    // 집계는 status='submitted' 로 좁혀 읽지만 저장된 요약은 그대로 남는다 — 재계산이 빠지면
    // 숨긴 후기가 매너 점수에 계속 살아 있다.
    expect(upsert).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalled();
  });

  it('이미 숨겨진 후기는 멱등하게 alreadyHidden 을 돌려준다', async () => {
    const { service, update } = makeWorld({ ...submittedReview, status: 'hidden' });

    await expect(service.hideReview(user, 'review-1', {})).resolves.toEqual({ alreadyHidden: true });
    expect(update).not.toHaveBeenCalled();
  });

  it('없는 후기는 REVIEW_NOT_FOUND', async () => {
    const { service } = makeWorld(null);

    await expect(service.hideReview(user, 'ghost', {})).rejects.toMatchObject({
      response: { code: 'REVIEW_NOT_FOUND' },
    });
  });

  it('복구는 hidden 일 때만 — removed 는 종착 상태라 되살리지 않는다', async () => {
    const { service, update } = makeWorld({ ...submittedReview, status: 'removed' });

    await expect(service.unhideReview(user, 'review-1')).resolves.toEqual({ alreadyVisible: true });
    expect(update).not.toHaveBeenCalled();
  });

  it('숨김 복구는 status 를 submitted 로 되돌리고 재계산한다', async () => {
    const { service, update, upsert } = makeWorld({ ...submittedReview, status: 'hidden' });

    await expect(service.unhideReview(user, 'review-1')).resolves.toEqual({ alreadyVisible: false });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'submitted', hiddenAt: null }),
    }));
    expect(upsert).toHaveBeenCalled();
  });

  it('어드민이 아니면 숨길 수 없다 (getMutationAdmin 이 게이트)', async () => {
    const { service, adminContext, update } = makeWorld(submittedReview);
    adminContext.getMutationAdmin.mockRejectedValue(new Error('FORBIDDEN'));

    await expect(service.hideReview(user, 'review-1', {})).rejects.toThrow('FORBIDDEN');
    expect(update).not.toHaveBeenCalled();
  });
});

type FakeRow = Record<string, unknown>;

// where 절을 실제로 해석하는 최소 fake — mock이 인자를 무시하고 고정값을 돌려주면
// "팀 기준 → 사람 기준" 회귀를 잡을 수 없기 때문에 조회 조건을 직접 평가한다.
function matchesWhere(row: FakeRow, where: FakeRow): boolean {
  return Object.entries(where).every(([field, condition]) => {
    // 팀 대상/개인 대상 후기를 한 번에 읽는 쿼리가 쓰는 분기 — 하위 절 중 하나만 맞으면 된다.
    if (field === 'OR') {
      return (condition as FakeRow[]).some((clause) => matchesWhere(row, clause));
    }
    if (condition !== null && typeof condition === 'object') {
      if ('in' in (condition as object)) return ((condition as { in: unknown[] }).in).includes(row[field]);
      // { not: null } — 팀 신뢰점수 집계가 reviewerTeamId가 null인 행을 "이름 없는 한 팀"으로
      // 세지 않도록 쿼리 단계에서 거르는 데 쓴다.
      if ('not' in (condition as object)) return row[field] !== (condition as { not: unknown }).not;
      // 모델링하지 않은 연산자를 조용히 통과시키면 가짜 통과가 된다
      throw new Error(`fake prisma: unsupported filter ${field}=${JSON.stringify(condition)}`);
    }
    return row[field] === condition;
  });
}

function makeService(prisma: unknown) {
  const tournamentFixtureReviews = { pending: jest.fn(), source: jest.fn(), submit: jest.fn(), sourceSummaries: jest.fn() };
  return new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());
}

function authUser(id: string) {
  return { id, email: `${id}@teameet.v1`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
}

function teamReviewDto(rating: number) {
  return {
    sourceType: 'team_match' as const,
    sourceId: teamSourceId,
    targetType: 'team' as const,
    targetTeamId: awayTeamId,
    rating,
    tagCodes: ['manner'],
  };
}

/** hostTeam vs awayTeam 완료 팀매치 하나를 둘러싼 fake Prisma. 멤버십·후기는 실제 테이블처럼 필터링된다. */
function teamMatchWorld(
  memberships: Array<{ userId: string; teamId: string; role: string }>,
  seededReviews: FakeRow[] = [],
  /** 상대(원정)팀 라인업에 실린 연동 팀원 userId 목록. 비우면 라인업 없는 팀 매치. */
  awayRosterUserIds: string[] = [],
) {
  const membershipRows: FakeRow[] = memberships.map((membership) => ({
    ...membership,
    status: 'active',
    team: { name: membership.teamId === hostTeamId ? '홈팀' : '원정팀' },
  }));
  const reviewRows: FakeRow[] = [...seededReviews];
  const teamMatchRow = {
    id: teamSourceId,
    title: '성수 풋살파크 팀 매치',
    status: 'completed',
    completedAt: submittedAt,
    startAt: submittedAt,
    sportId: 'sport-futsal',
    hostTeamId,
    approvedApplicantTeamId: awayTeamId,
    hostTeam: { id: hostTeamId, name: '홈팀', profile: { logoUrl: null } },
    approvedApplicantTeam: { id: awayTeamId, name: '원정팀', profile: { logoUrl: null } },
  };

  // 원정팀 사이드에 연동 팀원이 실린 라인업 한 벌. 서비스는 gameId+sideId로 참가자를 모아
  // userId가 있는 행만 후기 대상으로 쓴다.
  const awaySideId = 'side-away';
  const gameRow = {
    id: 'game-1',
    teamMatchId: teamSourceId,
    sides: [
      { id: 'side-home', teamId: hostTeamId },
      { id: awaySideId, teamId: awayTeamId },
    ],
  };
  const gameParticipantRows = awayRosterUserIds.map((userId) => ({
    gameId: gameRow.id,
    sideId: awaySideId,
    userId,
    displayNameSnapshot: `선수-${userId}`,
  }));

  let sequence = 0;
  const createMock = jest.fn(async ({ data }: { data: FakeRow }) => {
    sequence += 1;
    const row: FakeRow = {
      id: `review-${sequence}`,
      reviewerUserId: data.reviewerUserId,
      reviewerTeamId: data.reviewerTeamId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      targetType: data.targetType,
      targetTeamId: data.targetTeamId ?? null,
      targetUserId: data.targetUserId ?? null,
      rating: data.rating,
      sportId: data.sportId,
      status: 'submitted',
      submittedAt,
      tags: [],
      targetUser: data.targetUserId
        ? { id: data.targetUserId, profile: { nickname: `선수-${String(data.targetUserId)}`, profileImageUrl: null } }
        : null,
      targetTeam: data.targetTeamId
        ? { id: data.targetTeamId, name: '원정팀', profile: { logoUrl: null } }
        : null,
      reviewerUser: { id: data.reviewerUserId, profile: { nickname: '작성자', profileImageUrl: null } },
      reviewerTeam: { id: data.reviewerTeamId, name: '홈팀', profile: { logoUrl: null } },
    };
    reviewRows.push(row);
    return row;
  });
  const reviewFindMany = jest.fn(async ({ where }: { where: FakeRow }) => reviewRows.filter((row) => matchesWhere(row, where)));
  const teamTrustUpsert = jest.fn().mockResolvedValue({});
  const userReputationUpsert = jest.fn().mockResolvedValue({});

  const prisma = {
    v1TeamMatch: {
      findUnique: jest.fn().mockResolvedValue(teamMatchRow),
      findMany: jest.fn().mockResolvedValue([teamMatchRow]),
    },
    v1TeamMembership: {
      findMany: jest.fn(async ({ where }: { where: FakeRow }) => membershipRows.filter((row) => matchesWhere(row, where))),
    },
    v1PostEventReview: {
      findFirst: jest.fn(async ({ where }: { where: FakeRow }) => reviewRows.find((row) => matchesWhere(row, where)) ?? null),
      findMany: reviewFindMany,
    },
    // awayRosterUserIds 가 비면 라인업 없는 팀 매치 — 상대 선수 대상 0명이라 팀 후기 경로만 남는다.
    v1Game: {
      findUnique: jest.fn().mockResolvedValue(awayRosterUserIds.length ? gameRow : null),
      findMany: jest.fn().mockResolvedValue(awayRosterUserIds.length ? [{ ...gameRow, teamMatchId: teamSourceId }] : []),
    },
    v1GameParticipant: { findMany: jest.fn().mockResolvedValue(gameParticipantRows) },
    v1User: {
      findMany: jest.fn().mockResolvedValue(
        awayRosterUserIds.map((userId) => ({
          id: userId,
          profile: { nickname: `선수-${userId}`, profileImageUrl: null },
        })),
      ),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      v1PostEventReview: { create: createMock, findMany: reviewFindMany },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(1) },
      v1TeamTrustScore: { upsert: teamTrustUpsert },
      // 선수 후기 경로는 팀 신뢰점수가 아니라 개인 평판을 갱신한다.
      v1UserReputationSummary: { upsert: userReputationUpsert },
    })),
  };

  return { prisma, createMock, reviewRows, teamTrustUpsert, userReputationUpsert };
}

async function runTeamTrust(candidates: FakeRow[], reverseReviews: FakeRow[]) {
  const upsert = jest.fn().mockResolvedValue({});
  const tx = {
    v1PostEventReview: {
      findMany: jest.fn().mockResolvedValueOnce(candidates).mockResolvedValueOnce(reverseReviews),
    },
    v1TeamMatch: { count: jest.fn().mockResolvedValue(1) },
    v1TeamTrustScore: { upsert },
  };
  await makeService({})['recalculateTeamTrust'](tx as never, 'team-x');
  return upsert.mock.calls[0][0].update as { mannerScore: { toFixed: (digits: number) => string } | null; trustState: string };
}

/**
 * 양 팀 모두의 active 멤버인 사용자(겸직) — 예전에는 AMBIGUOUS_REVIEWER_TEAM(409)으로
 * 어느 쪽 후기도 쓸 수 없었다. 이제 두 방향 모두 대상이 되고, 평가 대상 팀이 곧 작성자 팀을
 * 결정한다. 잡아야 하는 회귀: (a) 겸직자가 다시 409로 막히는 것,
 * (b) 두 방향 중 한쪽만 노출되는 것, (c) 작성자 팀이 뒤바뀌어 저장되는 것.
 */
describe('ReviewsService — 양 팀 겸직 후기', () => {
  // 두 방향이 모두 열리려면 양쪽에서 팀 후기 자격(owner/manager)이 있어야 한다.
  // 한쪽만 자격이 있는 경우는 아래 '역할은 방향별로 따로 판정된다'가 따로 고정한다.
  const bothTeamMemberships = [
    { teamId: hostTeamId, role: 'manager', team: { name: '홈팀' } },
    { teamId: awayTeamId, role: 'manager', team: { name: '원정팀' } },
  ];

  const createdRow = (reviewerTeamId: string, targetTeamId: string) => ({
    id: 'review-dual-1',
    sourceType: 'team_match',
    sourceId: teamSourceId,
    targetType: 'team',
    targetUser: null,
    targetTeam: { id: targetTeamId, name: '상대팀', profile: { logoUrl: null } },
    reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
    reviewerTeam: { id: reviewerTeamId, name: '내팀', profile: { logoUrl: null } },
    rating: 5,
    tags: [],
    status: 'submitted',
    submittedAt,
  });

  function makeDualPrisma(createMock = jest.fn()) {
    return {
      v1TeamMatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: teamSourceId,
          title: '홈팀 vs 원정팀',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          sportId: 'sport-futsal',
          hostTeamId,
          approvedApplicantTeamId: awayTeamId,
          hostTeam: { id: hostTeamId, name: '홈팀', profile: { logoUrl: null } },
          approvedApplicantTeam: { id: awayTeamId, name: '원정팀', profile: { logoUrl: null } },
        }),
      },
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue(bothTeamMemberships) },
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // 겸직 케이스는 팀 후기 방향만 검증한다 — 라인업 없음(선수 대상 0명).
      v1Game: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      v1GameParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      v1User: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: { create: createMock, findMany: jest.fn().mockResolvedValue([]) },
        v1TeamMatch: { count: jest.fn().mockResolvedValue(1) },
        v1TeamTrustScore: { upsert: jest.fn().mockResolvedValue({}) },
      })),
    };
  }

  const tournamentFixtureReviews = {
    pending: jest.fn(), source: jest.fn(), submit: jest.fn(), sourceSummaries: jest.fn(),
  };

  it('겸직자에게 두 방향이 모두 대상으로 나오고, 각 대상에 작성자 팀이 실린다', async () => {
    const prisma = makeDualPrisma();
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    const source = await service.source(user, { sourceType: 'team_match', sourceId: teamSourceId });

    expect(source.targets).toHaveLength(2);
    // 단일 값으로 좁힐 수 없으므로 최상위는 null — 소비자는 target.reviewerTeam 을 봐야 한다.
    expect(source.reviewerTeam).toBeNull();
    expect(source.targets.map((target) => [target.targetTeamId, target.reviewerTeam?.teamId])).toEqual([
      [awayTeamId, hostTeamId],
      [hostTeamId, awayTeamId],
    ]);
  });

  it('원정팀을 평가하면 홈팀 입장으로 저장된다 (대상이 작성자 팀을 결정)', async () => {
    const createMock = jest.fn().mockResolvedValue(createdRow(hostTeamId, awayTeamId));
    const prisma = makeDualPrisma(createMock);
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    await service.submit(user, {
      sourceType: 'team_match',
      sourceId: teamSourceId,
      targetType: 'team',
      targetTeamId: awayTeamId,
      rating: 5,
      tagCodes: ['manner'],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerTeamId: hostTeamId, targetTeamId: awayTeamId }),
      }),
    );
  });

  it('반대 방향(홈팀 평가)은 원정팀 입장으로 저장된다', async () => {
    const createMock = jest.fn().mockResolvedValue(createdRow(awayTeamId, hostTeamId));
    const prisma = makeDualPrisma(createMock);
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    await service.submit(user, {
      sourceType: 'team_match',
      sourceId: teamSourceId,
      targetType: 'team',
      targetTeamId: hostTeamId,
      rating: 3,
      tagCodes: ['manner'],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerTeamId: awayTeamId, targetTeamId: hostTeamId }),
      }),
    );
  });

  // 겸직이라도 역할은 팀마다 다르다 — 홈팀 운영진이지만 원정팀에서는 일반 팀원이면
  // 원정팀 입장(=홈팀 평가) 방향만 막혀야 하고, 홈팀 입장 방향은 그대로 열려 있어야 한다.
  it('역할은 방향별로 따로 판정된다 (한쪽만 자격이 있으면 그 방향만 열린다)', async () => {
    const prisma = makeDualPrisma();
    prisma.v1TeamMembership.findMany = jest.fn().mockResolvedValue([
      { teamId: hostTeamId, role: 'manager', team: { name: '홈팀' } },
      { teamId: awayTeamId, role: 'member', team: { name: '원정팀' } },
    ]);
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never, adminContextStub());

    const source = await service.source(user, { sourceType: 'team_match', sourceId: teamSourceId });

    expect(source.targets).toHaveLength(1);
    expect(source.targets[0]).toMatchObject({
      targetType: 'team',
      targetTeamId: awayTeamId,
      reviewerTeam: { teamId: hostTeamId },
    });
  });
});
