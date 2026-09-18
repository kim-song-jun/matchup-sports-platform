import { Prisma } from '@prisma/client';
import { isReviewRevealed, reviewRevealScope } from './review-visibility';
import { aggregateTournamentMetricScores, type MetricScoreRow } from './review-metric-aggregation';
import { average, trustStateForReviewCount } from './team-trust-aggregation';
import { decimalScore, TOURNAMENT_FIXTURE_SOURCE_TYPE } from './tournament-fixture-review-mappers';

/**
 * 대회 개인 후기(sourceType=tournament_fixture · targetType=user)만 모아 평판을 재계산한다.
 *
 * 개인 매치 후기를 집계하는 `ReviewsService.recalculateUserReputation()`과 **컬럼이 다르다** —
 * 이쪽은 `tournament_*` 컬럼에만 쓴다. 한 대회에 나가면 상대팀 로스터 전원에게 며칠 만에 수십 건을
 * 받을 수 있어서, 같은 컬럼에 합산하면 개인 매치로 쌓아온 평점이 대회 한 번에 통째로 덮인다.
 * (V1TeamTrustScore의 team_match ↔ tournament_fixture 컬럼 분리와 같은 선례.)
 *
 * 집계 단위는 "대회 × 평가한 팀" 1표다. 상대팀 멤버 15명이 나 한 사람에게 각자 1점을 주면 원시
 * 평균에서는 15표가 되는데, 그건 15개의 독립된 의견이 아니라 한 팀의 의견이다(팀 후기에서 "팀 평균
 * 1표"로 접는 것과 정확히 같은 모양). 그래서 팀별 평균을 먼저 내고 그 평균들의 평균을 점수로 쓰며,
 * `tournamentReviewCount`도 후기 건수가 아니라 "평가한 상대팀 수"다.
 */
export async function recalculateTournamentUserReputation(
  tx: Prisma.TransactionClient,
  targetUserId: string,
) {
  const now = new Date();
  const candidates = await tx.v1PostEventReview.findMany({
    where: {
      targetUserId,
      targetType: 'user',
      status: 'submitted',
      sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
      // 대회 개인 후기는 항상 reviewerTeamId(작성자가 서 있던 참가팀)를 기록하지만 컬럼이 nullable이라,
      // null 그룹이 "이름 없는 한 팀"으로 섞여 유령 1표를 만들지 않도록 쿼리 단계에서 제외한다
      // (recalculateTournamentFixtureTeamTrust / computeRevealedTeamTrustBatch와 동일한 처리).
      reviewerTeamId: { not: null },
      sourceGroupId: { not: null },
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      sourceGroupId: true,
      reviewerUserId: true,
      reviewerTeamId: true,
      targetUserId: true,
      rating: true,
      submittedAt: true,
    },
  });

  const sourceGroupIds = [...new Set(candidates.map((review) => review.sourceGroupId).filter((id): id is string => Boolean(id)))];
  const reverseReviews = sourceGroupIds.length
    ? (
        await tx.v1PostEventReview.findMany({
          where: {
            reviewerUserId: targetUserId,
            sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
            sourceGroupId: { in: sourceGroupIds },
            status: 'submitted',
          },
          select: { sourceType: true, sourceId: true, sourceGroupId: true, reviewerUserId: true, targetUserId: true },
        })
      ).map((review) => ({
        sourceId: reviewRevealScope(review),
        reviewerUserId: review.reviewerUserId,
        targetUserId: review.targetUserId,
      }))
    : [];

  // reveal 판정은 사람 대 사람 그대로 둔다(팀 후기처럼 그룹으로 접지 않는다) — 개인 후기는 "내가 그
  // 사람을 평가했으면 그 사람이 나에게 쓴 것도 공개"라는 상호성이 그대로 성립한다. 다만 짝을 맞추는
  // 단위만 대회(reviewRevealScope)로 접는다: 서로 다른 경기에서 평가했어도 같은 대회면 짝이다.
  const ratingsByGroup = new Map<string, number[]>();
  // 4항목 채점도 rating 과 같은 "대회 × 평가한 팀" 접기를 따른다 -- reveal 된 후기의
  // id → 접기 키 맵을 함께 만들어 항목 집계에 넘긴다.
  const revealedGroupKeyByReviewId = new Map<string, string>();
  for (const review of candidates) {
    const revealed = isReviewRevealed(
      {
        sourceId: reviewRevealScope(review),
        reviewerUserId: review.reviewerUserId,
        targetUserId: review.targetUserId,
        submittedAt: review.submittedAt,
      },
      reverseReviews,
      now,
    );
    if (!revealed) continue;
    const key = `${review.sourceGroupId ?? ''}:${review.reviewerTeamId ?? ''}`;
    revealedGroupKeyByReviewId.set(review.id, key);
    const ratings = ratingsByGroup.get(key) ?? [];
    ratings.push(review.rating);
    ratingsByGroup.set(key, ratings);
  }

  const metricRows = revealedGroupKeyByReviewId.size
    ? await tx.v1PostEventReviewMetricScore.findMany({
        where: { reviewId: { in: [...revealedGroupKeyByReviewId.keys()] } },
        select: { reviewId: true, metric: true, score: true },
      })
    : [];
  const metricAggregate = aggregateTournamentMetricScores(revealedGroupKeyByReviewId, metricRows as MetricScoreRow[]);

  const groupAverages = [...ratingsByGroup.values()].map(average);
  const reviewCount = groupAverages.length;
  const avgRating = reviewCount ? average(groupAverages) : null;
  const data = {
    tournamentTrustState: trustStateForReviewCount(reviewCount),
    tournamentMannerScore: decimalScore(avgRating),
    tournamentReviewCount: reviewCount,
    tournamentSourceLabel: '완료 대회 경기 개인 리뷰 기반',
    tournamentMetricReviewCount: metricAggregate.metricReviewCount,
    tournamentMetricSkillScore: decimalScore(metricAggregate.skill),
    tournamentMetricMannerScore: decimalScore(metricAggregate.manner),
    tournamentMetricPunctualityScore: decimalScore(metricAggregate.punctuality),
    tournamentMetricSafetyScore: decimalScore(metricAggregate.safety),
    calculatedAt: new Date(),
  };

  await tx.v1UserReputationSummary.upsert({
    where: { userId: targetUserId },
    update: data,
    create: { userId: targetUserId, ...data },
  });
}
