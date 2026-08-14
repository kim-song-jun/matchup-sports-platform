import { PrismaService } from '../prisma/prisma.service';
import { isReviewRevealed } from './review-visibility';

export type RevealedTeamTrust = {
  trustState: 'verified' | 'estimated' | 'sample' | 'none';
  mannerScore: number | null;
  reviewCount: number;
};

type PrismaLike = Pick<PrismaService, 'v1PostEventReview'>;

/**
 * 여러 팀의 공개(reveal)된 팀 신뢰점수를 N+1 없이 배치로 live 재계산한다.
 * ReviewsService.recalculateTeamTrust()의 candidates → reverse → isReviewRevealed 계산 로직을
 * "여러 팀 한 번에" 버전으로 이식했다 — 팀 목록/신청자 목록처럼 여러 팀을 한 화면에 렌더링할 때
 * 팀 개수만큼 반복 조회하지 않도록 정확히 2개의 쿼리(candidates 1회 + reverse 1회)로 처리한다.
 * NestJS DI에 의존하지 않는 순수 함수라서 TeamsModule/TeamMatchesModule/AdminModule 어디서든
 * 순환 의존 걱정 없이 import해서 쓸 수 있다.
 *
 * 주의(이 배치화의 핵심 함정): reverse 쿼리는 teamIds 전체에 대해 한 번에 조회되므로, 서로 다른
 * 팀의 candidate가 같은 reverseReviews 배열을 공유한다. isReviewRevealed()를 호출할 때 각
 * candidate의 실제 targetTeamId(= 그 candidate가 속한 팀)를 그대로 pairKey에 넣어야 한다 —
 * 고정값(예: teamIds[0])으로 하드코딩하면 다른 팀의 리뷰가 엉뚱하게 매칭/누락된다.
 */
export async function computeRevealedTeamTrustBatch(
  prisma: PrismaLike,
  teamIds: string[],
): Promise<Map<string, RevealedTeamTrust>> {
  const result = new Map<string, RevealedTeamTrust>();
  if (teamIds.length === 0) return result;

  const emptyTrust: RevealedTeamTrust = { trustState: 'sample', mannerScore: null, reviewCount: 0 };
  for (const teamId of teamIds) result.set(teamId, emptyTrust);

  const candidates = await prisma.v1PostEventReview.findMany({
    where: {
      targetTeamId: { in: teamIds },
      targetType: 'team',
      status: 'submitted',
      sourceType: 'team_match',
      // 팀 후기는 항상 reviewerTeamId를 기록하지만 컬럼이 nullable이라, null 그룹이 "이름 없는 한 팀"으로
      // 집계에 섞여 유령 1표를 만들지 않도록 쿼리 단계에서 제외한다(recalculateTournamentFixtureTeamTrust와 동일).
      reviewerTeamId: { not: null },
    },
    select: { targetTeamId: true, sourceId: true, reviewerTeamId: true, rating: true, submittedAt: true },
  });
  if (candidates.length === 0) return result;

  const now = new Date();
  const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
  const reverseReviews = (
    await prisma.v1PostEventReview.findMany({
      where: { reviewerTeamId: { in: teamIds }, sourceId: { in: sourceIds }, sourceType: 'team_match', status: 'submitted' },
      select: { sourceId: true, reviewerTeamId: true, targetTeamId: true },
    })
  ).map((review) => ({ sourceId: review.sourceId, reviewerUserId: review.reviewerTeamId ?? '', targetUserId: review.targetTeamId }));

  // candidateTeamIds: 실제로 candidate 리뷰가 하나라도 존재하는 팀만 trustStateForReviewCount로 "계산"한다.
  // 여기 없는 teamId는 위에서 채운 기본값(sample/null/0)을 그대로 유지 — DB 컬럼 기본값(@default(sample))과
  // 동일하게 "한 번도 평가된 적 없음"을 의미한다. 반면 candidate는 있지만 reveal 필터로 0건이 된 경우는
  // trustStateForReviewCount(0) = 'none'(= "계산은 했는데 현재 공개된 리뷰가 0건")으로 구분한다.
  const candidateTeamIds = new Set(candidates.map((review) => review.targetTeamId).filter((id): id is string => Boolean(id)));

  // reveal 판정은 "대상팀 × 경기 × 평가한 팀" 단위로 접는다. 참가팀 멤버 전원이 후기를 쓸 수 있게 된 뒤로는
  // 한 팀에서 여러 명이 각자 제출해 시각이 제각각이므로, 행마다 판정하면 72시간 폴백이 따로 만료되어 같은 팀의
  // 기여분이 부분적으로만 공개되고 팀 평균이 흔들린다. 그룹당 한 번만 판정하고 그 그룹의 최초 제출 시각을
  // 기준으로 삼아 팀 기여분이 통째로 공개/비공개되게 한다(ReviewsService.recalculateTeamTrust와 동일한 규칙).
  // 배치 버전이라 키에 targetTeamId를 포함한다 — 여러 대상팀의 후기가 한 배열에 섞여 있기 때문이다.
  const revealGroups = new Map<
    string,
    { sourceId: string; reviewerTeamId: string; targetTeamId: string; earliestSubmittedAt: Date }
  >();
  for (const candidate of candidates) {
    if (!candidate.targetTeamId || !candidate.reviewerTeamId) continue;
    const key = batchRevealGroupKey(candidate.targetTeamId, candidate.sourceId, candidate.reviewerTeamId);
    const group = revealGroups.get(key);
    if (!group) {
      revealGroups.set(key, {
        sourceId: candidate.sourceId,
        reviewerTeamId: candidate.reviewerTeamId,
        targetTeamId: candidate.targetTeamId,
        earliestSubmittedAt: candidate.submittedAt,
      });
      continue;
    }
    if (candidate.submittedAt < group.earliestSubmittedAt) group.earliestSubmittedAt = candidate.submittedAt;
  }
  const revealedGroupKeys = new Set(
    [...revealGroups.entries()]
      .filter(([, group]) =>
        isReviewRevealed(
          {
            sourceId: group.sourceId,
            reviewerUserId: group.reviewerTeamId,
            targetUserId: group.targetTeamId,
            submittedAt: group.earliestSubmittedAt,
          },
          reverseReviews,
          now,
        ),
      )
      .map(([key]) => key),
  );

  // 집계는 대상팀별로 다시 reviewerTeamId "만"으로 묶는다 — reveal 그룹 키(sourceId 포함)와 다르다.
  // 같은 두 팀이 여러 경기를 치러도 "팀 평균 1표"이므로 경기 수만큼 표가 늘어나면 안 된다.
  const ratingsByTargetTeam = new Map<string, Map<string, number[]>>();
  for (const candidate of candidates) {
    if (!candidate.targetTeamId || !candidate.reviewerTeamId) continue;
    if (!revealedGroupKeys.has(batchRevealGroupKey(candidate.targetTeamId, candidate.sourceId, candidate.reviewerTeamId))) {
      continue;
    }
    const byReviewerTeam = ratingsByTargetTeam.get(candidate.targetTeamId) ?? new Map<string, number[]>();
    const ratings = byReviewerTeam.get(candidate.reviewerTeamId) ?? [];
    ratings.push(candidate.rating);
    byReviewerTeam.set(candidate.reviewerTeamId, ratings);
    ratingsByTargetTeam.set(candidate.targetTeamId, byReviewerTeam);
  }

  for (const teamId of teamIds) {
    if (!candidateTeamIds.has(teamId)) continue; // 기본값(sample/null/0) 유지
    // 팀별 평균을 먼저 낸 뒤 그 평균들의 평균 — 인원 많은 팀의 목소리가 커지지 않도록 팀당 1표로 환산한다.
    // reviewCount도 후기 건수가 아니라 "평가에 참여한 팀 수"다. 건수로 세면 한 경기에서 상대 팀원 3명이
    // 쓰는 것만으로 trustStateForReviewCount가 'verified'에 닿아 등급 지표가 무력화된다.
    const teamAverages = [...(ratingsByTargetTeam.get(teamId)?.values() ?? [])].map(average);
    const reviewCount = teamAverages.length;
    const avgRating = reviewCount ? average(teamAverages) : null;
    result.set(teamId, {
      trustState: trustStateForReviewCount(reviewCount),
      mannerScore: decimalScore(avgRating),
      reviewCount,
    });
  }

  return result;
}

