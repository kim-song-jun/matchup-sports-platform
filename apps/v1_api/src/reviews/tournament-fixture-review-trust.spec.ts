import { recalculateTournamentFixtureTeamTrust } from './tournament-fixture-review-trust';

const targetTeamId = '00000000-0000-4000-8000-000000000202';
const teamA = '00000000-0000-4000-8000-000000000201';
const teamB = '00000000-0000-4000-8000-000000000203';

describe('recalculateTournamentFixtureTeamTrust', () => {
  // 참가팀 멤버 전원이 후기를 쓸 수 있으므로 원시 평균을 쓰면 인원 많은 팀의 목소리가 커진다.
  // A팀 3명(평균 2점) + B팀 1명(5점)일 때 원시 평균은 (2+2+2+5)/4 = 2.75, 팀 평균 1표는
  // (2+5)/2 = 3.5다 — 두 방식이 실제로 갈리는 숫자라 이 단언이 집계 방식을 고정한다.
  it('팀별 평균을 먼저 낸 뒤 그 평균들의 평균을 쓴다 (원시 평균 2.75가 아니라 3.5)', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const groupByMock = jest.fn().mockResolvedValue([
      { reviewerTeamId: teamA, _avg: { rating: 2 }, _count: { _all: 3 } },
      { reviewerTeamId: teamB, _avg: { rating: 5 }, _count: { _all: 1 } },
    ]);
    const tx = {
      v1PostEventReview: { groupBy: groupByMock },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(2) },
      v1TournamentFixture: { count: jest.fn().mockResolvedValue(3) },
      v1TeamTrustScore: { upsert: upsertMock },
    };

    await recalculateTournamentFixtureTeamTrust(tx as never, targetTeamId);

    const upsertCall = upsertMock.mock.calls[0][0];
    // Prisma.Decimal#toString()은 후행 0을 지우므로 toFixed(2)로 정밀도까지 검증한다.
    expect(upsertCall.update.tournamentMannerScore.toFixed(2)).toBe('3.50');
    // reviewCount는 후기 건수(4)가 아니라 평가에 참여한 팀 수(2)다.
    expect(upsertCall.update.tournamentReviewCount).toBe(2);
    expect(upsertCall.update.tournamentTrustState).toBe('estimated');
    expect(upsertCall.update.tournamentMatchCount).toBe(5);
    expect(upsertCall.where).toEqual({ teamId: targetTeamId });
  });

  // groupBy mock이 where 인자와 무관하게 고정값을 반환하므로, 필터가 헐거워지는 회귀
  // (team_match 후기까지 섞임 / 이름 없는 null 그룹이 한 팀으로 계산됨)는 인자 단언으로만 잡힌다.
  it('대회 후기(tournament_fixture)만, reviewerTeamId가 있는 행만 집계한다', async () => {
    const groupByMock = jest.fn().mockResolvedValue([]);
    const tx = {
      v1PostEventReview: { groupBy: groupByMock },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentFixture: { count: jest.fn().mockResolvedValue(0) },
      v1TeamTrustScore: { upsert: jest.fn().mockResolvedValue({}) },
    };

    await recalculateTournamentFixtureTeamTrust(tx as never, targetTeamId);

    expect(groupByMock).toHaveBeenCalledWith(expect.objectContaining({
      by: ['reviewerTeamId'],
      where: expect.objectContaining({
        targetTeamId,
        targetType: 'team',
        status: 'submitted',
        sourceType: 'tournament_fixture',
        reviewerTeamId: { not: null },
      }),
    }));
  });

  // 같은 팀에서 3명이 써도 "1개 팀 평가"다. 작성자 수로 세면 여기서 verified(3건 이상)로
  // 튀어올라 등급 지표가 무력화된다.
  it('한 팀에서 여러 명이 써도 reviewCount는 1이다', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: {
        groupBy: jest.fn().mockResolvedValue([
          { reviewerTeamId: teamA, _avg: { rating: 4.5 }, _count: { _all: 3 } },
        ]),
      },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentFixture: { count: jest.fn().mockResolvedValue(1) },
      v1TeamTrustScore: { upsert: upsertMock },
    };

    await recalculateTournamentFixtureTeamTrust(tx as never, targetTeamId);

    const upsertCall = upsertMock.mock.calls[0][0];
    expect(upsertCall.update.tournamentReviewCount).toBe(1);
    expect(upsertCall.update.tournamentTrustState).toBe('estimated');
    expect(upsertCall.update.tournamentMannerScore.toFixed(2)).toBe('4.50');
  });

  it('후기가 없으면 점수는 null, 등급은 none이다', async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    const tx = {
      v1PostEventReview: { groupBy: jest.fn().mockResolvedValue([]) },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentFixture: { count: jest.fn().mockResolvedValue(0) },
      v1TeamTrustScore: { upsert: upsertMock },
    };

    await recalculateTournamentFixtureTeamTrust(tx as never, targetTeamId);

    const upsertCall = upsertMock.mock.calls[0][0];
    expect(upsertCall.update.tournamentMannerScore).toBeNull();
    expect(upsertCall.update.tournamentReviewCount).toBe(0);
    expect(upsertCall.update.tournamentTrustState).toBe('none');
    expect(upsertCall.create).toMatchObject({ teamId: targetTeamId, tournamentReviewCount: 0 });
  });
});
