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
    where: { targetTeamId: { in: teamIds }, targetType: 'team', status: 'submitted', sourceType: 'team_match' },
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

  const revealedByTeam = new Map<string, number[]>();
  for (const candidate of candidates) {
    if (!candidate.targetTeamId) continue;
    const revealed = isReviewRevealed(
      {
        sourceId: candidate.sourceId,
        reviewerUserId: candidate.reviewerTeamId ?? '',
        targetUserId: candidate.targetTeamId,
        submittedAt: candidate.submittedAt,
      },
      reverseReviews,
      now,
    );
    if (!revealed) continue;
    const ratings = revealedByTeam.get(candidate.targetTeamId) ?? [];
    ratings.push(candidate.rating);
    revealedByTeam.set(candidate.targetTeamId, ratings);
  }

  for (const teamId of teamIds) {
    if (!candidateTeamIds.has(teamId)) continue; // 기본값(sample/null/0) 유지
    const ratings = revealedByTeam.get(teamId);
    const reviewCount = ratings?.length ?? 0;
    const avgRating = reviewCount ? ratings!.reduce((sum, rating) => sum + rating, 0) / reviewCount : null;
    result.set(teamId, {
      trustState: trustStateForReviewCount(reviewCount),
      mannerScore: decimalScore(avgRating),
      reviewCount,
    });
  }

  return result;
}

// reviews.service.ts의 private trustStateForReviewCount()를 그대로 복제 — export 안 되어 있고
// ReviewsModule을 여기서 import하면 순환 의존이 생기므로 로직만 이식한다(profile.service.ts의
// getRevealedMonthlyReviewCount()와 동일한 전례를 따름).
function trustStateForReviewCount(reviewCount: number) {
  if (reviewCount >= 3) return 'verified' as const;
  if (reviewCount >= 1) return 'estimated' as const;
  return 'none' as const;
}

// reviews.service.ts의 private decimalScore()와 동일 로직(소수점 둘째 자리 반올림). 다만 이 배치 헬퍼는
// Prisma에 쓰지 않고 API 소비용 number를 반환하므로 Prisma.Decimal 왕복 없이 바로 반올림한다.
function decimalScore(avgRating: number | null) {
  return avgRating === null ? null : Number(avgRating.toFixed(2));
}
