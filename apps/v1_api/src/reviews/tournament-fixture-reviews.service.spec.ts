import { ForbiddenException } from '@nestjs/common';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'captain@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
// 같은 팀의 일반 멤버(role: 'member'). 예전 정책에서는 이 사람이 제출하면 403이었다.
const teammate = { ...user, id: '00000000-0000-4000-8000-000000000002', email: 'member@teameet.v1' };
// 어느 참가팀에도 속하지 않은 사용자(다른 팀 소속).
const outsider = { ...user, id: '00000000-0000-4000-8000-000000000003', email: 'outsider@teameet.v1' };

const fixtureId = '00000000-0000-4000-8000-000000000101';
const secondFixtureId = '00000000-0000-4000-8000-000000000102';
const tournamentId = '00000000-0000-4000-8000-000000000301';
const reviewerTeamId = '00000000-0000-4000-8000-000000000201';
const targetTeamId = '00000000-0000-4000-8000-000000000202';
const otherTeamId = '00000000-0000-4000-8000-000000000203';
const reviewerRegistrationId = '00000000-0000-4000-8000-000000000401';
const targetRegistrationId = '00000000-0000-4000-8000-000000000402';
// 상대팀(마포 러너스) 등록 로스터 — 개인 후기 대상.
const opponentPlayerId = '00000000-0000-4000-8000-000000000011';
const secondOpponentPlayerId = '00000000-0000-4000-8000-000000000012';
// 상대팀 등록에 있었지만 대회 도중 빠진 선수(removedAt) — 대상에서 빠져야 한다.
const removedOpponentPlayerId = '00000000-0000-4000-8000-000000000013';
const sportId = 'sport-futsal';
const recordedAt = new Date('2026-06-20T12:00:00.000Z');