// reveal 판정 단위: 한 대상팀(targetTeamId)에 대해 한 경기(sourceId)에서 한 팀(reviewerTeamId)이 낸 후기 묶음.
// 단일 팀만 다루는 ReviewsService.recalculateTeamTrust와 달리 배치는 여러 대상팀을 한 번에 처리하므로
// targetTeamId까지 키에 넣어야 서로 다른 팀의 그룹이 섞이지 않는다.
function batchRevealGroupKey(targetTeamId: string, sourceId: string, reviewerTeamId: string) {
  return `${targetTeamId}:${revealGroupKey(sourceId, reviewerTeamId)}`;
}

// reveal 판정 단위 키(경기 × 평가한 팀). ReviewsService.recalculateTeamTrust도 같은 함수를 쓴다 —
// 두 경로가 같은 정책을 각자 구현하다 어긋나는 것을 막기 위해 여기서 단일 정의로 export한다.
export function revealGroupKey(sourceId: string, reviewerTeamId: string) {
  return `${sourceId}:${reviewerTeamId}`;
}

export function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// 신뢰 등급 경계의 단일 정의. ReviewsService.recalculateTeamTrust도 이 함수를 import해서 쓴다 —
// 예전에는 양쪽이 각자 복제한 사본을 갖고 있었고, 그 복제가 "DB는 팀 평균 1표인데 화면은 원시 건수"로
// 갈라지는 사고의 원인이었다. 방향은 서비스 → 순수 헬퍼이므로 순환 의존이 생기지 않는다.
export function trustStateForReviewCount(reviewCount: number) {
  if (reviewCount >= 3) return 'verified' as const;
  if (reviewCount >= 1) return 'estimated' as const;
  return 'none' as const;
}

// reviews.service.ts의 private decimalScore()와 동일 로직(소수점 둘째 자리 반올림). 다만 이 배치 헬퍼는
// Prisma에 쓰지 않고 API 소비용 number를 반환하므로 Prisma.Decimal 왕복 없이 바로 반올림한다.
function decimalScore(avgRating: number | null) {
  return avgRating === null ? null : Number(avgRating.toFixed(2));
}
