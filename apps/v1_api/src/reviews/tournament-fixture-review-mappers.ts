import { Prisma } from '@prisma/client';
// 신뢰 등급 경계는 team-trust-aggregation.ts의 단일 정의를 쓴다 — 예전엔 여기에도 사본이 있었고,
// 그런 복제가 "DB 저장값과 화면 재계산값이 갈라지는" 사고의 원인이었다(reviews.service.ts 하단 주석 참고).
import { trustStateForReviewCount } from './team-trust-aggregation';

export const TOURNAMENT_FIXTURE_SOURCE_TYPE = 'tournament_fixture' as const;
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
export type TournamentFixture = Prisma.V1TeamMatchGetPayload<{
  select: ReturnType<typeof tournamentFixtureSelect>;
}>;
export type CanonicalTournamentFixture = TournamentFixture & {
  tournamentId: string;
  leagueId: null;
  tournament: NonNullable<TournamentFixture['tournament']>;
  tournamentDetails: NonNullable<TournamentFixture['tournamentDetails']>;
};
export type ReviewWithIncludes = Prisma.V1PostEventReviewGetPayload<{
  include: ReturnType<typeof reviewInclude>;
}>;
export type ExistingReviewWithIncludes = ReviewWithIncludes & { __alreadySubmitted: true };

export function tournamentFixtureSelect() {
  return {
    id: true,
    title: true,
    status: true,
    completedAt: true,
    startAt: true,
    sportId: true,
    tournamentId: true,
    leagueId: true,
    updatedAt: true,
    // Canonical eligibility uses only the current official revision; VOID is not eligible.
    game: {
      select: {
        id: true,
        sourceType: true,
        currentOfficialRevision: { select: { id: true, state: true, officialAt: true } },
      },
    },
    tournament: { select: { title: true, sportId: true } },
    tournamentDetails: {
      select: {
        tournamentId: true,
        teamMatchId: true,
        round: true,
        fixtureNumber: true,
        homeRegistration: { select: { id: true, teamId: true, team: { select: teamSelect() } } },
        awayRegistration: { select: { id: true, teamId: true, team: { select: teamSelect() } } },
      },
    },
  } as const;
}

/** 상대팀 로스터(개인 후기 대상)를 읽을 때 쓰는 select. 실명(realName)은 응답에 싣지 않는다 — 닉네임만 노출한다. */
export function rosterPlayerSelect() {
  return {
    userId: true,
    user: { select: userSelect() },
  } as const;
}

export type RosterPlayer = Prisma.V1TournamentPlayerGetPayload<{ select: ReturnType<typeof rosterPlayerSelect> }>;

/** Canonical review eligibility is driven only by the current OFFICIAL revision. */
export function officialResultTimestamp(fixture: TournamentFixture): Date | null {
  const revision = fixture.game?.currentOfficialRevision;
  return revision?.state === 'OFFICIAL' ? revision.officialAt : null;
}

/** Canonical tournament review source guard. Legacy fixture rows are intentionally not accepted. */
export function isCanonicalTournamentFixture(fixture: TournamentFixture): fixture is CanonicalTournamentFixture {
  const details = fixture.tournamentDetails;
  return Boolean(
    fixture.tournamentId &&
      fixture.leagueId === null &&
      fixture.tournament &&
      fixture.game?.sourceType === 'TEAM_MATCH' &&
      details &&
      details.teamMatchId === fixture.id &&
      details.tournamentId === fixture.tournamentId,
  );
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

export function fixtureTeams(fixture: CanonicalTournamentFixture) {
  if (!fixture.tournamentDetails.homeRegistration || !fixture.tournamentDetails.awayRegistration) return null;
  return {
    home: teamInfo(fixture.tournamentDetails.homeRegistration),
    away: teamInfo(fixture.tournamentDetails.awayRegistration),
  };
}

export function fixtureTitle(fixture: CanonicalTournamentFixture) {
  const details = fixture.tournamentDetails;
  return `${fixture.tournament.title} · ${details?.round ?? '대회'} ${details?.fixtureNumber ?? ''}경기`;
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

/**
 * @param reviewCount 후기를 쓴 **팀 수**(작성자 수가 아니다). 팀 후기는 참가팀 멤버 전원이
 *   쓸 수 있으므로 작성자 수로 세면 한 경기만 뛰어도 `trustStateForReviewCount`의 최고
 *   등급(3건)에 닿아 지표가 무력화된다 — 집계 쪽에서 팀 단위로 접은 값을 넘겨야 한다.
 * @param avgRating 팀별 평균 rating들의 평균("팀 평균 1표"). 원시 평균이 아니다.
 */
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

/**
 * 내가 참가팀으로 서 있는 팀 중 이 경기에 나온 팀 전부.
 * 양 팀 모두의 active 멤버인 사람은 두 방향의 후기를 각각 남길 수 있으므로
 * 하나로 좁히지 않고 전부 돌려준다 — 예전에는 이 경우를 모호하다고 보고 아예 막았다.
 */
export function resolveReviewerTeamIds(teamIds: string[], homeTeamId: string, awayTeamId: string) {
  return [homeTeamId, awayTeamId].filter((teamId) => teamIds.includes(teamId));
}

/**
 * 대회 후기의 "이미 썼음" 판정 키. 중복 방지 스코프가 대회(sourceGroupId) 단위인 것은
 * 그대로지만, 주체는 팀이 아니라 **사람**이다 — 팀 기준으로 키를 잡으면 한 명이 쓴 순간
 * 같은 팀원 전원의 pending 목록에서 그 경기가 사라진다.
 */
export function teamReviewKey(sourceGroupId: string, reviewerUserId: string, targetTeamId: string) {
  return `${sourceGroupId}:${reviewerUserId}:${targetTeamId}`;
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

function teamInfo(registration: NonNullable<NonNullable<TournamentFixture['tournamentDetails']>['homeRegistration']>) {
  return {
    // 로스터(V1TournamentPlayer)는 팀이 아니라 "이 대회의 등록"에 달려 있으므로, 개인 후기 대상 명단을
    // 뽑으려면 teamId가 아니라 registrationId가 필요하다.
    registrationId: registration.id,
    teamId: registration.teamId,
    name: registration.team.name,
    imageUrl: registration.team.profile?.logoUrl ?? null,
  };
}

export function decimalScore(avgRating: number | null) {
  return avgRating === null ? null : new Prisma.Decimal(avgRating.toFixed(2));
}