describe('TournamentFixtureReviewsService', () => {
  it('returns the opponent team target for a completed tournament fixture', async () => {
    const prisma = {
      v1TournamentFixture: {
        findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 7 })),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: reviewerTeamId, role: 'owner', team: { name: '성수 FC' } },
        ]),
      },
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(user, fixtureId)).resolves.toMatchObject({
      source: {
        sourceType: 'tournament_fixture',
        sourceId: fixtureId,
        title: 'TeamMeet Cup · 예선 7경기',
        completedAt: recordedAt.toISOString(),
      },
      sportId,
      reviewerTeam: { teamId: reviewerTeamId, name: '성수 FC', role: 'owner' },
      targets: [
        {
          targetType: 'team',
          targetTeamId,
          name: '마포 러너스',
          subtitle: '대회 상대 팀',
          alreadySubmitted: false,
        },
      ],
    });
  });

  // 개인 후기 대상 명단(사용자 확정): 대회 로스터(V1TournamentPlayer) 기준 · 상대팀만.
  it('개인 후기 대상은 상대팀 로스터뿐이다 — 같은 팀 동료와 제외된 선수는 나오지 않는다', async () => {
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: user.id, teamId: reviewerTeamId, role: 'owner' })]),
      v1TournamentPlayer: playerStore([
        player({ registrationId: targetRegistrationId, userId: opponentPlayerId, nickname: '러너스 10번' }),
        player({ registrationId: targetRegistrationId, userId: secondOpponentPlayerId, nickname: '러너스 7번' }),
        player({ registrationId: targetRegistrationId, userId: removedOpponentPlayerId, nickname: '빠진 선수', removedAt: recordedAt }),
        // 내 팀(성수 FC) 로스터 — 팀 내부 담합을 막기 위해 대상에서 절대 나오면 안 된다.
        player({ registrationId: reviewerRegistrationId, userId: teammate.id, nickname: '성수 9번' }),
        player({ registrationId: reviewerRegistrationId, userId: user.id, nickname: '성수 캡틴' }),
      ]),
      v1PostEventReview: reviewStore([]),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    const result = await service.source(user, fixtureId);

    expect(result.targets.map((target) => [target.targetType, target.targetUserId ?? target.targetTeamId])).toEqual([
      ['team', targetTeamId],
      ['user', opponentPlayerId],
      ['user', secondOpponentPlayerId],
    ]);
    expect(result.targets[1]).toMatchObject({
      name: '러너스 10번',
      subtitle: '상대 팀 선수',
      targetTeamId: null,
      alreadySubmitted: false,
      locked: false,
    });
    // 명단의 근거는 "상대팀 등록"이다 — 팀 기준으로 조회하면 상대팀의 다른 대회 로스터까지 섞인다.
    expect(prisma.v1TournamentPlayer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ registrationId: targetRegistrationId, removedAt: null }),
    }));
  });

  it('상대팀 로스터에 없는 사람에게는 개인 후기를 쓸 수 없다', async () => {
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: user.id, teamId: reviewerTeamId, role: 'owner' })]),
      v1TournamentPlayer: playerStore([
        player({ registrationId: targetRegistrationId, userId: opponentPlayerId, nickname: '러너스 10번' }),
        // 같은 팀 동료는 로스터에 있지만 "내 등록"이라 대상 조회에 애초에 잡히지 않는다.
        player({ registrationId: reviewerRegistrationId, userId: teammate.id, nickname: '성수 9번' }),
      ]),
      v1PostEventReview: reviewStore([]),
      $transaction: jest.fn(),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(
      service.submit(user, { sourceId: fixtureId, targetType: 'user', targetUserId: teammate.id, rating: 5 }, ['manner']),
    ).rejects.toMatchObject({ response: { code: 'TARGET_NOT_REVIEWABLE' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('개인 후기는 대회 스코프(sourceGroupId) + 종목 + 작성자 팀을 함께 기록한다', async () => {
    const createMock = jest.fn().mockResolvedValue(playerReviewRow({ id: 'review-player', reviewerUserId: user.id, targetUserId: opponentPlayerId, rating: 5 }));
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: user.id, teamId: reviewerTeamId, role: 'owner' })]),
      v1TournamentPlayer: playerStore([player({ registrationId: targetRegistrationId, userId: opponentPlayerId, nickname: '러너스 10번' })]),
      v1PostEventReview: reviewStore([]),
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(reputationTx(createMock))),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(
      service.submit(user, { sourceId: fixtureId, targetType: 'user', targetUserId: opponentPlayerId, rating: 5 }, ['manner']),
    ).resolves.toMatchObject({ alreadySubmitted: false, review: { reviewId: 'review-player', targetUser: { userId: opponentPlayerId } } });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reviewerUserId: user.id,
        // 평판 집계가 "대회 × 평가한 팀" 1표로 접으려면 개인 대상 행에도 작성자 팀이 있어야 한다.
        reviewerTeamId,
        sourceType: 'tournament_fixture',
        sourceId: fixtureId,
        // 대회 단위 중복 방지 스코프 — 없으면 같은 상대를 예선·8강·결승에서 세 번 평가할 수 있다.
        sourceGroupId: tournamentId,
        targetType: 'user',
        targetUserId: opponentPlayerId,
        sportId,
      }),
    }));
  });

  it('같은 대회에서 같은 상대 선수에게 다시 제출하면 기존 후기를 그대로 돌려준다', async () => {
    const transactionMock = jest.fn();
    const prisma = {
      // 예선(fixtureId)에서 이미 썼고, 이번엔 결승(secondFixtureId)에서 같은 선수를 다시 평가하려는 상황.
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: secondFixtureId, fixtureNumber: 2 })) },
      v1TeamMembership: membershipStore([membership({ userId: user.id, teamId: reviewerTeamId, role: 'owner' })]),
      v1TournamentPlayer: playerStore([player({ registrationId: targetRegistrationId, userId: opponentPlayerId, nickname: '러너스 10번' })]),
      v1PostEventReview: reviewStore([
        playerReviewRow({ id: 'review-mine', reviewerUserId: user.id, targetUserId: opponentPlayerId, rating: 3 }),
      ]),
      $transaction: transactionMock,
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(
      service.submit(user, { sourceId: secondFixtureId, targetType: 'user', targetUserId: opponentPlayerId, rating: 1 }, ['manner']),
    ).resolves.toMatchObject({ alreadySubmitted: true, review: { reviewId: 'review-mine', rating: 3 } });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('deduplicates pending reviews when the same teams meet twice in one tournament', async () => {
    const prisma = {
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([{ teamId: reviewerTeamId }]),
      },
      v1TournamentFixture: {
        findMany: jest.fn().mockResolvedValue([
          fixture({ id: fixtureId, fixtureNumber: 1 }),
          fixture({ id: secondFixtureId, fixtureNumber: 2 }),
        ]),
      },
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.pending(user, 20)).resolves.toMatchObject([
      {
        sourceType: 'tournament_fixture',
        sourceId: fixtureId,
        targetTeam: { teamId: targetTeamId, name: '마포 러너스' },
        remainingCount: 1,
      },
    ]);
  });

  it('pending 대상 수는 상대 팀 1 + 상대팀 로스터 인원이다', async () => {
    const prisma = {
      v1TeamMembership: membershipStore([membership({ userId: user.id, teamId: reviewerTeamId, role: 'owner' })]),
      v1TournamentFixture: { findMany: jest.fn().mockResolvedValue([fixture({ id: fixtureId, fixtureNumber: 1 })]) },
      v1TournamentPlayer: playerStore([
        player({ registrationId: targetRegistrationId, userId: opponentPlayerId, nickname: '러너스 10번' }),
        player({ registrationId: targetRegistrationId, userId: secondOpponentPlayerId, nickname: '러너스 7번' }),
        player({ registrationId: reviewerRegistrationId, userId: teammate.id, nickname: '성수 9번' }),
      ]),
      // 상대 선수 1명은 이미 평가했고 팀 후기는 아직 안 썼다 → 3명 중 1명 완료.
      v1PostEventReview: reviewStore([
        playerReviewRow({ id: 'review-mine', reviewerUserId: user.id, targetUserId: opponentPlayerId, rating: 4 }),
      ]),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.pending(user, 20)).resolves.toMatchObject([
      { sourceId: fixtureId, targetCount: 3, reviewedCount: 1, remainingCount: 2, state: 'ready' },
    ]);
  });

  it('locks a repeated opponent team review after another fixture in the same tournament was reviewed', async () => {
    const existingReview = {
      id: '00000000-0000-4000-8000-000000000501',
      sourceType: 'tournament_fixture',
      sourceId: fixtureId,
      targetType: 'team',
      targetUser: null,
      targetTeam: { id: targetTeamId, name: '마포 러너스', profile: { logoUrl: null } },
      reviewerUser: { id: user.id, profile: { nickname: '성수 캡틴', profileImageUrl: null } },
      reviewerTeam: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
      rating: 5,
      tags: [],
      status: 'submitted',
      submittedAt: recordedAt,
    };
    const prisma = {
      v1TournamentFixture: {
        findUnique: jest.fn().mockResolvedValue(fixture({ id: secondFixtureId, fixtureNumber: 2 })),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: reviewerTeamId, role: 'owner', team: { name: '성수 FC' } },
        ]),
      },
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: {
        findFirst: jest.fn(({ where }) => (
          where.sourceGroupId === tournamentId && where.targetTeamId === targetTeamId ? existingReview : null
        )),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(user, secondFixtureId)).resolves.toMatchObject({
      targets: [
        {
          targetTeamId,
          alreadySubmitted: true,
          locked: true,
          lockReason: 'ALREADY_SUBMITTED',
          review: { sourceId: fixtureId, targetTeam: { teamId: targetTeamId } },
        },
      ],
    });
  });

  // R3 §4-3단계: 결과 존재 게이트를 신규 경로(V1Game.currentOfficialRevision)로 옮겼다.
  // currentOfficialRevisionId는 VOID 이후 VOID 리비전을 가리키도록 다시 옮겨가므로
  // (tournament-result-review.service.ts voidResult), state까지 확인하지 않으면 무효화된
  // 결과를 "리뷰 가능"으로 오판한다.
  it('무효화(VOID)된 결과는 완료로 취급하지 않고 SOURCE_NOT_COMPLETED로 막는다', async () => {
    const prisma = {
      v1TournamentFixture: {
        findUnique: jest.fn().mockResolvedValue({
          ...fixture({ id: fixtureId, fixtureNumber: 1 }),
          game: { currentOfficialRevision: { state: 'VOID', officialAt: null } },
        }),
      },
      v1TeamMembership: { findMany: jest.fn() },
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(user, fixtureId)).rejects.toMatchObject({
      response: { code: 'SOURCE_NOT_COMPLETED' },
    });
  });

  // 아래 5개는 "팀 후기 작성 권한 개방"(팀장 전용 → 참가팀 active 멤버 전원) 회귀 테스트다.
  // 이 블록의 prisma 스텁은 고정값 mock이 아니라 where 인자를 실제로 평가하는 미니 스토어
  // (membershipStore/reviewStore)를 쓴다 — 고정값 mock은 서비스가 role 필터를 되살리거나
  // 중복 판정 축을 사람→팀으로 되돌려도 같은 값을 돌려줘서 정책 역전을 못 잡기 때문이다.
  it('일반 멤버(role: member)도 상대팀 후기를 제출할 수 있다', async () => {
    const createMock = jest.fn().mockResolvedValue(reviewRow({ id: 'review-member', reviewerUserId: teammate.id, rating: 4 }));
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      // role 필터가 살아 있으면(role: { in: ['owner','manager'] }) 이 행이 걸러져
      // NOT_TEAM_MEMBER 403으로 떨어진다 — 그게 이 테스트가 잡으려는 회귀다.
      v1TeamMembership: membershipStore([membership({ userId: teammate.id, teamId: reviewerTeamId, role: 'member' })]),
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: reviewStore([]),
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(trustTx(createMock))),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(
      service.submit(teammate, { sourceId: fixtureId, targetType: 'team', targetTeamId, rating: 4 }, ['manner']),
    ).resolves.toMatchObject({
      alreadySubmitted: false,
      review: { reviewId: 'review-member', rating: 4, targetTeam: { teamId: targetTeamId } },
    });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reviewerUserId: teammate.id,
        reviewerTeamId,
        targetTeamId,
        sourceGroupId: tournamentId,
        rating: 4,
      }),
    }));
    // 스토어가 걸러주는 것과 별개로, 역할 필터가 쿼리에 다시 붙는 것 자체를 막는다.
    expect(prisma.v1TeamMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ role: expect.anything() }),
    }));
  });

  it('source(): 일반 멤버의 role을 그대로 실어 응답한다', async () => {
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: teammate.id, teamId: reviewerTeamId, role: 'member' })]),
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: reviewStore([]),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(teammate, fixtureId)).resolves.toMatchObject({
      reviewerTeam: { teamId: reviewerTeamId, name: '성수 FC', role: 'member' },
      targets: [{ targetTeamId, alreadySubmitted: false, locked: false }],
    });
  });

  it('같은 팀의 다른 사람이 이미 썼어도 내 후기는 새로 생성된다', async () => {
    const createMock = jest.fn().mockResolvedValue(reviewRow({ id: 'review-second', reviewerUserId: teammate.id, rating: 2 }));
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: teammate.id, teamId: reviewerTeamId, role: 'member' })]),
      v1TournamentPlayer: playerStore([]),
      // 팀장(user)이 같은 대회·같은 상대팀에 이미 후기를 남긴 상태.
      v1PostEventReview: reviewStore([reviewRow({ id: 'review-captain', reviewerUserId: user.id, rating: 5 })]),
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(trustTx(createMock))),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    // 중복 판정이 팀 기준으로 되돌아가면 팀장의 후기가 "내 기존 후기"로 잡혀
    // alreadySubmitted: true로 조기 리턴되고 create가 호출되지 않는다.
    await expect(
      service.submit(teammate, { sourceId: fixtureId, targetType: 'team', targetTeamId, rating: 2 }, ['manner']),
    ).resolves.toMatchObject({ alreadySubmitted: false, review: { reviewId: 'review-second' } });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reviewerUserId: teammate.id }),
    }));
    // 중복 조회의 축이 사람이어야 한다 — 팀(reviewerTeamId)이 섞이면 같은 팀 두 번째 작성자가 막힌다.
    expect(prisma.v1PostEventReview.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        reviewerUserId: teammate.id,
        targetTeamId,
        sourceType: 'tournament_fixture',
        sourceGroupId: tournamentId,
      },
    }));
  });

  // 팀 기준 unique 제약(reviewerTeamId, targetTeamId, sourceType, sourceGroupId)이 아직 살아
  // 있으면 두 번째 멤버의 create가 P2002로 튕긴다. 이때 폴백은 "내 후기"를 찾으므로 아무것도
  // 못 찾고 409로 시끄럽게 실패해야 한다 — 팀장의 후기를 내 것인 양 돌려주면 안 된다.
  it('P2002 폴백은 내 후기만 찾는다 — 없으면 DUPLICATE_REVIEW_RETRY로 실패한다', async () => {
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: teammate.id, teamId: reviewerTeamId, role: 'member' })]),
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: reviewStore([reviewRow({ id: 'review-captain', reviewerUserId: user.id, rating: 5 })]),
      $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(
      service.submit(teammate, { sourceId: fixtureId, targetType: 'team', targetTeamId, rating: 2 }, ['manner']),
    ).rejects.toMatchObject({ response: { code: 'DUPLICATE_REVIEW_RETRY' } });
  });

  it('같은 사람이 같은 상대팀에 다시 제출하면 기존 후기를 그대로 돌려준다', async () => {
    const transactionMock = jest.fn();
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      v1TeamMembership: membershipStore([membership({ userId: teammate.id, teamId: reviewerTeamId, role: 'member' })]),
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: reviewStore([reviewRow({ id: 'review-mine', reviewerUserId: teammate.id, rating: 3 })]),
      $transaction: transactionMock,
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(
      service.submit(teammate, { sourceId: fixtureId, targetType: 'team', targetTeamId, rating: 1 }, ['manner']),
    ).resolves.toMatchObject({ alreadySubmitted: true, review: { reviewId: 'review-mine', rating: 3 } });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('팀장이 이미 쓴 경기도 다른 팀원의 pending 목록에는 남는다', async () => {
    const prisma = {
      v1TeamMembership: membershipStore([
        membership({ userId: user.id, teamId: reviewerTeamId, role: 'owner' }),
        membership({ userId: teammate.id, teamId: reviewerTeamId, role: 'member' }),
      ]),
      v1TournamentFixture: {
        findMany: jest.fn().mockResolvedValue([fixture({ id: fixtureId, fixtureNumber: 1 })]),
      },
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: reviewStore([reviewRow({ id: 'review-captain', reviewerUserId: user.id, rating: 5 })]),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    // 판정 키가 팀 기준으로 되돌아가면 팀장의 후기가 팀원 전원의 목록을 완료 처리해 []가 된다.
    await expect(service.pending(teammate, 20)).resolves.toMatchObject([
      { sourceId: fixtureId, targetTeam: { teamId: targetTeamId }, remainingCount: 1, state: 'ready' },
    ]);
    // "이미 썼음" 조회도 사람 축이어야 한다(팀 축이면 팀장의 후기가 팀원 목록을 지운다).
    expect(prisma.v1PostEventReview.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ reviewerUserId: teammate.id }),
    }));
    // 반대 방향도 고정 — 정작 쓴 사람에게는 남지 않아야 한다(키가 아무것도 못 맞추는 반대 회귀 차단).
    await expect(service.pending(user, 20)).resolves.toEqual([]);
  });

  it('참가팀 소속이 아니면 NOT_TEAM_MEMBER로 막는다', async () => {
    const prisma = {
      v1TournamentFixture: { findUnique: jest.fn().mockResolvedValue(fixture({ id: fixtureId, fixtureNumber: 1 })) },
      // 참가하지 않은 제3팀의 멤버 — teamId 필터에서 걸러져야 한다.
      v1TeamMembership: membershipStore([membership({ userId: outsider.id, teamId: otherTeamId, role: 'owner' })]),
      v1TournamentPlayer: playerStore([]),
      v1PostEventReview: reviewStore([]),
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    const error = await service.source(outsider, fixtureId).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).toMatchObject({ response: { code: 'NOT_TEAM_MEMBER' } });
  });
});

