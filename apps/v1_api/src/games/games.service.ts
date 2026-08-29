import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  V1ConsentState,
  V1GameEventType,
  V1GameLineupState,
  V1GamePeriodState,
  V1GameResultRevisionState,
  V1GameSourceType,
  V1GameState,
  type V1GameParticipant,
  V1IdentityActorType,
  V1IdentityLinkAction,
  V1TeamMatchStatus,
  type V1TournamentStaffRole,
  V1VisibilityMode,
  type V1GameEvent,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type {
  JsonValue as AuditJsonValue,
  OperationAuditActor,
} from '../common/audit/operation-audit.contract';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateSuspension,
  suspensionRulesEnabled,
  type PlayedGameCards,
} from '../tournaments/discipline/card-suspension';
import { cascadeCompleteTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import {
  parseLineupCatalog,
  parseLineupConfigForResponse,
  parseLineupLimits,
  parsePeriodDurations,
  parseResultPolicy,
} from '../tournaments/competition-config/competition-config.parse';
import { readIsKnockoutFixture, readKnockoutFixtureFacts } from '../tournaments/knockout-fixture';
import { assertPenaltyShootoutPersistable } from './core/penalty-shootout-outcome';
import { isCommandConcurrencyConflict } from './command-concurrency-error';
import {
  assertBracketResolvable,
  assertPenaltiesNotAllowed,
  needsKnockoutFixtureFacts,
  type StoredPenalties,
} from './core/knockout-penalties';
import { GameTakeoverService } from './game-takeover.service';
import {
  writeIdentityAttestRequestNotifications,
  type IdentityAttestPushPlan,
  writeIdentityAttestDecisionNotification,
  type IdentityAttestDecisionPushPlan,
} from './identity-attest-notification';
import {
  IDENTITY_LINK_REQUEST_TTL_MS,
  scheduleIdentityLinkExpiry,
} from '../jobs/identity-link/identity-link-expiry.service';
import { WebPushService } from '../notifications/web-push.service';
import {
  decideTournamentStaffAccess,
  type TournamentStaffAction,
  type TournamentStaffRole,
} from '../tournaments/staff/tournament-staff-policy';
import {
  assertGameCommandContext,
  assertGameLifecycleTransition,
  assertGameSourceCreationInput,
  assertRevisionSupersession,
  assertRevisionTransition,
  deriveAppearedParticipantIds,
  GameContractError,
  projectParticipantForPublic,
  resolveGameIdempotency,
  selectLatestLineupParticipants,
  serializeGameVisibility,
  validateGameResultInvariants,
  validateSubstitution,
  type PublicParticipantProjection,
} from './core';
import type {
  GameActorScope,
  GameCommandContext,
  GameCreationResult,
  GameEventAppendResult,
  GameMutationResult,
  PersistedGameEvent,
  GameResultEvent,
  GameResultParticipant,
  GameRevisionMutationResult,
  GameScore,
  GameSourceCreationInput,
} from './games.types';
import type { CancelGameDto, GameCommandDto } from './dto/game-command.dto';
import type {
  AppendGameEventDto,
  AssignGoalAssistDto,
  ReverseGameEventDto,
} from './dto/game-event.dto';
import type {
  SaveGameLineupDto,
  SubmitGameLineupDto,
} from './dto/game-lineup.dto';
import type {
  CreateGameResultRevisionDto,
  DecideGameResultRevisionDto,
  GameResultRecoveryDto,
  SubmitGameResultRevisionDto,
  VoidTeamMatchResultDto,
} from './dto/game-result.dto';
import type {
  AttestIdentityLinkDto,
  GrantParticipantConsentDto,
  RequestIdentityLinkDto,
  RevokeIdentityLinkDto,
  RevokeParticipantConsentDto,
} from './dto/game-participant-identity.dto';

type Transaction = Prisma.TransactionClient;
type CommandResult = object;
// Exhaustive list of every `v1_outbox_events.type` value this service ever
// writes — see writeOutbox()'s docblock for why this exists. Each member
// must have a registered handler in v1-game-operations-worker.service.ts's
// constructor (or the worker main.ts bootstrap) or it will retry 6 times
// and end up POISONED forever.
type GamesOutboxEventType =
  | 'GAME_RESULT_SUBMITTED'
  | 'GAME_RESULT_OFFICIAL'
  | 'GAME_RESULT_CHANGE_REQUESTED'
  // D2: TEAM_MATCH 결과 무효화(voidTeamMatchResult) 가 쓴다. 이미
  // GameResultVoidProjectionService 가 이 타입으로 워커에 등록돼 있다(대회 레인의
  // voidResultRevision 이 먼저 썼다) -- 핸들러가 sourceType 을 가리지 않는 범용
  // 투영이라 새 핸들러 등록 없이 그대로 재사용한다.
  | 'GAME_RESULT_VOIDED';
type GameAuthorizationAction =
  | 'read'
  | 'tournament_command'
  | 'event_append'
  | 'event_reverse'
  | 'lineup_mutate'
  | 'team_result_submit'
  | 'opponent_result_decide'
  // D1-a: TEAM_MATCH 전용 결과 정정(이미 OFFICIAL 인 결과를 새 DRAFT 로 슈퍼시드했다가
  // 다시 OFFICIAL 로 승격). team_result_submit/opponent_result_decide 와 달리 이
  // 액션은 팀 소속(host/opponent)만으로는 절대 통과시키지 않는다 — resolveActor 의
  // TEAM_MATCH 분기가 명시적으로 forbidden 을 던진다. 오직 admin 패스스루(이 함수보다
  // 먼저 검사된다)만 통과할 수 있다.
  | 'team_result_correction'
  // D2: 이의(dispute) 제기 -- 참가 두 팀(host/opponent) 중 어느 쪽이든 owner/manager면
  // 낼 수 있다. team_result_correction 과 달리 이 액션은 **명시적으로 특수 취급하지
  // 않는다** -- resolveActor TEAM_MATCH 분기 맨 아래 공용 fallback
  // (`managerRole(hostMembership) ?? managerRole(opponentMembership)`)이 정확히
  // "두 팀 중 하나의 owner/manager" 규칙과 일치하므로 그대로 통과시킨다.
  | 'team_result_dispute_file'
  // D2: 이의 수락 시 운영자가 고르는 무효(void) 처리 -- team_result_correction 과
  // 완전히 같은 이유로 팀 소속 fallback 을 명시적으로 차단해야 한다(그러지 않으면
  // 상대팀 매니저가 자기에게 불리한 결과를 스스로 무효화할 수 있는 구멍이 생긴다).
  | 'team_result_void'
  | 'cancel'
  | 'participant_identity';

type LockedGame = {
  id: string;
  sourceType: V1GameSourceType;
  teamMatchId: string | null;
  tournamentFixtureId: string | null;
  state: V1GameState;
  version: number;
  lastSequence: number;
  competitionConfigVersionId: string;
};

type CommandBoundaryInput = {
  gameId: string;
  action: string;
  actor: GameActorScope;
  expectedVersion: number;
  headerIdempotencyKey: string | undefined;
  bodyCommandId: string;
  takeoverToken?: string;
  payload: unknown;
  /** Lineup commands own their concurrency boundary per side/revision. The game row is still
   * locked and versioned for aggregate ordering, but an opponent lineup command must not make
   * this side's editor stale. The mutation callback must enforce the resource revision. */
  versionScope?: 'game' | 'lineup';
};

type ImmutableGameEventInput = Omit<AppendGameEventDto, 'expectedVersion' | 'clientEventId' | 'takeoverToken'>;

export type RetryGameEventInput = {
  rebasedExpectedVersion: number;
  clientEventId: string;
  takeoverToken: string;
  payloadHash: string;
  event: ImmutableGameEventInput;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalGameCommandPayloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

function immutableGameEventPayload(dto: AppendGameEventDto): ImmutableGameEventInput {
  return {
    type: dto.type,
    ...(dto.sideId === undefined ? {} : { sideId: dto.sideId }),
    ...(dto.participantId === undefined ? {} : { participantId: dto.participantId }),
    ...(dto.assistParticipantId === undefined ? {} : { assistParticipantId: dto.assistParticipantId }),
    period: dto.period,
    clockMs: dto.clockMs,
    occurredAt: dto.occurredAt,
    payload: dto.payload,
  };
}

function parseStoredGameEventAppendResult(value: unknown): GameEventAppendResult | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  if (
    !('gameId' in value) ||
    !('state' in value) ||
    !('version' in value) ||
    !('durableCommandId' in value) ||
    !('replayed' in value) ||
    !('clientEventId' in value) ||
    !('sequence' in value)
  ) {
    return null;
  }
  const state = Object.values(V1GameState).find((candidate) => candidate === value.state);
  if (
    typeof value.gameId !== 'string' ||
    state === undefined ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    typeof value.durableCommandId !== 'string' ||
    typeof value.replayed !== 'boolean' ||
    typeof value.clientEventId !== 'string' ||
    typeof value.sequence !== 'number' ||
    !Number.isSafeInteger(value.sequence)
  ) {
    return null;
  }
  return {
    gameId: value.gameId,
    state,
    version: value.version,
    durableCommandId: value.durableCommandId,
    replayed: value.replayed,
    clientEventId: value.clientEventId,
    sequence: value.sequence,
  };
}

export function gameAuthorizationAction(action: string): GameAuthorizationAction {
  switch (action) {
    case 'game_start':
    case 'game_pause':
    case 'game_resume':
    case 'game_end':
    // 이슈 #375 — end-period/start-period/revert-period은 next_period가
    // 쓰던 자리를 그대로 물려받는다(같은 굵기의 권한: 대회 커맨드). 구
    // next_period는 배포 안전을 위해 당분간 함께 받는다(game-command.dto.ts
    // GameCommandName.next_period의 @deprecated 문서 참고).
    case 'game_end_period':
    case 'game_start_period':
    case 'game_revert_period':
    case 'game_next_period':
    case 'result_recovery_derive_and_submit':
      return 'tournament_command';
    case 'game_cancel':
      return 'cancel';
    case 'event_append':
      return 'event_append';
    case 'event_reverse':
      return 'event_reverse';
    // Issue #376: attaching/detaching an assist amends an already-recorded
    // GOAL event in place -- the same authority level as reversing one, not
    // a fresh append. Reuses the 'event_reverse' authorization bucket
    // rather than adding a new TournamentStaffAction (which would also need
    // a matching entry in tournament-staff-policy.ts's role matrix) purely
    // to express a permission set that's already identical to event_reverse
    // everywhere it's checked (resolveActor, decideTournamentStaffAccess).
    case 'event_assist_assign':
      return 'event_reverse';
    case 'lineup_save':
    case 'lineup_submit':
      return 'lineup_mutate';
    case 'result_revision_create':
    case 'result_revision_submit':
      return 'team_result_submit';
    case 'result_revision_approve':
    case 'result_revision_change_request':
      return 'opponent_result_decide';
    case 'team_result_correction_create':
    case 'team_result_correction_officialize':
      return 'team_result_correction';
    // D2: voidTeamMatchResult가 withCommand에 넘기는 명령 이름이 곧 이 액션
    // 버킷과 같은 이름이다(team_result_correction_create/_officialize처럼 별도
    // create/officialize 단계가 없는 단일 커맨드라서 나눌 이유가 없다).
    case 'team_result_void':
      return 'team_result_void';
    default:
      throw new TypeError(`Unsupported game command action: ${action}`);
  }
}

export function gameOperationAuditActor(actor: GameActorScope): OperationAuditActor {
  if (actor.actorType === 'SYSTEM') {
    return { type: 'SYSTEM', id: actor.systemActor };
  }
  if (actor.role === 'platform_ops') {
    return { type: 'PLATFORM_OPS', id: actor.actorUserId };
  }
  if (
    actor.role === 'team_manager' ||
    actor.role === 'team_owner' ||
    actor.role === 'opponent_manager'
  ) {
    return { type: 'TEAM_MANAGER', id: actor.actorUserId };
  }
  return { type: 'TOURNAMENT_STAFF', id: actor.actorUserId };
}

export function toGameHttpException(error: GameContractError): HttpException {
  const body = {
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  if (error.code === 'COMMAND_IDEMPOTENCY_KEY_MISMATCH') {
    return new UnprocessableEntityException(body);
  }
  if (
    error.code === 'EVENT_INVALID' ||
    error.code === 'PARTICIPANT_INVALID' ||
    error.code === 'PARTICIPANT_SIDE_MISMATCH' ||
    error.code === 'SCORE_EVENT_MISMATCH' ||
    error.code === 'SCORE_INVALID' ||
    error.code === 'SUBSTITUTION_INVALID' ||
    error.code === 'SUBSTITUTION_OUT_NOT_ON_PITCH' ||
    error.code === 'SUBSTITUTION_IN_ALREADY_ON_PITCH' ||
    error.code === 'SUBSTITUTION_LIMIT_REACHED'
  ) {
    return new UnprocessableEntityException(body);
  }
  return new ConflictException(body);
}

function actorStorageId(actor: GameActorScope): string {
  return actor.actorType === 'USER' ? actor.actorUserId : `SYSTEM:${actor.systemActor}`;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return canonicalize(value) as Prisma.InputJsonValue;
}

/**
 * `V1GameEvent` (the raw Prisma row from `tx.v1GameEvent.create()`) →
 * `PersistedGameEvent` (the wire shape `RealtimeGateway` broadcasts and
 * `GameEventAppendResult.event` carries). See `PersistedGameEvent`'s doc
 * comment in games.types.ts for why `occurredAt`/`receivedAt` are
 * stringified HERE rather than left as `Date` — passing raw `Date`s through
 * `jsonInput()`/`canonicalize()` (idempotency + audit storage) would
 * silently collapse them to `{}`.
 */
function toPersistedGameEvent(row: V1GameEvent): PersistedGameEvent {
  return {
    id: row.id,
    gameId: row.gameId,
    sequence: row.sequence,
    clientEventId: row.clientEventId,
    payloadHash: row.payloadHash,
    type: row.type,
    // `?? null` on every nullable column: the Prisma-generated `V1GameEvent`
    // type already promises `string | null` (never `undefined`) here, but
    // that's only as reliable as whatever produced `row` honors it — this
    // is exactly the class of bug this whole fix responds to (see this
    // function's callers' doc comments), so the conversion at the one place
    // that builds the wire/audit shape from a raw row doesn't also trust
    // that promise blindly.
    sideId: row.sideId ?? null,
    participantId: row.participantId ?? null,
    assistParticipantId: row.assistParticipantId ?? null,
    period: row.period,
    clockMs: row.clockMs,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    actorUserId: row.actorUserId,
    reversesEventId: row.reversesEventId ?? null,
    payload: jsonObject(row.payload),
  };
}

export function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

/**
 * Pure period-count derivation extracted from `GamesService.periodCount()` so
 * the fixture-game-backfill migration (apps/v1_api/src/games/migration/
 * fixture-game-backfill.ts) can reuse the EXACT same derivation instead of
 * re-transcribing it — a transcribed copy could silently drift from this one
 * if either changed independently, and a backfilled game's period count is
 * the kind of thing that only shows up as a fresh bug when someone starts a
 * legacy game with the wrong number of halves.
 */
export function computePeriodCount(periods: Prisma.JsonValue): number {
  if (Array.isArray(periods)) {
    return Math.max(1, periods.length);
  }
  const config = jsonObject(periods);
  const count = config.count;
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 2;
}

function scoreFromJson(value: Prisma.JsonValue): GameScore {
  const score = jsonObject(value);
  return {
    home: typeof score.home === 'number' ? score.home : 0,
    away: typeof score.away === 'number' ? score.away : 0,
  };
}

/**
 * Pure grouping helper backing `GamesService.listLineups()`'s `participants`
 * field (Task 21) -- kept as a standalone exported function so it is
 * unit-testable without a database. Preserves each lineup's own
 * `(jerseyNumber asc, createdAt asc)` ordering: `findMany`'s `orderBy` is a
 * property of the QUERY, not of `Map` insertion, so this only has to bucket
 * by `lineupId` without re-sorting -- the caller (`listLineups`) already
 * requested rows in the order this function must preserve per bucket.
 */
/**
 * 라인업 편집용 등록 명단을 어느 등록(registration)에서 읽을지 정한다 — 그리고 애초에
 * 읽어도 되는지도 함께 정한다.
 *
 * 참가팀 매니저·오너는 **자기 팀 사이드만** 볼 수 있다. 이걸 놓치면 상대팀 선수 실명을
 * 그대로 넘겨주는 PII 유출이 된다(라인업을 짜려면 이름이 필요해 응답에 실명이 들어간다).
 * 대회 스태프는 양 팀을 대신 짤 수 있어야 해서 이 제한을 받지 않는다 — saveLineup의
 * sideId 가드(이 파일)와 정확히 같은 판단 기준이다.
 *
 * DB를 건드리지 않는 순수 판정이라 단독으로 테스트한다(games.service.spec.ts).
 */
export function resolveLineupRosterRegistration(params: {
  actorRole: string;
  actorTeamId: string | null;
  sideTeamId: string | null;
  homeRegistration: { id: string; teamId: string } | null;
  awayRegistration: { id: string; teamId: string } | null;
}): { registrationId: string } | { denied: 'forbidden' | 'registration_not_found' } {
  const isTeamActor = params.actorRole === 'team_manager' || params.actorRole === 'team_owner';
  if (isTeamActor && params.actorTeamId !== params.sideTeamId) {
    return { denied: 'forbidden' };
  }
  const registration =
    params.homeRegistration?.teamId === params.sideTeamId
      ? params.homeRegistration
      : params.awayRegistration?.teamId === params.sideTeamId
        ? params.awayRegistration
        : null;
  // 사이드는 있는데 대회 등록이 없다 — 등록이 취소돼 fixture에서 떨어져 나간 경우다.
  // 빈 명단으로 돌려주면 "선수가 아직 없네"로 오해되므로 명시적으로 구분한다.
  return registration === null ? { denied: 'registration_not_found' } : { registrationId: registration.id };
}

/**
 * 사이드별 **최신** 라인업 상태만 남긴다. 라인업은 저장할 때마다 revision이 올라가며
 * 행이 쌓이므로, 정렬을 믿지 않고 revision을 직접 비교해 고른다 — 옛 리비전이 남으면
 * 일정 화면이 이미 제출한 라인업을 "미작성"으로 표시한다.
 */
export function latestLineupStateBySideId(
  lineups: readonly { sideId: string; state: V1GameLineupState; revision: number }[],
): Map<string, V1GameLineupState> {
  const latest = new Map<string, { state: V1GameLineupState; revision: number }>();
  for (const lineup of lineups) {
    const current = latest.get(lineup.sideId);
    if (current === undefined || lineup.revision > current.revision) {
      latest.set(lineup.sideId, { state: lineup.state, revision: lineup.revision });
    }
  }
  return new Map(Array.from(latest.entries(), ([sideId, value]) => [sideId, value.state]));
}

export function groupParticipantsByLineupId(
  participants: readonly V1GameParticipant[],
): Map<string, V1GameParticipant[]> {
  const byLineupId = new Map<string, V1GameParticipant[]>();
  for (const participant of participants) {
    const bucket = byLineupId.get(participant.lineupId);
    if (bucket === undefined) {
      byLineupId.set(participant.lineupId, [participant]);
    } else {
      bucket.push(participant);
    }
  }
  return byLineupId;
}

const CLOCK_DRIFT_TOLERANCE_MS = 30_000;

function assertClockNotDrifted(occurredAt: string): void {
  const occurredAtMs = new Date(occurredAt).getTime();
  if (!Number.isFinite(occurredAtMs) || Math.abs(Date.now() - occurredAtMs) > CLOCK_DRIFT_TOLERANCE_MS) {
    throw new UnprocessableEntityException({
      code: 'CLOCK_DRIFT',
      message: 'occurredAt has drifted from server time by more than 30 seconds',
    });
  }
}

/**
 * Pulls an optional penalty shootout score off the `end` command's
 * `payload.penalties` (the generic per-command extensibility slot every
 * `GameCommandDto` already carries -- no new command or endpoint needed,
 * matching how `start`/`pause`/`resume`/`next-period` all share the same
 * envelope). Shape/decisiveness only -- whether a shootout is even allowed
 * here (knockout fixture, regulation actually tied) is `GamesService.
 * applyPenalties`'s job, once the fixture's group is known inside the same
 * transaction. Returns `undefined` (no shootout recorded) when the key is
 * absent, exactly like every other optional command field in this file.
 *
 * Exported (like `canonicalGameCommandPayloadHash`/`groupParticipantsByLineupId`
 * elsewhere in this file) so this pure parsing rule is unit-testable without
 * a database.
 */
/**
 * `end` 커맨드 payload 에서 몰수·중단 종결 사유를 뽑는다.
 *
 * 1차 대회 회고 "몰수·중단 등 특수 상황 처리". 지금까지 운영자는 몰수를 임의 점수로
 * 수기 입력하는 수밖에 없었고, 정상 종료와 구분되지 않아 **왜 그 점수인지 근거가
 * 남지 않았다**.
 *
 * 2026-08-23 사용자 결정(Q3): 종목별 표준 스코어를 자동 부여하지 않는다. 대신
 * **사유를 필수로** 걸어 임의성이 사람 판단에 남더라도 그 판단이 기록에 남게 한다 —
 * 이 함수의 존재 이유가 그 "필수"다. 사유 없는 몰수는 여기서 422 로 막힌다.
 *
 * `extractEndPenalties` 와 같은 이유로 순수 함수다(payload 가 느슨한 레코드라 DTO
 * 검증을 못 거치고, DB 없이 단위 테스트할 수 있어야 한다).
 */
export function extractEndOutcome(payload: Record<string, unknown>): {
  outcomeReason: 'NORMAL' | 'FORFEIT' | 'ABANDONED';
  note: string | null;
} {
  const raw = payload.outcomeReason;
  if (raw === undefined || raw === null || raw === 'NORMAL') {
    return { outcomeReason: 'NORMAL', note: null };
  }
  if (raw !== 'FORFEIT' && raw !== 'ABANDONED') {
    throw new UnprocessableEntityException({
      code: 'GAME_OUTCOME_REASON_INVALID',
      message: "outcomeReason must be one of 'NORMAL', 'FORFEIT', 'ABANDONED'",
    });
  }
  const note = typeof payload.outcomeNote === 'string' ? payload.outcomeNote.trim() : '';
  if (note.length === 0) {
    throw new UnprocessableEntityException({
      code: 'GAME_OUTCOME_NOTE_REQUIRED',
      message:
        '몰수·중단으로 종료할 때는 사유를 반드시 남겨야 해요 — 나중에 왜 그 점수인지 설명할 수 있는 유일한 기록이에요.',
    });
  }
  return { outcomeReason: raw, note };
}

export function extractEndPenalties(payload: Record<string, unknown>): StoredPenalties | undefined {
  const raw = payload.penalties;
  if (raw === undefined) return undefined;
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw) ||
    typeof (raw as { home?: unknown }).home !== 'number' ||
    !Number.isInteger((raw as { home: number }).home) ||
    (raw as { home: number }).home < 0 ||
    typeof (raw as { away?: unknown }).away !== 'number' ||
    !Number.isInteger((raw as { away: number }).away) ||
    (raw as { away: number }).away < 0
  ) {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: 'penalties must be an object with non-negative integer home and away scores',
    });
  }
  const home = (raw as { home: number; away: number }).home;
  const away = (raw as { home: number; away: number }).away;
  if (home === away) {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: 'A penalty shootout must produce a decisive winner',
    });
  }
  // 선축(먼저 찬 팀). `PenaltyScoreDto`가 이미 `'HOME'|'AWAY'`만 통과시키지만, 이
  // 함수는 DTO를 거치지 않는 경로(`GameCommandDto.payload`는 느슨한 레코드다)에서도
  // 불리므로 여기서 다시 좁힌다.
  //
  // 못 쓰는 값은 **조용히 버리지 않고 422로 되돌린다.** 같은 함수가 잘못된 home/away에는
  // 이미 422를 던지는데 선축만 삼키면, 형식 오류를 어떤 것은 거부하고 어떤 것은 무시하는
  // 기준이 한 함수 안에서 갈린다. 더 나쁜 건 조용히 버릴 때의 결말이다: `'home'`(소문자)
  // 같은 오타를 보낸 운영자에게는 200이 돌아가지만 리비전에는 선축이 없고, 정정 폼에는
  // 선축 입력란이 없어 되살릴 수단도 없다 — 이 변경이 막으려던 바로 그 영구 손실이다.
  //
  // 반면 **키가 아예 없는 것**은 오류가 아니라 정상이다(선축이 생기기 전 클라이언트,
  // 그리고 정정 승계 경로). 그때는 키 자체를 빼서 돌려준다 — `undefined`나 `null`을
  // 그대로 실으면 그 형태가 `jsonInput`을 타고 `score` JSON 컬럼에 들어가(`null`은 실제로
  // 저장된다) `readStoredPenalties`·`parseOfficialPenalties` 계열이 "선축 없음"과 "선축이
  // null" 두 상태를 구분해야 하는 부채가 생긴다. 없으면 없는 것이 유일한 표현이다.
  // 킥 수(`takenHome`/`takenAway`). 이게 실려 와야 서버도 "홈 1킥 1:0 / 원정 0킥"과
  // "각 5킥 1:0"을 구분할 수 있다 — 총점 두 개만으로는 구조적으로 같은 값이라,
  // 예전 서버가 막을 수 있는 건 무승부뿐이었고 화면의 가드는 API 직접 호출로
  // 그대로 우회됐다.
  //
  // **둘 다 있거나 둘 다 없어야 한다.** 한쪽만 오면 어느 팀이 몇 번 찼는지 알 수
  // 없는데도 "킥 수를 안다"고 착각한 채 판정이 돌아간다 — 없는 쪽을 0으로 메우면
  // 그 팀이 한 번도 안 찬 것으로 읽혀 정상 결과가 거부된다.
  const takenHome = parseKickCount(raw, 'takenHome');
  const takenAway = parseKickCount(raw, 'takenAway');
  if ((takenHome === undefined) !== (takenAway === undefined)) {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: 'penalties.takenHome and penalties.takenAway must be provided together',
    });
  }
  // 성공 수가 시도 수를 넘을 수는 없다. 이건 정책과 무관한 산술 불변식이라
  // `assertPenaltyShootoutConcluded`(정책 판정)가 아니라 여기서 본다 —
  // `operatorOverride`로도 면제되지 않아야 하는 종류의 오류다.
  if (takenHome !== undefined && takenAway !== undefined && (home > takenHome || away > takenAway)) {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: 'penalties scored count cannot exceed the number of kicks taken',
    });
  }
  const operatorOverrideRaw = (raw as { operatorOverride?: unknown }).operatorOverride;
  if (operatorOverrideRaw !== undefined && typeof operatorOverrideRaw !== 'boolean') {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: 'penalties.operatorOverride must be a boolean when provided',
    });
  }
  // `true`일 때만 싣는다. `false`를 저장하면 "우회 아님"이 두 가지 표현(키 부재 ·
  // false)을 갖게 되고, 그건 이 함수가 `firstKickSideKey`에서 이미 지키는 불변식
  // ("없으면 없는 것이 유일한 표현")을 깨는 것이다.
  const counts =
    takenHome !== undefined && takenAway !== undefined ? { takenHome, takenAway } : {};
  const override = operatorOverrideRaw === true ? { operatorOverride: true as const } : {};

  const firstKickSideKey = (raw as { firstKickSideKey?: unknown }).firstKickSideKey;
  if (firstKickSideKey === undefined) return { home, away, ...counts, ...override };
  if (firstKickSideKey !== 'HOME' && firstKickSideKey !== 'AWAY') {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: "penalties.firstKickSideKey must be 'HOME' or 'AWAY' when provided",
    });
  }
  return { home, away, firstKickSideKey, ...counts, ...override };
}

/** `takenHome`/`takenAway` 한 칸을 읽는다 — 없으면 `undefined`, 형식이 틀리면 422. */
function parseKickCount(raw: unknown, key: 'takenHome' | 'takenAway'): number | undefined {
  const value = (raw as Record<string, unknown>)[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_PENALTY_INVALID',
      message: `penalties.${key} must be a non-negative integer when provided`,
    });
  }
  return value;
}

/**
 * 2026-08-11 알파 실측: 대회 스태프(감독/현장 담당/조회 전용)가 라인업을
 * `저장`(saveLineup, takeoverToken 불요구)까지는 통과시키고 `제출`
 * (submitLineup)에서만 인계 토큰을 요구해, 라인업 화면(lineup-client.tsx)이
 * 토큰을 얻지도 보내지도 않는 탓에 구조적으로 제출이 불가능했다
 * (TAKEOVER_TOKEN_EXPIRED). 오너 결정: "경기가 아직 시작되지 않았으면
 * (SCHEDULED) 스태프도 토큰 없이 제출할 수 있다 — 라이브 중(피리어드가 시작된
 * 이후)에는 두 운영자가 라인업을 놓고 충돌하는 걸 막기 위해 기존대로 토큰을
 * 요구한다." `game.state`를 그 판정 기준으로 재사용한다: executeCommand의
 * 'start' 커맨드가 SCHEDULED→LIVE로 전이시키는 바로 그 트랜잭션에서
 * V1GamePeriod도 함께 LIVE로 전환하므로(advancePeriod, 이 파일의
 * executeCommand 본문 참고) game.state는 이미 "피리어드가 시작됐는가"의 단일
 * 진실 소스다 — 새 판정을 만들지 않는다. 팀 매니저/오너는 이 함수가 관여하지
 * 않는 상위 조건(actorIsStaff)에서 이미 항상 면제이므로 그대로 둔다.
 */
export function staffLineupSubmitRequiresTakeover(gameState: V1GameState): boolean {
  return gameState !== V1GameState.SCHEDULED;
}

/**
 * 이슈 #375 — `executeCommand`의 command 문자열을 idempotency/audit
 * (`writeAudit`, `withCommand`)이 쓰는 `action` 문자열로 매핑한다. 구
 * `next-period`가 이미 하이픈이 아니라 언더스코어(`game_next_period`)로
 * 특별 취급됐던 관례를 새 세 커맨드에도 그대로 잇는다 — `game_${command}`
 * 템플릿을 그냥 쓰면 `game_end-period`처럼 하이픈이 섞인 액션 문자열이
 * 나와 감사 로그/권한 매핑(`gameAuthorizationAction`)의 스네이크케이스
 * 관례와 어긋난다. 순수 함수라 `GamesService` 밖에서도 단위 테스트할 수
 * 있다(`canonicalGameCommandPayloadHash`/`extractEndPenalties`와 같은 이유).
 */
export function gameCommandAuditAction(
  command: 'start' | 'pause' | 'resume' | 'end' | 'end-period' | 'start-period' | 'revert-period' | 'next-period',
): string {
  switch (command) {
    case 'end-period':
      return 'game_end_period';
    case 'start-period':
      return 'game_start_period';
    case 'revert-period':
      return 'game_revert_period';
    case 'next-period':
      return 'game_next_period';
    default:
      return `game_${command}`;
  }
}

/**
 * 신원 연결(identity link) 3종 헬퍼는 `GamesService`의 private 메서드였다가 모듈 레벨
 * 함수로 올라왔다 — 팀매치 전용 라인업 서비스(`team-match-lineup.service.ts`)가
 * `GamesService.saveLineup`을 지나지 않고 자기 참가자 행을 직접 쓰는데, 그쪽에서도
 * **똑같은** ROSTER_ASSERTED 연결을 만들어야 하기 때문이다. 계약(중복 연결 조기 반환,
 * eventVersion 채번, 트리거 오류 매핑)을 복제하면 반드시 갈라지므로 구현은 하나로 둔다.
 * `this`를 쓰지 않는 순수 tx 함수라 클래스 밖으로 옮기는 데 다른 제약은 없다.
 */
async function appendIdentityEvent(
  tx: Transaction,
  input: {
    participantId: string;
    linkId: string;
    requestId: string;
    userId: string;
    reason?: string;
  } & (
    | {
        action:
          | typeof V1IdentityLinkAction.REQUESTED
          | typeof V1IdentityLinkAction.ATTESTED
          // 라인업 저장 시 매니저가 로스터에 지정한 계정으로 자동 생성되는 연결.
          // v1_guard_identity_event 트리거는 ATTESTED/EXPIRED만 승인자≠본인을
          // 검증하므로 ROSTER_ASSERTED는 그 검증을 우회하지 않고 애초에 대상이
          // 아니다(자기 자신을 로스터에 넣는 선수 겸 매니저도 막히지 않는다).
          | typeof V1IdentityLinkAction.ROSTER_ASSERTED
          | typeof V1IdentityLinkAction.REJECTED
          | typeof V1IdentityLinkAction.REVOKED;
        actorType: typeof V1IdentityActorType.USER;
        actorUserId: string;
      }
    | {
        action:
          | typeof V1IdentityLinkAction.EXPIRED
          | typeof V1IdentityLinkAction.ROSTER_ASSERTED;
        actorType: typeof V1IdentityActorType.SYSTEM;
        systemActor:
          | 'IDENTITY_LINK_EXPIRY'
          | 'GAME_END_DERIVER'
          | 'GAME_BACKFILL'
          | 'PROJECTION_REPAIR'
          // 라인업 리비전 복사(정정 요청)가 원본의 연결을 새 참가자 행으로 옮길 때.
          // 사람이 새로 주장한 것이 아니라 시스템이 기존 주장을 이어 붙인 것이므로
          // 복사를 실행한 상대팀 팀장의 이름을 빌리지 않는다.
          // `system_actor` 는 TEXT 컬럼이고 트리거가 값을 검사하는 것은 EXPIRED 뿐이라
          // (20260729000100 migration 의 v1_guard_identity_event) 스키마 변경이 필요 없다.
          | 'LINEUP_REVISION_COPY';
      }
  ),
) {
  const last = await tx.v1ParticipantIdentityLinkEvent.findFirst({
    where: { participantId: input.participantId },
    orderBy: { eventVersion: 'desc' },
    select: { eventVersion: true },
  });
  try {
    return await tx.v1ParticipantIdentityLinkEvent.create({
      data: {
        participantId: input.participantId,
        linkId: input.linkId,
        eventVersion: (last?.eventVersion ?? 0) + 1,
        requestId: input.requestId,
        action: input.action,
        userId: input.userId,
        actorType: input.actorType,
        actorUserId: input.actorType === V1IdentityActorType.USER ? input.actorUserId : null,
        systemActor: input.actorType === V1IdentityActorType.SYSTEM ? input.systemActor : null,
        reason: input.reason ?? null,
      },
    });
  } catch (error) {
    throw mapIdentityEventError(error);
  }
}

/**
 * Roster-backed participants become readable personal records in the same
 * transaction that creates them. `V1GameParticipant.userId` alone is not a
 * public identity assertion; the records reader intentionally follows the
 * append-only identity event plus current-link pair.
 *
 * **멱등**: 이미 연결이 있는 participant 면 아무것도 하지 않고 조기 반환한다. 그래서
 * 같은 라인업을 여러 번 저장하거나(각 저장은 새 participant 행을 만든다) 재시도로 이
 * 함수가 두 번 불려도 유니크 제약(`v1_participant_identity_link_current` PK =
 * participantId) 위반으로 500 이 나지 않는다. 한 사용자가 같은 경기에서 **여러**
 * participant 행(라인업 리비전별 행, 자동 로스터 행)에 연결되는 것은 정상이다 —
 * 연결 테이블의 유일성은 participant 기준이지 사용자 기준이 아니고, 기록은 결과
 * 리비전이 지목한 participant 행 하나에만 붙기 때문에 이중 집계가 되지 않는다.
 */
export async function createRosterAssertedIdentityLink(
  tx: Transaction,
  participantId: string,
  userId: string,
  actor:
    | { actorType: 'USER'; actorUserId: string }
    | {
        actorType: 'SYSTEM';
        systemActor:
          | 'GAME_END_DERIVER'
          | 'GAME_BACKFILL'
          | 'PROJECTION_REPAIR'
          | 'LINEUP_REVISION_COPY';
      },
  reason: string,
): Promise<void> {
  const existingLink = await tx.v1ParticipantIdentityLinkCurrent.findUnique({
    where: { participantId },
  });
  if (existingLink !== null) return;

  const linkId = randomUUID();
  const identityEvent =
    actor.actorType === 'USER'
      ? await appendIdentityEvent(tx, {
          participantId,
          linkId,
          requestId: linkId,
          action: V1IdentityLinkAction.ROSTER_ASSERTED,
          userId,
          actorType: V1IdentityActorType.USER,
          actorUserId: actor.actorUserId,
          reason,
        })
      : await appendIdentityEvent(tx, {
          participantId,
          linkId,
          requestId: linkId,
          action: V1IdentityLinkAction.ROSTER_ASSERTED,
          userId,
          actorType: V1IdentityActorType.SYSTEM,
          systemActor: actor.systemActor,
          reason,
        });

  await tx.v1ParticipantIdentityLinkCurrent.create({
    data: {
      participantId,
      linkId,
      userId,
      version: 1,
      effectiveFrom: identityEvent.effectiveAt,
    },
  });
}

