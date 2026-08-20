export const gameSchemaFixture = {
  gameId: '00000000-0000-4000-8000-000000000901',
  secondGameId: '00000000-0000-4000-8000-000000000902',
  teamMatchId: '00000000-0000-4000-8000-000000000911',
  tournamentFixtureId: '00000000-0000-4000-8000-000000000912',
  secondTournamentFixtureId: '00000000-0000-4000-8000-0000000009e1',
  sportId: '00000000-0000-4000-8000-000000000913',
  regionId: '00000000-0000-4000-8000-000000000914',
  teamId: '00000000-0000-4000-8000-000000000915',
  configId: '00000000-0000-4000-8000-000000000921',
  secondConfigId: '00000000-0000-4000-8000-000000000922',
  sideHomeId: '00000000-0000-4000-8000-000000000931',
  sideAwayId: '00000000-0000-4000-8000-000000000932',
  lineupId: '00000000-0000-4000-8000-000000000941',
  participantId: '00000000-0000-4000-8000-000000000951',
  revisionId: '00000000-0000-4000-8000-000000000961',
  secondRevisionId: '00000000-0000-4000-8000-000000000962',
  fieldId: '00000000-0000-4000-8000-000000000971',
  secondFieldId: '00000000-0000-4000-8000-000000000972',
  tournamentId: '00000000-0000-4000-8000-000000000981',
  secondTournamentId: '00000000-0000-4000-8000-000000000982',
  userId: '00000000-0000-4000-8000-000000000991',
  secondUserId: '00000000-0000-4000-8000-000000000992',
  requestId: '00000000-0000-4000-8000-0000000009a1',
  linkId: '00000000-0000-4000-8000-0000000009b1',
  now: new Date('2026-07-29T00:00:00.000Z'),
} as const;

