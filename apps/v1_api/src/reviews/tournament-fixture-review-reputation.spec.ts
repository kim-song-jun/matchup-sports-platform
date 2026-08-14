import { recalculateTournamentUserReputation } from './tournament-fixture-review-reputation';

const targetUserId = '00000000-0000-4000-8000-000000000011';
const tournamentId = '00000000-0000-4000-8000-000000000301';
const otherTournamentId = '00000000-0000-4000-8000-000000000302';
const teamA = '00000000-0000-4000-8000-000000000201';
const teamB = '00000000-0000-4000-8000-000000000203';
const fixtureA = '00000000-0000-4000-8000-000000000101';
const fixtureB = '00000000-0000-4000-8000-000000000102';
const longAgo = new Date('2026-06-01T00:00:00.000Z'); // 72시간 폴백이 이미 지난 시각
const now = new Date('2026-06-20T12:00:00.000Z');

describe('recalculateTournamentUserReputation', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 상대팀 15명이 한 사람에게 몰아쓰는 것을 15표로 세면 안 된다 — 팀 후기의 "팀 평균 1표"와 같은 규칙.
  // A팀 3명(평균 2점) + B팀 1명(5점): 원시 평균 2.75 vs 팀 평균 1표 3.5 — 두 방식이 실제로 갈리는 숫자다.
  it('대회 × 평가한 팀 단위로 접는다 (원시 평균 2.75가 아니라 3.50)', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            candidate({ reviewerUserId: 'a1', reviewerTeamId: teamA, rating: 1 }),
            candidate({ reviewerUserId: 'a2', reviewerTeamId: teamA, rating: 2 }),
            candidate({ reviewerUserId: 'a3', reviewerTeamId: teamA, rating: 3 }),
            candidate({ reviewerUserId: 'b1', reviewerTeamId: teamB, rating: 5 }),
          ])
          .mockResolvedValueOnce([]),
      },
      v1UserReputationSummary: { upsert: upsertMock },
    };

    await recalculateTournamentUserReputation(tx as never, targetUserId);

    const upsertCall = upsertMock.mock.calls[0][0];
    // Prisma.Decimal#toString()은 후행 0을 지우므로 toFixed(2)로 정밀도까지 검증한다.
    expect(upsertCall.update.tournamentMannerScore.toFixed(2)).toBe('3.50');
    // 후기 건수(4)가 아니라 평가한 팀 수(2).
    expect(upsertCall.update.tournamentReviewCount).toBe(2);
    expect(upsertCall.update.tournamentTrustState).toBe('estimated');
    expect(upsertCall.where).toEqual({ userId: targetUserId });
  });

  // 같은 상대팀이라도 대회가 다르면 별개의 표다 — 키에서 sourceGroupId가 빠지면 여러 대회의
  // 같은 팀 후기가 한 표로 뭉쳐 평판이 영원히 1표에 머문다.
  it('대회가 다르면 같은 팀이어도 별개의 표로 센다', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            candidate({ reviewerUserId: 'a1', reviewerTeamId: teamA, rating: 2 }),
            candidate({ reviewerUserId: 'a1', reviewerTeamId: teamA, rating: 4, sourceGroupId: otherTournamentId }),
          ])
          .mockResolvedValueOnce([]),
      },
      v1UserReputationSummary: { upsert: upsertMock },
    };

    await recalculateTournamentUserReputation(tx as never, targetUserId);

    expect(upsertMock.mock.calls[0][0].update.tournamentReviewCount).toBe(2);
    expect(upsertMock.mock.calls[0][0].update.tournamentMannerScore.toFixed(2)).toBe('3.00');
  });

  // 이 필터가 헐거워지면(sourceType 누락) 개인 매치 후기가 tournament_* 컬럼에 섞여 들어가
  // "소스 분리"가 이름만 남는다. mock은 where와 무관하게 고정값을 주므로 인자 단언으로만 잡힌다.
  it('대회 후기(tournament_fixture) · 개인 대상 행만 집계한다', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: { findMany: findManyMock },
      v1UserReputationSummary: { upsert: upsertMock },
    };

    await recalculateTournamentUserReputation(tx as never, targetUserId);

    expect(findManyMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        targetUserId,
        targetType: 'user',
        status: 'submitted',
        sourceType: 'tournament_fixture',
        reviewerTeamId: { not: null },
        sourceGroupId: { not: null },
      }),
    }));
    // 후보가 0건이어도 요약 행은 갱신해야 한다 — 안 그러면 후기가 철회/숨김된 뒤에도 옛 점수가 남는다.
    expect(upsertMock.mock.calls[0][0].update).toMatchObject({
      tournamentReviewCount: 0,
      tournamentTrustState: 'none',
      tournamentMannerScore: null,
    });
  });

  // reveal 게이트: 상대가 아직 나를 평가하지 않았고 72시간도 안 지난 후기는 집계에서 빠진다.
  it('아직 공개되지 않은 후기는 집계에서 제외한다', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            candidate({ reviewerUserId: 'a1', reviewerTeamId: teamA, rating: 1, submittedAt: now }),
          ])
          .mockResolvedValueOnce([]),
      },
      v1UserReputationSummary: { upsert: upsertMock },
    };

    await recalculateTournamentUserReputation(tx as never, targetUserId);

    expect(upsertMock.mock.calls[0][0].update).toMatchObject({ tournamentReviewCount: 0, tournamentMannerScore: null });
  });

  // 짝 맞추기 단위가 대회(sourceGroupId)여야 한다. 내가 예선(fixtureA)에서 상대를 평가하고 상대가
  // 결승(fixtureB)에서 나를 평가한 경우, 픽스처 기준으로 맞추면 짝이 영영 성립하지 않아
  // 상호 공개 경로가 죽고 72시간 폴백만 남는다.
  it('같은 대회의 다른 경기에서 되평가했어도 즉시 공개된다', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            candidate({ reviewerUserId: 'a1', reviewerTeamId: teamA, rating: 4, submittedAt: now, sourceId: fixtureA }),
          ])
          .mockResolvedValueOnce([
            {
              sourceType: 'tournament_fixture',
              sourceId: fixtureB,
              sourceGroupId: tournamentId,
              reviewerUserId: targetUserId,
              targetUserId: 'a1',
            },
          ]),
      },
      v1UserReputationSummary: { upsert: upsertMock },
    };

    await recalculateTournamentUserReputation(tx as never, targetUserId);

    expect(upsertMock.mock.calls[0][0].update).toMatchObject({ tournamentReviewCount: 1 });
    expect(upsertMock.mock.calls[0][0].update.tournamentMannerScore.toFixed(2)).toBe('4.00');
  });
});

function candidate(input: {
  readonly reviewerUserId: string;
  readonly reviewerTeamId: string;
  readonly rating: number;
  readonly submittedAt?: Date;
  readonly sourceId?: string;
  readonly sourceGroupId?: string;
}) {
  return {
    sourceType: 'tournament_fixture' as const,
    sourceId: input.sourceId ?? fixtureA,
    sourceGroupId: input.sourceGroupId ?? tournamentId,
    reviewerUserId: input.reviewerUserId,
    reviewerTeamId: input.reviewerTeamId,
    targetUserId,
    rating: input.rating,
    submittedAt: input.submittedAt ?? longAgo,
  };
}
