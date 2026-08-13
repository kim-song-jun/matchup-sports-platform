import { Prisma } from '@prisma/client';
import { resolveTournamentFixtureOfficialTimestamp } from '../tournaments/tournament-fixture-official-result';
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
    // sportId: 개인 후기 행의 sportId 스냅샷 — 종목별 받은 후기 집계(ReviewsService.receivedSummary)가
    // sportId 없는 행을 레거시로 취급해 통째로 빼기 때문에, 대회 개인 후기도 종목을 실어야 집계에 잡힌다.
    tournament: { select: { title: true, sportId: true } },
    // registration id: 상대팀 등록 로스터(V1TournamentPlayer)를 조회하는 키. 개인 후기 대상 명단의 근거다.
    homeRegistration: { select: { id: true, teamId: true, team: { select: teamSelect() } } },
    awayRegistration: { select: { id: true, teamId: true, team: { select: teamSelect() } } },
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

export function resolveReviewerTeamId(teamIds: string[], homeTeamId: string, awayTeamId: string) {
  const matches = teamIds.filter((teamId) => teamId === homeTeamId || teamId === awayTeamId);
  return matches.length === 1 ? matches[0] : null;
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

function teamInfo(registration: NonNullable<TournamentFixture['homeRegistration']>) {
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