// Re-pinned for the expand/contract migration-gate split
// (fix/v1-expand-contract-split). Both hashes changed this time:
// - schema: competitionConfigVersionId went from required-with-@default to
//   optional/no-default on V1TeamMatch/V1Tournament/V1TournamentFixture
//   (their `competitionConfig` relations became optional to match) — that
//   column's SET NOT NULL/SET DEFAULT moved to a deferred contract-phase
//   migration; see docs/ops/task9-competition-config-contract-phase.md.
//   V1Notification.businessKey keeps its `@unique` (deferring
//   v1_notifications_business_key_key turned out to be unsafe, not just a
//   gate nuance — game-result-submitted-escalation.service.ts's
//   notifyReviewer() relies on `INSERT ... ON CONFLICT (business_key)`
//   against an index that must actually exist, confirmed by running the
//   Task 22 result-review integration suite against a build that deferred
//   it), so schema.prisma's byte diff from the previous pin is narrower
//   than the first draft of this comment described.
// - migration (20260729000100_v1_game_operations): "V1EscalationKind" is now
//   created directly as ('ESCALATION', 'REMINDER') — its final order —
//   instead of ('REMINDER', 'ESCALATION') + a later rename/recreate/
//   alter-column/drop dance in 20260802000300_v1_result_escalation_lifecycle,
//   which scripts/qa/check-expand-contract-migrations.mjs rejected as
//   non-additive on a pre-existing type. No table, column, index, or FK in
//   this migration changed shape.
// Re-pinned for Task T1-2 (assist column, FOUL event type, result
// aggregation columns). Only apps/v1_api/prisma/schema.prisma changed:
// V1GameEventType.FOUL, V1GameEvent.assistParticipantId,
// V1GameResultParticipant.assists/fouls. The migration hash is UNCHANGED —
// this task's migration is a new file
// (20260807090000_v1_game_assist_foul_columns), not an edit to the bound
// 20260729000100_v1_game_operations migration.
// Re-pinned for T4 (team-match-series). Additive only: V1TeamMatchSeriesState enum,
// V1TeamMatchSeries/V1TeamMatchSeriesTeam models, V1TeamMatch.seriesId + its index,
// and back-relation array fields on V1Sport/V1Region/V1AdminUser/V1Team. No existing
// field/type/attribute was modified. The migration hash below is UNCHANGED — this
// branch adds a new migration file, it does not edit the bound
// 20260729000100_v1_game_operations migration.
// Re-pinned again (same T4 branch, CI-fixed): V1TeamMatchSeriesTeam's
// @@unique([seriesId, teamId]) got an explicit map: to match the committed
// migration's constraint name (v1_team_match_series_teams_series_team_key)
// instead of Prisma's default name — the migrate-diff zero-drift gate was
// failing on that rename. No shape change; migration hash still unchanged.
//
// Re-pinned once more when T1-2 (assist/foul) and T4 (series) met on dev. Each
// branch had pinned the hash of its own schema.prisma, so the two pins collided
// here while schema.prisma itself merged cleanly. The value below is the sha256
// of the MERGED file, computed with `shasum -a 256` — it is not either branch's
// value. Both sets of changes are present and both are additive; the bound
// migration is untouched, so `migration` stays as it was.
// Re-pinned for 레인 schedule (매치 ↔ 팀일정 연동): V1TeamSchedule gained
// `@@unique([teamId, teamMatchId])` (belt-and-suspenders against a duplicate
// system-generated schedule for the same team+match). Additive-only index
// change, no column/type/FK touched.
// Re-pinned for the match-conditions lane: V1TeamMatch gained matchFormat/
// matchStyle/uniformColor (additive, nullable/default-[]).
// Re-pinned for the pause-aware clock fix (2026-08): V1GamePeriod gained
// `pausedTotalMs`/`pausedAt` (both additive — Int default 0, nullable
// DateTime) so `pause`/`resume` can exclude a stoppage from the elapsed-time
// display and `freezeCapture()`'s `clockMs` instead of both ticking through it.
//
// All three arrived in the same merge, each having pinned the hash of its own
// schema.prisma while schema.prisma itself merged cleanly. The value below is
// the sha256 of the MERGED file — no branch's standalone value — computed by
// running `shasum -a 256` against it, not carried over from a review comment.
// Every one of these migrations is a new file; the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration`
// stays as it was.
// Re-pinned for the tournament natural-key lane (Part 2 upsert foundation):
// V1TournamentGroup gained @@unique([tournamentId, name]) and
// V1TournamentFixture gained @@unique([tournamentId, round, fixtureNumber,
// legNumber]) — the natural keys the alpha QA seed will upsert on instead of
// delete-then-recreate. Additive-only index attributes; no column/type/FK
// changed shape. Two new migration files back them
// (20260809140000_v1_tournament_group_natural_key,
// 20260809140100_v1_tournament_fixture_natural_key); the bound
// 20260729000100_v1_game_operations migration is untouched.
//
// The natural-key lane and the pause-aware clock met here: each had pinned the
// hash of its own schema.prisma while schema.prisma itself merged cleanly. The
// value below is the sha256 of the MERGED file, produced by running
// `shasum -a 256` against it — neither branch's standalone value.
// Re-pinned for the operation-gate DB switch: the simplified admin toggle moved
// off the `V1_ALLOW_SIMPLIFIED_OPERATION_FLAG_GATE` env var onto a new
// `V1GameOperationGateSetting` singleton model (table
// v1_game_operation_gate_settings). Purely additive — a brand-new model with its
// own table, no column/type/FK on any existing model touched, and nothing in the
// game-operations schema itself changed shape. One new migration file backs it
// (20260810120000_v1_operation_gate_setting); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps
// its value. Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for the theme-preference lane: V1ThemePreference enum + V1User.themePreference
// (light/dark/system, default light) — unrelated to game operations, additive-only,
// no column/type/FK on any existing game-domain model touched. One new migration
// file backs it (20260810045157_v1_theme_preference); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps
// its value. Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for issue #375 (하프타임 분리): V1GamePeriodState gains a HALFTIME value so
// "current period ended, next not started yet" is an explicitly observable state instead of
// an implicit combination. Unlike the two re-pins above, this one DOES touch the game
// domain — that is why this guard fired, and it fired correctly. It is still additive:
// `ALTER TYPE ... ADD VALUE 'HALFTIME'` adds an enum member without touching any existing
// row, column, or FK, and no pre-existing state (SCHEDULED/LIVE/ENDED) changes meaning —
// only the new `endCurrentPeriod`/`startNextPeriod` commands ever write HALFTIME. One new
// migration file backs it (20260812000000_v1_game_period_halftime_state); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps its value.
// Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for 팀 후기 작성 권한 개방: V1PostEventReview swaps its two team-scoped unique keys
// for person-scoped ones (reviewer_team_id -> reviewer_user_id) so every member of a
// participating team can submit a review instead of only the owner/manager. Like the theme
// preference re-pin and unlike the HALFTIME one, this does NOT touch the game domain — no
// v1_game_* model, enum, or relation changes; the guard fired only because it hashes the whole
// schema.prisma file. One new migration file backs it
// (20260812231238_v1_post_event_review_reviewer_user_unique); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps its value.
// Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for 대회 개인 후기: V1UserReputationSummary gains four tournament_* columns so
// tournament-sourced personal reviews aggregate separately from casual-match ones (mirroring the
// V1TeamTrustScore.tournament_* split), and V1PostEventReview gains a tournament-scoped unique key.
// Same shape as the two review re-pins above — no v1_game_* model, enum, or relation changes; the
// guard fired only because it hashes the whole schema.prisma file. One new migration file backs it
// (20260813061500_v1_tournament_personal_review_scope); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps its value.
// Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for 대회 라인업의 등록 명단 연결: V1GameParticipant gains a nullable `user_id` so a
// saved tournament lineup can be matched back against the tournament roster by person instead of
// by display-name string (동명이인이면 이름 매칭은 선발 표시를 엉뚱한 사람에게 붙인다). Like the
// HALFTIME re-pin and unlike the review ones, this DOES touch the game domain — that is why this
// guard fired, and it fired correctly. It is still additive: the column is nullable with no
// default, so every existing participant row keeps its exact meaning (null = 이 컬럼이 없던 시절에
// 저장됐거나 사용자 계정을 쓰지 않는 team-match 경로), and no enum, relation, or FK changes. One
// new migration file backs it (20260813190000_v1_game_participant_user_id); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps its value.
// Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for 대회 후기 팀 귀속: V1TournamentReview gains a nullable `team_id` (+ V1Team
// relation and a (tournament_id, team_id) unique) so a tournament review belongs to the team
// rather than to whoever pressed the apply button — 팀장이 신청했으면 운영진이 후기를 쓸 수도,
// 우리 팀이 이미 썼는지 볼 수도 없었다. Same shape as the review re-pins above and unlike the
// HALFTIME/user_id ones, this does NOT touch the game domain — no v1_game_* model, enum, or
// relation changes; the guard fired only because it hashes the whole schema.prisma file. The
// column is nullable by design: the backfill leaves ambiguous legacy rows unmapped rather than
// guessing, and NULLs do not collide under the new unique (Postgres NULL-distinct). One new
// migration file backs it (20260813070000_v1_tournament_review_team_scope); the bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps its value.
// Recomputed with `shasum -a 256` against the file on this branch.
// Re-pinned for 라인업 기반 신원 연결: `V1IdentityLinkAction` gains `ROSTER_ASSERTED` and a new
// `V1UserRecordConsent` model lands. Unlike the 대회 후기 팀 귀속 re-pin above, this one *does*
// touch the game domain — the identity-link enum is read by `v1_guard_identity_event`, so the
// guard firing here is the intended signal, not incidental file-hash noise. The new action is
// additive and deliberately outside that trigger's `ATTESTED`/`EXPIRED` branch: roster
// attribution records a squad-list fact rather than a two-party attestation, so a player who is
// also the manager can be linked from their own lineup save. `V1GameParticipant.user_id` is in
// this diff too but is owned by 20260813190000_v1_game_participant_user_id (dev), not by this
// branch. Backing migration: 20260813120000_v1_roster_identity_link — verified by replaying the
// full chain against an empty database (`prisma migrate deploy`) plus a drift check
// (`prisma migrate diff --exit-code` → "No difference detected"). The bound
// 20260729000100_v1_game_operations migration is untouched, so `migration` keeps its value.
// Recomputed with `shasum -a 256` against the file on this branch.
export const gameSchemaSourceManifest = {
  // 팀 라인업 재사용(2026-08-13)과 dev의 스키마 변경이 여기서 만났다. 두 브랜치가
  // 각자 자기 schema.prisma 해시를 못 박아 둔 탓에 이 값만 충돌했고, schema.prisma
  // 자체는 깨끗하게 병합됐다 — 그래서 아래 값은 어느 쪽 브랜치의 값도 아니라
  // **병합된 파일**에 `shasum -a 256`을 돌려 새로 계산한 것이다(이 파일의 기존
  // 재-pin 주석들이 따르는 관례 그대로). 이번 브랜치가 더한 것은 라인업 프리셋
  // 테이블 2개와 v1_team_memberships.jersey_number이고, 둘 다 새 마이그레이션
  // 파일로 들어가므로 바인딩된 20260729000100_v1_game_operations 마이그레이션은
  // 건드리지 않았다 — migration 해시가 그대로인 이유다.
  // 개인 어워드 icon_key는 game domain 밖의 nullable 컬럼이지만 이 guard는 전체
  // schema.prisma 바이트를 결속한다. 전용 20260815193000 migration의 빈 DB replay와
  // drift 검증을 통과한 스키마 해시로 재고정하며 game operations migration은 불변이다.
  // 대회 후기의 "팀당 1건" unique(@@unique([tournamentId, teamId]))를 뺐다. game domain 밖의
  // 제약이지만 이 guard 는 schema.prisma 전체 바이트를 결속하므로 여기서 걸린다 — 파일 해시
  // 노이즈이지 game operations 계약 변화가 아니다. 전용 마이그레이션
  // 20260817120000_v1_tournament_review_drop_team_unique 의 빈 DB replay + drift 검증을 통과한
  // 스키마로 재고정하며, 바인딩된 20260729000100_v1_game_operations 는 건드리지 않았다.
  // 2026-08-17 재핀: 리그전 통합 순위(V1TournamentOverallStanding) 신규 테이블 +
  // V1Tournament.minMatchesPerTeam + V1TournamentStanding.fairPlayPoints 추가.
  // 게임 도메인(V1Game*) 모델은 건드리지 않았고 전부 additive다.
  // 뒷받침 마이그레이션: 20260817000000_v1_tournament_league_format.
  // 이 값은 위 두 변경(dev 의 후기 unique 제거 + 이 브랜치의 리그전)이 **병합된 뒤**의
  // schema.prisma 에 `shasum -a 256` 을 돌려 재계산한 것이다 — 어느 한쪽 브랜치의 해시를
  // 그대로 가져오면 병합 결과와 달라 SOURCE_SNAPSHOT_DRIFT 로 CI 가 깨진다.
  // migration 해시는 양쪽 다 새 마이그레이션 파일만 추가했으므로 그대로다.
  // 2026-08-18 재핀: 대회 경기 기록 실명 표시 정책 뒤집기(F2 record-consent와 별개 스위치) --
  // V1UserProfile.tournamentRealNameVisible(Boolean, default false) 추가. game domain 밖의
  // 컬럼이지만 이 guard는 schema.prisma 전체 바이트를 결속하므로 여기서 걸린다 — 파일 해시
  // 노이즈이지 game operations 계약 변화가 아니다. 전용 마이그레이션
  // 20260818000000_v1_tournament_real_name_visibility 로 뒷받침되며, NOT NULL + DEFAULT
  // 추가라 양방향 롤링 배포에 안전하다. 바인딩된 20260729000100_v1_game_operations 는
  // 건드리지 않았으므로 migration 해시는 그대로다.
  // 2026-08-18 재핀: 경기 후기 4항목 채점 재설계(스펙 §4) -- enum 4종 신규
  // (V1PostEventReviewMetric/ScoringVersion/RiskRule/RiskFlagStatus), V1PostEventReviewStatus 에
  // flagged/archived 2값 추가, 모델 2개 신규(V1PostEventReviewMetricScore /
  // V1PostEventReviewRiskFlag), V1PostEventReview.scoringVersion, V1TeamTrustScore 및
  // V1UserReputationSummary 에 metric_* 컬럼 10개씩. 전부 additive 이고 game domain(V1Game*)
  // 모델은 한 줄도 건드리지 않았다 -- 이 guard 가 schema.prisma **전체 바이트**를 결속하기
  // 때문에 걸리는 것이지 game operations 계약이 바뀐 게 아니다. 뒷받침 마이그레이션은
  // 20260817010000_v1_post_event_review_scoring_redesign 이며, 바인딩된
  // 20260729000100_v1_game_operations 는 그대로라 migration 해시는 변하지 않는다.
  // 2026-08-18 재핀: 일반 리그 재명명의 **확장(expand) 단계** -- V1League / V1LeagueTeam
  // 신규 모델, V1LeagueState enum, V1TeamMatch.leagueId 신규 nullable 컬럼. 전부 additive 이고
  // 구 모델(V1TeamMatchSeries*)과 구 컬럼(seriesId)은 **그대로 살려 둔다** -- 롤링 배포 창에서
  // 구버전 컨테이너가 계속 그것을 읽기 때문이다(deploy-alpha.sh 가 migrate 를 컨테이너 교체보다
  // 먼저 돌린다). 구 이름 제거는 별도 릴리스(수축 단계)에서 한다.
  // game domain(V1Game*) 모델은 건드리지 않았다 -- 이 guard 가 schema.prisma 전체 바이트를
  // 결속하기 때문에 걸리는 것이지 game operations 계약이 바뀐 게 아니다. 뒷받침 마이그레이션은
  // 20260818120000_v1_league_expand 이며, 바인딩된 20260729000100_v1_game_operations 는
  // 그대로라 migration 해시는 변하지 않는다.
  // 2026-08-18 재핀: 리뷰 작성 가능 기간을 48시간 하드코딩에서 어드민 편집 설정으로 바꾸며
  // 싱글턴 모델 V1ReviewPolicySettings 1개를 신규 추가했다(reviewWindowHours 기본 168시간).
  // 순수 additive 이고 game domain(V1Game*) 모델·enum 은 한 줄도 건드리지 않았다 -- 이 guard 가
  // schema.prisma **전체 바이트**를 결속하기 때문에 걸리는 것이지 game operations 계약 변경이 아니다.
  // 뒷받침 마이그레이션은 20260818120000_v1_review_policy_settings 이며, 바인딩된
  // 20260729000100_v1_game_operations 는 그대로라 migration 해시는 변하지 않는다.
  // 위 두 재핀이 **병합된 뒤**의 schema.prisma 에 shasum 을 다시 돌려 계산한 값이다 --
  // 어느 한쪽 브랜치의 해시를 그대로 쓰면 병합 결과와 달라 SOURCE_SNAPSHOT_DRIFT 로 CI 가 깨진다.
  // 2026-08-19 재핀: 리그 재명명의 **수축(contract) 단계** -- 구 모델
  // V1TeamMatchSeries / V1TeamMatchSeriesTeam, enum V1TeamMatchSeriesState,
  // V1TeamMatch.seriesId 와 그 relation·인덱스를 제거했다. 이번엔 additive 가 아니라
  // **삭제**이며, 확장 단계(20260818120000_v1_league_expand)가 이미 배포돼 모든 컨테이너가
  // 신 이름만 읽는 상태에서만 안전하다. game domain(V1Game*) 모델은 건드리지 않았고
  // 바인딩된 20260729000100_v1_game_operations 도 그대로라 migration 해시는 변하지 않는다.
  // 뒷받침 마이그레이션: 20260819100000_v1_league_contract.
  // 2026-08-20 재핀: 대회 수상자 계정 연결을 위해 V1TournamentAward 에 nullable
  // recipientUserId relation/index를 추가했다. game domain 모델·바인딩된 game operations
  // migration은 바뀌지 않았으며 뒷받침 마이그레이션은
  // 20260820180000_v1_tournament_award_recipient_user 이다.
  schema: '14b574339e01d6d73dea6f3c1eaab12c8c6cf9db9379e001f5f360ea2204d24c',
  migration: '6bd7fae42e9ee7debff71d26f7252d220ad2c12ae6f14745d103fc7fa61e8f64',
} as const;