type Row = Record<string, unknown>;

/**
 * where 인자를 실제로 평가하는 최소 스토어. 고정값 `mockResolvedValue`로 두면
 * "role 필터가 되살아남" / "중복 판정 축이 사람→팀으로 되돌아감" 같은 회귀에서도 같은 값이
 * 돌아와 테스트가 통과해버린다. 지원하지 않는 연산자는 조용히 무시하지 않고 던진다 —
 * 스토어가 실제 쿼리보다 헐거워지면 그 순간부터 회귀를 못 잡기 때문이다.
 */
function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (condition !== null && typeof condition === 'object') {
      if ('in' in condition) return ((condition as { in: readonly unknown[] }).in ?? []).includes(value);
      if ('not' in condition) return value !== (condition as { not: unknown }).not;
      throw new Error(`spec 스토어가 지원하지 않는 where 연산자: ${field}=${JSON.stringify(condition)}`);
    }
    return value === condition;
  });
}

function membershipStore(rows: Row[]) {
  return {
    findMany: jest.fn(async (args: { where: Row }) => rows.filter((row) => matchesWhere(row, args.where))),
  };
}

function reviewStore(rows: Row[]) {
  return {
    findFirst: jest.fn(async (args: { where: Row }) => rows.find((row) => matchesWhere(row, args.where)) ?? null),
    findMany: jest.fn(async (args: { where: Row }) => rows.filter((row) => matchesWhere(row, args.where))),
  };
}

