import { Prisma, V1TeamMembershipRole } from '@prisma/client';

export const TOURNAMENT_FIXTURE_SOURCE_TYPE = 'tournament_fixture' as const;
export const TEAM_REVIEW_ROLES: V1TeamMembershipRole[] = ['owner', 'manager'];
export const REVIEW_TAGS = {
  punctual: '시간 약속을 잘 지켜요',
  manner: '매너가 좋아요',
  teamwork: '팀워크가 좋아요',
  communication: '소통이 원활해요',
  active: '운동에 적극적으로 참여해요',
  considerate: '배려심이 있어요',
  passionate: '열정적으로 운동해요',
  play_again: '또 같이 운동하고 싶어요',
} as const;

export type TournamentFixtureReviewTagCode = keyof typeof REVIEW_TAGS;
export type TournamentFixture = Prisma.V1TournamentFixtureGetPayload<{
  select: ReturnType<typeof tournamentFixtureSelect>;
}>;
export type ReviewWithIncludes = Prisma.V1PostEventReviewGetPayload<{
  include: ReturnType<typeof reviewInclude>;
}>;
export type ExistingReviewWithIncludes = ReviewWithIncludes & { __alreadySubmitted: true };

export function tournamentFixtureSelect() {
  return {
    id: true,
    tournamentId: true,
    round: true,
    fixtureNumber: true,
    status: true,
    scheduledAt: true,
    updatedAt: true,
    result: { select: { recordedAt: true } },
    tournament: { select: { title: true } },
    homeRegistration: { select: { teamId: true, team: { select: teamSelect() } } },
    awayRegistration: { select: { teamId: true, team: { select: teamSelect() } } },
  } as const;
}

export function reviewInclude() {
  return {
    tags: { orderBy: { createdAt: 'asc' as const } },
    reviewerUser: { select: userSelect() },
    reviewerTeam: { select: teamSelect() },
    targetUser: { select: userSelect() },
    targetTeam: { select: teamSelect() },
  };
}

export function fixtureTeams(fixture: TournamentFixture) {
  if (!fixture.homeRegistration || !fixture.awayRegistration) return null;
  return {
    home: teamInfo(fixture.homeRegistration),
    away: teamInfo(fixture.awayRegistration),
  };
}

export function fixtureTitle(fixture: TournamentFixture) {
  return `${fixture.tournament.title} · ${fixture.round} ${fixture.fixtureNumber}경기`;
}

export function sourceSummary(sourceId: string, title: string, completedAt: Date | null) {
  return {
    sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
    sourceId,
    title,
    completedAt: completedAt ? toIso(completedAt) : null,
  };
}

export function toReviewDetail(review: ReviewWithIncludes) {
  return {
    reviewId: review.id,
    sourceType: review.sourceType,
    sourceId: review.sourceId,
    targetType: review.targetType,
    targetUser: review.targetUser ? {
      userId: review.targetUser.id,
      name: review.targetUser.profile?.nickname ?? '사용자',
      imageUrl: review.targetUser.profile?.profileImageUrl ?? null,
    } : null,
    targetTeam: review.targetTeam ? {
      teamId: review.targetTeam.id,
      name: review.targetTeam.name,
      imageUrl: review.targetTeam.profile?.logoUrl ?? null,
    } : null,
    reviewerUser: {
      userId: review.reviewerUser.id,
      name: review.reviewerUser.profile?.nickname ?? '사용자',
      imageUrl: review.reviewerUser.profile?.profileImageUrl ?? null,
    },
    reviewerTeam: review.reviewerTeam ? {
      teamId: review.reviewerTeam.id,
      name: review.reviewerTeam.name,
      imageUrl: review.reviewerTeam.profile?.logoUrl ?? null,
    } : null,
    rating: review.rating,
    tags: review.tags.map((tag) => ({ tagCode: tag.tagCode, label: tag.labelSnapshot })),
    status: review.status,
    submittedAt: toIso(review.submittedAt),
  };
}

export function markExistingReviewResult(review: ReviewWithIncludes): ExistingReviewWithIncludes {
  return Object.assign(review, { __alreadySubmitted: true as const });
}

export function isExistingReviewResult(review: ReviewWithIncludes): review is ExistingReviewWithIncludes {
  return '__alreadySubmitted' in review;
}

export function teamTrustData(reviewCount: number, avgRating: number | null, matchCount: number) {
  return {
    trustState: trustStateForReviewCount(reviewCount),
    // mannerScore(team_match 전용)와 컬럼을 분리 — 대회후기 평점은 tournamentMannerScore/tournamentReviewCount에 기록한다
    tournamentMannerScore: decimalScore(avgRating),
    tournamentReviewCount: reviewCount,
    matchCount,
    sourceLabel: '완료 팀매치·대회 경기 리뷰 기반',
    calculatedAt: new Date(),
  };
}

export function toIso(value: Date) {
  return value.toISOString();
}

export function resolveReviewerTeamId(teamIds: string[], homeTeamId: string, awayTeamId: string) {
  const matches = teamIds.filter((teamId) => teamId === homeTeamId || teamId === awayTeamId);
  return matches.length === 1 ? matches[0] : null;
}

export function teamReviewKey(sourceGroupId: string, reviewerTeamId: string, targetTeamId: string) {
  return `${sourceGroupId}:${reviewerTeamId}:${targetTeamId}`;
}

export function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function userSelect() {
  return { id: true, profile: { select: { nickname: true, profileImageUrl: true } } } as const;
}

function teamSelect() {
  return { id: true, name: true, profile: { select: { logoUrl: true } } } as const;
}

function teamInfo(registration: NonNullable<TournamentFixture['homeRegistration']>) {
  return {
    teamId: registration.teamId,
    name: registration.team.name,
    imageUrl: registration.team.profile?.logoUrl ?? null,
  };
}

function trustStateForReviewCount(reviewCount: number) {
  if (reviewCount >= 3) return 'verified' as const;
  if (reviewCount >= 1) return 'estimated' as const;
  return 'none' as const;
}

function decimalScore(avgRating: number | null) {
  return avgRating === null ? null : new Prisma.Decimal(avgRating.toFixed(2));
}
