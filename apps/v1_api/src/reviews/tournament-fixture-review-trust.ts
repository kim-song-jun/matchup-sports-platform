import { Prisma } from '@prisma/client';
import { teamTrustData } from './tournament-fixture-review-mappers';

export async function recalculateTournamentFixtureTeamTrust(
  tx: Prisma.TransactionClient,
  targetTeamId: string,
) {
  const [reviewerTeamAverages, teamMatchCount, tournamentFixtureCount] = await Promise.all([
    // "팀 평균 1표": 참가팀 멤버 전원이 후기를 쓸 수 있으므로 원시 평균을 쓰면 인원이 많은
    // 팀의 목소리가 그만큼 커진다. reviewerTeamId로 묶어 팀별 평균을 먼저 낸 뒤(아래에서)
    // 그 평균들의 평균을 최종 점수로 쓴다.
    // sourceType 필터 — 대회후기(tournament_fixture)만 이 집계에 반영(team_match는 recalculateTeamTrust가 별도 관리)
    tx.v1PostEventReview.groupBy({
      by: ['reviewerTeamId'],
      where: {
        targetTeamId,
        targetType: 'team',
        status: 'submitted',
        sourceType: 'tournament_fixture',
        // 팀 후기는 항상 reviewerTeamId를 기록하지만 컬럼이 nullable이라, null 그룹이
        // "이름 없는 한 팀"으로 집계에 섞이지 않도록 쿼리 단계에서 제외한다.
        reviewerTeamId: { not: null },
      },
      _avg: { rating: true },
    }),
    tx.v1TeamMatch.count({
      where: {
        OR: [{ hostTeamId: targetTeamId }, { approvedApplicantTeamId: targetTeamId }],
        AND: [{ OR: [{ status: 'completed' }, { completedAt: { not: null } }] }],
      },
    }),
    tx.v1TournamentFixture.count({
      where: {
        game: { is: { currentOfficialRevisionId: { not: null } } },
        OR: [
          { homeRegistration: { is: { teamId: targetTeamId } } },
          { awayRegistration: { is: { teamId: targetTeamId } } },
        ],
      },
    }),
  ]);
  const teamAverages = reviewerTeamAverages
    .map((group) => group._avg.rating)
    .filter((rating): rating is number => rating !== null);
  // reviewCount는 후기 건수가 아니라 "평가에 참여한 팀 수"다 — teamTrustData 주석 참고.
  const reviewCount = teamAverages.length;
  const avgRating = reviewCount === 0
    ? null
    : teamAverages.reduce((sum, rating) => sum + rating, 0) / reviewCount;
  const trustData = teamTrustData(reviewCount, avgRating, teamMatchCount + tournamentFixtureCount);
  await tx.v1TeamTrustScore.upsert({
    where: { teamId: targetTeamId },
    update: trustData,
    create: { teamId: targetTeamId, ...trustData },
  });
}
