import { Prisma, V1TeamMembershipRole } from '@prisma/client';
import { resolveTournamentFixtureOfficialTimestamp } from '../tournaments/tournament-fixture-official-result';

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
    // R3 §4-3단계: 신규 경로(V1Game.currentOfficialRevision.officialAt)를 우선 읽는다 --
    // officialResultTimestamp() 참고. state까지 함께 골라서 VOID로 넘어간 리비전을
    // "결과 있음"으로 오판하지 않는다.
    game: { select: { currentOfficialRevision: { select: { state: true, officialAt: true } } } },
    // R3 §4-3단계 한시적 레거시 폴백 입력 — officialResultTimestamp()가 새 경로에 OFFICIAL
    // 리비전이 없을 때만(game 백필 전) 레거시 recordedAt으로 대체한다. §4-4단계에서 제거.
    result: { select: { recordedAt: true } },
    tournament: { select: { title: true } },
    homeRegistration: { select: { teamId: true, team: { select: teamSelect() } } },
    awayRegistration: { select: { teamId: true, team: { select: teamSelect() } } },
  } as const;
}

/**
 * 신규 경로(`V1Game.currentOfficialRevision.officialAt`) 우선, 새 경로에 OFFICIAL
 * 리비전이 없을 때만(game 백필 전 등) 레거시 `fixture.result?.recordedAt`으로 폴백한다
 * (R3 §4-3~§4-4단계 사이 한시적 — resolveTournamentFixtureOfficialTimestamp() 참고).
 * `currentOfficialRevisionId`는 VOID 이후 VOID 리비전을 가리키도록 옮겨가므로
 * (tournament-result-review.service.ts voidResult) 존재 여부가 아니라
 * `state === 'OFFICIAL'`을 확인해야 레거시의 "결과가 있다"와 동등해진다. 백필된 픽스처는
 * officialAt에 레거시 recordedAt이 그대로 들어있어(game-result-backfill.ts) 이 값이
 * 정확히 같다. 이 타임스탬프는 `reviewContext()`의 리뷰 게이트("결과가 확정된 경기만
 * 리뷰 가능")로도 그대로 쓰이므로, 폴백이 빠지면 레거시 결과만 있는(game 백필 전) 완료
 * 경기가 리뷰를 못 받게 된다.
 */
export function officialResultTimestamp(fixture: TournamentFixture): Date | null {
  return resolveTournamentFixtureOfficialTimestamp(fixture.game, fixture.result?.recordedAt);
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
    // trustState/matchCount/sourceLabel(team_match 전용, recalculateTeamTrust가 관리)과 컬럼을 분리 —
    // 대회후기 집계는 tournamentTrustState/tournamentMatchCount/tournamentSourceLabel에만 기록해서
    // 두 recalculate 함수가 같은 컬럼을 놓고 last-write-wins로 경쟁하지 않도록 한다.
    tournamentTrustState: trustStateForReviewCount(reviewCount),
    // mannerScore(team_match 전용)와 컬럼을 분리 — 대회후기 평점은 tournamentMannerScore/tournamentReviewCount에 기록한다
    tournamentMannerScore: decimalScore(avgRating),
    tournamentReviewCount: reviewCount,
    tournamentMatchCount: matchCount,
    tournamentSourceLabel: '완료 대회 경기 리뷰 기반',
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