/** 로스터 스토어. registrationId/removedAt 필터를 실제로 평가해야 "상대팀만" 규칙을 검증할 수 있다. */
function playerStore(rows: Row[]) {
  return {
    findMany: jest.fn(async (args: { where: Row }) => rows.filter((row) => matchesWhere(row, args.where))),
  };
}

function membership(input: { readonly userId: string; readonly teamId: string; readonly role: string }) {
  return { userId: input.userId, teamId: input.teamId, status: 'active', role: input.role, team: { name: '성수 FC' } };
}

function player(input: {
  readonly registrationId: string;
  readonly userId: string;
  readonly nickname: string;
  readonly removedAt?: Date;
}) {
  return {
    registrationId: input.registrationId,
    userId: input.userId,
    removedAt: input.removedAt ?? null,
    user: { id: input.userId, profile: { nickname: input.nickname, profileImageUrl: null } },
  };
}

/** 필터에 쓰이는 스칼라 + `reviewInclude()`가 붙인 중첩 관계를 한 행에 함께 담은 형태. */
function reviewRow(input: { readonly id: string; readonly reviewerUserId: string; readonly rating: number }) {
  return {
    id: input.id,
    reviewerUserId: input.reviewerUserId,
    reviewerTeamId,
    sourceType: 'tournament_fixture',
    sourceId: fixtureId,
    sourceGroupId: tournamentId,
    targetType: 'team',
    targetTeamId,
    targetUserId: null,
    targetUser: null,
    targetTeam: { id: targetTeamId, name: '마포 러너스', profile: { logoUrl: null } },
    reviewerUser: { id: input.reviewerUserId, profile: { nickname: '성수 멤버', profileImageUrl: null } },
    reviewerTeam: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
    rating: input.rating,
    tags: [],
    status: 'submitted',
    submittedAt: recordedAt,
  };
}