function mapIdentityEventError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('attestation requires a distinct pending requestor')) {
    return new ConflictException({
      code: 'IDENTITY_LINK_REQUEST_EXPIRED',
      message: '연결 요청이 만료됐거나 유효하지 않아요.',
    });
  }
  if (message.includes('identity terminal action already committed')) {
    return new ConflictException({
      code: 'IDENTITY_LINK_ALREADY_DECIDED',
      message: '이미 처리된 요청이에요.',
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034(직렬화 충돌·데드락)는 신원 도메인의 사실이 아니라 **트랜잭션 레벨** 사건이다.
    // 이 헬퍼는 라인업 저장(team-match-lineup.service.ts saveLineup)처럼 신원과 무관한
    // 커맨드 한복판에서도 불리는데, 같은 저장의 다른 statement 가 졌을 때는 감싸는
    // 트랜잭션이 COMMAND_CONCURRENCY_CONFLICT 를 던진다 — 어느 statement 가 졌느냐로
    // 클라이언트가 보는 코드가 갈리면 같은 상황이 다른 실패로 보인다. 그래서 이쪽도
    // 같은 코드로 맞춘다(프론트가 실제로 분기하는 코드도 이쪽이다 —
    // apps/v1_web/src/hooks/use-v1-game-operations-console.ts).
    // 신원 커맨드(requestIdentityLink/attest/revoke)에서도 이 통일이 맞다: 그쪽을 감싸는
    // withParticipantCommand 의 P2034 처리가 원래 같은 코드를 내려는 것이었는데, 여기서
    // 먼저 ConflictException 으로 바꿔 던지는 바람에 도달하지 못하고 있었다.
    if (error.code === 'P2034') {
      return new ConflictException({
        code: 'COMMAND_CONCURRENCY_CONFLICT',
        message: '동시에 처리된 요청이 있어요. 최신 상태를 다시 불러와 주세요.',
      });
    }
    // P2002 는 반대로 신원 테이블의 유일성이 실제로 깨진 것(같은 요청의 중복 이벤트 등)이라
    // 도메인 코드를 유지한다.
    if (error.code === 'P2002') {
      return new ConflictException({
        code: 'IDENTITY_LINK_CONFLICT',
        message: '동시 요청이 충돌했어요. 다시 시도해 주세요.',
      });
    }
  }
  return error;
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAuditWriter: OperationAuditWriterService,
    private readonly takeover: GameTakeoverService,
    // 신원 연결 승인 요청 푸시(2026-08-26). optional 인 이유는 워커 서비스의 webPush 와 같다 —
    // `new GamesService(prisma, audit, takeover)` 로 직접 만드는 스펙이 다수 있고 그쪽은
    // 푸시가 no-op 이면 된다. 실제 앱에서는 GamesModule 이 import 한 WebPushModule 에서 주입된다.
    @Optional() private readonly webPush?: WebPushService,
  ) {}

  /** 푸시 발송 실패 기록용. 이 클래스에는 주입 로거가 없어 지역 인스턴스를 쓴다. */
  private readonly pushLogger = new Logger(`${GamesService.name}:push`);

  async createFromSourceInTransaction(
    tx: Prisma.TransactionClient,
    input: GameSourceCreationInput,
    context: GameCommandContext,
  ): Promise<GameCreationResult> {
    try {
      assertGameSourceCreationInput(input);
      assertGameCommandContext({
        actor: context.actor,
        expectedVersion: context.expectedVersion,
        currentVersion: 0,
        headerIdempotencyKey: context.durableCommandId,
        bodyClientCommandId: context.durableCommandId,
        payloadHash: context.payloadHash,
        ...(context.takeoverToken === undefined ? {} : { takeoverToken: context.takeoverToken }),
      });

      const existingRecord = await tx.v1IdempotencyRecord.findUnique({
        where: {
          actorUserId_action_resourceType_resourceId_idempotencyKey: {
            actorUserId: actorStorageId(context.actor),
            action: 'source_create',
            resourceType: input.sourceType,
            resourceId: input.sourceId,
            idempotencyKey: context.durableCommandId,
          },
        },
      });
      const decision = resolveGameIdempotency<GameCreationResult>(
        existingRecord === null
          ? null
          : {
              payloadHash: existingRecord.payloadHash,
              responseStatus: existingRecord.responseStatus,
              responseBody: existingRecord.responseBody as unknown as GameCreationResult,
            },
        context.payloadHash,
      );
      if (decision.kind === 'REPLAY') {
        return decision.responseBody;
      }

      const config = await tx.v1CompetitionConfigVersion.findUnique({
        where: { id: input.competitionConfigVersionId },
        select: { id: true, status: true, periods: true, visibility: true },
      });
      if (config === null || config.status !== 'ACTIVE') {
        throw new GameContractError(
          'COMPETITION_CONFIG_REQUIRED',
          'The source must pin an active competition config version',
        );
      }

      const sourceWhere =
        input.sourceType === V1GameSourceType.TEAM_MATCH
          ? { teamMatchId: input.sourceId }
          : { tournamentFixtureId: input.sourceId };
      const existingGame = await tx.v1Game.findFirst({ where: sourceWhere });
      if (existingGame !== null) {
        if (existingGame.competitionConfigVersionId !== input.competitionConfigVersionId) {
          throw new GameContractError(
            'COMPETITION_CONFIG_REQUIRED',
            'Existing game pin differs from the immutable source pin',
          );
        }
        const replay: GameCreationResult = {
          gameId: existingGame.id,
          sourceType: existingGame.sourceType,
          sourceId: input.sourceId,
          competitionConfigVersionId: existingGame.competitionConfigVersionId,
          state: existingGame.state,
          version: existingGame.version,
        };
        await this.storeIdempotency(tx, {
          actor: context.actor,
          action: 'source_create',
          resourceType: input.sourceType,
          resourceId: input.sourceId,
          durableCommandId: context.durableCommandId,
          payloadHash: context.payloadHash,
          response: replay,
        });
        return replay;
      }

      const game = await tx.v1Game.create({
        data: {
          sourceType: input.sourceType,
          teamMatchId:
            input.sourceType === V1GameSourceType.TEAM_MATCH ? input.sourceId : null,
          tournamentFixtureId:
            input.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE ? input.sourceId : null,
          competitionConfigVersionId: config.id,
        },
      });
      const sides = new Map<'HOME' | 'AWAY', { id: string; lineupId: string }>();
      for (const sideInput of input.sides) {
        const side = await tx.v1GameSide.create({
          data: {
            gameId: game.id,
            sideKey: sideInput.sideKey,
            teamId: sideInput.teamId,
            displayNameSnapshot: sideInput.displayNameSnapshot,
          },
        });
        const lineup = await tx.v1GameLineup.create({
          data: { gameId: game.id, sideId: side.id, revision: 1 },
        });
        sides.set(sideInput.sideKey, { id: side.id, lineupId: lineup.id });
      }
      for (const participant of input.participants) {
        const side = sides.get(participant.sideKey);
        if (side === undefined) {
          throw new GameContractError('PARTICIPANT_INVALID', 'Participant side is missing');
        }
        const createdParticipant = await tx.v1GameParticipant.create({
          data: {
            gameId: game.id,
            sideId: side.id,
            lineupId: side.lineupId,
            userId: participant.userId,
            displayNameSnapshot: participant.displayNameSnapshot,
            jerseyNumber: participant.jerseyNumber,
            position: participant.position,
          },
        });
        if (participant.userId !== undefined) {
          await createRosterAssertedIdentityLink(
            tx,
            createdParticipant.id,
            participant.userId,
            context.actor,
            'source_roster',
          );
        }
      }

      const periodCount = this.periodCount(config.periods);
      await tx.v1GamePeriod.createMany({
        data: Array.from({ length: periodCount }, (_, index) => ({
          gameId: game.id,
          number: index + 1,
        })),
      });
      const visibility = jsonObject(config.visibility);
      await tx.v1GameVisibilityPolicy.create({
        data: {
          gameId: game.id,
          mode:
            visibility.mode === 'status_only'
              ? V1VisibilityMode.STATUS_ONLY
              : V1VisibilityMode.LIVE,
        },
      });

      const result: GameCreationResult = {
        gameId: game.id,
        sourceType: game.sourceType,
        sourceId: input.sourceId,
        competitionConfigVersionId: game.competitionConfigVersionId,
        state: game.state,
        version: game.version,
      };
      await this.storeIdempotency(tx, {
        actor: context.actor,
        action: 'source_create',
        resourceType: input.sourceType,
        resourceId: input.sourceId,
        durableCommandId: context.durableCommandId,
        payloadHash: context.payloadHash,
        response: result,
      });
      await this.writeAudit(tx, context.actor, 'GAME_CREATED', game.id, context.durableCommandId, null, result);
      return result;
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
  }

  async getGame(user: V1AuthUser, gameId: string) {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.resolveActor(tx, gameId, user.id, 'read');
      const game = await tx.v1Game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          sourceType: true,
          state: true,
          version: true,
          lastSequence: true,
          competitionConfigVersionId: true,
          currentOfficialRevisionId: true,
          // 승부차기 입력 단계(운영 콘솔) 추가 — 아래 isKnockoutFixture 계산에만
          // 쓰고, 이 필드 자체는 응답에서 뺀다(destructure로 분리, 기존 관찰
          // 가능한 API 표면을 넓히지 않는다).
          tournamentFixtureId: true,
          sides: { orderBy: { sideKey: 'asc' } },
          periods: { orderBy: { number: 'asc' } },
          lineups: { orderBy: [{ sideId: 'asc' }, { revision: 'desc' }] },
        },
      });
      if (game === null) {
        throw this.notFound();
      }
      // T1-5: the pitch-placement screen (D-17) needs the sport's formation
      // preset catalog to build slot-based placement — this is the single
      // server source of truth (apps/v1_web/src/components/lineup/formation-slots.ts).
      const config = await tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { lineup: true, periods: true, result: true },
      });
      const lineup = config === null ? {} : jsonObject(config.lineup);
      const { tournamentFixtureId, ...gameFields } = game;
      return {
        ...gameFields,
        actorRole: actor.role,
        // 승부차기 입력 단계(운영 콘솔) 추가 — `applyPenalties`가 이미 쓰는
        // 것과 완전히 같은 knockout 판정을 재사용한다(새 판정을 만들지
        // 않는다). 콘솔은 이 값으로 "승부차기 시작" 버튼을 조별리그 무승부
        // 에서는 아예 보여주지 않는다 — 보여줬다가 `end` 제출 시점에야
        // `TOURNAMENT_PENALTY_NOT_ALLOWED`로 실패하는 깨진 UX를 막는다.
        isKnockoutFixture: await readIsKnockoutFixture(tx, tournamentFixtureId),
        lineupConfig: parseLineupConfigForResponse(config?.lineup ?? null),
        // Live-substitution addition: the console needs this to decide
        // whether to surface the rolling quick-substitution mode (config-
        // driven, never a hardcoded sport name) and to show a remaining-
        // substitutions count for `limited` sports. `assertSubstitution`
        // reads the same two config keys server-side as the authoritative
        // enforcement gate — this is only what the UI needs to render ahead
        // of a submit.
        substitutionPolicy: {
          mode: lineup.substitutions === 'rolling' ? 'rolling' : 'limited',
          maxSubstitutions: typeof lineup.maxSubstitutions === 'number' ? lineup.maxSubstitutions : null,
        } as const,
        // alpha 452′ 사고 대응: 캡처 확인 게이트(`operate-console.tsx`)가 "이
        // 피리어드가 몇 분짜리인지" 를 알아야 비정상 클럭을 판단할 수 있다 —
        // `parsePeriodDurations` 문서 참고.
        periodDurations: config === null ? null : parsePeriodDurations(config.periods),
        // 승부차기 선축·결판 판정 추가 — 콘솔이 "승부차기 종료" 버튼을 언제 열지
        // 판단하려면 이 대회가 FIFA 정규(5킥 이내라도 수학적으로 끝났으면 종료)인지
        // "끝까지 차는" 정책인지를 알아야 한다. `substitutionPolicy`/`periodDurations`와
        // 동형이다 — 서버가 config 를 해석해서 UI 가 쓸 형태로만 내보내고, 프런트는
        // config JSON 을 직접 읽지 않는다. `parseResultPolicy`가 키 부재를 기본값
        // (`earlyStop: true`)으로 메우므로 `config === null`이어도 같은 기본값이다.
        penaltyShootoutPolicy: parseResultPolicy(config?.result ?? null),
      };
    });
  }

  async getVisibility(gameId: string) {
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        state: true,
        visibilityPolicy: true,
        sides: true,
        lineups: {
          where: { state: { in: [V1GameLineupState.SUBMITTED, V1GameLineupState.LOCKED] } },
          orderBy: { revision: 'desc' },
        },
        events: { orderBy: { sequence: 'asc' } },
        currentOfficialRevision: true,
      },
    });
    if (game === null || game.visibilityPolicy === null) {
      throw this.notFound();
    }
    const publicLiveFlag = await this.prisma.v1GameOperationFlag.findUnique({
      where: { key: 'PUBLIC_LIVE' },
      select: { value: true },
    });
    return serializeGameVisibility(
      {
        gameId: game.id,
        state: game.state,
        lineup: game.lineups,
        liveScore: this.scoreFromEvents(game.events, game.sides),
        liveEvents: game.events,
        officialScore:
          game.currentOfficialRevision === null
            ? null
            : scoreFromJson(game.currentOfficialRevision.score),
        officialEvents:
          game.currentOfficialRevision === null ? [] : game.events,
        officialRecords: [],
      },
      {
        mode:
          game.visibilityPolicy.mode === V1VisibilityMode.STATUS_ONLY ? 'status_only' : 'live',
        publicLiveEnabled: publicLiveFlag?.value === 'on',
        lineupEligible:
          game.visibilityPolicy.lineupAt !== null &&
          game.visibilityPolicy.lineupAt.getTime() <= Date.now(),
      },
    );
  }

  async executeCommand(
    user: V1AuthUser,
    gameId: string,
    command:
      | 'start'
      | 'pause'
      | 'resume'
      | 'end'
      | 'end-period'
      | 'start-period'
      | 'revert-period'
      | 'next-period',
    headerIdempotencyKey: string | undefined,
    dto: GameCommandDto,
  ): Promise<GameMutationResult | GameRevisionMutationResult> {
    return this.withCommand<GameMutationResult | GameRevisionMutationResult>(
      {
        gameId,
        action: gameCommandAuditAction(command),
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'tournament_command'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        takeoverToken: dto.takeoverToken,
        payload: { command, ...dto },
      },
      async (tx, game, context) => {
        // T3(기록 UX) 추가: 팀매치도 피리어드를 시작/전환해야 이벤트 시각이 찍힌다(T1-0).
        // 끝맺음만 검증된 결과 제출 경로를 거쳐야 하므로 `end`만 계속 막는다.
        if (game.sourceType === V1GameSourceType.TEAM_MATCH && command === 'end') {
          throw new ConflictException({
            code: 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN',
            message: 'Team matches end only through validated result submission',
          });
        }
        assertClockNotDrifted(dto.occurredAt);
        this.requireTakeover(game.id, game.sourceType, context);

        // 이슈 #375 — 구 `next-period`(fused 종료+시작, 배포 호환용으로만
        // 남겨둠 — GameCommandName.next_period의 @deprecated 문서 참고)와
        // 새로 분리된 `end-period`/`start-period`/`revert-period`. 넷 다
        // advancePeriod류 헬퍼로 위임하고, 아래 `end`/`start`/`pause`/
        // `resume` 공용 게임-상태 전이 블록은 거치지 않는다.
        if (command === 'next-period') {
          return this.advancePeriod(tx, game, context);
        }
        if (command === 'end-period') {
          return this.endCurrentPeriod(tx, game, context);
        }
        if (command === 'start-period') {
          return this.startNextPeriod(tx, game, context);
        }
        if (command === 'revert-period') {
          return this.revertPeriodTransition(tx, game, context);
        }

        const target: V1GameState = {
          start: V1GameState.LIVE,
          pause: V1GameState.PAUSED,
          resume: V1GameState.LIVE,
          end: V1GameState.ENDED,
        }[command];
        this.assertLifecycle(game.sourceType, 'TOURNAMENT_COMMAND', game.state, target);
        if (command === 'start') {
          await this.assertLineupsSubmittedForStart(tx, game.id);
        }
        // 이슈 #375 — HALFTIME이 실제로 영속되는 상태가 되면서 "game.state
        // === LIVE인데 LIVE인 피리어드는 없다"(하프타임 도중)가 처음으로
        // 정상 상태가 됐다. `pause`는 LIVE 피리어드가 있어야만 뜻이 통하는
        // 명령이다 — 없으면 game.state만 PAUSED로 바뀌고 실제로는 아무
        // 피리어드도 멈추지 않는, 하프타임+PAUSED가 겹친 혼란스러운 조합을
        // 만든다. 이 조합은 end-period 도입 이전에는 도달 불가능했던
        // 상태라 여기서만 막는다(resume은 이 가드 덕분에 "PAUSED인데 LIVE
        // 피리어드가 없다"에 도달할 방법 자체가 사라져 대칭 가드가
        // 불필요하다).
        if (command === 'pause') {
          const livePeriodForPause = await tx.v1GamePeriod.findFirst({
            where: { gameId: game.id, state: V1GamePeriodState.LIVE },
            select: { id: true },
          });
          if (livePeriodForPause === null) {
            throw new ConflictException({
              code: 'PERIOD_NOT_STARTED',
              message: '일시 중지할 피리어드가 없어요',
            });
          }
        }
        const now = new Date();
        const updated = await tx.v1Game.update({
          where: { id: game.id },
          data: { state: target, version: { increment: 1 } },
        });
        // T1-0 (design doc §2.8): `start` used to only flip V1Game.state,
        // leaving V1GamePeriod.startedAt null forever — this is the root
        // cause every captured event froze at clockMs≈0. Period 1 now goes
        // LIVE in the same transaction as the game.
        if (command === 'start') {
          await tx.v1GamePeriod.updateMany({
            where: { gameId: game.id, number: 1 },
            data: { state: V1GamePeriodState.LIVE, startedAt: now },
          });
        }
        // Pause-aware clock (경과 시간 일시정지 반영, 2026-08): `pause`/`resume`
        // used to touch only V1Game.state, so the live elapsed-time display
        // and freezeCapture() had no way to exclude a paused stretch — the
        // console clock kept ticking through a stoppage. `pause` opens a
        // segment on the currently-LIVE period; `resume` folds it (additive
        // increment, never an overwrite) into `pausedTotalMs` and clears
        // `pausedAt`, so any number of pause/resume cycles within one period
        // accumulate correctly instead of only the last one surviving.
        if (command === 'pause') {
          const livePeriod = await tx.v1GamePeriod.findFirst({
            where: { gameId: game.id, state: V1GamePeriodState.LIVE },
          });
          if (livePeriod !== null && livePeriod.pausedAt === null) {
            await tx.v1GamePeriod.update({ where: { id: livePeriod.id }, data: { pausedAt: now } });
          }
        }
        if (command === 'resume') {
          const livePeriod = await tx.v1GamePeriod.findFirst({
            where: { gameId: game.id, state: V1GamePeriodState.LIVE },
          });
          const resolved = livePeriod === null ? null : this.resolveOpenPause(livePeriod, now);
          if (livePeriod !== null && resolved !== null) {
            await tx.v1GamePeriod.update({ where: { id: livePeriod.id }, data: resolved });
          }
        }
        if (target === V1GameState.ENDED) {
          // An operator can press "경기 종료" while the game is PAUSED (the
          // console's PAUSED state offers exactly `resume`/`end`) — the period
          // being closed here may still have an open pause segment. Fold it
          // the same way `resume` would, so a period that ends mid-pause
          // never leaves a dangling `pausedAt` and its final `pausedTotalMs`
          // still excludes that last stoppage.
          //
          // 이슈 #375 — `state: LIVE`만 찾던 필터에 `HALFTIME`도 더한다.
          // "경기 종료"는 game.state===LIVE인 동안 언제든 눌릴 수 있고,
          // 하프타임도 이제 game.state===LIVE인 채 지속되는 실제 상태라
          // 하프타임 도중 경기를 종료하는 경로가 새로 생겼다 — 다음
          // 피리어드가 "시작도 안 했는데 ENDED도 아닌" HALFTIME으로 영원히
          // 남는 대신 이 경로에서도 함께 ENDED로 닫는다. HALFTIME
          // 피리어드는 애초에 pausedAt이 설정될 수 없으므로(pause는 LIVE
          // 피리어드만 건드린다) resolveOpenPause는 안전하게 null을
          // 돌려준다.
          const livePeriods = await tx.v1GamePeriod.findMany({
            where: {
              gameId: game.id,
              state: { in: [V1GamePeriodState.LIVE, V1GamePeriodState.HALFTIME] },
            },
          });
          for (const period of livePeriods) {
            const resolved = this.resolveOpenPause(period, now);
            await tx.v1GamePeriod.update({
              where: { id: period.id },
              data: { state: V1GamePeriodState.ENDED, endedAt: now, ...(resolved ?? {}) },
            });
          }
          return this.deriveTournamentRevision(
            tx,
            updated,
            context,
            'END_COMMAND',
            extractEndPenalties(dto.payload),
            // 몰수·중단 종결 사유. 정상 종료면 NORMAL/null 이라 기존 동작과 같다.
            // 사유가 비어 있는 몰수는 extractEndOutcome 이 422 로 먼저 막는다.
            extractEndOutcome(dto.payload),
          );
        }
        return {
          gameId: updated.id,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
        };
      },
    );
  }

  /**
   * Pause-aware clock (경과 시간 일시정지 반영, 2026-08): if `period.pausedAt`
   * is set, returns the patch that folds `now - pausedAt` into
   * `pausedTotalMs` and clears `pausedAt` — this is an INCREMENT relative to
   * whatever `pausedTotalMs` already holds, never an overwrite, which is
   * exactly what makes repeated pause/resume cycles within one period
   * accumulate instead of only remembering the most recent one. Returns
   * `null` (no-op) when the period is not currently paused, so both call
   * sites (`resume`, and `end` while paused) can spread the result
   * unconditionally without a separate null-check branch at the call site.
   */
  private resolveOpenPause(
    period: { pausedTotalMs: number; pausedAt: Date | null },
    now: Date,
  ): { pausedTotalMs: number; pausedAt: null } | null {
    if (period.pausedAt === null) return null;
    // Clamp at zero. `pausedTotalMs` only ever accumulates, so a backwards
    // server clock (NTP step, VM migration) must not be able to subtract from
    // it — a negative delta here would silently shrink the total and inflate
    // every subsequent elapsed reading, including the clockMs written onto
    // recorded events.
    const segmentMs = Math.max(0, now.getTime() - period.pausedAt.getTime());
    return { pausedTotalMs: period.pausedTotalMs + segmentMs, pausedAt: null };
  }

  /**
   * @deprecated 이슈 #375 — `next-period` 전용 fused 핸들러. `GameCommandName.
   * next_period`의 문서(game-command.dto.ts)에 적은 배포 호환 사유로만
   * 남아 있다. 동작은 **절대 바꾸지 않는다**: 기존 통합 테스트
   * (`test/games/game-period-lifecycle.integration-spec.ts`,
   * `test/games/live-game-commands.integration-spec.ts`)가 정확히 이 fused
   * 동작(종료+시작을 한 트랜잭션에서, HALFTIME을 거치지 않고)에 근거해
   * 작성돼 있고, 이 값을 여전히 보내는 배포 직후의 구 프런트 번들도 같은
   * 동작을 기대한다. 새 분기 로직은 여기 추가하지 말고 `endCurrentPeriod`/
   * `startNextPeriod`/`revertPeriodTransition`에 넣는다.
   *
   * `next_period` (T1-0) — closes whichever `V1GamePeriod` is currently LIVE
   * and opens the following period number, both server-timestamped in the
   * same transaction as the version bump. Reaches here only for
   * TOURNAMENT_FIXTURE games (TEAM_MATCH is rejected above, before this is
   * called). Rejecting while the game itself is not LIVE (e.g. PAUSED) is
   * deliberate — advancing a period mid-pause is not part of the D-13 button
   * flow (start → 전반 종료/후반 시작 → 경기 종료), those buttons are only
   * ever shown while the game is LIVE.
   */
  private async advancePeriod(
    tx: Transaction,
    game: LockedGame,
    context: GameCommandContext,
  ): Promise<GameMutationResult> {
    if (game.state !== V1GameState.LIVE) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '경기가 진행 중이어야 다음 피리어드로 넘어갈 수 있어요',
      });
    }
    const current = await tx.v1GamePeriod.findFirst({
      where: { gameId: game.id, state: V1GamePeriodState.LIVE },
    });
    if (current === null) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '진행 중인 피리어드가 없어요',
      });
    }
    const next = await tx.v1GamePeriod.findFirst({
      where: { gameId: game.id, number: current.number + 1 },
    });
    if (next === null) {
      throw new ConflictException({
        code: 'NO_NEXT_PERIOD',
        message: '마지막 피리어드예요',
      });
    }
    const now = new Date();
    await tx.v1GamePeriod.update({
      where: { id: current.id },
      data: { state: V1GamePeriodState.ENDED, endedAt: now },
    });
    await tx.v1GamePeriod.update({
      where: { id: next.id },
      data: { state: V1GamePeriodState.LIVE, startedAt: now },
    });
    const updated = await tx.v1Game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });
    return {
      gameId: updated.id,
      state: updated.state,
      version: updated.version,
      durableCommandId: context.durableCommandId,
      replayed: false,
    };
  }

  /**
   * 이슈 #375 (`end-period`) — `advancePeriod`의 "종료" 절반만 수행한다.
   * 현재 LIVE인 피리어드를 ENDED로 닫고, **다음 피리어드가 곧장 LIVE로
   * 열리지 않는다** — 대신 HALFTIME으로 옮겨 "하프타임"을 실제로 관측
   * 가능한 상태로 만든다(운영 보드/실시간 화면이 이 값을 그대로 질의할 수
   * 있다). `startNextPeriod`가 이 HALFTIME 피리어드를 LIVE로 여는 짝이다.
   *
   * 마지막 피리어드(다음 피리어드가 없음)도 이 커맨드로 닫는다 — 예전엔
   * `NO_NEXT_PERIOD` 409로 거부하고 "마지막 피리어드는 `end`로 끝낸다"고
   * 적어 뒀지만, 그 결과 운영자에게는 "후반 종료 = 경기 종료(결과 리비전
   * 제출까지 한 트랜잭션)"밖에 없었다. 사용자 결정(운영 콘솔 종료 흐름
   * 개편)은 **후반 종료 → (결선 무승부면 승부차기 입력) → 경기 종료**의
   * 3단계이고, 그 중간 단계가 바로 "정규 시간은 끝났지만 결과는 아직
   * 확정 전"이다. 다음 피리어드가 없으면 HALFTIME 승격만 건너뛰고 현재
   * 피리어드만 ENDED로 닫는다 — 그러면 `game.state`는 LIVE인 채로 LIVE·
   * HALFTIME 피리어드가 하나도 없는 상태가 되고, 이 조합이 곧 "정규 시간
   * 종료" 그 자체다(새 enum 값도 새 컬럼도 만들지 않는다).
   *
   * 이 단계는 결과를 만들지 않는다: 스코어 산출·리비전 SUBMITTED·
   * `GAME_RESULT_SUBMITTED` outbox는 전부 `end`(`deriveTournamentRevision`)
   * 쪽에 그대로 남는다. `end`는 `state IN (LIVE, HALFTIME)`인 피리어드만
   * 닫으므로(executeCommand의 ENDED 분기) 이미 ENDED인 피리어드에는
   * no-op이고, 따라서 이 중간 단계를 거쳐도 최종 결과는 한 번에 끝냈을
   * 때와 동일하다.
   *
   * 되돌리기 비대칭 주의: `revertPeriodTransition`은 "다음 피리어드"를
   * SCHEDULED로 되감는 명령이라 다음 피리어드가 없는 이 전환은 되돌릴 수
   * 없다(`PERIOD_REVERT_NOT_AVAILABLE`). 콘솔도 그래서 마지막 피리어드
   * 종료에는 되돌리기 토스트를 붙이지 않고, 확인 문구에서 "되돌릴 수
   * 없다"고 명시한다.
   */
  private async endCurrentPeriod(
    tx: Transaction,
    game: LockedGame,
    context: GameCommandContext,
  ): Promise<GameMutationResult> {
    if (game.state !== V1GameState.LIVE) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '경기가 진행 중이어야 피리어드를 종료할 수 있어요',
      });
    }
    const current = await tx.v1GamePeriod.findFirst({
      where: { gameId: game.id, state: V1GamePeriodState.LIVE },
    });
    if (current === null) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '진행 중인 피리어드가 없어요',
      });
    }
    const next = await tx.v1GamePeriod.findFirst({
      where: { gameId: game.id, number: current.number + 1 },
    });
    const now = new Date();
    await tx.v1GamePeriod.update({
      where: { id: current.id },
      data: { state: V1GamePeriodState.ENDED, endedAt: now },
    });
    if (next !== null) {
      await tx.v1GamePeriod.update({
        where: { id: next.id },
        data: { state: V1GamePeriodState.HALFTIME },
      });
    }
    const updated = await tx.v1Game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });
    return {
      gameId: updated.id,
      state: updated.state,
      version: updated.version,
      durableCommandId: context.durableCommandId,
      replayed: false,
    };
  }

  /**
   * 이슈 #375 (`start-period`) — `endCurrentPeriod`가 HALFTIME으로 옮겨
   * 놓은 다음 피리어드를 LIVE로 연다(`advancePeriod`의 "시작" 절반).
   * HALFTIME인 피리어드가 하나도 없으면(하프타임이 아니거나, 이미
   * 시작됐거나) 거부한다 — 이 커맨드가 여는 대상은 항상 정확히 하나여야
   * 한다(같은 시점에 HALFTIME 피리어드가 둘 이상 존재하는 것은
   * endCurrentPeriod/startNextPeriod의 짝 구조상 불가능하다).
   */
  private async startNextPeriod(
    tx: Transaction,
    game: LockedGame,
    context: GameCommandContext,
  ): Promise<GameMutationResult> {
    if (game.state !== V1GameState.LIVE) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '경기가 진행 중이어야 다음 피리어드를 시작할 수 있어요',
      });
    }
    const halftime = await tx.v1GamePeriod.findFirst({
      where: { gameId: game.id, state: V1GamePeriodState.HALFTIME },
    });
    if (halftime === null) {
      throw new ConflictException({
        code: 'HALFTIME_NOT_ACTIVE',
        message: '하프타임 상태가 아니에요',
      });
    }
    const now = new Date();
    await tx.v1GamePeriod.update({
      where: { id: halftime.id },
      data: { state: V1GamePeriodState.LIVE, startedAt: now },
    });
    const updated = await tx.v1Game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });
    return {
      gameId: updated.id,
      state: updated.state,
      version: updated.version,
      durableCommandId: context.durableCommandId,
      replayed: false,
    };
  }

  /**
   * 이슈 #375 (`revert-period`) — `endCurrentPeriod`(그리고 그 뒤
   * `startNextPeriod`까지)를 되돌린다. `GamesService.reverseEvent`가
   * "이벤트 하나"를 되돌리는 선례라면, 이건 그 선례를 "피리어드 전환"
   * 단위로 적용한 것이다 — 다만 되돌릴 대상을 클라이언트가 id로 지정할
   * 필요가 없다(한 시점에 "되돌릴 수 있는 전환"은 항상 최대 하나뿐이라
   * next/current 피리어드의 상태만으로 유일하게 특정된다).
   *
   * 대상 판별: 되돌릴 "다음 피리어드"는 (a) 아직 `HALFTIME`이거나(전반
   * 종료 후 후반 시작 전) (b) 이미 `LIVE`이면서 그 바로 앞 피리어드
   * (number - 1)가 `ENDED`인 경우(후반이 이미 시작된 뒤)다. (b)의 "앞
   * 피리어드가 ENDED" 조건이 핵심이다 — 이게 없으면 피리어드 1의 최초
   * `start`로 생긴 LIVE(앞에 아무 피리어드도 없다)까지 되돌릴 대상으로
   * 잘못 집어낸다.
   *
   * 데이터 정합성 게이트(사용자 결정, 이슈 #375 브리프): 다음 피리어드에
   * **이벤트가 하나라도 기록된 뒤에는 되돌릴 수 없다.** 골/카드가 이미 그
   * 피리어드 번호로 기록된 채 그 피리어드를 SCHEDULED로 되돌리면, 그
   * 이벤트들은 "시작도 안 한 피리어드에 속한 기록"이 되어 이후 조회/집계
   * (`deriveTournamentRevision`, `assertEventReferences`)에서 소속이
   * 뒤틀린다. 그래서 콘솔 UI는 하프타임 동안만 되돌리기 진입점을 보여주지만
   * (operate-console.tsx), 백엔드는 그보다 넓게 "다음 피리어드에 기록된
   * 이벤트가 없는 동안"이라는 더 근본적인 조건으로 강제한다 — 하프타임
   * 창을 넘겨도 아직 아무 기록이 없다면 서버는 여전히 허용한다.
   */
  private async revertPeriodTransition(
    tx: Transaction,
    game: LockedGame,
    context: GameCommandContext,
  ): Promise<GameMutationResult> {
    if (game.state !== V1GameState.LIVE) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '경기가 진행 중이어야 피리어드 전환을 되돌릴 수 있어요',
      });
    }
    const next = await tx.v1GamePeriod.findFirst({
      where: {
        gameId: game.id,
        OR: [
          { state: V1GamePeriodState.HALFTIME },
          { state: V1GamePeriodState.LIVE, number: { gt: 1 } },
        ],
      },
      orderBy: { number: 'desc' },
    });
    const previous =
      next === null
        ? null
        : await tx.v1GamePeriod.findFirst({ where: { gameId: game.id, number: next.number - 1 } });
    if (next === null || previous === null || previous.state !== V1GamePeriodState.ENDED) {
      // `next`가 LIVE인데 바로 앞 피리어드가 ENDED가 아니면(전형적으로
      // 피리어드 1의 최초 kickoff) end-period/start-period가 만든 전환이
      // 아니라는 뜻 — 되돌릴 게 없다.
      throw new ConflictException({
        code: 'PERIOD_REVERT_NOT_AVAILABLE',
        message: '되돌릴 피리어드 전환이 없어요',
      });
    }
    const nextPeriodEventCount = await tx.v1GameEvent.count({
      where: { gameId: game.id, period: next.number },
    });
    if (nextPeriodEventCount > 0) {
      throw new ConflictException({
        code: 'PERIOD_REVERT_HAS_EVENTS',
        message: '이미 기록된 이벤트가 있어 되돌릴 수 없어요',
      });
    }
    await tx.v1GamePeriod.update({
      where: { id: next.id },
      data: {
        state: V1GamePeriodState.SCHEDULED,
        startedAt: null,
        // start-period 이후 pause/resume이 한 번도 없었다면 이미 0/null이라
        // no-op이다 — 이벤트 없이도 pause/resume만 눌렸던 드문 경로까지
        // 대비해 "한 번도 시작 안 한 피리어드"로 완전히 되돌린다.
        pausedTotalMs: 0,
        pausedAt: null,
      },
    });
    // F64 fix: previous가 ENDED로 머문 구간(endedAt → 지금)을 "정지 시간"으로 접어
    // 넣지 않으면, LIVE로 되살아난 순간부터 프런트 시계(elapsedMatchMs =
    // now - startedAt - pausedTotalMs, game-operations-clock.ts)가 실제 경과시간보다
    // 그 구간만큼 부풀어 보이고, 그 뒤 기록되는 골/카드의 clockMs도 같은 값으로 영구
    // 저장된다. 바로 위에서 next를 pausedTotalMs:0으로 완전히 되감는 것과 대칭적으로,
    // previous는 "ENDED로 머문 시간"을 pausedTotalMs에 누적한다(resolveOpenPause와
    // 동일하게 음수 방지 clamp). endCurrentPeriod는 game.state===LIVE(PAUSED 아님)에서만
    // 피리어드를 ENDED로 닫으므로 previous.pausedAt은 이 시점에 항상 null이다 — 열린
    // pause 구간과 겹칠 걱정 없이 그대로 더할 수 있다.
    const now = new Date();
    const endedDurationMs =
      previous.endedAt === null ? 0 : Math.max(0, now.getTime() - previous.endedAt.getTime());
    await tx.v1GamePeriod.update({
      where: { id: previous.id },
      data: {
        state: V1GamePeriodState.LIVE,
        endedAt: null,
        pausedTotalMs: previous.pausedTotalMs + endedDurationMs,
      },
    });
    const updated = await tx.v1Game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });
    return {
      gameId: updated.id,
      state: updated.state,
      version: updated.version,
      durableCommandId: context.durableCommandId,
      replayed: false,
    };
  }

  async cancel(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: CancelGameDto,
  ): Promise<GameMutationResult> {
    return this.withCommand(
      {
        gameId,
        action: 'game_cancel',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'cancel'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        takeoverToken: dto.takeoverToken,
        payload: dto,
      },
      async (tx, game, context) => {
        this.assertLifecycle(game.sourceType, 'CANCEL', game.state, V1GameState.CANCELLED);
        const updated = await tx.v1Game.update({
          where: { id: game.id },
          data: { state: V1GameState.CANCELLED, version: { increment: 1 } },
        });
        await tx.v1GameVisibilityPolicy.update({
          where: { gameId },
          data: { mode: V1VisibilityMode.STATUS_ONLY, lineupAt: null, version: { increment: 1 } },
        });
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
        };
      },
    );
  }

  async listEvents(user: V1AuthUser, gameId: string, afterSequence: number) {
    await this.resolveActor(this.prisma, gameId, user.id, 'read');
    return this.prisma.$transaction(
      async (tx) => {
        const game = await tx.v1Game.findUnique({
          where: { id: gameId },
          select: { lastSequence: true },
        });
        if (game === null) {
          throw this.notFound();
        }
        const snapshotLastSequence = game.lastSequence;
        const events = await tx.v1GameEvent.findMany({
          where: {
            gameId,
            sequence: { gt: afterSequence, lte: snapshotLastSequence },
          },
          orderBy: { sequence: 'asc' },
        });
        let expectedSequence = afterSequence + 1;
        let gap: { expectedSequence: number; availableFrom: number } | null = null;
        for (const event of events) {
          if (event.sequence > expectedSequence) {
            gap = { expectedSequence, availableFrom: event.sequence };
            break;
          }
          expectedSequence = event.sequence + 1;
        }
        return { events, lastSequence: snapshotLastSequence, gap };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async appendEvent(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: AppendGameEventDto,
  ): Promise<GameEventAppendResult> {
    return this.withCommand(
      {
        gameId,
        action: 'event_append',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'event_append'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientEventId,
        takeoverToken: dto.takeoverToken,
        payload: immutableGameEventPayload(dto),
      },
      async (tx, game, context) => {
        assertClockNotDrifted(dto.occurredAt);
        this.requireTakeover(game.id, game.sourceType, context);
        if (game.state === V1GameState.ENDED || game.state === V1GameState.CANCELLED) {
          throw new ConflictException({
            code: 'TERMINAL_GAME_IMMUTABLE',
            message: 'Terminal games reject event mutation',
          });
        }
        const references = await this.assertEventReferences(tx, game, dto);
        const sequence = game.lastSequence + 1;
        const createdEvent = await tx.v1GameEvent.create({
          data: {
            gameId,
            sequence,
            clientEventId: dto.clientEventId,
            payloadHash: context.payloadHash,
            type: dto.type,
            sideId: dto.sideId,
            participantId: dto.participantId,
            assistParticipantId: dto.assistParticipantId ?? null,
            period: dto.period,
            clockMs: dto.clockMs,
            occurredAt: new Date(dto.occurredAt),
            actorUserId: actorStorageId(context.actor),
            payload: jsonInput(dto.payload),
          },
        });
        // Live-substitution addition: the incoming participant inherits the
        // outgoing participant's last-known pitch placement, so the roster
        // still reflects "who is where" after the swap. `dto.participantId`
        // is guaranteed defined here — `assertSubstitution` already rejected
        // an undefined one before this point could ever be reached.
        if (references.substitutionInheritedPlacement && dto.participantId !== undefined) {
          await tx.v1GameParticipant.update({
            where: { id: dto.participantId },
            data: references.substitutionInheritedPlacement,
          });
        }
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { lastSequence: sequence, version: { increment: 1 } },
        });
        // GAME_EVENT_APPENDED used to be written to the outbox here, but a full
        // repo audit (outbox-handler cleanup task) found no reader anywhere —
        // not the realtime gateway (it broadcasts synchronously in this same
        // request, never through the outbox), no projection, no doc/commit
        // intent. It never poisoned in alpha only because attempts hadn't hit
        // 6 yet. Removed at the publish site rather than papered over with a
        // no-op handler: the immutable `v1_game_event` row created above IS
        // this event's durable record, so nothing is lost by not also
        // queuing a job nobody claims.
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          clientEventId: dto.clientEventId,
          sequence,
          // See GameEventAppendResult.event's doc comment — the realtime
          // gateway broadcasts THIS (the real persisted row), never the raw
          // client-submitted `dto`.
          event: toPersistedGameEvent(createdEvent),
        };
      },
    );
  }

  async retryEvent(
    user: V1AuthUser,
    gameId: string,
    input: RetryGameEventInput,
  ): Promise<GameEventAppendResult> {
    const immutablePayloadHash = canonicalGameCommandPayloadHash(input.event);
    if (input.payloadHash.toLowerCase() !== immutablePayloadHash) {
      throw new ConflictException({
        code: 'OFFLINE_EVENT_REBASE_CONFLICT',
        message: 'Offline event payload hash does not match the immutable event',
      });
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
          const game = await tx.v1Game.findUnique({
            where: { id: gameId },
            select: {
              id: true,
              sourceType: true,
              teamMatchId: true,
              tournamentFixtureId: true,
              state: true,
              version: true,
              lastSequence: true,
              competitionConfigVersionId: true,
            },
          });
          if (game === null) {
            throw this.notFound();
          }
          const actor = await this.resolveActor(tx, gameId, user.id, 'event_append');
          const existing = await tx.v1IdempotencyRecord.findUnique({
            where: {
              actorUserId_action_resourceType_resourceId_idempotencyKey: {
                actorUserId: actorStorageId(actor),
                action: 'event_append',
                resourceType: 'GAME',
                resourceId: gameId,
                idempotencyKey: input.clientEventId,
              },
            },
          });
          if (existing !== null) {
            if (existing.payloadHash !== immutablePayloadHash) {
              throw new ConflictException({
                code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
                message: 'The client event ID was already used with a different immutable event',
              });
            }
            const response = parseStoredGameEventAppendResult(existing.responseBody);
            if (response === null) {
              throw new ConflictException({
                code: 'OFFLINE_EVENT_REBASE_CONFLICT',
                message: 'The stored offline event response is invalid',
              });
            }
            return { ...response, replayed: true };
          }
          if (input.rebasedExpectedVersion !== game.version) {
            throw new ConflictException({
              code: 'OFFLINE_EVENT_REBASE_CONFLICT',
              message: 'The rebased game version is stale',
              details: {
                expectedVersion: input.rebasedExpectedVersion,
                currentVersion: game.version,
              },
            });
          }
          let context: GameCommandContext;
          try {
            context = assertGameCommandContext({
              actor,
              expectedVersion: input.rebasedExpectedVersion,
              currentVersion: game.version,
              headerIdempotencyKey: input.clientEventId,
              bodyClientCommandId: input.clientEventId,
              payloadHash: immutablePayloadHash,
              takeoverToken: input.takeoverToken,
            });
          } catch (error) {
            if (error instanceof GameContractError) {
              throw toGameHttpException(error);
            }
            throw error;
          }
          // No assertClockNotDrifted() here: input.event.occurredAt is the
          // immutable, hash-pinned capture time of an event that was already
          // frozen (offline or otherwise) before this retry/rebase call. The
          // drift guard exists to reject a *live* capture whose client clock
          // disagrees with the server right now; a retry is historical by
          // design and is legitimately allowed to arrive minutes after
          // occurredAt (offline recovery). Payload-hash pinning above already
          // guarantees occurredAt cannot be altered between capture and retry.
          this.requireTakeover(gameId, game.sourceType, context);
          const dto: AppendGameEventDto = {
            ...input.event,
            expectedVersion: input.rebasedExpectedVersion,
            clientEventId: input.clientEventId,
            takeoverToken: input.takeoverToken,
          };
          const references = await this.assertEventReferences(tx, game, dto);
          const sequence = game.lastSequence + 1;
          const createdEvent = await tx.v1GameEvent.create({
            data: {
              gameId,
              sequence,
              clientEventId: input.clientEventId,
              payloadHash: immutablePayloadHash,
              type: input.event.type,
              sideId: input.event.sideId,
              participantId: input.event.participantId,
              assistParticipantId: input.event.assistParticipantId ?? null,
              period: input.event.period,
              clockMs: input.event.clockMs,
              occurredAt: new Date(input.event.occurredAt),
              actorUserId: actorStorageId(context.actor),
              payload: jsonInput(input.event.payload),
            },
          });
          // See the matching comment in appendEvent() — same inheritance,
          // same guarantee that a SUBSTITUTION's participantId is defined.
          if (references.substitutionInheritedPlacement && input.event.participantId !== undefined) {
            await tx.v1GameParticipant.update({
              where: { id: input.event.participantId },
              data: references.substitutionInheritedPlacement,
            });
          }
          const updated = await tx.v1Game.update({
            where: { id: gameId },
            data: { lastSequence: sequence, version: { increment: 1 } },
          });
          const response: GameEventAppendResult = {
            gameId,
            state: updated.state,
            version: updated.version,
            durableCommandId: context.durableCommandId,
            replayed: false,
            clientEventId: input.clientEventId,
            sequence,
            // See GameEventAppendResult.event's doc comment.
            event: toPersistedGameEvent(createdEvent),
          };
          await this.storeIdempotency(tx, {
            actor,
            action: 'event_append',
            resourceType: 'GAME',
            resourceId: gameId,
            durableCommandId: input.clientEventId,
            payloadHash: immutablePayloadHash,
            response,
          });
          await this.writeAudit(
            tx,
            actor,
            'EVENT_APPEND',
            gameId,
            input.clientEventId,
            { version: game.version, state: game.state },
            response,
          );
          // See appendEvent()'s identical comment: GAME_EVENT_APPENDED had no
          // outbox consumer anywhere, and this path already writes a
          // V1OperationAudit row above (unlike appendEvent's primary path) —
          // removing the outbox write loses nothing.
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        isCommandConcurrencyConflict(error.code, error.meta, error.message)
      ) {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: 'A concurrent command won; reload the current game version and retry',
        });
      }
      throw error;
    }
  }

  async reverseEvent(
    user: V1AuthUser,
    gameId: string,
    eventId: string,
    headerIdempotencyKey: string | undefined,
    dto: ReverseGameEventDto,
  ): Promise<GameEventAppendResult> {
    return this.withCommand(
      {
        gameId,
        action: 'event_reverse',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'event_reverse'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientEventId,
        takeoverToken: dto.takeoverToken,
        payload: { eventId, ...dto },
      },
      async (tx, game, context) => {
        this.requireTakeover(game.id, game.sourceType, context);
        const target = await tx.v1GameEvent.findFirst({ where: { id: eventId, gameId } });
        if (target === null) {
          throw this.notFound('GAME_EVENT_NOT_FOUND');
        }
        const alreadyReversed = await tx.v1GameEvent.findFirst({
          where: { gameId, reversesEventId: target.id },
          select: { id: true },
        });
        if (alreadyReversed !== null) {
          throw new ConflictException({
            code: 'EVENT_ALREADY_REVERSED',
            message: 'This event was already reversed once',
          });
        }
        // F66 fix: assignGoalAssist(바로 아래 메서드, Issue #376 follow-up)가 이미
        // 갖고 있던 가드를 reverseEvent에도 그대로 이식한다 — 결과가 OFFICIAL로
        // 확정된 뒤에도 이 커맨드가 무가드였던 탓에, 콘솔에서 골을 취소하면 이벤트
        // 스트림(공개 기록·콘솔 헤더 스코어가 파생)과 확정된 공식 스코어(순위표·브래킷이
        // 읽는 스냅샷, 재계산되지 않음)가 영구히 갈라졌다. 확정 후 정정이 필요하면
        // 사유·검토·확정 기록이 남는 "결과 정정"(createResultCorrection) 흐름을 타야 한다.
        const officialPointer = await tx.v1Game.findUnique({
          where: { id: gameId },
          select: { currentOfficialRevisionId: true },
        });
        if (officialPointer?.currentOfficialRevisionId) {
          const officialRevision = await tx.v1GameResultRevision.findUnique({
            where: { id: officialPointer.currentOfficialRevisionId },
            select: { state: true },
          });
          if (officialRevision?.state === V1GameResultRevisionState.OFFICIAL) {
            throw new ConflictException({
              code: 'RESULT_ALREADY_OFFICIAL',
              message: '이미 확정된 결과예요. 이벤트를 취소하려면 결과 정정을 이용해주세요.',
            });
          }
        }
        const sequence = game.lastSequence + 1;
        await tx.v1GameEvent.create({
          data: {
            gameId,
            sequence,
            clientEventId: dto.clientEventId,
            payloadHash: context.payloadHash,
            type: V1GameEventType.CORRECTION,
            sideId: target.sideId,
            participantId: target.participantId,
            period: target.period,
            clockMs: target.clockMs,
            occurredAt: new Date(),
            actorUserId: actorStorageId(context.actor),
            reversesEventId: target.id,
            payload: { reason: dto.reason },
          },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { lastSequence: sequence, version: { increment: 1 } },
        });
        // GAME_EVENT_REVERSED had the same fate as GAME_EVENT_APPENDED above —
        // no reader anywhere in the codebase — and is removed for the same
        // reason: the `v1_game_event` CORRECTION row created above is the
        // durable record of this reversal.
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          clientEventId: dto.clientEventId,
          sequence,
        };
      },
    );
  }

  /**
   * Issue #376 fix — atomic in-place assist attach/detach for an
   * already-persisted GOAL event, replacing the old "reverseEvent the GOAL
   * (CORRECTION row + version+1), then re-submit a brand-new GOAL with
   * assistParticipantId set" two-step flow the operate console used to run
   * (`operate-console.tsx`'s `attachAssist`, before this fix).
   *
   * That flow broke three ways at once: (1) the console's `submitEvent`
   * closure captured `gameSnapshot.version` from the render BEFORE
   * `reverseEvent`'s version bump landed in state, so the re-submitted GOAL
   * almost always carried a stale `expectedVersion` and was rejected by
   * `assertGameCommandContext`'s VERSION_CONFLICT check; (2) `reverseEvent`
   * never deletes the original row, so the event list kept showing the
   * original GOAL, its CORRECTION, and the resubmitted GOAL as three rows
   * for what a reader experiences as one goal; (3) the official tournament
   * result derivation (`deriveTournamentRevision` below) counted both the
   * original and resubmitted GOAL toward the scorer's goal tally.
   *
   * This command sidesteps all three by never creating a second event at
   * all: it updates `assistParticipantId` on the SAME row via a single
   * version-incrementing command through the same `withCommand` boundary
   * `reverseEvent` uses (same expectedVersion/takeoverToken/idempotency/
   * audit handling), so there is exactly one command in flight and exactly
   * one row before and after.
   *
   * Deliberately does NOT touch `payloadHash` on the target row: that
   * column is the fingerprint of the event's ORIGINAL append payload (used
   * by `retryEvent`'s offline-replay hash pin), not a live checksum of the
   * row's current content -- nothing recomputes and compares it against a
   * fetched row elsewhere. Leaving it alone keeps it meaning "what was
   * originally submitted", which is itself useful audit information once
   * this command can also change the row after the fact.
   *
   * Detaching an assist (`assistParticipantId: null`) intentionally shares
   * this same command rather than getting a separate endpoint -- see
   * `AssignGoalAssistDto`'s doc comment for why.
   *
   * Deliberately does NOT reject on `game.state === ENDED`, matching
   * `reverseEvent`'s existing (also unguarded) behavior -- a correction to
   * a goal's recorded assist is exactly the kind of thing that legitimately
   * needs to happen after a game ends (a review catches a missed assist),
   * and `reverseEvent` already established that corrections are not
   * blocked by TERMINAL_GAME_IMMUTABLE the way fresh appends are. Widening
   * that asymmetry between appendEvent and reverseEvent/this command is a
   * pre-existing product decision, not something this fix introduces or
   * changes.
   *
   * Issue #376 follow-up (alpha finding on fixture
   * 4439fb84-9117-4d9f-b103-b9abda4bfdd0 -- see
   * `syncAssistsIntoSubmittedRevision`'s doc comment for the full per-state
   * rationale, including why that method creates a NEW superseding revision
   * instead of patching the SUBMITTED one in place): this command DOES
   * reject when the game's `currentOfficialRevisionId` currently points at
   * an OFFICIAL revision. Unlike the `game.state === ENDED` looseness
   * above, silently letting an assist edit land on the event stream while a
   * CONFIRMED official revision stays frozen would reproduce the exact
   * event/revision divergence this follow-up fixes, just one state later
   * and against a result already presented as final. An operator who needs
   * to fix an assist after official confirmation must go through the
   * existing "결과 정정" (`createResultCorrection`) flow, which already
   * carries the reason/review/officialize trail built for exactly that.
   * When the current official revision is anything other than OFFICIAL (no
   * revision yet, or the pointer sits on a VOID revision), this command
   * proceeds as before and additionally supersedes a SUBMITTED revision
   * with a fresh, assist-synced, still-SUBMITTED successor, if a resync
   * would actually change anything, via `syncAssistsIntoSubmittedRevision`
   * -- the change is captured in the response's optional
   * `revisionAssistSync` field, which flows into this command's normal
   * `withCommand`-driven `V1OperationAudit` row (`writeAudit` below) the
   * same way `event` above already does, so the sync is traceable through
   * the same audit mechanism this repo already uses rather than a new one
   * -- on top of the successor revision itself being a normal, permanent,
   * independently-visible row in `GET .../result-revisions` (surfaced by
   * the existing `RevisionTimeline` UI exactly like every other revision).
   */
  async assignGoalAssist(
    user: V1AuthUser,
    gameId: string,
    eventId: string,
    headerIdempotencyKey: string | undefined,
    dto: AssignGoalAssistDto,
  ): Promise<GameEventAppendResult> {
    return this.withCommand(
      {
        gameId,
        action: 'event_assist_assign',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'event_reverse'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientEventId,
        takeoverToken: dto.takeoverToken,
        payload: { eventId, ...dto },
      },
      async (tx, game, context) => {
        this.requireTakeover(game.id, game.sourceType, context);
        const target = await tx.v1GameEvent.findFirst({ where: { id: eventId, gameId } });
        if (target === null) {
          throw this.notFound('GAME_EVENT_NOT_FOUND');
        }
        if (target.type !== V1GameEventType.GOAL) {
          throw new UnprocessableEntityException({
            code: 'ASSIST_INVALID',
            message: 'An assist can only be attached to a GOAL event',
          });
        }
        // Same "already reversed" gate reverseEvent itself enforces
        // (`alreadyReversed` above) -- a reversed GOAL is no longer a valid
        // goal, so it cannot gain or lose an assist either.
        const alreadyReversed = await tx.v1GameEvent.findFirst({
          where: { gameId, reversesEventId: target.id },
          select: { id: true },
        });
        if (alreadyReversed !== null) {
          throw new ConflictException({
            code: 'EVENT_ALREADY_REVERSED',
            message: 'This event was already reversed and can no longer be amended',
          });
        }
        if (dto.assistParticipantId !== null) {
          // Same two checks `assertEventReferences` runs for a fresh
          // GOAL+assist append (games.service.ts, ASSIST_INVALID) --
          // duplicated here rather than shared because that helper takes an
          // `AppendGameEventDto` (a full new-event submission) and this
          // command only ever touches one existing field on one existing
          // row.
          if (dto.assistParticipantId === target.participantId) {
            throw new UnprocessableEntityException({
              code: 'ASSIST_INVALID',
              message: 'A scorer cannot be credited with their own assist',
            });
          }
          const assistParticipant = await tx.v1GameParticipant.findFirst({
            where: { gameId: game.id, id: dto.assistParticipantId },
          });
          if (assistParticipant === null || assistParticipant.sideId !== target.sideId) {
            throw new UnprocessableEntityException({
              code: 'ASSIST_INVALID',
              message: 'Assist participant must belong to the scoring side',
            });
          }
        }
        // Issue #376 follow-up -- refuse outright rather than silently
        // letting the event and an already CONFIRMED official revision
        // drift apart the same way the original bug report found event and
        // SUBMITTED revision drifting apart. See this method's doc comment.
        const officialPointer = await tx.v1Game.findUnique({
          where: { id: gameId },
          select: { currentOfficialRevisionId: true },
        });
        if (officialPointer?.currentOfficialRevisionId) {
          const officialRevision = await tx.v1GameResultRevision.findUnique({
            where: { id: officialPointer.currentOfficialRevisionId },
            select: { state: true },
          });
          if (officialRevision?.state === V1GameResultRevisionState.OFFICIAL) {
            throw new ConflictException({
              code: 'RESULT_ALREADY_OFFICIAL',
              message: '이미 확정된 결과예요. 어시스트를 바꾸려면 결과 정정을 이용해주세요.',
            });
          }
        }
        const updatedEvent = await tx.v1GameEvent.update({
          where: { id: target.id },
          data: { assistParticipantId: dto.assistParticipantId },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        // Issue #376 follow-up -- keep a still-pending SUBMITTED revision's
        // participant assist counts honest against the event stream this
        // command just amended, by superseding it with a fresh successor
        // (see the helper's doc comment for why it cannot patch the
        // SUBMITTED row in place). Returns null (folded away below, not
        // embedded as an empty diff) when there is no SUBMITTED revision or
        // nothing actually changed.
        const revisionAssistSync = await this.syncAssistsIntoSubmittedRevision(tx, gameId, context);
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          clientEventId: dto.clientEventId,
          sequence: target.sequence,
          event: toPersistedGameEvent(updatedEvent),
          ...(revisionAssistSync === null ? {} : { revisionAssistSync }),
        };
      },
    );
  }

  /**
   * Task 21 addition: the live operations console needs the actual roster
   * (name/jersey/position) behind each lineup revision to render tappable
   * player targets, not just the revision/state rows `V1GameLineup` itself
   * carries -- `V1GameParticipant` has no Prisma relation back to
   * `V1GameLineup` (see schema), so this is a second bounded query (by
   * `lineupId IN (...)`, not per-row N+1) rather than a nested `include`.
   * Purely additive to the response shape: every field this method already
   * returned is unchanged, `participants` is a new array appended per row.
   */
  async listLineups(user: V1AuthUser, gameId: string) {
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'read');
    // 참가팀 액터는 상대팀 라인업을 미리 볼 수 없다 — team-match 전용 라인업
    // 서비스(getLineup)가 항상 ownSideId로만 조회하는 것과 동일한 공정성 원칙을
    // 여기서도 지킨다. 스태프/platform_ops는 기존대로 양쪽 다 본다.
    const ownSideId =
      actor.role === 'team_manager' || actor.role === 'team_owner'
        ? (await this.prisma.v1GameSide.findFirst({ where: { gameId, teamId: actor.teamId } }))?.id ?? null
        : null;
    const lineups = await this.prisma.v1GameLineup.findMany({
      where: { gameId, ...(ownSideId !== null ? { sideId: ownSideId } : {}) },
      orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
    });
    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { lineupId: { in: lineups.map((lineup) => lineup.id) } },
      orderBy: [{ jerseyNumber: 'asc' }, { createdAt: 'asc' }],
    });
    const participantsByLineupId = groupParticipantsByLineupId(participants);
    return lineups.map((lineup) => ({
      ...lineup,
      participants: participantsByLineupId.get(lineup.id) ?? [],
    }));
  }

  /**
   * T3(기록 입력 UX) 추가 — 라이브 기록 콘솔 전용 읽기 경로. `listLineups()`와
   * 달리 `team_manager`/`team_owner` 액터에게도 양쪽 사이드를 모두 돌려준다:
   * 기록자는 상대팀 선수도 탭해서 카드/파울을 남겨야 한다. 사전 라인업 비공개
   * 원칙(listLineups의 ownSideId 제한)은 "SCHEDULED 상태에서는 여전히 자기
   * 사이드만" 으로 대체 보존한다 — 킥오프 전 상대 전술을 미리 볼 수 없게.
   */
  async listOperationsLineups(user: V1AuthUser, gameId: string) {
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'read');
    const game = await this.prisma.v1Game.findUnique({ where: { id: gameId }, select: { state: true } });
    if (game === null) {
      throw this.notFound();
    }
    const ownSideId =
      game.state === V1GameState.SCHEDULED &&
      (actor.role === 'team_manager' || actor.role === 'team_owner')
        ? (await this.prisma.v1GameSide.findFirst({ where: { gameId, teamId: actor.teamId } }))?.id ?? null
        : null;
    const lineups = await this.prisma.v1GameLineup.findMany({
      where: { gameId, ...(ownSideId !== null ? { sideId: ownSideId } : {}) },
      orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
    });
    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { lineupId: { in: lineups.map((lineup) => lineup.id) } },
      orderBy: [{ jerseyNumber: 'asc' }, { createdAt: 'asc' }],
    });
    const participantsByLineupId = groupParticipantsByLineupId(participants);
    return lineups.map((lineup) => ({
      ...lineup,
      participants: participantsByLineupId.get(lineup.id) ?? [],
    }));
  }

  /**
   * 명단 검인(체크인) — 참가자가 실제로 도착했음을 현장에서 확정한다.
   * 1차 대회 회고: "명단 검인 과정에서 오지 않거나, 하지 않은 사람들에 대한 확인이 어려움".
   *
   * **`withCommand` 를 쓰지 않는다.** 체크인은 라인업 내용을 바꾸지 않고 킥오프 직전 여러
   * 명을 연달아 누르는 조작이라, 버전 커맨드로 만들면 한 명 누를 때마다 revision 이 올라
   * 다음 사람에서 곧바로 409 VERSION_CONFLICT 가 난다. 그래서 게임/라인업 버전과 완전히
   * 분리된 단순 토글로 둔다 — 되돌리기(arrived=false → NULL)도 같은 이유로 값싸야 한다.
   *
   * **경기 상태로 막지 않는다.** 사람은 킥오프 직전은 물론 경기가 시작된 뒤에도 도착하고,
   * 늦게 온 사람을 기록하는 것이 이 기능의 목적이다. 라인업 저장의 deadline 게이트
   * (SCHEDULED 전용)를 여기에 그대로 옮기면 정작 필요한 순간에 잠긴다.
   */
  async setParticipantArrival(
    user: V1AuthUser,
    gameId: string,
    participantId: string,
    arrived: boolean,
  ) {
    // lineup_mutate 는 platform_ops · 라인업 권한을 가진 대회 스태프 · 이 fixture 참가팀의
    // 매니저/오너를 통과시킨다 — 명단 검인을 할 수 있어야 하는 사람과 정확히 같은 집합이다.
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'lineup_mutate');
    const participant = await this.prisma.v1GameParticipant.findFirst({
      where: { id: participantId, gameId },
      select: { id: true, sideId: true, arrivedAt: true },
    });
    if (participant === null) {
      throw this.notFound('GAME_PARTICIPANT_NOT_FOUND');
    }
    // 팀 액터는 자기 팀 사이드만 검인할 수 있다 — saveLineup 과 같은 규칙이다.
    // 스태프/platform_ops 는 어느 쪽이든 검인해야 하므로 팀 액터일 때만 검사한다.
    if (actor.role === 'team_manager' || actor.role === 'team_owner') {
      const side = await this.prisma.v1GameSide.findFirst({
        where: { id: participant.sideId, gameId },
        select: { teamId: true },
      });
      if (side === null || actor.teamId !== side.teamId) {
        throw this.forbidden();
      }
    }
    const arrivedAt = arrived ? (participant.arrivedAt ?? new Date()) : null;
    // 이미 같은 상태면 시각을 다시 쓰지 않는다 — 같은 사람을 두 번 눌러도 최초 확인 시각이
    // 유지돼야 분쟁 시 근거가 된다(위 `?? new Date()` 가 그 역할).
    return this.prisma.v1GameParticipant.update({
      where: { id: participant.id },
      data: { arrivedAt },
      select: { id: true, sideId: true, arrivedAt: true },
    });
  }

  async saveLineup(
    user: V1AuthUser,
    gameId: string,
    sideId: string,
    headerIdempotencyKey: string | undefined,
    dto: SaveGameLineupDto,
  ) {
    return this.withCommand(
      {
        gameId,
        action: 'lineup_save',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'lineup_mutate'),
        expectedVersion: dto.expectedVersion,
        versionScope: 'lineup',
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { sideId, ...dto },
      },
      async (tx, game, context) => {
        if (game.sourceType === V1GameSourceType.TEAM_MATCH) {
          throw new ConflictException({
            code: 'TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN',
            message:
              'Team matches manage lineups only through /team-matches/:teamMatchId/lineup, which enforces roster/eligibility/deadline invariants this generic route does not.',
          });
        }
        // Issue #378: this route had NO deadline gate at all — a director/manager
        // could overwrite a tournament-fixture lineup (DRAFT or SUBMITTED) after
        // kickoff by calling the API directly, even though the frontend hid the
        // save UI once SUBMITTED. `game.state` is already this codebase's single
        // source of truth for "has the game started" — see
        // `staffLineupSubmitRequiresTakeover` above, which reuses the exact same
        // SCHEDULED→LIVE transition (advancePeriod in executeCommand's 'start'
        // command) for the same question. Reject anything past SCHEDULED:
        // LIVE/PAUSED/ENDED obviously must not accept new rosters, and CANCELLED
        // is included too — a cancelled fixture has no upcoming kickoff to staff
        // a lineup for, so there is nothing left to save. Mirrors the sibling
        // team-match path's `LINEUP_DEADLINE_PASSED` gate
        // (team-match-lineup.service.ts saveLineup) — same code, same shape,
        // reworded because the fixture path has no wall-clock startAt deadline
        // and no opponent-correction-request reopen flow to point the caller at.
        if (game.state !== V1GameState.SCHEDULED) {
          throw new ConflictException({
            code: 'LINEUP_DEADLINE_PASSED',
            message: '경기 시작 이후에는 라인업을 직접 수정할 수 없어요.',
          });
        }
        const side = await tx.v1GameSide.findFirst({ where: { id: sideId, gameId } });
        if (side === null) {
          throw this.notFound('GAME_SIDE_NOT_FOUND');
        }
        // 참가팀 액터(team_manager/team_owner)는 자기 팀 사이드만 쓸 수 있다 — 스태프/
        // platform_ops는 sideId 제한 없이 어느 팀 라인업이든 대신 입력할 수 있어야 하므로
        // 팀 액터일 때만 검사한다.
        if (
          context.actor.actorType === 'USER' &&
          (context.actor.role === 'team_manager' || context.actor.role === 'team_owner') &&
          context.actor.teamId !== side.teamId
        ) {
          throw this.forbidden();
        }
        const previous = await tx.v1GameLineup.findFirst({
          where: { gameId, sideId },
          orderBy: { revision: 'desc' },
        });
        const currentLineupRevision = previous?.revision ?? 0;
        if (dto.expectedVersion !== currentLineupRevision) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
            details: { expectedVersion: dto.expectedVersion, currentVersion: currentLineupRevision },
          });
        }
        // team-match-lineup.service.ts#resolveEntries enforces this same gate for the
        // team-match lineup path (LINEUP_SIZE_INVALID against the pinned
        // V1CompetitionConfigVersion.lineup.{min,max}Players) — this generic
        // tournament-fixture route had no equivalent check at all, so a director/staff
        // caller could save a roster of any size regardless of what the tournament's
        // competition config (and, since Task N, the admin's chosen "출전 인원") actually
        // allows. Only starters count toward the cap, matching resolveEntries' contract
        // (bench size is a separate, unrelated concern this route doesn't otherwise gate).
        const startedCount = dto.participants.filter((participant) => participant.started).length;
        const config = await tx.v1CompetitionConfigVersion.findUnique({
          where: { id: game.competitionConfigVersionId },
          select: { lineup: true },
        });
        const lineupLimits = parseLineupLimits(config?.lineup ?? null);
        if (startedCount < lineupLimits.minPlayers || startedCount > lineupLimits.maxPlayers) {
          throw new UnprocessableEntityException({
            code: 'LINEUP_SIZE_INVALID',
            message: `선발 인원은 ${lineupLimits.minPlayers}명 이상 ${lineupLimits.maxPlayers}명 이하여야 해요.`,
          });
        }
        const goalkeeperCode =
          parseLineupCatalog(config?.lineup ?? null).positions.find((position) => position.goalkeeper === true)?.code ??
          'GK';
        const goalkeeperCount = dto.participants.filter(
          (participant) => participant.started && participant.position === goalkeeperCode,
        ).length;
        if (goalkeeperCount !== 1) {
          throw new UnprocessableEntityException({
            code: 'LINEUP_GOALKEEPER_INVALID',
            message: '선발 라인업에는 골키퍼를 정확히 한 명 지정해야 해요.',
          });
        }
        // 라인업에 실려 온 계정(userId) 검증. 이 값이 저장되면 아래에서 신원 연결이
        // 자동으로 생기므로, 아무 계정이나 남의 경기 기록에 붙지 않게 여기서 막는다.
        //
        // 인정 근거는 두 가지이고 **둘 중 하나면 통과**한다:
        //  ① 이 사이드 팀의 active 멤버
        //  ② 이 경기의 참가 등록 명단(V1TournamentPlayer)에 살아 있는 선수
        // ②가 필요한 이유: 대회 라인업 화면은 팀 멤버십이 아니라 **등록 명단**을
        // 출처로 삼는다(resolveFixtureLineupRoster). 등록 이후 팀을 떠났거나 애초에
        // 멤버십 없이 명단에만 오른 선수가 있을 수 있어서, 멤버십만 요구하면 정상적인
        // 라인업 저장이 422로 막힌다. 반대로 명단에도 팀에도 없는 계정은 여전히 거부된다.
        // 같은 요청 안에서 같은 계정이 두 번 오면(선발+후보 중복 지정 등) 별도 코드로 거부.
        const seenLineupUserIds = new Set<string>();
        const rosterUserIds = new Set<string>();
        if (
          game.tournamentFixtureId !== null &&
          dto.participants.some((participant) => participant.userId !== undefined)
        ) {
          // resolveFixtureLineupRoster 와 같은 경로로 이 사이드의 등록을 찾는다 --
          // 라인업 화면이 명단을 읽어 오는 출처와 검증의 출처가 갈리면, 화면에 뜬
          // 선수를 저장할 수 없는 상황이 생긴다.
          const fixture = await tx.v1TournamentFixture.findUnique({
            where: { id: game.tournamentFixtureId },
            select: {
              homeRegistration: { select: { id: true, teamId: true } },
              awayRegistration: { select: { id: true, teamId: true } },
            },
          });
          const registrationId = [fixture?.homeRegistration, fixture?.awayRegistration].find(
            (registration) => registration != null && registration.teamId === side.teamId,
          )?.id;
          if (registrationId !== undefined) {
            const rosterPlayers = await tx.v1TournamentPlayer.findMany({
              where: { registrationId, removedAt: null },
              select: { userId: true },
            });
            for (const player of rosterPlayers) rosterUserIds.add(player.userId);
          }
        }
        for (const participant of dto.participants) {
          if (participant.userId === undefined) continue;
          if (seenLineupUserIds.has(participant.userId)) {
            throw new UnprocessableEntityException({
              code: 'LINEUP_DUPLICATE_USER',
              message: '같은 선수를 라인업에 두 번 넣을 수 없어요.',
            });
          }
          seenLineupUserIds.add(participant.userId);
          if (rosterUserIds.has(participant.userId)) continue;
          const membership =
            side.teamId === null
              ? null
              : await tx.v1TeamMembership.findFirst({
                  where: { teamId: side.teamId, userId: participant.userId, status: 'active' },
                });
          if (membership === null) {
            throw new UnprocessableEntityException({
              code: 'LINEUP_USER_NOT_TEAM_MEMBER',
              message: '참가 명단에 있거나 이 팀에서 활동 중인 선수만 라인업에 연결할 수 있어요.',
            });
          }
        }
        // [P1-b] 대회 경기는 참가자 행을 **재사용**한다 -- 저장할 때마다 새로 만들지 않는다.
        //
        // 예전에는 저장 한 번에 새 라인업 리비전 + 새 참가자 행 한 벌이 통째로 생겼다.
        // 그런데 participant 행에는 그 행에만 붙는 것들이 매달려 있다:
        //  ① `arrivedAt` -- 현장 명단 검인(1차 대회 회고의 "안 온 사람 확인이 어려움").
        //  ② `V1GameResultParticipant.participantId` -- 공식 기록의 개인 귀속.
        //  ③ `V1ParticipantIdentityLink*.participantId` -- 개인 기록 공개의 출발점.
        // 즉 명단을 한 번 더 저장하는 것만으로 검인이 사라지고 신원 연결이 고아가 됐다.
        //
        // **왜 "새 리비전을 안 만든다"가 아니라 "새 행을 안 만든다"인가**: 리비전 번호는
        // 이 경로의 유일한 낙관적 잠금이다(`dto.expectedVersion !== currentLineupRevision`
        // 위 2574, 그리고 제출 경로 2788). 클라이언트도 그 전제로 짜여 있다
        // (fixture-lineup.view-model.ts:146/336). 번호를 고정하면 그 가드 둘이 **살아는
        // 있고 아무것도 못 잡는** 상태가 된다 -- 있는 줄 알고 안심하게 되므로 더 나쁘다.
        // 그래서 DRAFT 라인업 **행 하나를 재사용하면서 revision 은 그대로 올린다**:
        // 참가자는 같은 행에 고정되고, 잠금은 실효를 유지하고, 클라이언트는 안 바뀐다.
        //
        // 제출본(SUBMITTED/LOCKED) 위에는 그대로 **새 행**을 만든다 -- 엄격 셀렉터
        // (selectLatestLineupParticipants)가 제출본을 계속 집어내야 공식 결과와 신원 연결
        // 후보가 비지 않는다. 그 경로에서는 대신 `arrivedAt` 을 이월한다(아래).
        //
        // 범위는 `TOURNAMENT_FIXTURE` 한정이다. TEAM_MATCH 는 위 2528 에서 이미 거부되고,
        // COMPETITION_FIXTURE/FRIENDLY_MATCH 는 아직 쓰는 코드가 없는 값이라 암묵적으로
        // 새 동작에 태우지 않는다 -- 그 둘의 정책이 정해질 때 의도적으로 확장한다.
        const reusesDraftRow =
          game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE &&
          previous !== null &&
          previous.state === V1GameLineupState.DRAFT;
        // 재사용 경로든 이월 경로든 직전 행의 참가자를 신원으로 대조해야 한다.
        const priorParticipants =
          game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE && previous !== null
            ? await tx.v1GameParticipant.findMany({
                where: { gameId, sideId, lineupId: previous.id },
                // **정렬은 필수다.** 아래에서 같은 키의 행을 `shift()` 로 1:1 소진하는데,
                // 동명 게스트 둘(둘 다 userId=null, 둘 다 "김철수")은 **같은 버킷**에 들어간다.
                // `ORDER BY` 없는 SELECT 의 순서는 Postgres 가 보장하지 않으므로, 정렬이
                // 없으면 어느 쪽이 먼저 소진되는지가 DB 반환 순서에 좌우된다 -- 저장할 때마다
                // `arrivedAt` 이월 대상과 재사용되는 행이 뒤바뀔 수 있다(검인이 옆 사람에게
                // 옮겨 붙는데 재현은 불규칙하다).
                //
                // `id` 를 tie-breaker 로 붙이는 이유: 같은 트랜잭션에서 만들어진 행들은
                // `createdAt` 이 동일할 수 있어 그것만으로는 다시 비결정적이 된다.
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              })
            : [];
        // 매칭 키: 계정이 있으면 계정, 게스트는 이름이 유일한 신원이다(V1TeamTacticsBoardEntry
        // 와 같은 규칙). 이름 대조를 게스트로 한정하는 이유는 전술보드에서와 같다 -- 연동
        // 팀원까지 이름으로 묶으면 동명이인이 조용히 한 사람으로 합쳐진다.
        const priorByKey = new Map<string, (typeof priorParticipants)[number][]>();
        for (const row of priorParticipants) {
          const key = row.userId !== null ? `u:${row.userId}` : `g:${row.displayNameSnapshot}`;
          const bucket = priorByKey.get(key);
          if (bucket === undefined) priorByKey.set(key, [row]);
          else bucket.push(row);
        }
        // 같은 키가 여러 행이면(동명 게스트) 먼저 온 것부터 1:1 로 소진한다.
        const takePrior = (participant: SaveGameLineupDto['participants'][number]) => {
          const key =
            participant.userId !== undefined
              ? `u:${participant.userId}`
              : `g:${participant.displayNameSnapshot}`;
          return priorByKey.get(key)?.shift();
        };

        let lineup: { id: string; revision: number };
        if (reusesDraftRow && previous !== null) {
          // 낙관적 잠금 2단: revision 은 **stale 클라이언트**(먼저 열고 나중에 저장)를,
          // 이 CAS 는 **같은 순간 겹치는 트랜잭션**을 잡는다. 리비전만으로는 후자가 안
          // 잡힌다 -- 둘 다 같은 previous 를 읽고 둘 다 통과해 한쪽이 조용히 덮인다.
          // (`V1GameLineup.version` 은 컬럼만 있고 여태 아무도 안 쓰던 값이다.)
          const swapped = await tx.v1GameLineup.updateMany({
            where: { id: previous.id, version: previous.version },
            data: {
              revision: previous.revision + 1,
              version: { increment: 1 },
              formation: dto.formation,
            },
          });
          if (swapped.count === 0) {
            // `currentVersion` 에 `previous.revision` 을 넣으면 **항상 expectedVersion 과
            // 같은 값**이 나간다 -- 위 2574 가드를 통과했다는 것이 곧 둘이 같다는 뜻이라
            // 여기까지 온 시점에 그 둘은 정의상 일치한다. 그러면 두 값을 비교해 재조회
            // 여부를 정하는 클라이언트는 409 를 받고도 "충돌 없음"으로 읽어, 무엇을 해야
            // 할지 모르는 상태가 된다. 그래서 **실패 시점의 실제 최신 revision** 을 다시
            // 읽어 내려준다.
            //
            // 같은 트랜잭션 안에서 다시 읽는 것이 stale 을 볼 것 같지만, 이 경로에서는
            // 안전하다 -- 근거는 격리 수준이다:
            //  · Postgres 기본값 **READ COMMITTED** 에서 트랜잭션 안의 *새 문장*은 다른
            //    트랜잭션이 **커밋한** 변경을 본다.
            //  · `updateMany` 가 `count === 0` 을 돌려줬다는 것은 상대가 **이미 커밋했다**는
            //    뜻이다(커밋 전이었다면 행 잠금에 걸려 블록됐을 것이다).
            //  · 따라서 이 재조회는 반드시 새 값을 본다.
            //
            // **전제를 명시한다: 이 처리는 READ COMMITTED 를 가정한다.** 격리 수준을
            // REPEATABLE READ 이상으로 올리면 이 경로는 애초에 `count === 0` 이 아니라
            // 직렬화 오류로 터지므로, 그때는 이 블록 자체를 다시 설계해야 한다.
            const latest = await tx.v1GameLineup.findFirst({
              where: { gameId, sideId },
              orderBy: { revision: 'desc' },
              select: { revision: true },
            });
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: latest?.revision ?? previous.revision },
            });
          }
          lineup = { id: previous.id, revision: previous.revision + 1 };
        } else {
          lineup = await tx.v1GameLineup.create({
            data: {
              gameId,
              sideId,
              revision: (previous?.revision ?? 0) + 1,
              supersedesId: previous?.id,
              formation: dto.formation,
            },
          });
        }

        for (const participant of dto.participants) {
          const prior = takePrior(participant);
          // 재사용 경로에서는 **짝지어 update** 한다. deleteMany+createMany 로 갈아끼우면
          // 행 id 가 바뀌어 위 ①②③ 이 똑같이 끊긴다 -- 그러면 이 작업을 한 이유가 없다.
          const createdParticipant =
            reusesDraftRow && prior !== undefined
              ? await tx.v1GameParticipant.update({
                  where: { id: prior.id },
                  data: {
                    userId: participant.userId ?? null,
                    displayNameSnapshot: participant.displayNameSnapshot,
                    jerseyNumber: participant.jerseyNumber,
                    position: participant.position,
                    positionX: participant.positionX,
                    positionY: participant.positionY,
                    started: participant.started,
                  },
                })
              : await tx.v1GameParticipant.create({
                  data: {
                    gameId,
                    sideId,
                    lineupId: lineup.id,
                    userId: participant.userId,
                    displayNameSnapshot: participant.displayNameSnapshot,
                    jerseyNumber: participant.jerseyNumber,
                    position: participant.position,
                    positionX: participant.positionX,
                    positionY: participant.positionY,
                    started: participant.started,
                    // 제출본 위에 새 리비전을 여는 경로: 검인은 킥오프 직전이라 제출
                    // **뒤에** 일어나는 것이 정상이므로, 이월하지 않으면 뒤늦은 명단
                    // 수정 한 번에 이미 받아둔 검인이 통째로 사라진다.
                    arrivedAt: prior?.arrivedAt ?? null,
                  },
                });
          if (participant.userId === undefined) continue;
          // 로스터 귀속을 신원 연결(identity link)로 자동 승격한다 -- 방금 만든
          // participant라 정상적으로는 기존 링크가 있을 수 없지만, 방어적으로 한
          // 번 더 확인한다(재시도 등으로 이 루프가 두 번 돌 가능성에 대비).
          await createRosterAssertedIdentityLink(
            tx,
            createdParticipant.id,
            participant.userId,
            { actorType: 'USER', actorUserId: user.id },
            'roster',
          );
        }
        if (reusesDraftRow) {
          // 이번 저장에서 짝을 못 찾고 남은 행 = 명단에서 빠진 사람. 재사용 경로는 행을
          // 그대로 두면 다음 조회에 그 사람이 계속 실리므로 지운다.
          //
          // 여기서 지우는 것이 안전한 이유: 이 경로는 `game.state === SCHEDULED` 에서만
          // 열린다(위 2549 `LINEUP_DEADLINE_PASSED`). 공식 결과 리비전은 경기가 끝나야
          // 생기므로 이 시점에 `V1GameResultParticipant` 가 이 행을 가리킬 수 없다.
          // 라인업에서 빠진 사람의 검인 기록이 함께 사라지는 것도 의도한 동작이다 --
          // 그 사람은 더 이상 이 경기의 명단이 아니다.
          //
          // **신원 연결(identity link)은 같이 지우지 않는다.** 참가자를 만들 때
          // `createRosterAssertedIdentityLink` 가 자동으로 붙으므로(위) 행을 지우면 링크가
          // 고아로 남는다. 그래도 지우지 않는 이유는 두 가지다:
          //  ① 무해하다 -- 링크 소비처를 전수로 확인했다.
          //     · `games.service.ts:3075`·`:3130`, `league-claimable-fixtures.service.ts:144`
          //       — `participantId IN (현재 참가자)` 로 조회한다. 고아는 애초에 안 나온다.
          //     · `public-records/player-card-stats.ts:89` — `where: { userId }` 라 고아 링크를
          //       **읽는다**. 동의 자격 조회(`loadParticipantConsentEligibility`)도
          //       `v1ParticipantIdentityLinkCurrent` 기준이라 고아가 그대로 통과한다.
          //       무해해지는 지점은 그 다음이다: `:110` 의 `V1GameResultParticipant`
          //       조회가 **행을 0건 돌려준다**(SCHEDULED 경기라 결과 자체가 없다).
          //       즉 집계에 0 으로 기여할 뿐 숫자를 왜곡하지 않는다.
          //       (처음엔 "자격 조회에서 걸러진다"고 적었다가 코드를 보고 정정했다 --
          //        걸러지는 곳이 다르다.)
          //  ② 링크는 **감사 이벤트**다(`V1ParticipantIdentityLinkEvent` 는 append-only).
          //     "누가 언제 이 사람을 이 경기에 올렸다가 뺐다"는 기록이라 지우는 쪽이 정보
          //     손실이다.
          // 이 분석을 여기 남기는 이유: 안 적으면 다음 사람이 "고아 링크가 생기는데
          // 괜찮은가"를 처음부터 다시 조사한다.
          const leftovers = [...priorByKey.values()].flat();
          if (leftovers.length > 0) {
            await tx.v1GameParticipant.deleteMany({
              where: { id: { in: leftovers.map((row) => row.id) } },
            });
          }
        }
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        return {
          gameId,
          lineupId: lineup.id,
          lineupRevision: lineup.revision,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
        };
      },
    );
  }

  async submitLineup(
    user: V1AuthUser,
    gameId: string,
    lineupId: string,
    headerIdempotencyKey: string | undefined,
    dto: SubmitGameLineupDto,
  ) {
    return this.withCommand(
      {
        gameId,
        action: 'lineup_submit',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'lineup_mutate'),
        expectedVersion: dto.expectedVersion,
        versionScope: 'lineup',
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        takeoverToken: dto.takeoverToken,
        payload: { lineupId, ...dto },
      },
      async (tx, game, context) => {
        // 두 가드는 서로 다른 sourceType을 다루므로 배타적이다 — 둘 다 유지한다.
        // TEAM_MATCH 차단은 Task 16의 불변식(팀 매치 라인업은 로스터·자격·마감을
        // 강제하는 전용 라우트로만 관리), TOURNAMENT_FIXTURE의 takeover 요구는
        // Task 20의 불변식(라이브 대회 커맨드는 인계 토큰 없이는 실행 불가)이다.
        if (game.sourceType === V1GameSourceType.TEAM_MATCH) {
          throw new ConflictException({
            code: 'TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN',
            message:
              'Team matches manage lineups only through /team-matches/:teamMatchId/lineup, which enforces roster/eligibility/deadline invariants this generic route does not.',
          });
        }
        const actorIsStaff =
          context.actor.actorType === 'USER' &&
          (context.actor.role === 'platform_ops' ||
            context.actor.role === 'tournament_director' ||
            context.actor.role === 'field_operator' ||
            context.actor.role === 'support_readonly');
        if (
          game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE &&
          actorIsStaff &&
          staffLineupSubmitRequiresTakeover(game.state)
        ) {
          // Task 20이 requireTakeover에 gameId를 추가해 인계 토큰을 게임 단위로
          // 검증하도록 좁혔다(2-arg). 통합 브랜치에 남아 있던 1-arg 호출은 그
          // 시그니처 변경 이전 형태라 여기서 함께 정리한다.
          // 참가팀(team_manager/team_owner)의 사전 라인업 제출은 이 불변식 대상이
          // 아니다 — takeover는 "현장 기기가 이 경기를 배타적으로 장악 중"이라는
          // 라이브 운영 개념이라 경기 전 로스터 준비와는 무관하다(Task 27 후속).
          // 스태프도 경기 시작 전(SCHEDULED)에는 같은 이유로 면제한다 —
          // staffLineupSubmitRequiresTakeover 문서 주석 참고.
          this.requireTakeover(game.id, game.sourceType, context);
        }
        const lineup = await tx.v1GameLineup.findFirst({ where: { id: lineupId, gameId } });
        if (lineup === null) {
          throw this.notFound('GAME_LINEUP_NOT_FOUND');
        }
        const latestSideLineup = await tx.v1GameLineup.findFirst({
          where: { gameId, sideId: lineup.sideId },
          orderBy: { revision: 'desc' },
          select: { id: true, revision: true },
        });
        const currentLineupRevision = latestSideLineup?.revision ?? 0;
        if (
          latestSideLineup === null ||
          latestSideLineup.id !== lineup.id ||
          dto.expectedVersion !== currentLineupRevision
        ) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
            details: { expectedVersion: dto.expectedVersion, currentVersion: currentLineupRevision },
          });
        }
        if (
          context.actor.actorType === 'USER' &&
          (context.actor.role === 'team_manager' || context.actor.role === 'team_owner')
        ) {
          const lineupSide = await tx.v1GameSide.findUnique({ where: { id: lineup.sideId } });
          if (lineupSide === null || lineupSide.teamId !== context.actor.teamId) {
            throw this.forbidden();
          }
        }
        // 경고 누적·퇴장 출전정지 가드. 1차 대회 회고 "옐로카드 누적, 레드카드 퇴장등
        // 필요해보임" — 지금까지 이 경로는 정지 여부를 **전혀 검사하지 않아** 퇴장당한
        // 선수가 다음 경기에 그대로 뛸 수 있었다.
        //
        // **저장(saveLineup)이 아니라 제출에 건다.** 초안을 짜는 동안 막으면 팀장이
        // 명단을 구성조차 못 한다 — 제출이 "이 명단으로 뛰겠다"고 확정하는 지점이다.
        await this.assertNoSuspendedStarters(tx, game, lineup.id);
        if (lineup.state !== V1GameLineupState.DRAFT) {
          throw new ConflictException({
            code: 'INVALID_LINEUP_STATE',
            message: 'Only a draft lineup can be submitted',
          });
        }
        const submitted = await tx.v1GameLineup.update({
          where: { id: lineup.id },
          data: {
            state: V1GameLineupState.SUBMITTED,
            submittedAt: new Date(),
            version: { increment: 1 },
          },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        return {
          gameId,
          lineupId: submitted.id,
          lineupRevision: submitted.revision,
          lineupState: submitted.state,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
        };
      },
    );
  }

  /**
   * 참가팀이 대회 경기(fixture) 라인업을 다루기 전에 gameId·자기 sideId를 알아내는
   * 진입점. 공개 기록 엔드포인트(/tournaments/:id/matches/:fixtureId)는 공개 시점
   * 정책(visibilityPolicy)에 걸려 있어 팀이 사전에 라인업을 준비하는 용도로 못 쓴다
   * — 이건 그 정책과 무관하게 참가팀 매니저/오너(또는 스태프)에게만 열리는 별도 경로다.
   * 인가는 resolveActor('read')를 그대로 재사용해 team-match/tournament-fixture
   * 분기 로직을 여기서 다시 만들지 않는다.
   */
  /**
   * "이 기록은 제 것입니다" 화면이 쓰는 목록 (Task 154 P0-5, 사용자 선택 B안).
   *
   * 라인업에 **이름만 올라가고 계정이 연결되지 않은** 참가자를 돌려준다. 선수가 자기
   * 이름을 골라 신원 연결을 신청하는 것이 이 목록의 유일한 용도다.
   *
   * ## 노출 범위를 왜 이렇게 잡았나
   * 인가를 `participant_identity` 스코프로 건다 -- **신청할 수 있는 사람에게만 목록을
   * 보여준다**는 뜻이다. 볼 수만 있고 신청할 수 없는 사람을 만들지 않으므로, 이 API 가
   * 새로운 노출 판단을 만들지 않는다(#673 에서 이미 정한 범위를 그대로 따른다).
   * `read` 스코프로 걸면 관전자 전원에게 미연결 명단이 보이게 되어 훨씬 넓어진다.
   *
   * ## version 을 함께 내리는 이유
   * `requestIdentityLink` 는 `expectedVersion` 을 요구하는데(낙관적 동시성), 공개 경기
   * 응답에는 그 값이 없어 클라이언트가 알 길이 없었다. 목록과 같은 시점의 값을 함께
   * 내려 클라이언트가 별도 조회 없이 바로 신청할 수 있게 한다.
   */
  async listClaimableParticipants(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: { game: { select: { id: true, version: true } } },
    });
    if (fixture === null || fixture.game === null) {
      throw this.notFound('TOURNAMENT_FIXTURE_GAME_NOT_FOUND');
    }
    return this.listClaimableParticipantsForGame(user, fixture.game);
  }

  /**
   * 리그 판 (2026-08-25 대회 패리티 후속). 리그 대진의 게임은 TEAM_MATCH 소스라
   * resolveActor 의 team-match 분기가 `participant_identity` 를 "두 팀 중 한쪽의 활성
   * 멤버"에게 이미 허용한다 — 여기서 새 인가 규칙을 만들지 않고, **teamMatchId 가 정말
   * 이 리그의 대진인지**(리그 스코프)만 추가로 검증한다. 신청·승인 API 는 game 경로
   * (`/games/:gameId/...`)라 소스 불문 그대로 쓴다.
   */
  async listLeagueClaimableParticipants(user: V1AuthUser, leagueId: string, teamMatchId: string) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, leagueId, deletedAt: null },
      select: { game: { select: { id: true, version: true } } },
    });
    if (teamMatch === null || teamMatch.game === null) {
      throw this.notFound('LEAGUE_FIXTURE_GAME_NOT_FOUND');
    }
    return this.listClaimableParticipantsForGame(user, teamMatch.game);
  }

  private async listClaimableParticipantsForGame(
    user: V1AuthUser,
    game: { id: string; version: number },
  ) {
    const gameId = game.id;
    // 신청 자격과 동일한 스코프. 비참가자는 여기서 403 으로 끊긴다.
    await this.resolveActor(this.prisma, gameId, user.id, 'participant_identity');

    // 감사 결함 수정(2026-08-27): 예전엔 gameId 로만 걸러 사이드마다 쌓인 모든 라인업
    // 리비전의 참가자 행을 통째로 돌려줬다 -- listLineups/listOperationsLineups(위
    // 2408/2441)는 물론 deriveTournamentRevision(6073, selectLatestLineupParticipants)도
    // 전부 "사이드별 최신 라인업"으로 스코프하는데 이 목록만 예외였다. 라인업을 한 번이라도
    // 재저장하면(team-match-lineup.service.ts saveLineup) 리비전마다 참가자 행이 통째로
    // 새로 생기고 옛 행은 지워지지 않으므로(v1GameParticipant.delete 경로 자체가 없다),
    // 폐기된 리비전의 동명이인 참가자가 목록에 그대로 남아 화면에서 구분 불가능하게
    // 중복 표시됐다. 그 행을 골라 연결하면 공식 결과(V1GameResultParticipant)는 최신
    // participantId 로만 쓰이므로 개인 기록이 영원히 매칭되지 않는다(public-user-records
    // .service.ts). 최신 리비전으로만 좁혀 애초에 고를 수 없게 한다.
    const lineups = await this.prisma.v1GameLineup.findMany({
      where: { gameId },
      // 공식 결과 스냅샷(deriveTournamentRevision)이 DRAFT 리비전을 빼는 이상, 신원
      // 연결 후보도 같은 기준이어야 한다 — 아니면 위 주석이 경고한 그대로, 공식 결과에
      // 실리지 않을 participantId 를 연결해 개인 기록이 영원히 매칭되지 않는다.
      select: { id: true, sideId: true, revision: true, state: true },
    });
    const participantCandidates = await this.prisma.v1GameParticipant.findMany({
      where: { gameId },
      select: {
        id: true,
        sideId: true,
        lineupId: true,
        displayNameSnapshot: true,
        jerseyNumber: true,
      },
      orderBy: [{ sideId: 'asc' }, { jerseyNumber: 'asc' }],
    });
    const participants = selectLatestLineupParticipants(participantCandidates, lineups);
    if (participants.length === 0) {
      return { gameId, version: game.version, participants: [] };
    }
    // 이미 연결된 참가자는 뺀다 -- 남의 연결을 빼앗는 경로를 애초에 안 만든다.
    // (설령 목록에 넣어도 requestIdentityLink 가 409 로 막지만, 고를 수 있게 보여주는
    //  것 자체가 "가능하다"는 신호가 된다.)
    const linked = await this.prisma.v1ParticipantIdentityLinkCurrent.findMany({
      where: { participantId: { in: participants.map((participant) => participant.id) } },
      select: { participantId: true },
    });
    const linkedIds = new Set(linked.map((row) => row.participantId));
    return {
      gameId,
      version: game.version,
      participants: participants
        .filter((participant) => !linkedIds.has(participant.id))
        .map((participant) => ({
          participantId: participant.id,
          sideId: participant.sideId,
          displayName: participant.displayNameSnapshot,
          jerseyNumber: participant.jerseyNumber,
        })),
    };
  }

  /**
   * 승인함 목록 (2026-08-26, attest UI C안) — 이 경기에서 **내가 승인(attest)할 수 있는**
   * 대기 중 신원 연결 요청을 돌려준다. attest API 는 requestId 를 요구하는데 그것을
   * 알아낼 조회 경로가 없어 승인 UI 를 만들 수 없었다(신청·승인 API 만 존재).
   *
   * ## 노출 범위 = 승인 자격
   * 진입 게이트는 신청과 같은 `participant_identity` 스코프(참가팀 멤버)이고, 그 위에
   * **요청별 승인 자격**(assertAttestorAuthority — TEAM_MATCH 는 그 사이드 팀의
   * owner/manager, TOURNAMENT 는 등록팀 활성 멤버)을 사이드 단위로 판정해 통과하는
   * 요청만 싣는다. 볼 수 있는데 승인은 못 하는 행을 만들지 않는다(claim 목록과 같은
   * 원칙). 본인이 낸 요청도 뺀다 — 스스로 승인할 수 없다(서비스 + DB 트리거).
   *
   * ## pending 판정
   * REQUESTED 이벤트가 있고 종결 이벤트(ATTESTED/REJECTED/EXPIRED)가 없으며 24시간이
   * 지나지 않은 것. 24시간이 지난 요청은 EXPIRED 이벤트를 여기서 쓰지 않고 목록에서만
   * 뺀다 — 만료 이벤트 기록은 attest 시점의 lazy expiry (attestIdentityLink) 소관이다.
   */
  async listPendingIdentityLinkRequests(user: V1AuthUser, gameId: string) {
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { version: true, sourceType: true },
    });
    if (game === null) {
      throw this.notFound();
    }
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'participant_identity');

    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { gameId },
      select: { id: true, sideId: true, displayNameSnapshot: true, jerseyNumber: true },
    });
    if (participants.length === 0) {
      return { gameId, version: game.version, requests: [] };
    }
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));

    const events = await this.prisma.v1ParticipantIdentityLinkEvent.findMany({
      where: { participantId: { in: participants.map((participant) => participant.id) } },
      orderBy: { eventVersion: 'asc' },
    });
    const requestedByRequestId = new Map<string, (typeof events)[number]>();
    const terminalRequestIds = new Set<string>();
    for (const event of events) {
      if (event.action === V1IdentityLinkAction.REQUESTED) {
        requestedByRequestId.set(event.requestId, event);
      } else if (
        event.action === V1IdentityLinkAction.ATTESTED ||
        event.action === V1IdentityLinkAction.REJECTED ||
        event.action === V1IdentityLinkAction.EXPIRED
      ) {
        terminalRequestIds.add(event.requestId);
      }
    }
    const now = Date.now();
    const pending = [...requestedByRequestId.values()].filter(
      (event) =>
        !terminalRequestIds.has(event.requestId) &&
        now - event.effectiveAt.getTime() < IDENTITY_LINK_REQUEST_TTL_MS &&
        event.userId !== user.id,
    );
    if (pending.length === 0) {
      return { gameId, version: game.version, requests: [] };
    }

    // 승인 자격은 사이드(팀) 단위로 갈리므로 사이드마다 1회만 판정한다.
    const sideIds = [
      ...new Set(
        pending
          .map((event) => participantById.get(event.participantId)?.sideId)
          .filter((sideId): sideId is string => typeof sideId === 'string'),
      ),
    ];
    const sides = await this.prisma.v1GameSide.findMany({
      where: { id: { in: sideIds } },
      select: { id: true, teamId: true },
    });
    const canAttestBySideId = new Map<string, boolean>();
    for (const side of sides) {
      try {
        await this.assertAttestorAuthority(this.prisma, gameId, game.sourceType, side.teamId, actor);
        canAttestBySideId.set(side.id, true);
      } catch (error) {
        // ForbiddenException 만 "이 사이드는 내 승인 자격 밖" 판정값으로 쓴다 — 요청별
        // 필터이지 오류가 아니므로 삼키는 것이 맞다(참가팀 멤버 게이트는 위 resolveActor
        // 가 이미 통과시켰다). 그 외(DB 오류 등)를 함께 삼키면 실제 장애가 빈 승인함으로
        // 위장된다(Copilot 리뷰) — 그대로 던진다.
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
        canAttestBySideId.set(side.id, false);
      }
    }
    // 이벤트와 참가자를 여기서 한 쌍으로 확정한다 — 아래 응답 생성에서 다시 조회하며
    // 빈 문자열로 폴백하면 데이터 불일치가 "이름 없는 요청"으로 조용히 나간다(Copilot 리뷰).
    const visible = pending.flatMap((event) => {
      const participant = participantById.get(event.participantId);
      if (participant === undefined || canAttestBySideId.get(participant.sideId) !== true) {
        return [];
      }
      return [{ event, participant }];
    });

    const requesterIds = [
      ...new Set(
        visible.map(({ event }) => event.userId).filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const requesters =
      requesterIds.length === 0
        ? []
        : await this.prisma.v1UserProfile.findMany({
            where: { userId: { in: requesterIds } },
            select: { userId: true, nickname: true },
          });
    const nicknameById = new Map(requesters.map((requester) => [requester.userId, requester.nickname]));

    return {
      gameId,
      // attest 의 expectedVersion 으로 그대로 되돌아가는 값 — claim 목록과 같은 이유로
      // 목록과 같은 시점의 버전을 함께 내린다.
      version: game.version,
      requests: visible.map(({ event, participant }) => ({
        requestId: event.requestId,
        participantId: event.participantId,
        participantDisplayName: participant.displayNameSnapshot,
        jerseyNumber: participant.jerseyNumber,
        sideId: participant.sideId,
        requesterNickname:
          typeof event.userId === 'string' ? (nicknameById.get(event.userId) ?? null) : null,
        requestedAt: event.effectiveAt.toISOString(),
        expiresAt: new Date(event.effectiveAt.getTime() + IDENTITY_LINK_REQUEST_TTL_MS).toISOString(),
      })),
    };
  }

  async resolveFixtureLineupAccess(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: {
        scheduledAt: true,
        game: { select: { id: true } },
        homeRegistration: { select: { id: true, teamId: true, team: { select: { name: true } } } },
        awayRegistration: { select: { id: true, teamId: true, team: { select: { name: true } } } },
      },
    });
    if (fixture === null || fixture.game === null) {
      throw this.notFound('TOURNAMENT_FIXTURE_GAME_NOT_FOUND');
    }
    const gameId = fixture.game.id;
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'read');
    const sides = await this.prisma.v1GameSide.findMany({ where: { gameId } });
    const homeTeamId = fixture.homeRegistration?.teamId ?? null;
    const awayTeamId = fixture.awayRegistration?.teamId ?? null;
    const homeSide = sides.find((side) => side.teamId === homeTeamId) ?? null;
    const awaySide = sides.find((side) => side.teamId === awayTeamId) ?? null;
    const mySideId =
      actor.role === 'team_manager' || actor.role === 'team_owner'
        ? (sides.find((side) => side.teamId === actor.teamId)?.id ?? null)
        : null;
    // F61/F62: `isStaff`만으로는 SUPPORT_READONLY(조회 전용)와 실제로 lineup_mutate
    // 권한이 있는 스태프(field_operator/tournament_director/platform_ops)를 구분할 수
    // 없었다 — 그 결과 SUPPORT_READONLY도 매니저와 동일한 편집기를 받고 저장을 눌러야만
    // 서버 403으로 뒤늦게 걸러졌다. 여기서 'lineup_mutate' 액션으로 resolveActor를 한 번
    // 더 태워 실제 판정을 재사용한다(정책을 여기 복제하지 않음 — tournament-staff-policy.ts
    // 변경에 자동으로 맞춰진다). ForbiddenException은 "이 액션은 못 한다"는 정상 판정값이지
    // 오류가 아니므로 삼키고, 그 외(DB 오류 등)는 그대로 던진다.
    const canMutateLineup = await this.resolveActor(this.prisma, gameId, user.id, 'lineup_mutate')
      .then(() => true)
      .catch((error: unknown) => {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
        return false;
      });
    return {
      gameId,
      mySideId,
      isStaff: actor.role !== 'team_manager' && actor.role !== 'team_owner',
      // F61/F62 fix: 프론트가 "조회 전용 스태프에게는 편집기를 열지 않는다"를 판단할 수
      // 있도록 실제 lineup_mutate 인가 결과를 노출한다. mySideId가 있는(=팀 매니저/오너)
      // 경우도 true다.
      canMutateLineup,
      scheduledAt: fixture.scheduledAt,
      homeSideId: homeSide?.id ?? null,
      homeTeamName: fixture.homeRegistration?.team.name ?? null,
      // 라인업 화면이 참가 등록 명단을 불러오려면 어느 등록(registration)의 명단인지
      // 알아야 한다 — 사이드(팀)당 하나씩 함께 내려준다. 스태프는 양 팀 중 하나를 골라
      // 대신 짤 수 있으므로 자기 팀 것만 주는 형태로는 부족하다.
      homeRegistrationId: fixture.homeRegistration?.id ?? null,
      // 팀 스코프 자산(이전 라인업 히스토리·프리셋)은 teamId로 부른다. sideId만으로는
      // 어느 팀인지 알 수 없어서, 화면이 팀을 알아내려고 조회를 한 번 더 하는 대신
      // 이미 여기서 읽은 값을 그대로 실어 준다.
      homeTeamId,
      awaySideId: awaySide?.id ?? null,
      awayTeamName: fixture.awayRegistration?.team.name ?? null,
      awayRegistrationId: fixture.awayRegistration?.id ?? null,
      awayTeamId,
    };
  }

  /**
   * 이 경기에서 어느 한 팀의 **참가 등록 명단**(V1TournamentPlayer)을 라인업 편집용으로
   * 읽는다. 대회 경기 라인업의 선수는 등록 명단이 유일한 출처이고, 명단에 없는 사람을
   * 임의로 적어 넣는 경로는 없앴다.
   *
   * 인가는 `resolveActor`(read)를 그대로 재사용한다 — 참가팀 매니저·오너는 자기 팀
   * 사이드만, 대회 스태프는 양 팀 모두. 소비자용 로스터 API
   * (`TournamentPlayersService.listPlayers`)를 쓰지 않는 이유가 바로 이것이다: 그쪽은
   * `assertTeamMember` 라 팀에 속하지 않은 스태프가 항상 403이 되는데, 스태프는 팀
   * 매니저가 없는 자리에서 라인업을 대신 제출해야 한다.
   *
   * 응답에는 이름과 userId만 담는다 — 생년월일·성별·연락처 같은 나머지 PII는 라인업을
   * 짜는 데 필요 없다.
   */
  async resolveFixtureLineupRoster(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    sideId: string,
  ) {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: {
        game: { select: { id: true } },
        homeRegistration: { select: { id: true, teamId: true } },
        awayRegistration: { select: { id: true, teamId: true } },
      },
    });
    if (fixture === null || fixture.game === null) {
      throw this.notFound('TOURNAMENT_FIXTURE_GAME_NOT_FOUND');
    }
    const gameId = fixture.game.id;
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'read');
    const side = await this.prisma.v1GameSide.findFirst({ where: { id: sideId, gameId } });
    if (side === null) {
      throw this.notFound('GAME_SIDE_NOT_FOUND');
    }
    const resolved = resolveLineupRosterRegistration({
      actorRole: actor.role,
      actorTeamId:
        actor.role === 'team_manager' || actor.role === 'team_owner' ? (actor.teamId ?? null) : null,
      sideTeamId: side.teamId,
      homeRegistration: fixture.homeRegistration,
      awayRegistration: fixture.awayRegistration,
    });
    if ('denied' in resolved) {
      if (resolved.denied === 'forbidden') throw this.forbidden();
      throw this.notFound('TOURNAMENT_REGISTRATION_NOT_FOUND');
    }
    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId: resolved.registrationId, removedAt: null },
      orderBy: { addedAt: 'asc' },
      select: { id: true, userId: true, realName: true },
    });
    /**
     * 팀이 지정한 고정 등번호(`V1TeamMembership.jerseyNumber`)를 함께 내려준다.
     *
     * 1차 대회(2026-08-15~16) 회고: "라인업에서 선수 번호 등록을 처음에만 하고 추후에는
     * 안하는 문제". 프론트의 등번호 결정 로직은 `loaded ?? teamFixed ?? recent` 3단계로
     * 이미 설계돼 있었는데, **2순위 teamFixed 가 死문이었다** — 이 응답에 번호 자체가
     * 없어서 프론트가 넘길 값을 갖지 못했다. 그래서 팀장이 매 경기 번호를 다시 타이핑해야
     * 했고, 그 반복 입력이 곧 오탈자 발생원이다.
     *
     * 이 사이드 팀의 **active 멤버십만** 본다 — 팀을 떠난 사람의 옛 번호를 되살리면
     * 이미 그 번호를 물려받은 현재 멤버와 충돌한다(스키마에도 (teamId, jerseyNumber)
     * 유니크가 걸려 있다).
     */
    const memberships =
      side.teamId === null
        ? []
        : await this.prisma.v1TeamMembership.findMany({
            where: {
              teamId: side.teamId,
              status: 'active',
              userId: { in: players.map((player) => player.userId) },
            },
            select: { userId: true, jerseyNumber: true },
          });
    const teamJerseyByUserId = new Map(
      memberships.map((membership) => [membership.userId, membership.jerseyNumber]),
    );
    return {
      sideId,
      registrationId: resolved.registrationId,
      players: players.map((player) => ({
        tournamentPlayerId: player.id,
        userId: player.userId,
        name: player.realName,
        /** 팀 고정 등번호. 팀이 지정하지 않았거나 멤버십이 없으면 null. */
        teamJerseyNumber: teamJerseyByUserId.get(player.userId) ?? null,
      })),
    };
  }

  /**
   * 로그인한 사용자가 **매니저·오너로 있는 팀**이 이 대회에서 치르는 경기와 각 경기의
   * 라인업 상태를 한 번에 준다. 대회 일정 화면이 "내 팀 경기가 어느 것이고 무엇을 아직
   * 안 했는지"를 표시하는 데 쓴다 — 이게 없으면 화면은 경기마다 lineup-access를 따로
   * 불러야 해서 경기 수만큼 요청이 늘고, 그마저도 공개 일정 응답과 짝지을 수 없다.
   *
   * 인가는 `resolveActor`가 아니라 팀 멤버십으로 직접 판정한다 — resolveActor는 경기
   * 하나를 전제로 하는데 여기서는 "이 대회에서 내가 이끄는 팀"이 출발점이고, 경기별
   * 판정 기준(홈/원정 등록팀의 owner·manager)은 아래 조회 조건과 정확히 같다.
   */
  async listMyTournamentFixtures(user: V1AuthUser, tournamentId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { teamId: true },
    });
    const myTeamIds = memberships.map((membership) => membership.teamId);
    if (myTeamIds.length === 0) {
      return { teams: [] };
    }
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: { tournamentId, teamId: { in: myTeamIds } },
      select: { id: true, teamId: true, team: { select: { name: true } } },
    });
    if (registrations.length === 0) {
      return { teams: [] };
    }
    const registrationIds = registrations.map((registration) => registration.id);
    const fixtures = await this.prisma.v1TournamentFixture.findMany({
      where: {
        tournamentId,
        OR: [
          { homeRegistrationId: { in: registrationIds } },
          { awayRegistrationId: { in: registrationIds } },
        ],
      },
      select: {
        id: true,
        round: true,
        legNumber: true,
        scheduledAt: true,
        status: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
        group: { select: { name: true } },
        game: { select: { id: true } },
        homeRegistration: { select: { teamId: true, team: { select: { name: true } } } },
        awayRegistration: { select: { teamId: true, team: { select: { name: true } } } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { fixtureNumber: 'asc' }],
    });
    const gameIds = fixtures
      .map((fixture) => fixture.game?.id ?? null)
      .filter((gameId): gameId is string => gameId !== null);
    // 내 팀 사이드와 그 사이드의 최신 라인업만 두 번의 조회로 모은다(경기별 반복 조회 금지).
    const sides =
      gameIds.length === 0
        ? []
        : await this.prisma.v1GameSide.findMany({
            where: { gameId: { in: gameIds }, teamId: { in: myTeamIds } },
            select: { id: true, gameId: true, teamId: true },
          });
    const lineups =
      sides.length === 0
        ? []
        : await this.prisma.v1GameLineup.findMany({
            where: { sideId: { in: sides.map((side) => side.id) } },
            orderBy: { revision: 'desc' },
            select: { sideId: true, state: true, revision: true },
          });
    // F3 fix: 게임이 만들어질 때(createGame/fixture-game-backfill) 사이드마다 revision=1
    // DRAFT 라인업 행이 자동으로 함께 생긴다 — 한 번도 편집하지 않은 라인업도 항상 이 행을
    // 갖는다. 그래서 latestLineupStateBySideId(state만 남기는 공용 헬퍼)를 그대로 쓰면
    // "아직 아무도 저장한 적 없음"이 절대 null이 되지 못하고 항상 'DRAFT'("작성 중")로
    // 보였다. saveLineup은 저장할 때마다 새 revision 행을 만들므로(previous.revision+1,
    // previous는 항상 그 eager 행에서 시작) 실제 저장 여부는 revision>=2로만 구분된다 —
    // revision=1은 이 자동 생성 경로에서만 나온다. 그래서 여기서는 latestLineupStateBySideId를
    // 재사용하지 않고 revision까지 함께 남기는 지역 맵을 따로 만든다.
    const latestLineupBySideId = new Map<string, { state: V1GameLineupState; revision: number }>();
    for (const lineup of lineups) {
      const current = latestLineupBySideId.get(lineup.sideId);
      if (current === undefined || lineup.revision > current.revision) {
        latestLineupBySideId.set(lineup.sideId, { state: lineup.state, revision: lineup.revision });
      }
    }
    const sideByGameAndTeam = new Map<string, { id: string }>();
    for (const side of sides) {
      sideByGameAndTeam.set(`${side.gameId}:${side.teamId}`, { id: side.id });
    }

    return {
      teams: registrations.map((registration) => ({
        registrationId: registration.id,
        teamId: registration.teamId,
        teamName: registration.team.name,
        fixtures: fixtures
          .filter(
            (fixture) =>
              fixture.homeRegistrationId === registration.id ||
              fixture.awayRegistrationId === registration.id,
          )
          .map((fixture) => {
            const isHome = fixture.homeRegistrationId === registration.id;
            const gameId = fixture.game?.id ?? null;
            const side =
              gameId === null
                ? undefined
                : sideByGameAndTeam.get(`${gameId}:${registration.teamId}`);
            return {
              fixtureId: fixture.id,
              gameId,
              sideId: side?.id ?? null,
              round: fixture.round,
              legNumber: fixture.legNumber,
              groupName: fixture.group?.name ?? null,
              scheduledAt: fixture.scheduledAt,
              status: fixture.status,
              isHome,
              opponentTeamName:
                (isHome
                  ? fixture.awayRegistration?.team.name
                  : fixture.homeRegistration?.team.name) ?? null,
              // 라인업을 아직 한 번도 저장하지 않았으면 null — 화면은 이걸 "미작성"으로 읽는다.
              // revision===1은 게임 생성 시 자동으로 깔린 미편집 DRAFT 행이라 저장한 적 없음과
              // 동일하게 취급한다(위 주석 참고).
              lineupState: (() => {
                if (side === undefined) return null;
                const latest = latestLineupBySideId.get(side.id);
                if (latest === undefined || latest.revision === 1) return null;
                return latest.state;
              })(),
            };
          }),
      })),
    };
  }

  async listResultRevisions(user: V1AuthUser, gameId: string) {
    await this.resolveActor(this.prisma, gameId, user.id, 'read');
    return this.prisma.v1GameResultRevision.findMany({
      where: { gameId },
      include: { resultParticipants: true },
      orderBy: { revision: 'desc' },
    });
  }

  async createResultRevision(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: CreateGameResultRevisionDto,
    /**
     * 감사 L-E finding 4 수정: TEAM_MATCH 결과 리비전에 몰수·중단 사유를 심는 내부
     * 전용 파라미터다. `CreateGameResultRevisionDto`(공개 HTTP body)에는 일부러 넣지
     * 않는다 — 이 필드를 DTO에 두면 `games.controller.ts`의 일반 팀결과제출
     * 엔드포인트(팀 캡틴도 호출 가능)로 누구나 임의 결과에 몰수 표식을 붙일 수 있게
     * 된다. 몰수는 `league-match-forfeit.service.ts`·`league-match-result-entry.service.ts`
     * 같은 신뢰된 내부 호출자만 이 파라미터로 넘긴다. 생략하면 스키마 기본값 NORMAL이
     * 그대로 적용된다(`deriveTournamentRevision`의 같은 패턴 참고).
     */
    outcome?: { outcomeReason: 'NORMAL' | 'FORFEIT' | 'ABANDONED'; note: string | null },
  ): Promise<GameRevisionMutationResult> {
    const source = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { sourceType: true },
    });
    if (source === null) {
      throw this.notFound();
    }
    if (source.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE) {
      await this.resolveActor(this.prisma, gameId, user.id, 'read');
      throw new ConflictException({
        code: 'TOURNAMENT_RESULT_DERIVED_ONLY',
        message: 'Tournament result revisions are derived by the end command',
      });
    }
    return this.withCommand(
      {
        gameId,
        action: 'result_revision_create',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'team_result_submit'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: dto,
      },
      async (tx, game, context) => {
        await this.assertTeamMatchMatched(tx, game.teamMatchId);
        const invariant = await this.resultInvariantInput(tx, game, dto);
        try {
          validateGameResultInvariants(invariant);
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const latest = await tx.v1GameResultRevision.findFirst({
          where: { gameId },
          orderBy: { revision: 'desc' },
        });
        // 감사 L-E finding 2 수정: VOID도 CHANGE_REQUESTED와 마찬가지로 "현재 유효한
        // 공식 결과 없음"을 뜻하는 predecessor다 -- revision-state-machine.ts의
        // VOID_REENTRY purpose(assertRevisionSupersession)가 이미 이 설계를 문서화해
        // 두었지만, 지금까지 TOURNAMENT_FIXTURE 레인(tournament-result-review.service.ts)
        // 에만 배선돼 있고 이 TEAM_MATCH 레인은 빠져 있었다 -- 이의 수락으로 무효
        // 처리된 리그 대진은 결과를 다시 넣을 방법이 전혀 없어 시즌 승강이 영구히
        // 막혔다(이 함수는 위에서 TOURNAMENT_FIXTURE를 이미 거부했으므로 이 분기는
        // TEAM_MATCH 전용이다 -- 대회 픽스처의 결과 상태 기계에는 영향이 없다).
        if (
          latest !== null &&
          latest.state !== V1GameResultRevisionState.CHANGE_REQUESTED &&
          latest.state !== V1GameResultRevisionState.VOID
        ) {
          throw new ConflictException({
            code: 'RESULT_REVISION_ALREADY_EXISTS',
            message: 'A new draft requires a change-requested predecessor',
          });
        }
        const revision = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: (latest?.revision ?? 0) + 1,
            score: jsonInput(dto.score),
            eventsHash: dto.eventsHash,
            missingScorer: invariant.missingScorer,
            mvpParticipantId: dto.mvpParticipantId,
            reason: dto.reason,
            ...(outcome === undefined
              ? {}
              : { outcomeReason: outcome.outcomeReason, outcomeNote: outcome.note }),
            createdByActorType: 'USER',
            createdByUserId: user.id,
            supersedesId: latest?.id,
          },
        });
        await tx.v1GameResultParticipant.createMany({
          data: dto.actualParticipants.map((participant) => ({
            resultRevisionId: revision.id,
            participantId: participant.participantId,
            sideId: participant.sideId,
            started: participant.started,
            minutesPlayed: participant.minutesPlayed,
            goals: participant.goals,
            assists: participant.assists ?? 0,
            fouls: participant.fouls ?? 0,
            cards: jsonInput(participant.cards),
            goalkeeper: participant.goalkeeper,
          })),
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          revisionId: revision.id,
          revision: revision.revision,
          revisionState: revision.state,
        };
      },
    );
  }

  async submitResultRevision(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: SubmitGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withCommand(
      {
        gameId,
        action: 'result_revision_submit',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'team_result_submit'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        if (game.sourceType !== V1GameSourceType.TEAM_MATCH) {
          throw new ConflictException({
            code: 'TOURNAMENT_RESULT_DERIVED_ONLY',
            message: 'Tournament result submission is owned by the end command',
          });
        }
        await this.assertTeamMatchMatched(tx, game.teamMatchId);
        this.assertLifecycle(
          game.sourceType,
          'TEAM_RESULT_SUBMISSION',
          game.state,
          V1GameState.ENDED,
        );
        const revision = await tx.v1GameResultRevision.findFirst({
          where: { id: revisionId, gameId },
        });
        if (revision === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        try {
          assertRevisionTransition({
            from: revision.state,
            to: V1GameResultRevisionState.SUBMITTED,
            flow: 'STANDARD',
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const submitted = await tx.v1GameResultRevision.update({
          where: { id: revision.id },
          data: { state: V1GameResultRevisionState.SUBMITTED, submittedAt: new Date() },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { state: V1GameState.ENDED, version: { increment: 1 } },
        });
        // T1-0: team matches never call the tournament `end` command (see
        // TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN above) -- this submission is
        // the only place a team-match game's aggregate reaches ENDED, so
        // whichever period is still LIVE at that moment must close here too,
        // mirroring what `executeCommand('end')` does for tournament
        // fixtures. This is a defensive no-op today: nothing yet opens a
        // team-match period into LIVE (see the design doc's T1-0 decision
        // note) -- it exists so a later period-opening path for team
        // matches closes correctly without this submission path needing to
        // change again.
        //
        // 이슈 #375: `end-period`/`next-period`는 TEAM_MATCH sourceType도
        // 막지 않으므로(위 TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN 가드는 오직
        // `end`만 막는다) 팀매치 경기도 이론상 HALFTIME 도중 이 결과제출
        // 경로로 끝날 수 있다 — `executeCommand('end')`와 동일하게
        // HALFTIME도 함께 닫아 다음 피리어드가 영원히 HALFTIME으로 남지
        // 않게 한다.
        await tx.v1GamePeriod.updateMany({
          where: { gameId, state: { in: [V1GamePeriodState.LIVE, V1GamePeriodState.HALFTIME] } },
          data: { state: V1GamePeriodState.ENDED, endedAt: new Date() },
        });
        if (game.teamMatchId !== null) {
          // Task 16: submission is the literal end-of-match boundary for a team
          // match (see the frozen REST contract note on this route) — the same
          // transaction that ends the Game now also completes its TeamMatch, so
          // review eligibility (reviews.service.ts reads TeamMatch.status/
          // completedAt) keeps working now that the old complete()-only
          // shortcut that used to set this is removed. The `status: { not:
          // completed }` guard makes this idempotent across the correction loop
          // (a later change-request -> corrected-revision -> resubmit cycle finds
          // the TeamMatch already completed and skips the update); the log write
          // below is gated on `.count === 1` for the same reason, so a
          // no-op resubmit never writes a fromStatus==toStatus log row.
          const completion = await tx.v1TeamMatch.updateMany({
            where: { id: game.teamMatchId, status: { not: V1TeamMatchStatus.completed } },
            data: { status: V1TeamMatchStatus.completed, completedAt: new Date() },
          });
          if (completion.count === 1) {
            // assertTeamMatchMatched (above) already established that the TeamMatch's
            // status is `matched` or `completed`; the guard on the updateMany above
            // means a real transition only happens when it was `matched`, so
            // `matched` is the only possible fromStatus here.
            await tx.v1StatusChangeLog.create({
              data: {
                targetType: 'team_match',
                targetId: game.teamMatchId,
                fromStatus: V1TeamMatchStatus.matched,
                toStatus: V1TeamMatchStatus.completed,
                actorType: 'user',
                actorUserId: user.id,
                reason: 'team_match_result_submitted',
              },
            });
            // 매치 ↔ 팀일정 연동(레인 schedule): 결과 제출이 팀 매치의 실질적 종료 시점이라는
            // 바로 위 근거를 그대로 이어받아, 같은 트랜잭션 안에서 연결된 SCHEDULED 팀일정도
            // COMPLETED로 cascade한다. `completion.count === 1` 가드 덕분에 이 블록도 재제출/
            // 정정 루프에서 이미 완료 처리된 것을 다시 건드리지 않는다(자연히 idempotent).
            await cascadeCompleteTeamMatchSchedulesInTx(tx, game.teamMatchId);
          }
        }
        await this.writeOutbox(
          tx,
          `game:${gameId}:revision:${submitted.revision}:submitted`,
          gameId,
          'GAME_RESULT_SUBMITTED',
          { revisionId: submitted.id },
          submitted.id,
        );
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          revisionId: submitted.id,
          revision: submitted.revision,
          revisionState: submitted.state,
        };
      },
    );
  }

  async decideResultRevision(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: DecideGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withCommand(
      {
        gameId,
        action: `result_revision_${dto.decision}`,
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'opponent_result_decide'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        if (game.sourceType !== V1GameSourceType.TEAM_MATCH) {
          throw new ForbiddenException({
            code: 'PERMISSION_DENIED',
            message: 'Tournament review uses the tournament review decision surface',
          });
        }
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${revisionId} FOR UPDATE`;
        const revision = await tx.v1GameResultRevision.findFirst({ where: { id: revisionId, gameId } });
        if (revision === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        const target =
          dto.decision === 'approve'
            ? V1GameResultRevisionState.OFFICIAL
            : V1GameResultRevisionState.CHANGE_REQUESTED;
        try {
          assertRevisionTransition({ from: revision.state, to: target, flow: 'STANDARD' });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const decided = await tx.v1GameResultRevision.update({
          where: { id: revision.id },
          data: {
            state: target,
            officialAt: target === V1GameResultRevisionState.OFFICIAL ? new Date() : null,
          },
        });
        await tx.v1GameResultDecision.create({
          data: {
            revisionId: revision.id,
            decision: dto.decision,
            reason: dto.reason,
            actorType: 'USER',
            actorUserId: user.id,
          },
        });
        const updated = await tx.v1Game.update({
          where: { id: game.id },
          data: {
            version: { increment: 1 },
            currentOfficialRevisionId:
              target === V1GameResultRevisionState.OFFICIAL ? revision.id : undefined,
          },
        });
        await this.writeOutbox(
          tx,
          `game:${gameId}:revision:${decided.revision}:${dto.decision}`,
          gameId,
          target === V1GameResultRevisionState.OFFICIAL
            ? 'GAME_RESULT_OFFICIAL'
            : 'GAME_RESULT_CHANGE_REQUESTED',
          { revisionId: decided.id },
          decided.id,
        );
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          revisionId: decided.id,
          revision: decided.revision,
          revisionState: decided.state,
        };
      },
    );
  }

  // ─── D1-a: TEAM_MATCH 전용 결과 정정 ───────────────────────────────────────
  //
  // 이미 OFFICIAL 인 팀매치 결과를 운영자가 새 스코어로 덮어쓰는 경로. 대회 픽스처는
  // tournament-result-review.service.ts 의 CORRECTION flow(createResultCorrection /
  // officializeResultRevision)로 이미 지원되지만, 그 소비자는 TEAM_MATCH 를 명시적으로
  // 거부한다 -- games/core/revision-state-machine.ts 의 CORRECTION flow 자체(DRAFT가
  // OFFICIAL 이었던 리비전을 슈퍼시드하고, 승격 시 SUBMITTED 를 건너뛰어 DRAFT 에서
  // 곧바로 OFFICIAL 로 전이)는 소스타입을 가리지 않는 공용 계약이라 여기서도 그대로
  // 재사용한다.
  //
  // 두 메서드로 나눈 이유는 tournament 레인과 동일하다: 생성(create)과 승격
  // (officialize)을 분리해 두면 운영자가 화면에서 "정정 내용을 먼저 확인 -> 확정"
  // 흐름을 만들 수 있고, league-matches 레인의 admin 서비스가 이 둘을 이어 붙여
  // "즉시 확정"으로 쓸 수도 있다(league-match-result-entry.service.ts 참고).
  //
  // 인가: 두 메서드 모두 resolveActor 를 'team_result_correction' 액션으로 부른다 --
  // 그 액션은 admin 패스스루만 통과하고(games.service.ts 위쪽 TEAM_MATCH 분기의
  // "if (action === 'team_result_correction') throw this.forbidden();" 참고) 호스트/
  // 상대팀 owner·manager 는 예외 없이 403 이다. 승인 없는 결과 정정을 팀이 스스로
  // 만들어낼 수 없게 하는 것이 이 분리의 핵심이다.

  /**
   * 현재 게임의 currentOfficialRevisionId 를 base 로 삼아 새 DRAFT 정정을 만든다.
   * 생성만으로는 공식 포인터가 바뀌지 않는다 -- officializeTeamMatchResultCorrection
   * 을 별도로 호출해야 실제로 반영된다.
   *
   * `dto` 는 CreateGameResultRevisionDto 를 그대로 재사용한다(팀매치 신규 결과 제출과
   * 같은 모양 -- score/actualParticipants/eventsHash). `actualParticipants` 를 빈
   * 배열로 보내는 것도 허용된다: TEAM_MATCH 소스는 이벤트 스트림 교차검증이 면제되므로
   * (resultInvariantInput 이 매 요청 이벤트 0건을 그대로 통과시킨다) 참가자별 스탯 없이
   * 최종 스코어만 정정하는 운영 조작도 유효한 입력이다.
   */
  async createTeamMatchResultCorrection(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: CreateGameResultRevisionDto,
    /**
     * 감사 L-E finding 4 수정: 정정 리비전에 몰수·중단 사유를 심는 내부 전용
     * 파라미터. `createResultRevision`의 같은 파라미터와 이유가 같다 —
     * `league-match-result-entry.service.ts`(유일한 호출자)가 base 리비전의
     * `outcomeReason`(레거시 데이터는 reason 접두어)과 이번 요청의 명시적 의도를
     * 조합해 계산한 값을 넘긴다. 생략하면 NORMAL(정정은 기본적으로 몰수를 해제한다는
     * 뜻이 아니라 — 이 파라미터는 호출자가 항상 명시적으로 채워 넘긴다).
     */
    outcome?: { outcomeReason: 'NORMAL' | 'FORFEIT' | 'ABANDONED'; note: string | null },
  ): Promise<GameRevisionMutationResult> {
    const source = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { sourceType: true },
    });
    if (source === null) {
      throw this.notFound();
    }
    if (source.sourceType !== V1GameSourceType.TEAM_MATCH) {
      // 이 정정 경로는 리그 팀매치 전용이다 -- 대회 픽스처 정정은
      // tournament-result-review.service.ts 의 별도 경로를 쓴다. createResultRevision
      // 이 TOURNAMENT_FIXTURE 를 거부하는 것과 같은 이유·같은 패턴(위쪽 read 로
      // 감사 로그는 남기되 mutate 는 허용하지 않는다).
      await this.resolveActor(this.prisma, gameId, user.id, 'read');
      throw new ConflictException({
        code: 'RESULT_CORRECTION_TEAM_MATCH_ONLY',
        message: '이 정정 경로는 리그 팀매치 전용이에요.',
      });
    }
    return this.withCommand(
      {
        gameId,
        action: 'team_result_correction_create',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'team_result_correction'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: dto,
      },
      async (tx, game, context) => {
        await this.assertTeamMatchMatched(tx, game.teamMatchId);
        const gameRow = await tx.v1Game.findUniqueOrThrow({
          where: { id: gameId },
          select: { currentOfficialRevisionId: true },
        });
        const latest = await tx.v1GameResultRevision.findFirst({
          where: { gameId },
          orderBy: { revision: 'desc' },
        });
        if (latest === null || latest.state !== V1GameResultRevisionState.OFFICIAL) {
          throw new ConflictException({
            code: 'RESULT_CORRECTION_NO_OFFICIAL_REVISION',
            message: '정정할 공식 결과가 아직 없어요.',
          });
        }
        // base 는 반드시 게임의 **현재** 공식 포인터여야 한다(단순히 자기 state 컬럼이
        // OFFICIAL 인 것으로는 부족하다) -- tournament 레인의 createResultCorrection
        // docblock 이 설명하는 것과 같은 함정: 한 번 슈퍼시드된 리비전은 자기 state
        // 컬럼이 영원히 OFFICIAL 로 남는다.
        if (gameRow.currentOfficialRevisionId !== latest.id) {
          throw new ConflictException({
            code: 'REVISION_MUST_BE_SUPERSEDED',
            message: '가장 최근 리비전이 더 이상 현재 공식 결과가 아니에요.',
          });
        }
        try {
          assertRevisionSupersession({
            baseGameId: latest.gameId,
            successorGameId: gameId,
            baseRevisionId: latest.id,
            supersedesRevisionId: latest.id,
            baseState: latest.state,
            successorState: V1GameResultRevisionState.DRAFT,
            purpose: 'CORRECTION',
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const invariant = await this.resultInvariantInput(tx, game, dto);
        try {
          validateGameResultInvariants(invariant);
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const revision = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: latest.revision + 1,
            score: jsonInput(dto.score),
            eventsHash: dto.eventsHash,
            missingScorer: invariant.missingScorer,
            mvpParticipantId: dto.mvpParticipantId,
            reason: dto.reason,
            ...(outcome === undefined
              ? {}
              : { outcomeReason: outcome.outcomeReason, outcomeNote: outcome.note }),
            createdByActorType: 'USER',
            createdByUserId: user.id,
            supersedesId: latest.id,
          },
        });
        await tx.v1GameResultParticipant.createMany({
          data: dto.actualParticipants.map((participant) => ({
            resultRevisionId: revision.id,
            participantId: participant.participantId,
            sideId: participant.sideId,
            started: participant.started,
            minutesPlayed: participant.minutesPlayed,
            goals: participant.goals,
            assists: participant.assists ?? 0,
            fouls: participant.fouls ?? 0,
            cards: jsonInput(participant.cards),
            goalkeeper: participant.goalkeeper,
          })),
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          revisionId: revision.id,
          revision: revision.revision,
          revisionState: revision.state,
        };
      },
    );
  }

  /**
   * createTeamMatchResultCorrection 이 만든 DRAFT 를 OFFICIAL 로 승격한다. CORRECTION
   * flow(assertRevisionTransition)는 DRAFT -> OFFICIAL 직접 전이를 허용한다 -- 표준
   * 결과 제출(create -> submit -> decide)과 달리 SUBMITTED 를 거치지 않는다. 이 정정은
   * 운영자 단독 조작(상대팀 재승인 없음)이라 SUBMITTED 상태가 표현할 "상대팀 검토 대기"
   * 의미 자체가 없기 때문이다.
   */
  async officializeTeamMatchResultCorrection(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: SubmitGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withCommand(
      {
        gameId,
        action: 'team_result_correction_officialize',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'team_result_correction'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        if (game.sourceType !== V1GameSourceType.TEAM_MATCH) {
          // resolveActor 의 'team_result_correction' 액션이 TOURNAMENT_FIXTURE 에서는
          // tournamentAuthorizationAction 매핑(null)으로 이미 거부하므로 여기 도달하는
          // 것은 실제로 불가능하다 -- decideResultRevision 의 같은 자리 체크와 동일하게
          // 방어적으로만 남긴다.
          throw new ForbiddenException({
            code: 'PERMISSION_DENIED',
            message: 'Tournament correction uses the tournament review decision surface',
          });
        }
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${revisionId} FOR UPDATE`;
        const revision = await tx.v1GameResultRevision.findFirst({ where: { id: revisionId, gameId } });
        if (revision === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        const gameRow = await tx.v1Game.findUniqueOrThrow({
          where: { id: gameId },
          select: { currentOfficialRevisionId: true },
        });
        // 이 정정이 여전히 게임의 **현재** 공식 결과를 슈퍼시드하고 있는지 재확인한다.
        // 생성과 승격 사이에 다른 정정이 먼저 승격됐다면 이 DRAFT 는 stale 이다.
        if (revision.supersedesId === null || revision.supersedesId !== gameRow.currentOfficialRevisionId) {
          throw new ConflictException({
            code: 'REVISION_MUST_BE_SUPERSEDED',
            message: '이 정정은 더 이상 현재 공식 결과를 슈퍼시드하지 않아요.',
          });
        }
        try {
          assertRevisionTransition({
            from: revision.state,
            to: V1GameResultRevisionState.OFFICIAL,
            flow: 'CORRECTION',
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const officialized = await tx.v1GameResultRevision.update({
          where: { id: revision.id },
          data: { state: V1GameResultRevisionState.OFFICIAL, officialAt: new Date() },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 }, currentOfficialRevisionId: revision.id },
        });
        // 같은 outbox 이벤트 타입을 재사용한다 -- game-result-official-projection.service.ts
        // 의 핸들러가 currentOfficialRevisionId 를 다시 읽어 순위표·공개 캐시·팀 전적을
        // 재투영하므로, 정정도 표준 승인과 완전히 같은 다운스트림 경로를 그대로 탄다.
        await this.writeOutbox(
          tx,
          `game:${gameId}:revision:${officialized.revision}:correction_officialize`,
          gameId,
          'GAME_RESULT_OFFICIAL',
          { revisionId: officialized.id },
          officialized.id,
        );
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          revisionId: officialized.id,
          revision: officialized.revision,
          revisionState: officialized.state,
        };
      },
    );
  }

  // ─── D2: TEAM_MATCH 전용 결과 무효화(void) ─────────────────────────────────
  //
  // 이의(dispute) 수락 시 운영자가 정정(createTeamMatchResultCorrection) 대신 고를
  // 수 있는 두 번째 경로(E4). 대회 픽스처의
  // `TournamentResultReviewService.voidResultRevision`과 완전히 같은 패턴을
  // 재사용한다 -- DRAFT/SUBMITTED 를 거치지 않고 새 리비전을 곧바로 VOID 상태로
  // 만들어 현재 공식 리비전을 슈퍼시드한다(assertRevisionTransition 은 VOID 로 가는
  // STANDARD/CORRECTION 전이를 정의하지 않으므로 그 함수를 거치지 않는다 -- 대회
  // 레인의 원본도 마찬가지다).
  //
  // 인가는 'team_result_void' 액션으로 resolveActor 를 부른다 -- admin 패스스루만
  // 통과하고 호스트/상대팀 owner·manager 는 예외 없이 403 이다(위 resolveActor 의
  // "if (action === 'team_result_void') throw this.forbidden();" 참고).
  //
  // 순위표 제외는 이 메서드가 직접 하지 않는다 -- `game.currentOfficialRevisionId`
  // 를 VOID 리비전으로 옮기기만 하면, `GameResultOfficialFactsService`가 VOID
  // 리비전에는 fact 행을 절대 만들지 않으므로(오직 GAME_RESULT_OFFICIAL 투영에서만
  // fact 를 쓴다) `league-match-public.service.ts`의 `standings()`가 그 팀매치를
  // 자동으로 확정 집계에서 빠뜨린다(구조적으로 보장됨 -- league-standings.ts 자체를
  // 고칠 필요가 없다).
  async voidTeamMatchResult(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: VoidTeamMatchResultDto,
  ): Promise<GameRevisionMutationResult> {
    const source = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { sourceType: true },
    });
    if (source === null) {
      throw this.notFound();
    }
    if (source.sourceType !== V1GameSourceType.TEAM_MATCH) {
      // createTeamMatchResultCorrection 과 같은 패턴: read 로 감사 로그는 남기되
      // mutate 는 허용하지 않는다.
      await this.resolveActor(this.prisma, gameId, user.id, 'read');
      throw new ConflictException({
        code: 'RESULT_VOID_TEAM_MATCH_ONLY',
        message: '이 무효 처리 경로는 리그 팀매치 전용이에요.',
      });
    }
    return this.withCommand(
      {
        gameId,
        action: 'team_result_void',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'team_result_void'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: dto,
      },
      async (tx, game, context) => {
        await this.assertTeamMatchMatched(tx, game.teamMatchId);
        const gameRow = await tx.v1Game.findUniqueOrThrow({
          where: { id: gameId },
          select: { currentOfficialRevisionId: true },
        });
        const revision =
          gameRow.currentOfficialRevisionId === null
            ? null
            : await tx.v1GameResultRevision.findFirst({
                where: { id: gameRow.currentOfficialRevisionId, gameId },
              });
        if (revision === null || revision.state !== V1GameResultRevisionState.OFFICIAL) {
          throw new ConflictException({
            code: 'RESULT_VOID_NO_OFFICIAL_REVISION',
            message: '무효 처리할 공식 결과가 아직 없어요.',
          });
        }
        const voidRevision = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: revision.revision + 1,
            state: V1GameResultRevisionState.VOID,
            score: jsonInput(revision.score),
            eventsHash: revision.eventsHash,
            missingScorer: revision.missingScorer,
            mvpParticipantId: revision.mvpParticipantId,
            reason: dto.reason,
            createdByActorType: 'USER',
            createdByUserId: user.id,
            supersedesId: revision.id,
            submittedAt: new Date(),
            officialAt: new Date(),
          },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 }, currentOfficialRevisionId: voidRevision.id },
        });
        await this.writeOutbox(
          tx,
          `game:${gameId}:revision:${voidRevision.revision}:voided`,
          gameId,
          'GAME_RESULT_VOIDED',
          { revisionId: voidRevision.id, supersedesId: revision.id },
          voidRevision.id,
        );
        return {
          gameId,
          state: updated.state,
          version: updated.version,
          durableCommandId: context.durableCommandId,
          replayed: false,
          revisionId: voidRevision.id,
          revision: voidRevision.revision,
          revisionState: voidRevision.state,
        };
      },
    );
  }

  /**
   * D2: 이의(dispute) 제기 인가 게이트. `resolveActor`는 private 이라 외부 모듈
   * (`league-matches/league-match-dispute.service.ts`)이 직접 부를 수 없으므로,
   * 'team_result_dispute_file' 액션 하나만 노출하는 얇은 공개 래퍼를 둔다 --
   * 인가 판정 자체는 여전히 `resolveActor` 단일 지점에서만 일어난다(이 래퍼는
   * 그 결과를 그대로 돌려줄 뿐 스스로 아무것도 판단하지 않는다).
   *
   * admin(platform_ops)도 이 액션을 통과한다(위쪽 admin 패스스루가 TEAM_MATCH
   * 분기 어떤 액션보다도 먼저 적용되기 때문 -- team_result_correction/
   * team_result_void 의 명시적 deny 도 admin 을 막지 않는 것과 동일한 이유)만,
   * 이의는 "팀이 내는 것"이라는 도메인 의미상 `teamId`가 없는 admin 액터는
   * 여기서 별도로 거부한다.
   */
  async assertTeamResultDisputeFileAuthority(
    user: V1AuthUser,
    gameId: string,
  ): Promise<{ actorUserId: string; teamId: string }> {
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'team_result_dispute_file');
    if (actor.teamId === undefined) {
      throw this.forbidden();
    }
    return { actorUserId: actor.actorUserId, teamId: actor.teamId };
  }

  // ─── Task 14: participant identity link + consent (append-only, ≤5s purge) ───
  //
  // Design notes (see games.module.ts callers / task-14 tests for the literal
  // contract these implement):
  // - `userId` on a `V1ParticipantIdentityLinkEvent` row always names the
  //   human centrally relevant to THAT row: the requester for REQUESTED, the
  //   attestor/rejector for ATTESTED/REJECTED, the revoker for REVOKED, and
  //   the original requester (copied forward) for the system-generated
  //   EXPIRED row. `V1ParticipantIdentityLinkCurrent.userId` is populated from
  //   the REQUESTED row specifically, because that is the identity actually
  //   being linked — not whoever later attested it.
  // - `linkId` is minted once per request cycle (`linkId === requestId`) and
  //   never reused; a fresh request after reject/expire/revoke always gets a
  //   new linkId, which is what keeps consent (`consents/grant` requires the
  //   caller's `linkId` to match the *current* link) from silently
  //   reattaching to a superseded identity.
  // - The DB trigger `v1_guard_identity_event` is defense-in-depth (it always
  //   overwrites `effective_at` with `CURRENT_TIMESTAMP`, so a caller-supplied
  //   timestamp can never land even if a future DTO regression allowed the
  //   field through). The service layer performs the same checks earlier so
  //   the API can return the literal, distinguishable contract error codes
  //   (`IDENTITY_LINK_REQUEST_EXPIRED`, self-attestation 403, etc.) instead of
  //   a generic trigger failure string.

  async requestIdentityLink(
    user: V1AuthUser,
    gameId: string,
    participantId: string,
    headerIdempotencyKey: string | undefined,
    dto: RequestIdentityLinkDto,
  ) {
    // 푸시는 롤백할 수 없으므로 트랜잭션 밖에서 보낸다 — 커맨드가 커밋된 뒤에만 발송한다.
    // 재시도(idempotency REPLAY)로 mutate 가 아예 실행되지 않으면 이 값이 null 로 남아
    // 중복 푸시도 생기지 않는다.
    // 지역 변수 대신 박스에 담는다 — 클로저 안에서만 대입하면 TS 가 바깥 읽기 지점을
    // `null` 로 좁혀 버려(제어흐름 분석은 콜백 실행을 모른다) 사용이 불가능해진다.
    const push: { plan: IdentityAttestPushPlan | null } = { plan: null };
    const result = await this.withParticipantCommand(
      {
        gameId,
        action: 'identity_link_request',
        resourceId: participantId,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { participantId, ...dto },
        resolveActor: (tx) => this.resolveActor(tx, gameId, user.id, 'participant_identity'),
      },
      async (tx, _game, actor, context) => {
        const participant = await tx.v1GameParticipant.findFirst({
          where: { id: participantId, gameId },
          select: { id: true },
        });
        if (participant === null) {
          throw this.notFound('GAME_PARTICIPANT_NOT_FOUND');
        }
        const current = await tx.v1ParticipantIdentityLinkCurrent.findUnique({
          where: { participantId },
        });
        if (current !== null) {
          throw new ConflictException({
            code: 'IDENTITY_LINK_ALREADY_ACTIVE',
            message: '이미 다른 사용자와 연결된 참가자예요.',
          });
        }
        const last = await tx.v1ParticipantIdentityLinkEvent.findFirst({
          where: { participantId },
          orderBy: { eventVersion: 'desc' },
        });
        if (last !== null && last.action === V1IdentityLinkAction.REQUESTED) {
          const stillPending = Date.now() - last.effectiveAt.getTime() < IDENTITY_LINK_REQUEST_TTL_MS;
          if (stillPending) {
            throw new ConflictException({
              code: 'IDENTITY_LINK_REQUEST_PENDING',
              message: '이미 대기 중인 연결 요청이 있어요.',
            });
          }
          await appendIdentityEvent(tx, {
            participantId,
            linkId: last.linkId,
            requestId: last.requestId,
            action: V1IdentityLinkAction.EXPIRED,
            userId: last.userId,
            actorType: V1IdentityActorType.SYSTEM,
            systemActor: 'IDENTITY_LINK_EXPIRY',
          });
        }
        const requestId = randomUUID();
        const created = await appendIdentityEvent(tx, {
          participantId,
          linkId: requestId,
          requestId,
          action: V1IdentityLinkAction.REQUESTED,
          userId: user.id,
          actorType: V1IdentityActorType.USER,
          actorUserId: user.id,
        });
        // 승인 자격자에게 인앱 알림 (attest UI C안) — 같은 tx 라 신청 커밋 = 알림 존재.
        // businessKey 멱등이라 커맨드 재시도에도 재알림하지 않는다. 발송 정책·순환
        // 회피 이유는 identity-attest-notification.ts 헤더 참조.
        push.plan = await writeIdentityAttestRequestNotifications(tx, {
          gameId,
          participantId,
          requestId,
          requesterUserId: user.id,
        });
        // 24시간 뒤 만료를 확정하는 예약 잡 — 아무도 확인하지 않아도 요청이 원장에서
        // 종결되고 신청자가 통보를 받는다(identity-link-expiry.service.ts).
        await scheduleIdentityLinkExpiry(tx, {
          gameId,
          participantId,
          requestId,
          requestedAt: created.effectiveAt,
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        const response = {
          gameId,
          participantId,
          requestId,
          state: 'pending_attestation' as const,
          version: updated.version,
          effectiveAt: created.effectiveAt.toISOString(),
          expiresAt: new Date(created.effectiveAt.getTime() + IDENTITY_LINK_REQUEST_TTL_MS).toISOString(),
          replayed: false,
        };
        await this.writeAudit(
          tx,
          actor,
          'IDENTITY_LINK_REQUESTED',
          gameId,
          context.durableCommandId,
          null,
          response,
        );
        return response;
      },
    );

    // 커밋 뒤 best-effort 푸시. 실패해도 이미 커밋된 인앱 알림은 그대로 남고, 신청
    // 응답에도 영향을 주지 않는다.
    const plan = push.plan;
    if (plan !== null && this.webPush !== undefined) {
      for (const recipientUserId of plan.recipients) {
        void this.webPush
          .sendToUser(recipientUserId, {
            title: plan.title,
            body: plan.body,
            url: plan.url ?? undefined,
          })
          .catch((error: unknown) => {
            // best-effort 이지만 조용히 삼키지는 않는다 — 구독 조회·발송이 계속 실패해도
            // 아무 흔적이 없으면 운영에서 알아챌 방법이 없다(Copilot 리뷰).
            this.pushLogger.warn(
              `web push failed for identity attest request (game=${gameId}, recipient=${recipientUserId}): ${String(error)}`,
            );
          });
      }
    }
    return result;
  }

  async attestIdentityLink(
    user: V1AuthUser,
    gameId: string,
    participantId: string,
    requestId: string,
    headerIdempotencyKey: string | undefined,
    dto: AttestIdentityLinkDto,
  ) {
    // The lazy-expiry write must durably commit even though the request as a
    // whole still fails with 409 — so `mutate` never throws for the expiry
    // case (a throw would roll back the whole transaction, discarding the
    // EXPIRED event we just appended). Instead it returns a tagged result and
    // the 409 is raised here, after `withParticipantCommand`'s transaction
    // has already committed.
    // 승인/거절 결정 통보(2026-08-27 감사 결함 수정) — 감사 결함: 결정 자체가
    // 신청자에게 어떤 경로로도 통보되지 않았다. requestIdentityLink 의 push box 패턴을
    // 그대로 따른다: 푸시는 롤백할 수 없으므로 tx 밖에서, 커밋 뒤에만 보낸다.
    const decisionPush: { plan: IdentityAttestDecisionPushPlan | null } = { plan: null };
    const result = await this.withParticipantCommand(
      {
        gameId,
        action: 'identity_link_attest',
        resourceId: participantId,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { participantId, requestId, ...dto },
        resolveActor: (tx) => this.resolveActor(tx, gameId, user.id, 'participant_identity'),
      },
      async (tx, _game, actor, context) => {
        const requested = await tx.v1ParticipantIdentityLinkEvent.findFirst({
          where: { participantId, requestId, action: V1IdentityLinkAction.REQUESTED },
        });
        if (requested === null) {
          throw this.notFound('IDENTITY_LINK_REQUEST_NOT_FOUND');
        }
        const terminal = await tx.v1ParticipantIdentityLinkEvent.findFirst({
          where: {
            participantId,
            requestId,
            action: {
              in: [V1IdentityLinkAction.ATTESTED, V1IdentityLinkAction.REJECTED, V1IdentityLinkAction.EXPIRED],
            },
          },
        });
        if (terminal !== null) {
          throw new ConflictException({
            code: 'IDENTITY_LINK_ALREADY_DECIDED',
            message: '이미 처리된 요청이에요.',
          });
        }
        const expired = Date.now() - requested.effectiveAt.getTime() >= IDENTITY_LINK_REQUEST_TTL_MS;
        if (expired) {
          const expiredEvent = await appendIdentityEvent(tx, {
            participantId,
            linkId: requested.linkId,
            requestId,
            action: V1IdentityLinkAction.EXPIRED,
            userId: requested.userId,
            actorType: V1IdentityActorType.SYSTEM,
            systemActor: 'IDENTITY_LINK_EXPIRY',
          });
          const updatedOnExpiry = await tx.v1Game.update({
            where: { id: gameId },
            data: { version: { increment: 1 } },
          });
          const expiredResponse = {
            outcome: 'expired' as const,
            gameId,
            participantId,
            requestId,
            version: updatedOnExpiry.version,
            effectiveAt: expiredEvent.effectiveAt.toISOString(),
            replayed: false,
          };
          await this.writeAudit(
            tx,
            actor,
            'IDENTITY_LINK_EXPIRED',
            gameId,
            context.durableCommandId,
            null,
            expiredResponse,
          );
          return expiredResponse;
        }
        if (requested.userId === actor.actorUserId) {
          throw new ForbiddenException({
            code: 'IDENTITY_LINK_SELF_ATTESTATION_FORBIDDEN',
            message: '본인이 신청한 연결은 스스로 승인할 수 없어요.',
          });
        }
        const participant = await tx.v1GameParticipant.findFirst({
          where: { id: participantId, gameId },
          select: { sideId: true },
        });
        if (participant === null) {
          throw this.notFound('GAME_PARTICIPANT_NOT_FOUND');
        }
        const side = await tx.v1GameSide.findUnique({ where: { id: participant.sideId } });
        // sourceType 은 자격 판정을 가르므로 여기서 직접 읽는다 -- withParticipantCommand 가
        // 넘겨주는 game 은 id/version 만 담고 있다.
        const commandGame = await tx.v1Game.findUniqueOrThrow({
          where: { id: gameId },
          select: { sourceType: true },
        });
        await this.assertAttestorAuthority(
          tx,
          gameId,
          commandGame.sourceType,
          side?.teamId ?? null,
          actor,
        );

        const action =
          dto.decision === 'approve' ? V1IdentityLinkAction.ATTESTED : V1IdentityLinkAction.REJECTED;
        const decided = await appendIdentityEvent(tx, {
          participantId,
          linkId: requested.linkId,
          requestId,
          action,
          userId: actor.actorUserId,
          actorType: V1IdentityActorType.USER,
          actorUserId: actor.actorUserId,
          reason: dto.reason,
        });
        if (action === V1IdentityLinkAction.ATTESTED) {
          await tx.v1ParticipantIdentityLinkCurrent.create({
            data: {
              participantId,
              linkId: requested.linkId,
              userId: requested.userId,
              version: 1,
              effectiveFrom: decided.effectiveAt,
            },
          });
        }
        // 신청자에게 승인/거절 결과를 통보 — 같은 tx 라 결정 커밋 = 알림 존재.
        decisionPush.plan = await writeIdentityAttestDecisionNotification(tx, {
          gameId,
          participantId,
          requestId,
          requesterUserId: requested.userId,
          decision: dto.decision,
          reason: dto.reason,
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        const response = {
          outcome: 'decided' as const,
          gameId,
          participantId,
          requestId,
          linkId: requested.linkId,
          decision: dto.decision,
          linkState: action === V1IdentityLinkAction.ATTESTED ? ('active' as const) : ('rejected' as const),
          version: updated.version,
          effectiveAt: decided.effectiveAt.toISOString(),
          replayed: false,
        };
        await this.writeAudit(
          tx,
          actor,
          action === V1IdentityLinkAction.ATTESTED ? 'IDENTITY_LINK_ATTESTED' : 'IDENTITY_LINK_REJECTED',
          gameId,
          context.durableCommandId,
          null,
          response,
        );
        // PARTICIPANT_IDENTITY_LINKED used to be queued to the outbox here.
        // Removed (outbox-handler cleanup task): no reader anywhere, and the
        // writeAudit() call above already durably records this decision in
        // V1OperationAudit inside the same transaction — the outbox write
        // was a pure duplicate that nothing ever claimed. getPublicParticipant()
        // reads live (see its docblock), so there was never a cache to
        // invalidate either.
        return response;
      },
    );
    if (result.outcome === 'expired') {
      throw new ConflictException({
        code: 'IDENTITY_LINK_REQUEST_EXPIRED',
        message: '연결 요청이 만료됐어요.',
      });
    }
    // 커밋 뒤 best-effort 푸시. 실패해도 이미 커밋된 인앱 알림은 그대로 남고, 승인/거절
    // 응답에도 영향을 주지 않는다(requestIdentityLink 와 동일한 정책).
    const decisionPlan = decisionPush.plan;
    if (decisionPlan !== null && this.webPush !== undefined) {
      void this.webPush
        .sendToUser(decisionPlan.recipientUserId, {
          title: decisionPlan.title,
          body: decisionPlan.body,
          url: decisionPlan.url ?? undefined,
        })
        .catch((error: unknown) => {
          this.pushLogger.warn(
            `web push failed for identity attest decision (game=${gameId}, recipient=${decisionPlan.recipientUserId}): ${String(error)}`,
          );
        });
    }
    return result;
  }

  async revokeIdentityLink(
    user: V1AuthUser,
    gameId: string,
    participantId: string,
    linkId: string,
    headerIdempotencyKey: string | undefined,
    dto: RevokeIdentityLinkDto,
  ) {
    return this.withParticipantCommand(
      {
        gameId,
        action: 'identity_link_revoke',
        resourceId: participantId,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { participantId, linkId, ...dto },
        resolveActor: (tx) => this.resolveActor(tx, gameId, user.id, 'participant_identity'),
      },
      async (tx, _game, actor, context) => {
        const current = await tx.v1ParticipantIdentityLinkCurrent.findUnique({
          where: { participantId },
        });
        if (current === null || current.linkId !== linkId) {
          throw this.notFound('IDENTITY_LINK_NOT_FOUND');
        }
        if (actor.role !== 'platform_ops' && current.userId !== actor.actorUserId) {
          throw this.forbidden();
        }
        const revoked = await appendIdentityEvent(tx, {
          participantId,
          linkId,
          requestId: linkId,
          action: V1IdentityLinkAction.REVOKED,
          userId: actor.actorUserId,
          actorType: V1IdentityActorType.USER,
          actorUserId: actor.actorUserId,
          reason: dto.reason,
        });
        await tx.v1ParticipantIdentityLinkCurrent.delete({ where: { participantId } });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        const response = {
          gameId,
          participantId,
          linkId,
          version: updated.version,
          effectiveAt: revoked.effectiveAt.toISOString(),
          purgeDeadline: new Date(revoked.effectiveAt.getTime() + 5000).toISOString(),
          replayed: false,
        };
        await this.writeAudit(
          tx,
          actor,
          'IDENTITY_LINK_REVOKED',
          gameId,
          context.durableCommandId,
          null,
          response,
        );
        // PARTICIPANT_IDENTITY_REVOKED — same removal rationale as
        // PARTICIPANT_IDENTITY_LINKED above: no reader, and writeAudit()
        // already made this durable. The ≤5s purge guarantee comes from
        // v1ParticipantIdentityLinkCurrent.delete() above running
        // synchronously in this same transaction, not from any async worker.
        return response;
      },
    );
  }

  async grantParticipantConsent(
    user: V1AuthUser,
    gameId: string,
    participantId: string,
    headerIdempotencyKey: string | undefined,
    dto: GrantParticipantConsentDto,
  ) {
    return this.withParticipantCommand(
      {
        gameId,
        action: 'consent_grant',
        resourceId: participantId,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { participantId, ...dto },
        resolveActor: (tx) => this.resolveActor(tx, gameId, user.id, 'participant_identity'),
      },
      async (tx, _game, actor, context) => {
        const current = await tx.v1ParticipantIdentityLinkCurrent.findUnique({
          where: { participantId },
        });
        if (current === null || current.userId !== actor.actorUserId) {
          throw this.forbidden();
        }
        if (current.linkId !== dto.linkId) {
          throw new ConflictException({
            code: 'CONSENT_LINK_MISMATCH',
            message: '연결 정보가 최신 상태가 아니에요. 새로고침 후 다시 시도해 주세요.',
          });
        }
        const last = await tx.v1ParticipantConsentSnapshot.findFirst({
          where: { participantId },
          orderBy: { consentVersion: 'desc' },
        });
        const created = await tx.v1ParticipantConsentSnapshot.create({
          data: {
            participantId,
            linkId: dto.linkId,
            consentVersion: (last?.consentVersion ?? 0) + 1,
            state: V1ConsentState.GRANTED,
            policyHash: dto.policyHash,
            actorUserId: actor.actorUserId,
          },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        const response = {
          gameId,
          participantId,
          consentVersion: created.consentVersion,
          state: created.state,
          effectiveAt: created.effectiveAt.toISOString(),
          version: updated.version,
          replayed: false,
        };
        await this.writeAudit(
          tx,
          actor,
          'PARTICIPANT_CONSENT_GRANTED',
          gameId,
          context.durableCommandId,
          null,
          response,
        );
        // PARTICIPANT_CONSENT_GRANTED — same removal rationale: no reader,
        // and writeAudit() above already made this durable.
        return response;
      },
    );
  }

  async revokeParticipantConsent(
    user: V1AuthUser,
    gameId: string,
    participantId: string,
    headerIdempotencyKey: string | undefined,
    dto: RevokeParticipantConsentDto,
  ) {
    return this.withParticipantCommand(
      {
        gameId,
        action: 'consent_revoke',
        resourceId: participantId,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { participantId, ...dto },
        resolveActor: (tx) => this.resolveActor(tx, gameId, user.id, 'participant_identity'),
      },
      async (tx, _game, actor, context) => {
        const current = await tx.v1ParticipantIdentityLinkCurrent.findUnique({
          where: { participantId },
        });
        const isLinkedCaller = current !== null && current.userId === actor.actorUserId;
        if (!isLinkedCaller && actor.role !== 'platform_ops') {
          throw this.forbidden();
        }
        // 스냅샷 조회는 참가자의 **현재 링크**로 스코프한다. 죽은 linkId 아래
        // 남아 있던 낡은 GRANTED 를, 그것을 준 적 없는 새 링크 보유자가 뒤집어
        // 이력을 날조하는 일을 막기 위해서다(공개 판정도 public-consent.ts 에서
        // 현재 linkId 기준으로만 스냅샷을 읽으므로 낡은 스냅샷은 애초에 무시된다).
        // 현재 링크가 아예 없는 platform_ops 만 예외로 참가자 전체를 본다.
        //
        // 예전에는 "직전 스냅샷이 GRANTED 여야만 철회 가능"이었다. 그 규칙은 참가자
        // 스냅샷이 공개 동의의 유일한 출처이던 시절의 것이고, 지금은 사용자 단위
        // `V1UserRecordConsent` 가 출처다 -- 라인업에서 자동 연결(ROSTER_ASSERTED)된
        // 참가 기록은 참가자 스냅샷을 한 번도 거치지 않으므로, 옛 가드를 두면 당사자가
        // 자기 기록 하나만 숨기는 길이 아예 막힌다. 그래서 "현재 링크가 내 것이면
        // 스냅샷이 없어도 숨길 수 있다"로 바꾸되, 새 스냅샷은 언제나 현재 링크 아래에
        // 쓴다 -- 위의 날조 시나리오는 그대로 불가능하다.
        const scoped = await tx.v1ParticipantConsentSnapshot.findFirst({
          where: current === null ? { participantId } : { participantId, linkId: current.linkId },
          orderBy: { consentVersion: 'desc' },
        });
        if (scoped !== null && scoped.state === V1ConsentState.REVOKED) {
          throw new ConflictException({
            code: 'CONSENT_ALREADY_REVOKED',
            message: '이미 공개에서 제외된 기록이에요.',
          });
        }
        const targetLinkId = scoped?.linkId ?? current?.linkId ?? null;
        if (targetLinkId === null) {
          throw new ConflictException({
            code: 'CONSENT_NOT_GRANTED',
            message: '철회할 동의 내역이 없어요.',
          });
        }
        // policyHash 는 이력 표기용이다. 직전 스냅샷이 없으면(자동 연결만 된 경우)
        // 사용자 단위 동의에 쓰인 해시를 물려받고, 그것마저 없으면 상수를 남긴다.
        const userConsent =
          current === null
            ? null
            : await tx.v1UserRecordConsent.findUnique({
                where: { userId: current.userId },
                select: { policyHash: true },
              });
        // consentVersion 은 `@@unique([participantId, consentVersion])` 를 공유하므로
        // 링크로 스코프하지 않은 참가자 전체 최댓값에서 이어 붙인다 -- 링크가 교체된
        // 참가자에서 옛 링크 쪽 버전과 충돌하지 않게 한다.
        const highest = await tx.v1ParticipantConsentSnapshot.findFirst({
          where: { participantId },
          orderBy: { consentVersion: 'desc' },
          select: { consentVersion: true },
        });
        const created = await tx.v1ParticipantConsentSnapshot.create({
          data: {
            participantId,
            linkId: targetLinkId,
            consentVersion: (highest?.consentVersion ?? 0) + 1,
            state: V1ConsentState.REVOKED,
            policyHash: scoped?.policyHash ?? userConsent?.policyHash ?? 'participant-hide-override',
            actorUserId: actor.actorUserId,
          },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        const response = {
          gameId,
          participantId,
          consentVersion: created.consentVersion,
          state: created.state,
          effectiveAt: created.effectiveAt.toISOString(),
          purgeDeadline: new Date(created.effectiveAt.getTime() + 5000).toISOString(),
          version: updated.version,
          replayed: false,
        };
        await this.writeAudit(
          tx,
          actor,
          'PARTICIPANT_CONSENT_REVOKED',
          gameId,
          context.durableCommandId,
          null,
          response,
        );
        // PARTICIPANT_CONSENT_REVOKED — same removal rationale as the grant
        // path above: no reader, writeAudit() above already made this
        // durable, and the ≤5s purge guarantee comes from the live read path
        // (getPublicParticipant()) immediately reflecting the new REVOKED
        // snapshot, not from any async worker.
        return response;
      },
    );
  }

  /**
   * Consent-safe public projection for a single participant. Not exposed as
   * its own public HTTP route in Task 14 — the public bracket/record surfaces
   * are Task 24's — but the read is intentionally live (no cache) so any
   * caller of it inherits the ≤5s (in practice: immediate) purge guarantee
   * for free once a consent/identity revoke has committed.
   */
  async getPublicParticipant(
    gameId: string,
    participantId: string,
  ): Promise<PublicParticipantProjection> {
    const participant = await this.prisma.v1GameParticipant.findFirst({
      where: { id: participantId, gameId },
      select: { id: true },
    });
    if (participant === null) {
      throw this.notFound('GAME_PARTICIPANT_NOT_FOUND');
    }
    const current = await this.prisma.v1ParticipantIdentityLinkCurrent.findUnique({
      where: { participantId },
    });
    const latestConsent =
      current === null
        ? null
        : await this.prisma.v1ParticipantConsentSnapshot.findFirst({
            where: { participantId, linkId: current.linkId },
            orderBy: { consentVersion: 'desc' },
            select: { state: true },
          });
    const nickname =
      current === null
        ? null
        : ((
            await this.prisma.v1UserProfile.findUnique({
              where: { userId: current.userId },
              select: { nickname: true },
            })
          )?.nickname ?? null);
    return projectParticipantForPublic({
      participantId,
      currentLink: current === null ? null : { userId: current.userId },
      latestConsent: latestConsent === null ? null : { state: latestConsent.state },
      nickname,
    });
  }

  private async withParticipantCommand<T extends object>(
    input: {
      gameId: string;
      action: string;
      resourceId: string;
      expectedVersion: number;
      headerIdempotencyKey: string | undefined;
      bodyCommandId: string;
      payload: unknown;
      resolveActor: (tx: Transaction) => Promise<Extract<GameActorScope, { actorType: 'USER' }>>;
    },
    mutate: (
      tx: Transaction,
      game: { id: string; version: number },
      actor: Extract<GameActorScope, { actorType: 'USER' }>,
      context: GameCommandContext,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${input.gameId} FOR UPDATE`;
          const game = await tx.v1Game.findUnique({
            where: { id: input.gameId },
            select: { id: true, version: true },
          });
          if (game === null) {
            throw this.notFound();
          }
          const actor = await input.resolveActor(tx);
          const payloadHash = canonicalGameCommandPayloadHash(input.payload);
          let context: GameCommandContext;
          try {
            context = assertGameCommandContext({
              actor,
              expectedVersion: input.expectedVersion,
              currentVersion: game.version,
              headerIdempotencyKey: input.headerIdempotencyKey ?? '',
              bodyClientCommandId: input.bodyCommandId,
              payloadHash,
            });
          } catch (error) {
            if (error instanceof GameContractError) {
              throw toGameHttpException(error);
            }
            throw error;
          }
          const actorUserId = actorStorageId(actor);
          const existing = await tx.v1IdempotencyRecord.findUnique({
            where: {
              actorUserId_action_resourceType_resourceId_idempotencyKey: {
                actorUserId,
                action: input.action,
                resourceType: 'GAME_PARTICIPANT',
                resourceId: input.resourceId,
                idempotencyKey: context.durableCommandId,
              },
            },
          });
          try {
            const decision = resolveGameIdempotency<T>(
              existing === null
                ? null
                : {
                    payloadHash: existing.payloadHash,
                    responseStatus: existing.responseStatus,
                    responseBody: existing.responseBody as unknown as T,
                  },
              payloadHash,
            );
            if (decision.kind === 'REPLAY') {
              return { ...decision.responseBody, replayed: true };
            }
          } catch (error) {
            if (error instanceof GameContractError) {
              throw toGameHttpException(error);
            }
            throw error;
          }
          const response = await mutate(tx, game, actor, context);
          await this.storeIdempotency(tx, {
            actor,
            action: input.action,
            resourceType: 'GAME_PARTICIPANT',
            resourceId: input.resourceId,
            durableCommandId: context.durableCommandId,
            payloadHash,
            response,
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        isCommandConcurrencyConflict(error.code, error.meta, error.message)
      ) {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: 'A concurrent command won; reload the current version and retry',
        });
      }
      throw error;
    }
  }

  /**
   * 신원 연결의 **확인자** 자격. 이 게이트를 지나는 커맨드는 attest 하나뿐이다.
   *
   * 경기 종류에 따라 자격이 다르다 -- 같은 규칙을 쓰면 한쪽이 반드시 틀린다.
   *
   * ## TEAM_MATCH: 참가자 본인 팀의 owner/manager (기존 계약 유지)
   * 두 팀이 서로 아는 소규모 경기라 팀장이 곁에 있고, 팀장 승인이 실제로 작동한다.
   * `game-participant-identity.integration-spec.ts` 가 "평멤버는 거부"를 명시적으로
   * 못박고 있다(Track A 회귀 방지) -- 여기를 건드리면 그 계약이 깨진다.
   *
   * ## TOURNAMENT_FIXTURE: 두 등록팀의 **활성 멤버 누구나** (2026-08-24 사용자 확정)
   * 대회는 다르다. alpha 실측에서 **신청은 201, 확인은 403** 이 나왔다 -- 양쪽 다 등록팀
   * 활성 멤버였지만 둘 다 평멤버였다. 신청만 열리고 확인이 막히면 선수가 자기 기록을
   * 되찾겠다고 신청해도 팀장이 손대기 전까지 영영 pending 이라, "문의 없이 복구한다"는
   * 이 기능(P0-5)의 목적이 절반만 달성된다. 대회 등록팀의 팀장은 대개 현장에 없다.
   *
   * 판정은 **신청(request)이 쓰는 것과 같은 술어**를 쓴다 -- `resolveActor` 의
   * participant_identity 분기가 두 등록팀 멤버십으로 신청을 허용했으므로(그래서 201),
   * 확인도 같은 기준이어야 둘이 어긋나지 않는다. 참가자 본인 팀(`sideTeamId`)이 아니라
   * 등록팀 기준인 이유이기도 하다 -- 상대팀 사람이 "이 사람 맞다"고 말하는 편이 오히려
   * 담합이 어렵다.
   *
   * ## 대가 (실재한다)
   * 팀장 승인보다 담합이 쉬워진다 -- 한 대회에 공모자가 둘 있으면 서로의 기록을 확인해 줄
   * 수 있다. 감수하는 근거는 셋이다: ① 신청자 ≠ 확인자가 위에서 강제되고(서비스 + DB
   * 트리거 이중), ② 모든 결정이 `V1ParticipantIdentityLinkEvent` 원장에 누가 언제 했는지로
   * 남아 사후 추적·취소가 가능하며, ③ 잘못 붙은 기록은 되돌릴 수 있는 반면 영영 pending 인
   * 기록은 사용자가 앱 안에서 복구할 방법이 아예 없다.
   */
  private async assertAttestorAuthority(
    tx: Transaction | PrismaService,
    gameId: string,
    sourceType: V1GameSourceType,
    sideTeamId: string | null,
    actor: Extract<GameActorScope, { actorType: 'USER' }>,
  ) {
    if (actor.role === 'platform_ops') {
      return;
    }
    if (sourceType === V1GameSourceType.TOURNAMENT_FIXTURE) {
      const game = await tx.v1Game.findUnique({
        where: { id: gameId },
        select: {
          tournamentFixture: {
            select: {
              homeRegistration: { select: { teamId: true } },
              awayRegistration: { select: { teamId: true } },
            },
          },
        },
      });
      const registrationTeamIds = [
        game?.tournamentFixture?.homeRegistration?.teamId,
        game?.tournamentFixture?.awayRegistration?.teamId,
      ].filter((teamId): teamId is string => typeof teamId === 'string');
      if (registrationTeamIds.length === 0) {
        throw this.forbidden();
      }
      const membership = await tx.v1TeamMembership.findFirst({
        // 역할은 보지 않는다 -- 활성 멤버이기만 하면 된다. 탈퇴·정지 멤버는 status 로 걸린다.
        where: { userId: actor.actorUserId, teamId: { in: registrationTeamIds }, status: 'active' },
      });
      if (membership === null) {
        throw this.forbidden();
      }
      return;
    }
    if (sideTeamId === null) {
      throw this.forbidden();
    }
    const membership = await tx.v1TeamMembership.findFirst({
      where: {
        teamId: sideTeamId,
        userId: actor.actorUserId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
      },
    });
    if (membership === null) {
      throw this.forbidden();
    }
  }

  /**
   * 모든 게임 커맨드가 지나는 단일 경계.
   *
   * 트랜잭션은 Serializable 이고, 맨 처음 `SELECT id FROM v1_games ... FOR UPDATE` 로
   * 게임 행을 잠근다. 그래서 같은 게임에 대한 커맨드는 서로 직렬화되고, 뒤늦은 쪽은
   * 앞선 쪽이 커밋한 idempotency 레코드를 보게 돼 REPLAY 로 수렴한다.
   *
   * 다만 그 잠금 자체가 경합에 걸리면 Postgres 가 40001 을 던지는데, 그것이
   * **raw query 안에서** 난 것이라 Prisma 는 P2034 가 아니라 P2010 으로 감싼다 — 아래 catch 가
   * `isCommandConcurrencyConflict` 를 쓰는 이유다(P2034/P2002 만 보던 시절엔 이 경로가
   * 통째로 새어 500 이 됐다. alpha 실측 2026-08-23).
   *
   * 같은 catch 가 이 파일에 세 벌 있는데, 셋 다 같은 `FOR UPDATE` 경계를 감싸므로
   * 하나를 고칠 때는 나머지 둘도 같이 봐야 한다.
   */
  private async withCommand<T extends CommandResult>(
    input: CommandBoundaryInput,
    mutate: (
      tx: Transaction,
      game: LockedGame,
      context: GameCommandContext,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
        await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${input.gameId} FOR UPDATE`;
        const game = await tx.v1Game.findUnique({
          where: { id: input.gameId },
          select: {
            id: true,
            sourceType: true,
            teamMatchId: true,
            tournamentFixtureId: true,
            state: true,
            version: true,
            lastSequence: true,
            competitionConfigVersionId: true,
          },
        });
        if (game === null) {
          throw this.notFound();
        }
        const actor =
          input.actor.actorType === 'SYSTEM'
            ? input.actor
            : await this.resolveActor(
                tx,
                input.gameId,
                input.actor.actorUserId,
                gameAuthorizationAction(input.action),
                input.actor.authorizationSubject,
              );
        const payloadHash = canonicalGameCommandPayloadHash(input.payload);
        let preliminary: GameCommandContext;
        try {
          preliminary = assertGameCommandContext({
            actor,
            expectedVersion: input.expectedVersion,
            currentVersion: input.expectedVersion,
            headerIdempotencyKey: input.headerIdempotencyKey ?? '',
            bodyClientCommandId: input.bodyCommandId,
            payloadHash,
            ...(input.takeoverToken === undefined ? {} : { takeoverToken: input.takeoverToken }),
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const actorUserId = actorStorageId(actor);
        const existing = await tx.v1IdempotencyRecord.findUnique({
          where: {
            actorUserId_action_resourceType_resourceId_idempotencyKey: {
              actorUserId,
              action: input.action,
              resourceType: 'GAME',
              resourceId: input.gameId,
              idempotencyKey: preliminary.durableCommandId,
            },
          },
        });
        try {
          const decision = resolveGameIdempotency<T>(
            existing === null
              ? null
              : {
                  payloadHash: existing.payloadHash,
                  responseStatus: existing.responseStatus,
                  responseBody: existing.responseBody as unknown as T,
                },
            payloadHash,
          );
          if (decision.kind === 'REPLAY') {
            return { ...decision.responseBody, replayed: true };
          }
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        let context: GameCommandContext;
        try {
          context = assertGameCommandContext({
            actor,
            expectedVersion: input.versionScope === 'lineup' ? game.version : input.expectedVersion,
            currentVersion: game.version,
            headerIdempotencyKey: input.headerIdempotencyKey ?? '',
            bodyClientCommandId: input.bodyCommandId,
            payloadHash,
            ...(input.takeoverToken === undefined ? {} : { takeoverToken: input.takeoverToken }),
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        const response = await mutate(tx, game, context);
        await this.storeIdempotency(tx, {
          actor,
          action: input.action,
          resourceType: 'GAME',
          resourceId: input.gameId,
          durableCommandId: context.durableCommandId,
          payloadHash,
          response,
        });
        await this.writeAudit(
          tx,
          actor,
          input.action.toUpperCase(),
          input.gameId,
          context.durableCommandId,
          { version: game.version, state: game.state },
          response,
        );
        return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        isCommandConcurrencyConflict(error.code, error.meta, error.message)
      ) {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: 'A concurrent command won; reload the current game version and retry',
        });
      }
      throw error;
    }
  }

  private async storeIdempotency(
    tx: Transaction,
    input: {
      actor: GameActorScope;
      action: string;
      resourceType: string;
      resourceId: string;
      durableCommandId: string;
      payloadHash: string;
      response: unknown;
    },
  ) {
    await tx.v1IdempotencyRecord.create({
      data: {
        actorUserId: actorStorageId(input.actor),
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        idempotencyKey: input.durableCommandId,
        payloadHash: input.payloadHash,
        responseStatus: 200,
        responseBody: jsonInput(input.response),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  /**
   * 이 라인업의 **선발** 중 출전정지 선수가 있으면 400 `DISCIPLINE_SUSPENDED` 로 막는다.
   *
   * 후보(started=false)는 막지 않는다 — 정지 선수를 벤치에 앉히는 것 자체는 규정
   * 위반이 아니고, 실제로 뛰는 순간은 교체 이벤트라 그때 별도로 다룰 문제다.
   * (지금은 교체까지 막지 않는다 — 그건 이 변경의 범위를 넘고, 라인업 제출을 막는
   * 것만으로 회고가 지적한 "퇴장 선수가 다음 경기에 그대로 선발 출전"은 닫힌다.)
   *
   * 대회 픽스처가 아니거나 규정이 꺼진 대회면 조회 없이 즉시 통과한다.
   */
  private async assertNoSuspendedStarters(
    tx: Transaction,
    game: LockedGame,
    lineupId: string,
  ): Promise<void> {
    if (game.sourceType !== V1GameSourceType.TOURNAMENT_FIXTURE) return;
    // `LockedGame` 이 이미 `tournamentFixtureId` 를 들고 있으므로 게임을 다시 조회하지
    // 않는다 — 앞선 버전은 관계를 따라가느라 쿼리를 한 번 더 썼다(Copilot 리뷰 지적).
    if (game.tournamentFixtureId === null) return;
    const fixture = await tx.v1TournamentFixture.findUnique({
      where: { id: game.tournamentFixtureId },
      select: { id: true, tournamentId: true },
    });
    if (fixture === null) return;

    const verdicts = await this.suspensionVerdicts(tx, fixture.tournamentId, fixture.id);
    if (verdicts.size === 0) return; // 규정 미적용이거나 누적 카드가 아직 없다.

    const starters = await tx.v1GameParticipant.findMany({
      where: { lineupId, started: true },
      select: { userId: true, displayNameSnapshot: true },
    });
    const blocked = starters
      .map((starter) => {
        const verdict = starter.userId === null ? undefined : verdicts.get(starter.userId);
        return verdict?.suspended === true
          ? { name: starter.displayNameSnapshot, reason: verdict.reason }
          : null;
      })
      .filter((entry): entry is { name: string; reason: string | null } => entry !== null);
    if (blocked.length === 0) return;

    throw new BadRequestException({
      code: 'DISCIPLINE_SUSPENDED',
      message: `${blocked.map((entry) => entry.name).join(', ')} 선수는 출전정지 상태예요. 선발에서 빼고 다시 제출해 주세요.`,
      details: { blocked },
    });
  }

  /**
   * 이 대회에서 카드가 누적된 선수들의 `fixtureId` 경기 정지 여부. 규칙 자체는
   * `card-suspension.ts`(순수 함수, DB 없이 전수 테스트)에 있고 여기서는 조회만 한다.
   *
   * **별도 주입 서비스로 빼지 않은 이유**: `GamesService` 생성자에 인자를 하나 더하면
   * 이 클래스를 직접 `new` 하는 통합 스펙 41곳이 전부 깨진다(CI 실측 — 그 스펙들의
   * 타입은 로컬 `tsc -p tsconfig.json` 대상 밖이라 로컬에서는 보이지도 않는다).
   * 게다가 여기서 `tx` 를 쓰면 제출과 **같은 트랜잭션**에서 읽어 더 정확하다.
   *
   * **판정 단위는 사용자(userId)다.** 참가자 행은 경기마다 새로 생기므로 그것으로는
   * 대회 전체 누적을 셀 수 없고, 이름 문자열로 묶으면 동명이인이 서로의 카드를
   * 뒤집어쓴다. 계정 미연결 참가자는 대상에서 빠진다.
   */
  private async suspensionVerdicts(tx: Transaction, tournamentId: string, fixtureId: string) {
    const tournament = await tx.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { yellowAccumulationLimit: true, redCardSuspensionMatches: true },
    });
    const rules = {
      yellowAccumulationLimit: tournament?.yellowAccumulationLimit ?? null,
      redCardSuspensionMatches: tournament?.redCardSuspensionMatches ?? null,
    };
    // 규정이 꺼져 있으면 **조회조차 하지 않는다** — 대다수 대회가 그렇다.
    if (!suspensionRulesEnabled(rules)) return new Map<string, ReturnType<typeof evaluateSuspension>>();

    // 일정 순서 = "정지는 다음 경기부터"라는 규칙의 기준틀. scheduledAt 이 없는 픽스처는
    // 라운드·번호로 이어 정렬한다 — 순서를 못 정하면 판정 자체가 불가능하다.
    const fixtures = await tx.v1TournamentFixture.findMany({
      where: { tournamentId },
      // `nulls: 'last'` 를 **명시한다.** Postgres 의 ASC 기본값이 이미 NULLS LAST 라
      // 동작은 같지만(Copilot 은 "기본이 nulls first"라고 봤는데 그건 DESC 얘기다),
      // 이 순서가 정지 판정의 기준축이라 기본값에 기대지 않고 의도를 코드에 박는다 —
      // 일정 미정 픽스처가 앞으로 오면 gameOrder 가 통째로 어긋난다.
      orderBy: [
        { scheduledAt: { sort: 'asc', nulls: 'last' } },
        { round: 'asc' },
        { fixtureNumber: 'asc' },
      ],
      select: {
        id: true,
        game: {
          select: {
            currentOfficialRevisionId: true,
            // 공식 확정 전 결과도 봐야 한다 — 아래 폴백 주석 참고.
            resultRevisions: {
              where: { state: 'SUBMITTED' },
              orderBy: { revision: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
    const orderByFixtureId = new Map(fixtures.map((fixture, index) => [fixture.id, index + 1]));
    const upcomingGameOrder = orderByFixtureId.get(fixtureId);
    if (upcomingGameOrder === undefined) return new Map<string, ReturnType<typeof evaluateSuspension>>();

    /**
     * 픽스처마다 **딱 한 개**의 리비전만 센다 — 여러 개를 세면 정정 이력이 카드로 중복
     * 집계돼 멀쩡한 선수가 정지된다.
     *
     * 고르는 순서: **공식 확정본 우선, 없으면 최신 제출본(SUBMITTED)**.
     *
     * 공식본만 보면 안 되는 이유(2026-08-24 alpha 실측으로 발견): 경기를 `end` 하면
     * 결과 리비전은 `SUBMITTED` 로 남고 `currentOfficialRevisionId` 는 **null 이다** —
     * 공식 확정은 운영진이 결과 검토를 거쳐 따로 눌러야 하는 별도 단계다. 당일 대회는
     * 다음 경기가 그 검토보다 먼저 시작되는 게 보통이라, 공식본만 세면 **정작 필요한
     * 순간에 가드가 조용히 안 걸린다**(실측: 레드카드 받은 선수가 다음 경기 라인업에
     * 그대로 제출돼 201 로 통과했다).
     *
     * DRAFT·VOID 는 세지 않는다 — 초안은 아직 아무도 제출하지 않은 값이고 VOID 는
     * 무효화된 값이다. 제출된 결과는 "심판이 기록을 확정해 올린 것"이라 정지 판정의
     * 근거로 충분하다. 나중에 정정되면 공식본이 그 자리를 대신한다.
     */
    const revisionToOrder = new Map<string, number>();
    for (const fixture of fixtures) {
      const order = orderByFixtureId.get(fixture.id);
      if (order === undefined) continue;
      const revisionId =
        fixture.game?.currentOfficialRevisionId ?? fixture.game?.resultRevisions?.[0]?.id ?? null;
      if (revisionId !== null) revisionToOrder.set(revisionId, order);
    }
    if (revisionToOrder.size === 0) return new Map<string, ReturnType<typeof evaluateSuspension>>();

    const resultParticipants = await tx.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: [...revisionToOrder.keys()] } },
      select: { resultRevisionId: true, participantId: true, cards: true },
    });
    if (resultParticipants.length === 0) return new Map<string, ReturnType<typeof evaluateSuspension>>();

    const participants = await tx.v1GameParticipant.findMany({
      where: { id: { in: resultParticipants.map((row) => row.participantId) } },
      select: { id: true, userId: true },
    });
    const userByParticipantId = new Map(participants.map((row) => [row.id, row.userId]));

    const playedByUserId = new Map<string, PlayedGameCards[]>();
    for (const row of resultParticipants) {
      const userId = userByParticipantId.get(row.participantId) ?? null;
      if (userId === null) continue;
      const gameOrder = revisionToOrder.get(row.resultRevisionId);
      if (gameOrder === undefined) continue;
      const bucket = playedByUserId.get(userId) ?? [];
      bucket.push({ gameOrder, cards: readResultCards(row.cards) });
      playedByUserId.set(userId, bucket);
    }

    const verdicts = new Map<string, ReturnType<typeof evaluateSuspension>>();
    for (const [userId, played] of playedByUserId) {
      verdicts.set(userId, evaluateSuspension({ rules, played, upcomingGameOrder }));
    }
    return verdicts;
  }

  private async resolveActor(
    tx: Transaction | PrismaService,
    gameId: string,
    userId: string,
    action: GameAuthorizationAction,
    expectedAuthorizationSubject?: string,
  ): Promise<Extract<GameActorScope, { actorType: 'USER' }>> {
    const game = await tx.v1Game.findUnique({
      where: { id: gameId },
      select: {
        sourceType: true,
        teamMatch: {
          select: { hostTeamId: true, approvedApplicantTeamId: true },
        },
        tournamentFixture: {
          select: {
            id: true,
            tournamentId: true,
            fieldId: true,
            homeRegistration: { select: { teamId: true } },
            awayRegistration: { select: { teamId: true } },
          },
        },
      },
    });
    if (game === null) {
      throw this.notFound();
    }
    const admin = await tx.v1AdminUser.findUnique({
      where: { userId },
      select: {
        adminRole: true,
        status: true,
        revokedAt: true,
        updatedAt: true,
        user: { select: { accountStatus: true } },
      },
    });
    if (game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE) {
      const fixture = game.tournamentFixture;
      if (fixture === null) {
        throw this.notFound();
      }
      const eligibleAdmin =
        admin !== null &&
        admin.status === 'active' &&
        admin.revokedAt === null &&
        admin.adminRole !== 'support' &&
        admin.user.accountStatus === 'active'
          ? admin
          : null;
      if (action === 'participant_identity') {
        // Task 14: the canonical actor-action matrix grants tournament staff
        // (field_operator/support_readonly/tournament_director) no column for
        // participant identity-link/consent authority, so scoped assignments
        // never reach this action — only platform_ops may act, exactly like
        // the admin branch below but without falling through to the staff
        // assignment loop.
        //
        // Task 154 P0-5 (2026-08-24, 사용자 결정 A안): 위 규칙 때문에 **대회 경기에서는
        // 선수 본인도 자기 신원 연결을 신청할 수 없었다**(403). 그런데 TEAM_MATCH 쪽은
        // 같은 action 에 대해 "두 팀 중 한쪽의 활성 멤버면 자기 것을 신청/철회하거나
        // 별개 확인자로 행동할 수 있다"를 이미 허용하고 있다. 대회라고 다를 이유가 없다 --
        // 라인업이 마감된 뒤 연결이 누락된 선수에게 남는 경로가 platform_ops 문의뿐이면
        // 사실상 복구 수단이 없다.
        //
        // 그래서 **두 등록팀의 활성 멤버**에게 같은 권한을 준다. 안전장치는 새로 만들지
        // 않는다 -- Task 14 가 세운 "신청자 ≠ 확인자" 규칙이 서비스와 DB 트리거 양쪽에
        // 그대로 살아 있어(attestation requires a distinct pending requestor) 혼자서는
        // 연결을 완성할 수 없다. 여기서 여는 것은 *신청할 자격*이지 *확정할 권한*이 아니다.
        // platform_ops 는 아래 경로로 계속 통과한다(운영 개입 경로 유지).
        if (eligibleAdmin === null) {
          const registrationTeamIds = [
            fixture.homeRegistration?.teamId,
            fixture.awayRegistration?.teamId,
          ].filter((teamId): teamId is string => typeof teamId === 'string');
          const membership =
            registrationTeamIds.length === 0
              ? null
              : await tx.v1TeamMembership.findFirst({
                  where: { userId, teamId: { in: registrationTeamIds }, status: 'active' },
                  select: { teamId: true },
                });
          if (membership === null) {
            throw this.forbidden();
          }
          return {
            actorType: 'USER',
            actorUserId: userId,
            // 스태프 등급이 아니라 "참가팀 소속" 자격이다. 이 액션에서 role 은 감사
            // 기록용이고 추가 권한을 열지 않는다(위 tournamentAuthorizationAction 이
            // participant_identity 를 null 로 막아 스태프 경로로 새지 않는다).
            role: 'support_readonly',
            tournamentId: fixture.tournamentId,
            fixtureId: fixture.id,
            teamId: membership.teamId,
          };
        }
        const authorizationSubject = `platform_ops:${userId}@${eligibleAdmin.updatedAt.getTime()}`;
        if (
          expectedAuthorizationSubject !== undefined &&
          expectedAuthorizationSubject !== authorizationSubject
        ) {
          throw this.forbidden();
        }
        return {
          actorType: 'USER',
          actorUserId: userId,
          role: 'platform_ops',
          tournamentId: fixture.tournamentId,
          fixtureId: fixture.id,
          authorizationSubject,
        };
      }
      const tournamentAction = this.tournamentAuthorizationAction(action);
      if (tournamentAction === null) {
        throw this.forbidden();
      }
      const resource = {
        tournamentId: fixture.tournamentId,
        fixtureId: fixture.id,
        ...(fixture.fieldId === null ? {} : { fieldId: fixture.fieldId }),
      };
      if (eligibleAdmin !== null) {
        const decision = decideTournamentStaffAccess({
          role: 'platform_ops',
          action: tournamentAction,
          now: new Date().toISOString(),
          resource,
        });
        if (!decision.allowed) {
          throw this.forbidden();
        }
        const authorizationSubject = `platform_ops:${userId}@${eligibleAdmin.updatedAt.getTime()}`;
        if (
          expectedAuthorizationSubject !== undefined &&
          expectedAuthorizationSubject !== authorizationSubject
        ) {
          throw this.forbidden();
        }
        return {
          actorType: 'USER',
          actorUserId: userId,
          role: 'platform_ops',
          tournamentId: fixture.tournamentId,
          fixtureId: fixture.id,
          authorizationSubject,
        };
      }
      const assignments = await tx.v1TournamentStaffAssignment.findMany({
        where: {
          tournamentId: fixture.tournamentId,
          userId,
        },
        select: {
          id: true,
          tournamentId: true,
          role: true,
          fieldId: true,
          version: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          fixtureScopes: { select: { fixtureId: true } },
        },
      });
      const now = new Date().toISOString();
      for (const assignment of assignments) {
        const role = this.tournamentStaffRole(assignment.role);
        if (role === null) {
          continue;
        }
        const authorizationSubject = `assignment:${assignment.id}@${assignment.version}`;
        if (
          expectedAuthorizationSubject !== undefined &&
          expectedAuthorizationSubject !== authorizationSubject
        ) {
          continue;
        }
        const decision = decideTournamentStaffAccess({
          role,
          action: tournamentAction,
          now,
          resource,
          assignment: {
            role,
            tournamentId: assignment.tournamentId,
            startsAt: assignment.createdAt.toISOString(),
            expiresAt: assignment.expiresAt?.toISOString() ?? null,
            revokedAt: assignment.revokedAt?.toISOString() ?? null,
            fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
            ...(assignment.fieldId === null ? {} : { fieldId: assignment.fieldId }),
          },
        });
        if (decision.allowed) {
          return {
            actorType: 'USER',
            actorUserId: userId,
            role,
            tournamentId: fixture.tournamentId,
            fixtureId: fixture.id,
            authorizationSubject,
          };
        }
      }
      // 참가팀 자체 라인업 제출(Task 27 후속): 스태프/관리자가 아니어도 이 fixture의
      // 홈/원정 등록팀 매니저·오너 본인은 자기 팀 라인업을 읽고(read) 수정(lineup_mutate)
      // 할 수 있다 — team-match 분기의 hostMembership/opponentMembership 패턴을 그대로
      // 재현한다. 그 외 액션(tournament_command/event_append/event_reverse/cancel)은
      // 여전히 스태프 전용으로 남긴다(tournamentAction 화이트리스트에는 있지만 여기서
      // 팀 액터에게는 열지 않음).
      if (tournamentAction === 'read' || tournamentAction === 'lineup_mutate') {
        const fixtureTeamIds = [
          fixture.homeRegistration?.teamId ?? null,
          fixture.awayRegistration?.teamId ?? null,
        ].filter((teamId): teamId is string => teamId !== null);
        const teamMemberships = await tx.v1TeamMembership.findMany({
          where: { userId, teamId: { in: fixtureTeamIds }, status: 'active' },
        });
        const teamMembership = teamMemberships.find(
          (membership) => membership.role === 'owner' || membership.role === 'manager',
        );
        if (teamMembership !== undefined) {
          return {
            actorType: 'USER',
            actorUserId: userId,
            role: teamMembership.role === 'owner' ? 'team_owner' : 'team_manager',
            tournamentId: fixture.tournamentId,
            fixtureId: fixture.id,
            teamId: teamMembership.teamId,
          };
        }
      }
      throw this.forbidden();
    }
    if (
      admin !== null &&
      admin.status === 'active' &&
      admin.revokedAt === null &&
      admin.adminRole !== 'support' &&
      admin.user.accountStatus === 'active'
    ) {
      return { actorType: 'USER', actorUserId: userId, role: 'platform_ops' };
    }
    const match = game.teamMatch;
    if (match === null) {
      throw this.notFound();
    }
    const teamIds = [match.hostTeamId, match.approvedApplicantTeamId].filter(
      (teamId): teamId is string => teamId !== null,
    );
    const memberships = await tx.v1TeamMembership.findMany({
      where: { userId, teamId: { in: teamIds }, status: 'active' },
    });
    const hostMembership = memberships.find((membership) => membership.teamId === match.hostTeamId);
    const opponentMembership = memberships.find(
      (membership) => membership.teamId === match.approvedApplicantTeamId,
    );
    const managerRole = (membership: (typeof memberships)[number] | undefined) =>
      membership?.role === 'owner'
        ? 'team_owner'
        : membership?.role === 'manager'
          ? 'team_manager'
          : null;
    if (action === 'opponent_result_decide') {
      if (managerRole(opponentMembership) === null) {
        throw this.forbidden();
      }
      return {
        actorType: 'USER',
        actorUserId: userId,
        role: 'opponent_manager',
        teamId: match.approvedApplicantTeamId ?? undefined,
      };
    }
    if (action === 'team_result_submit' || action === 'tournament_command') {
      // Task 16: draft creation and submission are host-only. The opponent side's
      // sole authority over the result is the decision surface above
      // (approve/change_request) — an opponent manager must never be able to draft
      // or submit the result their own team is being evaluated against.
      //
      // D-20(B6, T3 추가): tournament_command(start/pause/resume/next-period)도
      // 같은 이유로 호스트 전용이다. 이 분기를 타지 않으면 아래쪽 공용 fallback
      // (managerRole(hostMembership) ?? managerRole(opponentMembership))
      // 로 양쪽을 합쳐버려서, 상대팀 매니저가 서버 API를 직접 호출해 경기
      // 시작/일시정지/재개/피리어드 전환을 조작할 수 있었다 — 프론트의 isHost
      // 게이트는 클라이언트 체크라 우회 가능하므로 여기서 막아야 실제 방어가 된다.
      const hostRole = managerRole(hostMembership);
      if (hostRole === null) {
        throw this.forbidden();
      }
      return {
        actorType: 'USER',
        actorUserId: userId,
        role: hostRole,
        teamId: match.hostTeamId,
      };
    }
    if (action === 'event_append' || action === 'event_reverse') {
      // Task T1-1: only the host team's owner/manager may record or reverse
      // live game events for a team match. This must NOT fall through to the
      // generic `managerRole(hostMembership) ?? managerRole(opponentMembership)`
      // merge below — that merge would let an opponent manager pass once the
      // event_append/event_reverse forbid further down is removed. A second,
      // uncoordinated recorder on the opponent side would race sequence
      // numbers against the host; disputes belong to the existing result
      // approve/change_request decision surface, not a second event writer.
      const hostRole = managerRole(hostMembership);
      if (hostRole === null) {
        throw this.forbidden();
      }
      return {
        actorType: 'USER',
        actorUserId: userId,
        role: hostRole,
        teamId: match.hostTeamId,
      };
    }
    if (action === 'team_result_correction') {
      // D1-a 적대 검증: resolveActor 의 나머지 TEAM_MATCH 액션들은 여기 도달하기 전에
      // 이미 명시적으로 처리됐고(opponent_result_decide/team_result_submit/
      // tournament_command/event_append/event_reverse), 이 지점까지 내려온
      // 'team_result_correction' 을 그대로 두면 몇 줄 아래의 공용 폴백
      // (`managerRole(hostMembership) ?? managerRole(opponentMembership)`)이
      // 팀 소속만으로 통과시켜 버린다 — 상대팀 매니저가 자기에게 유리한 '정정'을
      // 승인 단계 없이 즉시 OFFICIAL 로 만들 수 있게 되는 구멍이다.
      //
      // 이 함수 위쪽의 admin 패스스루(라인 ~4747, "if (admin !== null && ... )")가
      // 이미 자격 있는 admin 을 먼저 반환하므로, 이 줄까지 도달했다는 것 자체가
      // 호출자가 admin 이 아니라는 뜻이다 — 그러면 무조건 거부한다. 팀 owner/manager
      // 라도 예외 없음.
      throw this.forbidden();
    }
    if (action === 'team_result_void') {
      // D2 (#712 의 team_result_correction 과 동일한 방식의 명시적 deny): 여기까지
      // 내려왔다는 것 자체가(위 admin 패스스루를 통과하지 못했다는 뜻이므로) 호출자가
      // admin 이 아니라는 뜻이다 — 아래 공용 폴백으로 새면 이의를 낸 팀의 상대편
      // owner/manager 가 자기에게 유리하게 결과를 스스로 무효화할 수 있는 구멍이
      // 생긴다. 팀 owner/manager 라도 예외 없이 거부한다.
      throw this.forbidden();
    }
    const role = managerRole(hostMembership) ?? managerRole(opponentMembership);
    // `participant_identity` (Task 14 identity-link/consent mutations) is
    // deliberately as permissive as `read` here: the actor only needs to be
    // an active member of one of the two match teams to self-request/revoke
    // their own identity link or consent, or to act as a distinct attestor.
    // Per-participant authority (self-only revoke/consent, distinct-side
    // owner/manager attestation) is enforced inside each command body, not here.
    if ((action === 'read' || action === 'participant_identity') && memberships.length > 0) {
      return {
        actorType: 'USER',
        actorUserId: userId,
        role: role ?? 'support_readonly',
        teamId: hostMembership?.teamId ?? opponentMembership?.teamId,
      };
    }
    if (role === null) {
      throw this.forbidden();
    }
    return {
      actorType: 'USER',
      actorUserId: userId,
      role,
      teamId: hostMembership?.teamId ?? opponentMembership?.teamId,
    };
  }

  private tournamentAuthorizationAction(
    action: GameAuthorizationAction,
  ): TournamentStaffAction | null {
    switch (action) {
      case 'read':
      case 'tournament_command':
      case 'event_append':
      case 'event_reverse':
      case 'lineup_mutate':
      case 'cancel':
        return action;
      case 'team_result_submit':
      case 'opponent_result_decide':
      case 'team_result_correction':
      case 'team_result_dispute_file':
      case 'team_result_void':
      case 'participant_identity':
        // Unreachable in practice: resolveActor special-cases
        // 'participant_identity' before calling this mapper (see Task 14
        // note there), but the switch stays exhaustive over
        // GameAuthorizationAction and denies-by-default if that ever changes.
        // 'team_result_correction' (D1-a) is TEAM_MATCH-only by construction —
        // createTeamMatchResultCorrection/officializeTeamMatchResultCorrection
        // both reject a TOURNAMENT_FIXTURE game's sourceType before ever
        // resolving an actor for this action — so this arm denies-by-default
        // for the same "should never actually run" reason.
        // 'team_result_dispute_file'/'team_result_void' (D2) are the same:
        // the dispute service and the new void method both reject a
        // TOURNAMENT_FIXTURE game's sourceType before ever resolving an
        // actor for either action.
        return null;
    }
  }

  private tournamentStaffRole(
    role: V1TournamentStaffRole,
  ): Extract<
    TournamentStaffRole,
    'field_operator' | 'support_readonly' | 'tournament_director'
  > | null {
    switch (role) {
      case 'FIELD_OPERATOR':
        return 'field_operator';
      case 'SUPPORT_READONLY':
        return 'support_readonly';
      case 'TOURNAMENT_DIRECTOR':
        return 'tournament_director';
      case 'PLATFORM_OPS':
        return null;
    }
  }

  /**
   * Live-substitution addition: on top of the existing shape/reference
   * checks, a SUBSTITUTION event also needs to know what pitch placement to
   * carry onto the incoming participant's row (`V1GameParticipant.position*`
   * — see `validateSubstitution`'s doc comment for why that is a plain copy,
   * not a derived value). Returning it here — instead of re-querying inside
   * `appendEvent`/`retryEvent` — keeps this the single place that reads
   * participants/events/config for a SUBSTITUTION, so both call sites stay
   * exactly as cheap as every other event type.
   */
  private async assertEventReferences(
    tx: Transaction,
    game: LockedGame,
    dto: AppendGameEventDto,
  ): Promise<{
    substitutionInheritedPlacement?: { position: string | null; positionX: number | null; positionY: number | null };
  }> {
    const period = await tx.v1GamePeriod.findFirst({
      where: { gameId: game.id, number: dto.period },
    });
    if (period === null) {
      throw new UnprocessableEntityException({
        code: 'EVENT_INVALID',
        message: 'Event period is not configured for this game',
      });
    }
    // T1-0: only the currently-LIVE period may receive events. Before this,
    // `V1GamePeriod.state` was never checked here at all, and nothing ever
    // set it past SCHEDULED -- see the design doc's §2.8 diagnosis.
    //
    // 이슈 #375: HALFTIME도 SCHEDULED와 마찬가지로 "아직 시작 안 함"이다 —
    // `end-period`가 다음 피리어드를 SCHEDULED 대신 HALFTIME으로 옮기므로,
    // 이 가드가 SCHEDULED만 봤다면 하프타임 도중(또는 되돌리기 직후 stale
    // 클라이언트가 보낸) 이벤트가 "아직 시작하지 않은 피리어드"를 그냥
    // 통과해버린다.
    if (period.state === V1GamePeriodState.SCHEDULED || period.state === V1GamePeriodState.HALFTIME) {
      throw new ConflictException({
        code: 'PERIOD_NOT_STARTED',
        message: '아직 시작하지 않은 피리어드예요',
      });
    }
    if (period.state === V1GamePeriodState.ENDED) {
      throw new ConflictException({
        code: 'PERIOD_ALREADY_ENDED',
        message: '이미 종료된 피리어드예요',
      });
    }
    if (dto.sideId !== undefined) {
      const side = await tx.v1GameSide.findFirst({ where: { gameId: game.id, id: dto.sideId } });
      if (side === null) {
        throw new UnprocessableEntityException({
          code: 'EVENT_INVALID',
          message: 'Event side does not belong to the game',
        });
      }
    }
    if (dto.participantId !== undefined) {
      const participant = await tx.v1GameParticipant.findFirst({
        where: { gameId: game.id, id: dto.participantId },
      });
      const participantMustBeOpposingSide = dto.type === V1GameEventType.OWN_GOAL;
      if (
        participant === null ||
        (participantMustBeOpposingSide
          ? participant.sideId === dto.sideId
          : participant.sideId !== dto.sideId)
      ) {
        throw new UnprocessableEntityException({
          code: 'PARTICIPANT_SIDE_MISMATCH',
          message: participantMustBeOpposingSide
            ? 'Own-goal participant must belong to the opposing side'
            : 'Event participant and side do not agree',
        });
      }
    }
    if (dto.assistParticipantId !== undefined && dto.assistParticipantId !== null) {
      if (dto.type !== V1GameEventType.GOAL) {
        throw new UnprocessableEntityException({
          code: 'ASSIST_INVALID',
          message: 'An assist can only be recorded on a GOAL event',
        });
      }
      if (dto.assistParticipantId === dto.participantId) {
        throw new UnprocessableEntityException({
          code: 'ASSIST_INVALID',
          message: 'A scorer cannot be credited with their own assist',
        });
      }
      const assistParticipant = await tx.v1GameParticipant.findFirst({
        where: { gameId: game.id, id: dto.assistParticipantId },
      });
      if (assistParticipant === null || assistParticipant.sideId !== dto.sideId) {
        throw new UnprocessableEntityException({
          code: 'ASSIST_INVALID',
          message: 'Assist participant must belong to the scoring side',
        });
      }
    }
    if (
      dto.type === V1GameEventType.GOAL &&
      dto.participantId === undefined &&
      game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE &&
      dto.payload.anonymous !== true
    ) {
      const config = await tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { result: true },
      });
      const resultConfig = config === null ? {} : jsonObject(config.result);
      if (resultConfig.tournamentScorerPolicy === 'required') {
        throw new UnprocessableEntityException({
          code: 'SCORER_REQUIRED',
          message: 'A scorer participant is required for goal events under this tournament policy',
        });
      }
    }
    const priorEvents = await tx.v1GameEvent.findMany({
      where: { gameId: game.id },
      select: { period: true },
    });
    const maxRecordedPeriod = priorEvents.reduce<number | null>(
      (max, event) => (max === null || event.period > max ? event.period : max),
      null,
    );
    if (maxRecordedPeriod !== null && dto.period < maxRecordedPeriod) {
      throw new UnprocessableEntityException({
        code: 'EVENT_LATE',
        message: 'Event period cannot regress behind an already-recorded period',
      });
    }
    if (dto.type === V1GameEventType.SUBSTITUTION) {
      return { substitutionInheritedPlacement: await this.assertSubstitution(tx, game, dto) };
    }
    return {};
  }

  /**
   * SUBSTITUTION-specific reference checks, split out of
   * `assertEventReferences` because it needs its own bounded participants/
   * events/config reads (nothing else here does). `dto.sideId`/`participantId`
   * (the INCOMING participant) are already confirmed non-undefined and
   * side-matched by the generic checks above this call, so this only adds
   * what is genuinely SUBSTITUTION-specific: the OUTGOING participant
   * (`payload.outParticipantId`), on-pitch/off-pitch membership, and the
   * `substitutions: 'limited'` cap.
   */
  private async assertSubstitution(
    tx: Transaction,
    game: LockedGame,
    dto: AppendGameEventDto,
  ): Promise<{ position: string | null; positionX: number | null; positionY: number | null }> {
    if (dto.sideId === undefined) {
      // Copilot review: this used to fall through to the generic
      // EVENT_INVALID (English message) — a contract mismatch with the rest
      // of this method, which always answers a missing SUBSTITUTION field
      // with SUBSTITUTION_INVALID + a Korean message (and the frontend's
      // gameOperationsErrorMessage() maps SUBSTITUTION_INVALID specifically,
      // not the generic EVENT_INVALID bucket).
      throw new UnprocessableEntityException({
        code: 'SUBSTITUTION_INVALID',
        message: '팀 정보를 확인할 수 없어요. 새로고침 후 다시 시도해주세요.',
      });
    }
    if (dto.participantId === undefined) {
      throw new UnprocessableEntityException({
        code: 'SUBSTITUTION_INVALID',
        message: '들어오는 선수를 지정해주세요',
      });
    }
    const outParticipantId = dto.payload.outParticipantId;
    if (typeof outParticipantId !== 'string' || outParticipantId.trim().length === 0) {
      throw new UnprocessableEntityException({
        code: 'SUBSTITUTION_INVALID',
        message: '나가는 선수를 지정해주세요',
      });
    }
    const [participants, events, config] = await Promise.all([
      tx.v1GameParticipant.findMany({
        where: { gameId: game.id },
        select: { id: true, sideId: true, started: true, position: true, positionX: true, positionY: true },
      }),
      tx.v1GameEvent.findMany({
        where: { gameId: game.id },
        select: { id: true, sequence: true, type: true, sideId: true, participantId: true, reversesEventId: true, payload: true },
      }),
      tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { lineup: true },
      }),
    ]);
    const lineup = config === null ? {} : jsonObject(config.lineup);
    // Fail closed on an unrecognized/missing mode: cap enforcement, not
    // unlimited substitutions, is the safe default for a malformed config.
    const substitutionMode: 'limited' | 'rolling' = lineup.substitutions === 'rolling' ? 'rolling' : 'limited';
    const maxSubstitutions = typeof lineup.maxSubstitutions === 'number' ? lineup.maxSubstitutions : null;
    try {
      return validateSubstitution({
        sideId: dto.sideId,
        inParticipantId: dto.participantId,
        outParticipantId,
        participants,
        priorEvents: events.map((event) => ({
          id: event.id,
          sequence: event.sequence,
          type: event.type,
          sideId: event.sideId,
          participantId: event.participantId,
          reversesEventId: event.reversesEventId,
          payload: jsonObject(event.payload),
        })),
        substitutionMode,
        maxSubstitutions,
      });
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
  }

  private async resultInvariantInput(
    tx: Transaction,
    game: LockedGame,
    dto: CreateGameResultRevisionDto,
  ) {
    const [sides, events, config] = await Promise.all([
      tx.v1GameSide.findMany({ where: { gameId: game.id } }),
      tx.v1GameEvent.findMany({ where: { gameId: game.id }, orderBy: { sequence: 'asc' } }),
      tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { result: true },
      }),
    ]);
    const reversedIds = new Set(
      events
        .map((event) => event.reversesEventId)
        .filter((eventId): eventId is string => eventId !== null),
    );
    const mappedEvents: GameResultEvent[] = events.map((event) => {
      const payload = jsonObject(event.payload);
      return {
        type: event.type,
        ...(event.sideId === null ? {} : { sideId: event.sideId }),
        ...(event.participantId === null ? {} : { participantId: event.participantId }),
        ...(event.assistParticipantId === null
          ? {}
          : { assistParticipantId: event.assistParticipantId }),
        period: event.period,
        clockMs: event.clockMs,
        reversed: reversedIds.has(event.id),
        ...(payload.card === 'YELLOW' || payload.card === 'RED'
          ? { card: payload.card }
          : {}),
        ...(payload.anonymous === true ? { anonymous: true } : {}),
      };
    });
    const resultConfig = config === null ? {} : jsonObject(config.result);
    const scorerPolicy: 'required' | 'optional_with_warning' =
      resultConfig.teamMatchScorerPolicy === 'required'
        ? 'required'
        : 'optional_with_warning';
    const missingScorer = mappedEvents.some(
      (event) =>
        event.type === V1GameEventType.GOAL &&
        event.reversed !== true &&
        event.participantId === undefined &&
        event.anonymous !== true,
    );
    const participants: GameResultParticipant[] = dto.actualParticipants.map((participant) => ({
      id: participant.participantId,
      sideId: participant.sideId,
      goals: participant.goals,
      cards: participant.cards,
      ...(participant.assists === undefined ? {} : { assists: participant.assists }),
      ...(participant.fouls === undefined ? {} : { fouls: participant.fouls }),
      ...(participant.minutesPlayed === undefined
        ? {}
        : { minutesPlayed: participant.minutesPlayed }),
    }));
    return {
      sourceType: game.sourceType,
      score: dto.score,
      sides: sides.map((side) => ({ id: side.id, sideKey: side.sideKey })),
      participants,
      events: mappedEvents,
      scorerPolicy,
      missingScorer,
      ...(dto.mvpParticipantId === undefined ? {} : { mvpParticipantId: dto.mvpParticipantId }),
    };
  }

  private async deriveTournamentRevision(
    tx: Transaction,
    game: LockedGame,
    context: GameCommandContext,
    /**
     * 어느 레인에서 왔는가. 승부차기 킥 수를 **요구할 수 있는지**가 여기서 갈린다.
     *
     * `END_COMMAND` — 운영 콘솔이 승부차기를 **지금 기록하는** 경로다. 클라이언트가 킥
     *   목록을 들고 있으므로 킥 수를 못 보낼 이유가 없다. 그래서 이 레인에서는 킥 수를
     *   필수로 만든다 — 총점 두 개만으로는 "각 5킥 1:0"(정상)과 "홈 1킥, 원정 0킥"(비정상)이
     *   같은 값이라 서버가 구분할 수 없고, 실제로 알파에서 `{home:1, away:0}` 만 실은
     *   `end` 호출이 **201로 통과해 공개 화면까지 퍼지는 것**을 실측했다(2026-08-18).
     * `RECOVERY` — 이미 저장된 리비전을 복구·승계하는 경로다. 킥 수가 생기기 전에 저장된
     *   결과에는 그 값이 없으므로 요구하면 복구가 영구히 막힌다.
     */
    penaltyOrigin: 'END_COMMAND' | 'RECOVERY',
    penalties?: StoredPenalties,
    /**
     * 몰수·중단 종결 사유. 생략하면 정상 종료(NORMAL)다 — 복구 레인(RECOVERY)은
     * 이미 저장된 결과를 승계하는 경로라 사유를 새로 만들지 않는다.
     */
    outcome: { outcomeReason: 'NORMAL' | 'FORFEIT' | 'ABANDONED'; note: string | null } = {
      outcomeReason: 'NORMAL',
      note: null,
    },
  ): Promise<GameRevisionMutationResult> {
    const [events, participantCandidates, lineups, sides, config] = await Promise.all([
      tx.v1GameEvent.findMany({ where: { gameId: game.id }, orderBy: { sequence: 'asc' } }),
      tx.v1GameParticipant.findMany({ where: { gameId: game.id } }),
      tx.v1GameLineup.findMany({
        where: { gameId: game.id },
        // `state` 를 함께 읽어 selectLatestLineupParticipants 가 DRAFT 리비전을
        // "최신" 후보에서 빼도록 한다 — 정정 요청으로 새로 열린 초안이 직전 제출을
        // 무효화하지 않는다(그 유틸의 계약, SUBMITTED/LOCKED 만 운영 가능).
        select: { id: true, sideId: true, revision: true, state: true },
      }),
      tx.v1GameSide.findMany({ where: { gameId: game.id } }),
      tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { lineup: true },
      }),
    ]);
    const participants = selectLatestLineupParticipants(participantCandidates, lineups);
    // 하드코딩 버그 수정: started/goalkeeper를 실제 라인업 값과 무관하게
    // 항상 true/false로 박아 넣었다 -- 후보로 저장한 선수도 결과 프로젝션에서는
    // 전부 선발로 보였고, 실제로 골키퍼였던 선수도 항상 goalkeeper:false였다.
    // started는 라인업이 저장한 값(participant.started)을 그대로 쓴다.
    // goalkeeper는 이 대회 종목의 골키퍼 포지션 코드(competitionConfig의
    // lineup.positions 중 goalkeeper:true인 항목의 code -- 축구 'GK', 풋살
    // 'GOLEIRO' 등 종목마다 다르다. 프론트 formation-slots.ts의
    // goalkeeperPositionCode와 같은 방식)와 participant.position이 일치하는지로
    // 판정한다. 사전에 골키퍼 항목이 없는 레거시 config는 기존 관례와 동일하게
    // 'GK'로 폴백한다.
    const goalkeeperPositionCode =
      parseLineupCatalog(config?.lineup ?? null).positions.find((position) => position.goalkeeper === true)?.code ??
      'GK';
    const regulationScore = this.scoreFromEvents(events, sides);
    const score = await this.applyPenalties(tx, game, regulationScore, penalties, penaltyOrigin);
    // Issue #392 fix: `missingScorer` must be derived from the SAME
    // reversed-event-excluding aggregation `aggregateGameParticipantStats`
    // already builds below for goals/cards/assists/fouls -- moved ahead of
    // `v1GameResultRevision.create` so its `missingScorer` field can reuse
    // that one `reversedIds` computation instead of the old inline
    // `events.some(...)` here, which (like the pre-#376-fix participant
    // loop) had no `reversesEventId` filter at all: a GOAL recorded without
    // a scorer and then reversed (mis-tap corrected, wrong event undone)
    // still tripped the "득점자 미기재" warning forever, even though the
    // event stream no longer contains any live scorer-less goal.
    const { goalCount, cardCount, assistCount, foulCount, missingScorer } =
      this.aggregateGameParticipantStats(events);
    const revision = await tx.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        // 몰수·중단이면 그 사실과 사유가 결과 리비전에 함께 박힌다 — 점수만 남기면
        // 정상 종료와 구분되지 않아 "왜 그 점수인지"를 나중에 설명할 수 없다.
        outcomeReason: outcome.outcomeReason,
        outcomeNote: outcome.note,
        score: jsonInput(score),
        goalEvents: jsonInput(
          events
            .filter(
              (event) =>
                (event.type === V1GameEventType.GOAL || event.type === V1GameEventType.OWN_GOAL) &&
                !events.some((candidate) => candidate.reversesEventId === event.id),
            )
            .map((event) => ({
              id: event.id,
              sideId: event.sideId,
              participantId: event.participantId,
              minute: Math.max(0, Math.ceil(event.clockMs / 60000)),
              period: event.period,
              ownGoal: event.type === V1GameEventType.OWN_GOAL,
            })),
        ),
        eventsHash: canonicalGameCommandPayloadHash(events.map((event) => event.payloadHash)),
        missingScorer,
        createdByActorType: context.actor.actorType,
        createdByUserId:
          context.actor.actorType === 'USER' ? context.actor.actorUserId : undefined,
        createdBySystemActor:
          context.actor.actorType === 'SYSTEM' ? context.actor.systemActor : undefined,
      },
    });
    // Appearance gate: a `v1_game_result_participants` row means "this player
    // played", and every downstream reader treats it that way -- most visibly
    // `PublicUserRecordsService`, whose `summary.appearances` is a plain count
    // of these rows behind the profile's "출전 N경기". Before this, every
    // named participant got a row with a hardcoded `started: true`, so a
    // substitute who sat on the bench the whole match came out of a
    // tournament with the same appearance record as the player who started
    // it -- and was recorded as a *starter* on top of that.
    //
    // Who actually played is derived, not stored: `started` plus every active
    // SUBSTITUTION that brought someone on (`deriveAppearedParticipantIds`).
    // The stat maps are unioned in as a safety net -- `assertEventReferences`
    // checks only that a GOAL/CARD/FOUL names a participant of the right
    // side, never that they were on the pitch, so an operator who records a
    // substitute's goal but forgets the substitution itself produces a scorer
    // with no appearance. Dropping that row would silently delete the goal
    // from their record; keeping it treats scoring as the proof of playing it
    // plainly is.
    const appearedIds = new Set(deriveAppearedParticipantIds(participants, events));
    for (const statted of [goalCount, assistCount, foulCount, cardCount]) {
      for (const participantId of statted.keys()) appearedIds.add(participantId);
    }
    await tx.v1GameResultParticipant.createMany({
      data: participants
        .filter((participant) => appearedIds.has(participant.id))
        .map((participant) => ({
          resultRevisionId: revision.id,
          participantId: participant.id,
          sideId: participant.sideId,
          started: participant.started,
          goals: goalCount.get(participant.id) ?? 0,
          assists: assistCount.get(participant.id) ?? 0,
          fouls: foulCount.get(participant.id) ?? 0,
          cards: jsonInput(cardCount.get(participant.id) ?? { yellow: 0, red: 0 }),
          // 예전엔 false 로 못박혀 있었다 — 라인업이 이미 골키퍼를 알고 있는데도
          // 기록에는 남지 않아 개인 프로필에서 GK 출전을 구분할 수 없었다.
          // 포지션 코드는 경기의 competition config 에서 읽는다(종목마다 다르다).
          goalkeeper: participant.position === goalkeeperPositionCode,
        })),
    });
    const submitted = await tx.v1GameResultRevision.update({
      where: { id: revision.id },
      data: {
        state: V1GameResultRevisionState.SUBMITTED,
        submittedAt: new Date(),
      },
    });
    await this.writeOutbox(
      tx,
      `game:${game.id}:revision:${submitted.revision}:submitted`,
      game.id,
      'GAME_RESULT_SUBMITTED',
      { revisionId: submitted.id, sideCount: sides.length },
      submitted.id,
    );
    return {
      gameId: game.id,
      state: V1GameState.ENDED,
      version: game.version,
      durableCommandId: context.durableCommandId,
      replayed: false,
      revisionId: submitted.id,
      revision: submitted.revision,
      revisionState: submitted.state,
    };
  }

  /**
   * Per-participant GOAL/CARD/FOUL/assist aggregation, shared by
   * `deriveTournamentRevision` (builds a fresh SUBMITTED revision from the
   * full event stream) and `syncAssistsIntoSubmittedRevision` (assist-only
   * resync of an already-SUBMITTED revision after `assignGoalAssist` amends
   * an event in place -- see that method's doc comment for the bug this
   * closes). Extracted out of `deriveTournamentRevision` verbatim so both
   * call sites share one source of truth for what counts toward each stat,
   * `reversesEventId` filtering included -- see that filter's comment
   * below for the Issue #376 defect it closes.
   *
   * Also derives `missingScorer` (Issue #392 fix) from the SAME
   * `reversedIds` set used for the per-participant counts above, instead of
   * `deriveTournamentRevision` computing it separately with its own
   * unfiltered `events.some(...)`, which -- like the pre-#376-fix
   * goal/card/foul/assist loop -- never excluded reversed events: a GOAL
   * appended without a scorer and then reversed (mis-tap, wrong event
   * undone) kept tripping the "득점자 미기재" warning forever even after the
   * event stream no longer contained any live scorer-less goal. This keeps
   * `missingScorer` consistent with the same semantics `resultInvariantInput`
   * already uses for the manual team-match submission path: "does any
   * non-reversed GOAL event lack a participantId".
   */
  private aggregateGameParticipantStats(
    events: readonly {
      id: string;
      type: V1GameEventType;
      participantId: string | null;
      assistParticipantId: string | null;
      payload: Prisma.JsonValue;
      reversesEventId: string | null;
    }[],
  ): {
    goalCount: Map<string, number>;
    cardCount: Map<string, { yellow: number; red: number }>;
    assistCount: Map<string, number>;
    foulCount: Map<string, number>;
    missingScorer: boolean;
  } {
    const goalCount = new Map<string, number>();
    const cardCount = new Map<string, { yellow: number; red: number }>();
    const assistCount = new Map<string, number>();
    const foulCount = new Map<string, number>();
    let missingScorer = false;
    // Issue #376 fix: this loop used to have no reversed-event filter at
    // all, unlike its two siblings in this same file -- `scoreFromEvents`
    // (below) builds this identical `reversed` Set from `reversesEventId`
    // to exclude reversed GOALs from the home/away score, and
    // `resultInvariantInput` (above, team-match path) does the same to mark
    // `event.reversed` for the invariant validator. Without it here, a
    // reversed GOAL's participant/card/foul/assist still got counted
    // alongside whatever replaced it -- most visibly, attaching an assist
    // used to reverse the original GOAL and resubmit a new one, which made
    // the scorer's goal tally double-count (1 official goal, 2 counted)
    // while `scoreFromEvents`'s home/away total correctly stayed at 1. The
    // atomic `assignGoalAssist` command (see its doc comment) no longer
    // creates that specific pattern, but `reverseEvent` is still the
    // general correction path for GOAL/CARD/FOUL/SUBSTITUTION, so this
    // aggregation must independently stay correct for any reversed event.
    // Every caller of this shared helper (including the #376-follow-up
    // assist-revision-sync path) inherits this filter for free.
    const reversedIds = new Set(
      events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
    );
    for (const event of events) {
      if (reversedIds.has(event.id)) {
        continue;
      }
      if (event.type === V1GameEventType.GOAL && event.assistParticipantId !== null) {
        assistCount.set(
          event.assistParticipantId,
          (assistCount.get(event.assistParticipantId) ?? 0) + 1,
        );
      }
      if (event.participantId === null) {
        if (event.type === V1GameEventType.GOAL && jsonObject(event.payload).anonymous !== true) {
          missingScorer = true;
        }
        continue;
      }
      if (event.type === V1GameEventType.GOAL) {
        goalCount.set(event.participantId, (goalCount.get(event.participantId) ?? 0) + 1);
      }
      if (event.type === V1GameEventType.CARD) {
        const payload = jsonObject(event.payload);
        const cards = cardCount.get(event.participantId) ?? { yellow: 0, red: 0 };
        if (payload.card === 'RED') {
          cards.red += 1;
        } else {
          cards.yellow += 1;
        }
        cardCount.set(event.participantId, cards);
      }
      if (event.type === V1GameEventType.FOUL) {
        foulCount.set(event.participantId, (foulCount.get(event.participantId) ?? 0) + 1);
      }
    }
    return { goalCount, cardCount, assistCount, foulCount, missingScorer };
  }

  /**
   * Assist-revision-sync fix (Issue #376 follow-up; alpha finding on
   * fixture 4439fb84-9117-4d9f-b103-b9abda4bfdd0): `assignGoalAssist` amends
   * `assistParticipantId` on an already-persisted GOAL event in place, but
   * nothing previously re-derived the game's result revision from that
   * change. `deriveTournamentRevision` only ever runs ONCE per game, at
   * `end`/recovery time (its `revision: 1` literal above assumes exactly
   * one call) -- every assist attach/detach AFTER that moment left the
   * already-created revision's `V1GameResultParticipant` rows frozen at
   * whatever they were when the revision was derived, while the event
   * stream (and the "경기 세부 기록" event list the operate console renders
   * straight from events) kept moving. Reviewers then saw the two halves of
   * the same result-review screen disagree, and approving that revision
   * would have shipped the STALE assist count as the official record
   * forever.
   *
   * ## Why this creates a NEW revision instead of patching the SUBMITTED one
   *
   * The first cut of this fix tried `tx.v1GameResultParticipant.update(...)`
   * directly against the SUBMITTED revision's rows and hit a hard DB wall:
   * `v1_guard_result_participant_mutation` (a trigger, see
   * prisma/migrations/20260729000100_v1_game_operations/migration.sql)
   * rejects every INSERT/UPDATE/DELETE on `v1_game_result_participants`
   * whose owning revision's `state` isn't `DRAFT` -- SUBMITTED included --
   * with SQLSTATE 55000 "result participants require a draft revision".
   * This isn't dead/unenforced code the way `assertRevisionMutationAllowed`
   * is (see below); it's a live, currently-active trigger, confirmed by a
   * real failing integration test, and it has never been relaxed by a later
   * migration. The chosen fix (product decision, not a technical
   * workaround) is to reuse the SAME supersede-then-submit mechanism
   * `TournamentResultReviewService.supersedeAndSubmit`/`createResultCorrection`
   * already use for every other "this SUBMITTED-adjacent content needs to
   * change" case in this codebase: create a fresh DRAFT successor (which
   * CAN carry participant rows, per the trigger), attach the resynced
   * participants to it, then transition it DRAFT -> SUBMITTED (both legal,
   * pre-existing transitions) -- never mutating the predecessor row itself.
   * `ASSIST_SYNC` (`games/core/revision-state-machine.ts`) is the new,
   * additive `RevisionSupersessionPurpose` this requires, following the
   * exact same shape `VOID_REENTRY` added for issue #380.
   *
   * ## Deciding which revision state(s) this method acts on
   *
   * `V1GameResultRevisionState` has DRAFT / SUBMITTED / CHANGE_REQUESTED /
   * SUPPLEMENT_REQUESTED / REJECTED / OFFICIAL / VOID (schema.prisma):
   *
   *  - `SUBMITTED` (this method's only base): still awaiting a reviewer
   *    decision -- nothing has been confirmed or even provisionally decided
   *    about it yet, so a fresh successor built from the current event
   *    stream keeps the review screen honest about what the events actually
   *    say. This is the literal case reported in alpha: revision #1
   *    SUBMITTED, the event already showing the new assist, the "어시스트
   *    미기입" warning banner still counting the stale row.
   *  - `OFFICIAL` is NEVER a base here -- silently rewriting (or silently
   *    superseding without review) a CONFIRMED public result would destroy
   *    the audit trail's meaning. `assignGoalAssist` itself refuses the
   *    whole command up front (see its doc comment) whenever the game's
   *    `currentOfficialRevisionId` currently points at an OFFICIAL
   *    revision, so this method's `state: SUBMITTED` filter is structurally
   *    incapable of ever selecting an OFFICIAL row anyway -- two
   *    independent, redundant protections for the same invariant. An
   *    operator who needs to fix an assist on an already-confirmed result
   *    must go through the existing "결과 정정" (`createResultCorrection`)
   *    flow instead.
   *  - `DRAFT` is a correction-in-progress with HAND-AUTHORED participant
   *    rows (`createResultCorrection`'s `dto.changes.actualParticipants`,
   *    not event-derived). Silently overwriting -- or superseding -- an
   *    operator's in-flight correction with a fresh event aggregate would
   *    clobber the very correction they are actively typing. Excluded by
   *    the `state: SUBMITTED` filter below (and `assertRevisionSupersession`
   *    independently rejects `ASSIST_SYNC` from any base other than
   *    SUBMITTED -- see its unit tests).
   *  - `CHANGE_REQUESTED` / `SUPPLEMENT_REQUESTED` / `REJECTED` are
   *    terminal, already-decided snapshots (`TERMINAL_REVISION_STATES` in
   *    `games/core/revision-state-machine.ts`, which also models `SUBMITTED`
   *    participants as frozen via `assertRevisionMutationAllowed`'s
   *    `REVISION_CONTENT_FROZEN` branch -- that function is defined but not
   *    wired into any runtime check; the DB trigger above is what actually
   *    enforces the equivalent invariant). They exist specifically to
   *    preserve "this is what the reviewer saw when they rejected /
   *    requested changes / requested supplement" -- touching them would
   *    corrupt that decision's provenance. A resubmission after one of
   *    these creates a brand-new SUBMITTED revision (`supersedeAndSubmit`),
   *    which this method picks up normally once it exists. Excluded by the
   *    `state: SUBMITTED` filter.
   *  - `VOID` is also terminal and, per `createResultCorrection`'s
   *    `VOID_REENTRY` comment ("기존 공식·무효 리비전은 그대로 남아요"), an
   *    existing official/void revision must stay exactly as it is when a
   *    new correction re-enters review. A VOID revision also never has any
   *    `V1GameResultParticipant` rows to begin with (`voidResultRevision`
   *    never creates any), so there would be nothing to sync into even
   *    before the state filter excludes it.
   *
   * ## What happens to the predecessor SUBMITTED row
   *
   * Left completely untouched -- `supersedeAndSubmit` never mutates its own
   * base row either (its REJECTED/SUPPLEMENT_REQUESTED bases are already
   * permanently frozen by `v1_block_terminal_revision_mutation`, so there is
   * nothing TO mutate there; SUBMITTED is not in that trigger's terminal
   * set, so it technically COULD be mutated, but none of the seven
   * `V1GameResultRevisionState` values honestly describes "auto-superseded
   * by a system sync, no reviewer decision" -- REJECTED/CHANGE_REQUESTED/
   * SUPPLEMENT_REQUESTED would misrepresent a human decision that never
   * happened, and the coordinator's decision for this fix was explicitly
   * schema-only-if-necessary, not "add a new enum value"). Leaving it
   * `SUBMITTED` forever, unguarded, would reopen exactly the stale-approval
   * hazard this whole fix exists to close -- a stale reviewer view (or a
   * stale cached revisionId) could still `officializeResultRevision` the
   * OLD row and confirm outdated assist data as official.
   * `officializeResultRevision`'s STANDARD flow now independently refuses
   * that: it rejects officializing any revision that a newer revision's
   * `supersedesId` already points at (see that method's own comment) --
   * the exact same kind of staleness check its CORRECTION flow already
   * performs, just in the other direction.
   *
   * This method DOES close the predecessor's still-open review SLA
   * (`V1ResultEscalation` rows + not-yet-fired reminder/escalation outbox
   * jobs) via `closeAssistSyncPredecessorSla`, mirroring
   * `TournamentResultReviewService.closeReviewSla` exactly (duplicated, not
   * imported -- that class already duplicates `jsonInput`/`canonicalize`
   * from this file in the opposite direction for the identical reason: it
   * is a different service in a different ownership lane). The successor's
   * `submittedAt` is copied from the predecessor's ORIGINAL `submittedAt`,
   * not `new Date()` -- `GameResultSubmittedEscalationService` computes
   * every reminder/escalation due date from `submittedAt`, so preserving it
   * means the review deadline the coordinator flagged ("어시스트 한 건
   * 붙였다고 검토 기한이 리셋되면 그건 부작용이다") genuinely does not move;
   * an operator fixing an assist does not buy the submitter extra review
   * time, nor does it dock any already-elapsed time.
   *
   * Known residual gap (reported, not fixed here -- see the task report):
   * if this method runs in the narrow window before the worker has yet
   * processed the predecessor's OWN original `GAME_RESULT_SUBMITTED` outbox
   * event, `closeAssistSyncPredecessorSla` finds nothing to close yet, and
   * the worker's `GameResultSubmittedEscalationService.escalationHandler`
   * later still sees `revision.state === 'SUBMITTED'` (never changed here)
   * and can recreate a PENDING escalation row against the now-superseded
   * predecessor id. Closing that race requires teaching the worker to also
   * recognize "this revision has since been superseded" (e.g. via the same
   * `supersedesId`-pointed-at-me check `officializeResultRevision` now
   * runs), which is a change to a third file/subsystem outside this fix's
   * scope -- flagged rather than silently patched, per instruction not to
   * add unrequested complexity here.
   *
   * ## Repeated toggling chains revisions -- confirmed, not mitigated
   *
   * Attaching/detaching the same goal's assist N times creates N superseding
   * revisions (revision +1 each time) -- this method always supersedes
   * "whichever revision is currently SUBMITTED", so it cannot collapse
   * consecutive system-generated syncs into one row. The suggested
   * mitigation (delete-and-recreate the immediately-preceding sync
   * revision instead of chaining) was checked and is structurally
   * impossible, not merely undesirable: `V1GameResultParticipant.
   * resultRevision` is `onDelete: Restrict`, so deleting a
   * `V1GameResultRevision` row first requires deleting its participant
   * rows -- and `v1_guard_result_participant_mutation` (the same trigger
   * that forced this whole design) blocks deleting participant rows for
   * any non-DRAFT revision exactly as it blocks updating them. There is no
   * state a completed sync's revision can be left in that is simultaneously
   * "SUBMITTED for review" and "still deletable". Left unmitigated per
   * instruction (report the fact, do not add complexity to work around a
   * structural wall).
   *
   * Aggregation reuses `aggregateGameParticipantStats` -- the SAME
   * event-to-participant-stat aggregation `deriveTournamentRevision` uses to
   * build a revision from scratch, `reversesEventId` filter included --
   * rather than hand-rolling a +1/-1 delta, so a swapped assist (old
   * participant loses one, new participant gains one, in the same call) and
   * every future event-derived stat stay derived from one source of truth
   * instead of two aggregation implementations that could drift apart.
   *
   * Only the `assists` column differs from the predecessor's own rows:
   * goals/cards/fouls/started/minutesPlayed/goalkeeper are copied through
   * unchanged -- they are outside `assignGoalAssist`'s blast radius (it
   * only ever changes `assistParticipantId`), so re-deriving them here too
   * would be unrelated scope creep with its own risk of silently
   * overwriting a reviewer-visible field this command was never asked to
   * touch.
   *
   * ## Bench-assist fix (2026-08-27 audit finding)
   *
   * `assignGoalAssist` validates only that the assist participant belongs to
   * the scoring SIDE, never that they appeared -- so an operator can attach
   * an assist to a bench player who never came on (no SUBSTITUTION event
   * recorded) after the revision was already derived. That participant has
   * NO predecessor row (the appearance gate in `deriveTournamentRevision`
   * excluded them), so the copy-through loop above cannot pick them up no
   * matter what it copies. This method now separately diffs `assistCount`
   * against `predecessorParticipantIds` and builds a fresh row -- with
   * `started`/`sideId`/`goalkeeper` looked up directly from
   * `V1GameParticipant` (mirroring `deriveTournamentRevision`'s own
   * goalkeeper-position-code lookup) since there is no predecessor row to
   * copy those columns from -- for every such participant. Without this, the
   * assist stayed visible in the raw event stream while silently never
   * reaching `V1GameResultParticipant` (and therefore never reaching
   * `public-user-records.service.ts` / `player-card-stats.ts`, which read
   * only from that table).
   *
   * Returns `null` when there is no SUBMITTED revision to sync, or when the
   * resync would produce no observable change (e.g. an assist toggle that
   * happens to reproduce the value already stored) -- callers use this to
   * skip creating a pointless successor revision and to omit an empty,
   * meaningless diff from the audit trail's `after` snapshot.
   */
  private async syncAssistsIntoSubmittedRevision(
    tx: Transaction,
    gameId: string,
    context: GameCommandContext,
  ): Promise<{
    revisionId: string;
    revision: number;
    supersedesRevisionId: string;
    participants: Array<{ participantId: string; assistsBefore: number; assistsAfter: number }>;
  } | null> {
    // `orderBy` is required, not cosmetic: because this method deliberately
    // never changes a predecessor's own `state` column away from SUBMITTED
    // (see the doc comment above), repeated toggling leaves MULTIPLE rows
    // with `state: SUBMITTED` for the same game -- an unordered `findFirst`
    // can return any of them, including an already-superseded one, silently
    // syncing into the wrong (stale) row while the actual latest revision
    // is left untouched. Revision numbers strictly increase (`predecessor.
    // revision + 1` below, mirroring `nextRevisionNumber` elsewhere in this
    // file), so the highest-numbered SUBMITTED row is always the live one.
    const predecessor = await tx.v1GameResultRevision.findFirst({
      where: { gameId, state: V1GameResultRevisionState.SUBMITTED },
      orderBy: { revision: 'desc' },
    });
    if (predecessor === null) {
      return null;
    }
    const [events, predecessorParticipants] = await Promise.all([
      tx.v1GameEvent.findMany({
        where: { gameId },
        select: {
          id: true,
          type: true,
          participantId: true,
          assistParticipantId: true,
          payload: true,
          reversesEventId: true,
        },
      }),
      tx.v1GameResultParticipant.findMany({ where: { resultRevisionId: predecessor.id } }),
    ]);
    const { assistCount } = this.aggregateGameParticipantStats(events);
    const diffs: Array<{ participantId: string; assistsBefore: number; assistsAfter: number }> = [];
    for (const participant of predecessorParticipants) {
      const nextAssists = assistCount.get(participant.participantId) ?? 0;
      if (nextAssists !== participant.assists) {
        diffs.push({
          participantId: participant.participantId,
          assistsBefore: participant.assists,
          assistsAfter: nextAssists,
        });
      }
    }
    // 감사 결함 수정(2026-08-27) -- 벤치 어시스트가 통째로 사라지는 결함.
    // `assignGoalAssist`는 어시스트 참가자가 득점 사이드 소속인지만 확인하고(2331
    // `assistParticipant.sideId !== target.sideId`) 출전 여부는 전혀 보지 않는다. 그래서
    // SUBSTITUTION 을 안 찍은 채 실제로는 뛴 벤치 선수(`started:false`) 에게 사후 어시스트를
    // 붙일 수 있는데, 그 선수는 `deriveTournamentRevision` 의 출전 게이트(appearedIds, 위
    // 6153)를 리비전 생성 시점에 통과하지 못해 predecessor 에 애초에 행이 없다. 위 루프는
    // predecessorParticipants 만 순회하므로 이 참가자는 어디에도 안 걸리고, 다른 선수의
    // 어시스트가 안 움직이면 diffs 가 비어 이 메서드 자체가 null 을 반환해 -- 새 리비전이
    // 아예 만들어지지 않고 어시스트가 이벤트 목록에는 보이는데 공식 기록(개인 기록·선수
    // 카드 PAS 가 읽는 V1GameResultParticipant)에는 영원히 반영되지 않는다. predecessor 에
    // 없지만 지금 assistCount 가 credit 하는 participantId 마다 새 행을 만들어 이 경로를
    // 막는다.
    const predecessorParticipantIds = new Set(
      predecessorParticipants.map((participant) => participant.participantId),
    );
    const newAssistParticipantIds = [...assistCount.entries()]
      .filter(([participantId, assists]) => assists > 0 && !predecessorParticipantIds.has(participantId))
      .map(([participantId]) => participantId);
    const newParticipantRows: Array<{
      participantId: string;
      sideId: string;
      started: boolean;
      goals: number;
      assists: number;
      fouls: number;
      cards: Prisma.InputJsonValue;
      goalkeeper: boolean;
    }> = [];
    if (newAssistParticipantIds.length > 0) {
      const [missingParticipants, syncGame] = await Promise.all([
        tx.v1GameParticipant.findMany({
          where: { id: { in: newAssistParticipantIds }, gameId },
          select: { id: true, sideId: true, started: true, position: true },
        }),
        tx.v1Game.findUnique({ where: { id: gameId }, select: { competitionConfigVersionId: true } }),
      ]);
      const config = syncGame
        ? await tx.v1CompetitionConfigVersion.findUnique({
            where: { id: syncGame.competitionConfigVersionId },
            select: { lineup: true },
          })
        : null;
      // deriveTournamentRevision(위 6084)과 같은 판정 -- 종목마다 다른 골키퍼 포지션
      // 코드를 대회 설정에서 읽는다. 레거시 config 는 같은 이유로 'GK' 로 폴백한다.
      const goalkeeperPositionCode =
        parseLineupCatalog(config?.lineup ?? null).positions.find(
          (position) => position.goalkeeper === true,
        )?.code ?? 'GK';
      for (const participant of missingParticipants) {
        const assists = assistCount.get(participant.id) ?? 0;
        diffs.push({ participantId: participant.id, assistsBefore: 0, assistsAfter: assists });
        newParticipantRows.push({
          participantId: participant.id,
          sideId: participant.sideId,
          started: participant.started,
          goals: 0,
          assists,
          fouls: 0,
          cards: jsonInput({ yellow: 0, red: 0 }),
          goalkeeper: participant.position === goalkeeperPositionCode,
        });
      }
    }
    if (diffs.length === 0) {
      return null;
    }
    try {
      assertRevisionSupersession({
        baseGameId: predecessor.gameId,
        successorGameId: gameId,
        baseRevisionId: predecessor.id,
        supersedesRevisionId: predecessor.id,
        baseState: predecessor.state,
        successorState: V1GameResultRevisionState.DRAFT,
        purpose: 'ASSIST_SYNC',
      });
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
    const successorDraft = await tx.v1GameResultRevision.create({
      data: {
        gameId,
        revision: predecessor.revision + 1,
        score: jsonInput(predecessor.score),
        goalEvents:
          predecessor.goalEvents === null ? undefined : jsonInput(predecessor.goalEvents),
        eventsHash: predecessor.eventsHash,
        missingScorer: predecessor.missingScorer,
        mvpParticipantId: predecessor.mvpParticipantId,
        // 몰수·중단 표식과 사유를 승계한다. 빠뜨리면 기본값 NORMAL 로 떨어져 몰수로
        // 끝난 경기가 어시스트 동기화 한 번에 정상 종료로 둔갑한다(Copilot 리뷰 지적).
        outcomeReason: predecessor.outcomeReason,
        outcomeNote: predecessor.outcomeNote,
        reason: '시스템: 어시스트 변경을 반영해 새 리비전을 제출했어요',
        createdByActorType: context.actor.actorType,
        createdByUserId:
          context.actor.actorType === 'USER' ? context.actor.actorUserId : undefined,
        createdBySystemActor:
          context.actor.actorType === 'SYSTEM' ? context.actor.systemActor : undefined,
        supersedesId: predecessor.id,
      },
    });
    await tx.v1GameResultParticipant.createMany({
      data: [
        ...predecessorParticipants.map((participant) => ({
          resultRevisionId: successorDraft.id,
          participantId: participant.participantId,
          sideId: participant.sideId,
          started: participant.started,
          minutesPlayed: participant.minutesPlayed,
          goals: participant.goals,
          assists: assistCount.get(participant.participantId) ?? 0,
          fouls: participant.fouls,
          cards: jsonInput(participant.cards),
          goalkeeper: participant.goalkeeper,
        })),
        // 위에서 새로 지은 벤치-어시스트 행 -- predecessor 에 없던 참가자라 여기 별도로
        // 붙인다(예전엔 이 배열이 predecessorParticipants 만 순회해 이 케이스가 통째로
        // 드롭됐다).
        ...newParticipantRows.map((participant) => ({
          resultRevisionId: successorDraft.id,
          participantId: participant.participantId,
          sideId: participant.sideId,
          started: participant.started,
          goals: participant.goals,
          assists: participant.assists,
          fouls: participant.fouls,
          cards: participant.cards,
          goalkeeper: participant.goalkeeper,
        })),
      ],
    });
    try {
      assertRevisionTransition({
        from: successorDraft.state,
        to: V1GameResultRevisionState.SUBMITTED,
        flow: 'STANDARD',
      });
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
    const submitted = await tx.v1GameResultRevision.update({
      where: { id: successorDraft.id },
      data: {
        state: V1GameResultRevisionState.SUBMITTED,
        // Preserve the ORIGINAL submission instant -- see this method's doc
        // comment on why the review SLA clock must not reset.
        submittedAt: predecessor.submittedAt ?? new Date(),
      },
    });
    await this.closeAssistSyncPredecessorSla(tx, predecessor.id);
    await this.writeOutbox(
      tx,
      `game:${gameId}:revision:${submitted.revision}:submitted`,
      gameId,
      'GAME_RESULT_SUBMITTED',
      { revisionId: submitted.id, supersedesId: predecessor.id },
      submitted.id,
    );
    return {
      revisionId: submitted.id,
      revision: submitted.revision,
      supersedesRevisionId: predecessor.id,
      participants: diffs,
    };
  }

  /**
   * Cancels the predecessor's still-open review escalations and not-yet-
   * fired reminder/escalation outbox jobs when `ASSIST_SYNC` supersedes it
   * (see `syncAssistsIntoSubmittedRevision`'s doc comment). Same two
   * statements as `TournamentResultReviewService.closeReviewSla`,
   * duplicated rather than imported -- that method is private on a
   * different service in a different ownership lane (that file already
   * duplicates `jsonInput`/`canonicalize` from THIS file for the same
   * reason, in the opposite direction). Safe to call even when the
   * predecessor has no open escalations yet: both statements affect 0 rows
   * and do not error.
   */
  private async closeAssistSyncPredecessorSla(tx: Transaction, revisionId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE v1_result_escalations
      SET status = 'CLOSED'::"V1EscalationStatus",
          reason = '어시스트 변경으로 새 리비전이 제출되어 대체됨',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE result_revision_id = ${revisionId}
        AND status IN ('PENDING', 'ACKNOWLEDGED')
    `;
    await tx.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'COMPLETED'::"V1OutboxStatus",
          lease_owner = NULL,
          lease_until = NULL,
          last_error = NULL,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE revision_id = ${revisionId}
        AND type IN ('GAME_RESULT_REVIEW_REMINDER', 'GAME_RESULT_REVIEW_ESCALATION')
        AND status IN ('PENDING', 'RETRY')
    `;
  }

  private scoreFromEvents(
    events: readonly {
      id: string;
      type: V1GameEventType;
      sideId: string | null;
      reversesEventId: string | null;
    }[],
    sides: readonly { id: string; sideKey: 'HOME' | 'AWAY' }[],
  ): GameScore {
    const reversed = new Set(
      events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
    );
    const sideIds = new Map(
      sides.map((side) => [side.id, side.sideKey === 'HOME' ? 'home' : 'away'] as const),
    );
    let home = 0;
    let away = 0;
    events.forEach((event) => {
      if (
        (event.type !== V1GameEventType.GOAL && event.type !== V1GameEventType.OWN_GOAL) ||
        event.sideId === null ||
        reversed.has(event.id)
      ) {
        return;
      }
      if (sideIds.get(event.sideId) === 'home') {
        home += 1;
      } else {
        away += 1;
      }
    });
    return { home, away };
  }

  /**
   * Folds an `end` command's optional penalty shootout score onto the
   * event-derived regulation score. `undefined` in (no `payload.penalties`
   * sent) is the ordinary case and passes `score` through unchanged --
   * every other TOURNAMENT_FIXTURE `end` keeps behaving exactly as before
   * this feature existed.
   *
   * 판정 자체는 이 파일에 두지 않는다. 규칙은
   * `games/core/knockout-penalties.ts`의 순수 함수
   * (`assertPenaltiesNotAllowed` / `assertBracketResolvable`)에, 그 규칙이
   * 필요로 하는 DB 사실 읽기는 `tournaments/knockout-fixture.ts`의
   * `readKnockoutFixtureFacts`에 있다. 이유·근거·POISONED 사고 기록은 전부
   * 그 두 파일의 docblock으로 **옮겼다**(복제하지 않았다) — 원래 이 가드가
   * `end` 레인의 private 메서드 안에만 있었기 때문에 정정(correction) 레인이
   * 같은 가드를 하나도 갖지 못했고, 그 결함을 고치려면 판정이 두 레인에서
   * 공유 가능한 자리에 있어야 한다.
   *
   * `extractEndPenalties`가 이미 `penalties.home !== penalties.away`(승부차기는
   * 승자를 만들어야 한다)를 보장하므로, 이 경로를 통과한 `score.penalties`는
   * `GameResultBracketProjectionService.resolveWinnerSide`가 무조건 신뢰할 수
   * 있다.
   */
  private async applyPenalties(
    tx: Transaction,
    game: LockedGame,
    score: GameScore,
    penalties: StoredPenalties | undefined,
    penaltyOrigin: 'END_COMMAND' | 'RECOVERY',
  ): Promise<GameScore> {
    // 결정적 스코어 + 승부차기 없음이면 어떤 fact도 판정을 바꾸지 않으므로
    // 질의하지 않는다 — 리팩터 전 단축 평가 동작을 그대로 보존한다.
    if (!needsKnockoutFixtureFacts(score, penalties)) {
      return score;
    }
    const facts = await readKnockoutFixtureFacts(tx, game.tournamentFixtureId);
    if (penalties === undefined) {
      assertBracketResolvable(score, facts);
      return score;
    }
    // **자격 먼저, 내용 나중.** `assertPenaltiesNotAllowed`가 "이 경기가 애초에 승부차기를
    // 받을 수 있는가"(조별리그가 아닌가 · 정규시간이 무승부인가)를 409로 가른다. 킥 수·정책
    // 검사를 그보다 앞에 두면 **조별리그 경기에 승부차기를 보낸 운영자에게 "킥 수를 넣어라"가
    // 뜬다** — 시키는 대로 킥 수를 채워 넣어도 여전히 거부당하는 막다른 안내다.
    // (2026-08-18 CI 실측: 통합 테스트 4건이 409를 기대했는데 422가 나와 실패했다.)
    const applied = assertPenaltiesNotAllowed(score, penalties, facts);
    // 자격을 통과한 뒤에야 내용을 본다 — 킥 수가 실려 왔으면 서버도 프런트와 **같은 술어**로
    // 결판을 판정한다. 예전에는 이 판정이 프런트에만 있어(총점 두 개로는 킥 수를 알 수 없다)
    // 화면의 가드가 API 직접 호출로 그대로 우회됐다.
    await this.assertPenaltyShootoutConcludedForGame(tx, game, penalties, penaltyOrigin);
    return applied;
  }

  /**
   * 이 대회의 승부차기 종료 정책을 읽어 게이트를 건다. 정책 해석은 `getGame`이
   * 프런트에 `penaltyShootoutPolicy`를 내려줄 때 쓰는 것과 **같은 `parseResultPolicy`**다 —
   * 화면이 버튼을 여는 기준과 서버가 저장을 허용하는 기준이 갈리면, 운영자에게는
   * "눌렀는데 실패했다"로만 보인다.
   *
   * 킥 수가 없는 요청(레거시 클라이언트·정정 승계)은 `assertPenaltyShootoutConcluded`가
   * 즉시 통과시키므로 config 를 읽을 필요도 없다 — 그 경우 질의를 건너뛴다.
   */
  private async assertPenaltyShootoutConcludedForGame(
    tx: Transaction,
    game: LockedGame,
    penalties: StoredPenalties,
    penaltyOrigin: 'END_COMMAND' | 'RECOVERY',
  ): Promise<void> {
    // 판정은 모든 경로가 공유하는 단일 관문에 있다(`assertPenaltyShootoutPersistable`).
    // 여기서 정하는 건 "킥 수를 요구할 것인가" 하나뿐이다: `end` 는 승부차기를 **새로 쓰는**
    // 경로라 클라이언트가 킥 목록을 들고 있으므로 요구하고, 복구는 이미 저장된 값을 옮기는
    // 경로라 면제한다(킥 수가 생기기 전 리비전에는 그 값이 없다).
    const requireKickCounts = penaltyOrigin === 'END_COMMAND';
    // 킥 수가 없으면 관문이 정책을 보지 않는다(그 함수의 계약) — 잠금 구간에서 쓸모없는
    // config 질의를 하지 않도록 여기서 먼저 갈라 준다.
    const needsPolicy = penalties.takenHome !== undefined && penalties.takenAway !== undefined;
    const policy = needsPolicy
      ? parseResultPolicy(
          (
            await tx.v1CompetitionConfigVersion.findUnique({
              where: { id: game.competitionConfigVersionId },
              select: { result: true },
            })
          )?.result ?? null,
        )
      : { earlyStop: true };
    assertPenaltyShootoutPersistable(penalties, policy, { requireKickCounts });
  }

  private async assertTeamMatchMatched(tx: Transaction, teamMatchId: string | null): Promise<void> {
    // Task 16: mirrors the precondition the removed `/team-matches/:teamMatchId/complete`
    // shortcut used to enforce (matched status + a locked-in opponent) before letting a
    // host draft or submit a result. Without this, a still-recruiting or closed team
    // match's Game row (created up front with a placeholder, teamId-less AWAY side —
    // see TeamMatchesService.teamMatchGameSourceInput) could be drafted/ended against a
    // side that isn't a real opposing team yet.
    //
    // `completed` is intentionally accepted alongside `matched`: submitResultRevision
    // atomically flips the TeamMatch to `completed` on the *first* submission, and this
    // guard runs at the top of both createResultRevision and submitResultRevision — so a
    // matched-only check would make status `completed` after that first submission and
    // permanently reject every later call, including the correction loop this task
    // requires (opponent change-request -> host drafts + submits a superseding
    // revision). Any status the match reached before ever becoming `matched` (recruiting,
    // closed, cancelled) has approvedApplicantTeamId === null and fails below; `archived`,
    // which only an admin sets after the fact, is neither `matched` nor `completed` and
    // fails the status check directly. So the "never reached a playable state" rejection
    // is preserved either way.
    if (teamMatchId === null) {
      return;
    }
    const teamMatch = await tx.v1TeamMatch.findUnique({
      where: { id: teamMatchId },
      select: { status: true, approvedApplicantTeamId: true },
    });
    const reachedPlayableState =
      teamMatch !== null &&
      teamMatch.approvedApplicantTeamId !== null &&
      (teamMatch.status === V1TeamMatchStatus.matched ||
        teamMatch.status === V1TeamMatchStatus.completed);
    if (!reachedPlayableState) {
      throw new ConflictException({
        code: 'TEAM_MATCH_NOT_MATCHED',
        message: 'Only a matched team match with an approved opponent can draft or submit a result',
      });
    }
  }

  private assertLifecycle(
    sourceType: V1GameSourceType,
    trigger: 'TOURNAMENT_COMMAND' | 'TEAM_RESULT_SUBMISSION' | 'CANCEL',
    from: V1GameState,
    to: V1GameState,
  ) {
    try {
      assertGameLifecycleTransition({ sourceType, trigger, from, to });
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
  }

  /**
   * `start` used to only call `assertLifecycle` — a valid SCHEDULED→LIVE
   * state transition was enough, even with zero lineups submitted on either
   * side. That left an operator with a LIVE game and no participants to
   * record events against (`LineupGrid` would show "제출된 선발 명단이
   * 없어요" with no way back). PR #316 added a client-side gate
   * (`sidesMissingLineup` in operate-console.tsx, built on
   * `latestOperableLineup` in lineup-grid.tsx), but that only blocks the
   * button — calling this API directly still skipped the check entirely.
   * This mirrors the exact same rule server-side so the API itself refuses
   * the transition: every `V1GameSide` on the game needs at least one
   * lineup in SUBMITTED or LOCKED state (a newer DRAFT revision on top
   * doesn't retract an earlier submission — same semantics as
   * `latestOperableLineup`, which only ever looks at SUBMITTED/LOCKED rows).
   */
  private async assertLineupsSubmittedForStart(tx: Transaction, gameId: string): Promise<void> {
    const sides = await tx.v1GameSide.findMany({ where: { gameId } });
    const operableLineups = await tx.v1GameLineup.findMany({
      where: { gameId, state: { in: [V1GameLineupState.SUBMITTED, V1GameLineupState.LOCKED] } },
      select: { sideId: true },
    });
    const sideIdsWithOperableLineup = new Set(operableLineups.map((lineup) => lineup.sideId));
    const missingSides = sides.filter((side) => !sideIdsWithOperableLineup.has(side.id));
    if (missingSides.length > 0) {
      throw new ConflictException({
        code: 'LINEUP_NOT_SUBMITTED',
        message: `${missingSides.map((side) => side.displayNameSnapshot).join(', ')} 팀의 선발 명단을 제출해야 경기를 시작할 수 있어요.`,
      });
    }
  }

  private requireTakeover(gameId: string, sourceType: V1GameSourceType, context: GameCommandContext) {
    // Task T1-1: the exclusive takeover token exists to arbitrate between
    // multiple tournament staff devices contending for control of the same
    // physical live console (see requestTakeover's doc comment). A team
    // match has exactly one writer role (the host team owner/manager,
    // enforced in resolveActor) and no staff handoff concept — team-match
    // actors can never obtain an authorizationSubject (see resolveActor) and
    // would otherwise be permanently locked out of event_append/event_reverse.
    if (sourceType === V1GameSourceType.TEAM_MATCH) {
      return;
    }
    const token = context.takeoverToken?.trim();
    const authorizationSubject =
      context.actor.actorType === 'USER' ? context.actor.authorizationSubject : undefined;
    if (
      token === undefined ||
      token.length === 0 ||
      authorizationSubject === undefined ||
      !this.takeover.validate({ gameId, token, authorizationSubject })
    ) {
      throw new ForbiddenException({
        code: 'TAKEOVER_TOKEN_EXPIRED',
        message: 'A valid exclusive takeover token is required',
      });
    }
  }

  /**
   * Grants a fresh exclusive takeover token for a tournament-fixture game.
   * Only actors with tournament command authority (field_operator,
   * tournament_director, platform_ops) may hold the token; support_readonly
   * and team-match actors are denied. Called from the realtime gateway's
   * `game.takeover.request` handler.
   */
  async requestTakeover(
    user: V1AuthUser,
    gameId: string,
    input: { clientInstanceId: string; lastSequence: number },
  ): Promise<{
    gameId: string;
    takeoverToken: string;
    version: number;
    lastSequence: number;
    expiresAt: string;
  }> {
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'tournament_command');
    if (actor.authorizationSubject === undefined) {
      throw this.forbidden();
    }
    const grant = this.takeover.grant({
      gameId,
      authorizationSubject: actor.authorizationSubject,
      clientInstanceId: input.clientInstanceId,
      lastSequence: input.lastSequence,
    });
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { version: true, lastSequence: true },
    });
    if (game === null) {
      throw this.notFound();
    }
    return {
      gameId,
      takeoverToken: grant.token,
      version: game.version,
      lastSequence: game.lastSequence,
      expiresAt: new Date(grant.expiresAt).toISOString(),
    };
  }

  /**
   * Renews an already-held takeover token, extending its 90s expiry. Fails
   * closed (TAKEOVER_TOKEN_EXPIRED) on any stale/foreign/expired token so a
   * client must re-request a fresh grant instead of silently continuing.
   */
  async renewTakeover(
    user: V1AuthUser,
    gameId: string,
    input: { takeoverToken: string; clientInstanceId: string },
  ): Promise<{
    gameId: string;
    takeoverToken: string;
    version: number;
    lastSequence: number;
    expiresAt: string;
  }> {
    const actor = await this.resolveActor(this.prisma, gameId, user.id, 'tournament_command');
    if (actor.authorizationSubject === undefined) {
      throw this.forbidden();
    }
    const renewed = this.takeover.renew({
      gameId,
      token: input.takeoverToken,
      authorizationSubject: actor.authorizationSubject,
      clientInstanceId: input.clientInstanceId,
    });
    if (renewed === null) {
      throw new ForbiddenException({
        code: 'TAKEOVER_TOKEN_EXPIRED',
        message: 'The takeover token could not be renewed',
      });
    }
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { version: true, lastSequence: true },
    });
    if (game === null) {
      throw this.notFound();
    }
    return {
      gameId,
      takeoverToken: renewed.token,
      version: game.version,
      lastSequence: game.lastSequence,
      expiresAt: new Date(renewed.expiresAt).toISOString(),
    };
  }

  async resultRecoveryDeriveAndSubmit(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: GameResultRecoveryDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withCommand(
      {
        gameId,
        action: 'result_recovery_derive_and_submit',
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'tournament_command'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        takeoverToken: dto.takeoverToken,
        payload: { eventsHash: dto.eventsHash, reason: dto.reason },
      },
      async (tx, game, context) => {
        if (game.sourceType !== V1GameSourceType.TOURNAMENT_FIXTURE) {
          throw new ConflictException({
            code: 'RESULT_RECOVERY_NOT_REQUIRED',
            message: 'Result recovery only applies to tournament fixtures',
          });
        }
        // Result recovery is deliberately narrower than the generic
        // tournament_command authority: field_operator may run live commands
        // but must not derive/submit a recovered official result.
        if (context.actor.actorType === 'USER' && context.actor.role === 'field_operator') {
          throw this.forbidden();
        }
        this.requireTakeover(game.id, game.sourceType, context);
        if (game.state !== V1GameState.ENDED) {
          throw new ConflictException({
            code: 'RESULT_RECOVERY_NOT_REQUIRED',
            message: 'Result recovery only applies to an already-ended game',
          });
        }
        const existingRevisionCount = await tx.v1GameResultRevision.count({
          where: { gameId: game.id },
        });
        if (existingRevisionCount > 0) {
          throw new ConflictException({
            code: 'RESULT_RECOVERY_NOT_REQUIRED',
            message: 'A result revision already exists for this game',
          });
        }
        // The game is already ENDED (that is the whole precondition for
        // recovery), so no state transition happens here -- but every
        // successful command still bumps the aggregate version exactly once,
        // matching every other mutation path (submitResultRevision,
        // decideResultRevision, appendEvent, ...).
        const updated = await tx.v1Game.update({
          where: { id: game.id },
          data: { version: { increment: 1 } },
        });
        // 승부차기를 넘긴다 — 결선 무승부 게임을 복구하려면 `end`와 똑같이 penalties가
        // 필요하다(applyPenalties의 TOURNAMENT_PENALTY_REQUIRED 가드). 넘기지 않으면 그런 게임은
        // 복구 자체가 409로 막혀 영구 막다른 길이 된다.
        //
        // `end` 레인과 **같은** `extractEndPenalties`를 통과시킨다. DTO
        // (`GameResultRecoveryDto.penalties`)는 형태까지만 보고 "동점 승부차기"는
        // 통과시키므로, 그대로 넘기면 승자 없는 결과가 저장되고
        // `resolveWinnerSide`가 draw로 떨어뜨려 잡이 POISONED로 남는다 — 운영자
        // 화면에는 "복구 성공"만 보인다. 422 `TOURNAMENT_PENALTY_INVALID`로
        // 커맨드 자리에서 거부하는 것이 이 레인의 계약이다.
        //
        // 킥 수도 `end` 와 **똑같이 요구한다**(2026-08-19 alpha 감사 F-3). 예전에는 이 레인이
        // 기본값 `'RECOVERY'`(면제)로 떨어져 킥 수 없는 승부차기를 받아 줬는데, 면제의 근거로
        // 적힌 "이미 저장된 값을 옮기는 경로"가 이 레인엔 성립하지 않는다 — **진입 조건 자체가
        // `existingRevisionCount === 0`**(위 참조)이라 옮겨 올 값이 없고, 승부차기는
        // `dto.penalties` 로 **새로 작성**된다. 성격이 `end` 와 같으므로 기준도 같아야 한다.
        // (면제가 실제로 필요한 곳은 정정 레인의 "base 를 그대로 옮기는" 경우뿐이다.)
        return this.deriveTournamentRevision(
          tx,
          { ...game, version: updated.version },
          context,
          'END_COMMAND',
          extractEndPenalties({ penalties: dto.penalties }),
        );
      },
    );
  }

  private periodCount(periods: Prisma.JsonValue): number {
    return computePeriodCount(periods);
  }

  private async writeAudit(
    tx: Transaction,
    actor: GameActorScope,
    action: string,
    resourceId: string,
    requestId: string,
    before: unknown,
    after: unknown,
  ) {
    const game = await tx.v1Game.findUnique({
      where: { id: resourceId },
      select: {
        tournamentFixture: {
          select: { id: true, tournamentId: true, fieldId: true },
        },
      },
    });
    if (game === null) {
      throw this.notFound();
    }
    const fixture = game.tournamentFixture;
    await this.operationAuditWriter.create(tx, {
      actor: gameOperationAuditActor(actor),
      requestId,
      action,
      targetType: 'GAME',
      targetId: resourceId,
      occurredAt: new Date(),
      sourceIp: null,
      before: canonicalize(before) as AuditJsonValue,
      after: canonicalize(after) as AuditJsonValue,
      tournamentId: fixture?.tournamentId ?? null,
      fixtureId: fixture?.id ?? null,
      fieldId: fixture?.fieldId ?? null,
    });
  }

  /**
   * `type` is deliberately a closed literal union, not `string` — the outbox
   * only ever runs the worker's registered handlers (see
   * `v1-game-operations-worker.service.ts`'s constructor); a type written
   * here without a matching `registerHandler`/`registerDurableAuditHandler`
   * call retries 6 times on a fixed backoff and then sits POISONED forever
   * (alpha hit exactly this for GAME_EVENT_APPENDED/REVERSED). Narrowing
   * this parameter means adding a new event type is a compile error here
   * until it's added to `GamesOutboxEventType` below, which is the one
   * place a reviewer needs to check "is a handler registered for this?" —
   * cheaper than a runtime registry/boot check for a single-file writer,
   * see the outbox-handler-cleanup task notes for why a repo-wide boot-time
   * registry was judged out of scope here.
   */
  private async writeOutbox(
    tx: Transaction,
    businessKey: string,
    gameId: string,
    type: GamesOutboxEventType,
    payload: unknown,
    revisionId?: string,
  ) {
    await tx.v1OutboxEvent.create({
      data: {
        businessKey,
        aggregateType: 'GAME',
        aggregateId: gameId,
        revisionId,
        type,
        payload: jsonInput(payload),
      },
    });
  }

  private notFound(code = 'GAME_NOT_FOUND') {
    return new NotFoundException({ code, message: 'Game resource was not found' });
  }

  private forbidden() {
    return new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Actor scope is not permitted' });
  }
}

/**
 * `V1GameResultParticipant.cards`(Json)에서 카드 수를 읽는다. 저장 모양은
 * `{ yellow: number, red: number }` 뿐이다(`parseFairPlayCards` 주석 참고 — 경고 누적
 * 퇴장과 직접 퇴장을 구분하는 필드가 데이터 모델에 없다). 모양이 다르면 0으로 본다 —
 * 판정을 못 하는 것이 잘못 막는 것보다 낫다.
 */
function readResultCards(value: unknown): { yellow: number; red: number } {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { yellow?: unknown }).yellow === 'number' &&
    typeof (value as { red?: unknown }).red === 'number'
  ) {
    const record = value as { yellow: number; red: number };
    return { yellow: record.yellow, red: record.red };
  }
  return { yellow: 0, red: 0 };
}