type GameSchemaSourcePaths = {
  schema: string;
  migration: string;
};

export function verifyGameSchemaSourceSnapshot(
  manifest: Pick<typeof gameSchemaSourceManifest, 'schema' | 'migration'>,
  candidates: GameSchemaSourcePaths,
) {
  for (const [name, path, expected] of [
    ['schema', candidates.schema, manifest.schema],
    ['migration', candidates.migration, manifest.migration],
  ] as const) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== expected) {
      throw new Error(`SOURCE_SNAPSHOT_DRIFT: ${name} bytes differ from bound source snapshot`);
    }
  }
}

export function gameConfigData(id: string = gameSchemaFixture.configId) {
  return {
    id,
    sportCode: 'FOOTBALL',
    name: 'football-v1',
    version: 1,
    periods: [{ number: 1, durationSeconds: 1800 }, { number: 2, durationSeconds: 1800 }],
    events: ['GOAL', 'CARD', 'SUBSTITUTION'],
    lineup: { minimum: 5, maximum: 18 },
    result: { requiresScorer: false },
    tieBreak: { order: ['points', 'goalDifference', 'goalsFor'] },
    visibility: { default: 'LIVE' },
    contentHash: `fixture-${id}`,
    createdAt: gameSchemaFixture.now,
    updatedAt: gameSchemaFixture.now,
  };
}

export function gameData(overrides: Record<string, unknown> = {}) {
  return {
    id: gameSchemaFixture.gameId,
    sourceType: 'TEAM_MATCH' as const,
    teamMatchId: gameSchemaFixture.teamMatchId,
    tournamentFixtureId: null,
    state: 'SCHEDULED' as const,
    version: 0,
    lastSequence: 0,
    competitionConfigVersionId: gameSchemaFixture.configId,
    createdAt: gameSchemaFixture.now,
    updatedAt: gameSchemaFixture.now,
    ...overrides,
  };
}
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