/** 개인(선수) 대상 후기 행. 팀 대상 행과 달리 targetTeamId가 없고 targetUserId가 채워진다. */
function playerReviewRow(input: {
  readonly id: string;
  readonly reviewerUserId: string;
  readonly targetUserId: string;
  readonly rating: number;
}) {
  return {
    id: input.id,
    reviewerUserId: input.reviewerUserId,
    reviewerTeamId,
    sourceType: 'tournament_fixture',
    sourceId: fixtureId,
    sourceGroupId: tournamentId,
    targetType: 'user',
    targetTeamId: null,
    targetUserId: input.targetUserId,
    targetTeam: null,
    targetUser: { id: input.targetUserId, profile: { nickname: '러너스 10번', profileImageUrl: null } },
    reviewerUser: { id: input.reviewerUserId, profile: { nickname: '성수 멤버', profileImageUrl: null } },
    reviewerTeam: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
    rating: input.rating,
    tags: [],
    status: 'submitted',
    submittedAt: recordedAt,
  };
}

/** submit()의 트랜잭션 내부 — create + recalculateTournamentFixtureTeamTrust가 쓰는 델리게이트. */
function trustTx(createMock: jest.Mock) {
  return {
    v1PostEventReview: { create: createMock, groupBy: jest.fn().mockResolvedValue([]) },
    v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
    v1TournamentFixture: { count: jest.fn().mockResolvedValue(1) },
    v1TeamTrustScore: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

/** 개인 후기 submit()의 트랜잭션 내부 — create + recalculateTournamentUserReputation이 쓰는 델리게이트. */
function reputationTx(createMock: jest.Mock) {
  return {
    v1PostEventReview: { create: createMock, findMany: jest.fn().mockResolvedValue([]) },
    v1UserReputationSummary: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

function fixture(input: { readonly id: string; readonly fixtureNumber: number }) {
  return {
    id: input.id,
    tournamentId,
    tournament: { title: 'TeamMeet Cup', sportId },
    round: '예선',
    fixtureNumber: input.fixtureNumber,
    status: 'completed',
    scheduledAt: recordedAt,
    updatedAt: recordedAt,
    game: { currentOfficialRevision: { state: 'OFFICIAL', officialAt: recordedAt } },
    homeRegistration: {
      id: reviewerRegistrationId,
      teamId: reviewerTeamId,
      team: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
    },
    awayRegistration: {
      id: targetRegistrationId,
      teamId: targetTeamId,
      team: { id: targetTeamId, name: '마포 러너스', profile: { logoUrl: null } },
    },
  };
}
