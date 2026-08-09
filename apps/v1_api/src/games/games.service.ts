import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
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
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type {
  JsonValue as AuditJsonValue,
  OperationAuditActor,
} from '../common/audit/operation-audit.contract';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { cascadeCompleteTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import { parseLineupCatalog } from '../tournaments/competition-config/competition-config.parse';
import { GameTakeoverService } from './game-takeover.service';
import {
  decideTournamentStaffAccess,
  type TournamentStaffAction,
  type TournamentStaffRole,
} from '../tournaments/staff/tournament-staff-policy';
import {
  assertGameCommandContext,
  assertGameLifecycleTransition,
  assertGameSourceCreationInput,
  assertRevisionTransition,
  GameContractError,
  projectParticipantForPublic,
  resolveGameIdempotency,
  serializeGameVisibility,
  validateGameResultInvariants,
  type PublicParticipantProjection,
} from './core';
import type {
  GameActorScope,
  GameCommandContext,
  GameCreationResult,
  GameEventAppendResult,
  GameMutationResult,
  GameResultEvent,
  GameResultParticipant,
  GameRevisionMutationResult,
  GameScore,
  GameSourceCreationInput,
} from './games.types';
import type { CancelGameDto, GameCommandDto } from './dto/game-command.dto';
import type {
  AppendGameEventDto,
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
type GameAuthorizationAction =
  | 'read'
  | 'tournament_command'
  | 'event_append'
  | 'event_reverse'
  | 'lineup_mutate'
  | 'team_result_submit'
  | 'opponent_result_decide'
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
    case 'game_next_period':
    case 'result_recovery_derive_and_submit':
      return 'tournament_command';
    case 'game_cancel':
      return 'cancel';
    case 'event_append':
      return 'event_append';
    case 'event_reverse':
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
    error.code === 'SCORE_INVALID'
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

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAuditWriter: OperationAuditWriterService,
    private readonly takeover: GameTakeoverService,
  ) {}

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
        await tx.v1GameParticipant.create({
          data: {
            gameId: game.id,
            sideId: side.id,
            lineupId: side.lineupId,
            displayNameSnapshot: participant.displayNameSnapshot,
            jerseyNumber: participant.jerseyNumber,
            position: participant.position,
          },
        });
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
        select: { lineup: true },
      });
      return {
        ...game,
        actorRole: actor.role,
        lineupConfig: parseLineupCatalog(config?.lineup ?? null),
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
    command: 'start' | 'pause' | 'resume' | 'end' | 'next-period',
    headerIdempotencyKey: string | undefined,
    dto: GameCommandDto,
  ): Promise<GameMutationResult | GameRevisionMutationResult> {
    return this.withCommand<GameMutationResult | GameRevisionMutationResult>(
      {
        gameId,
        action: command === 'next-period' ? 'game_next_period' : `game_${command}`,
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

        if (command === 'next-period') {
          return this.advancePeriod(tx, game, context);
        }

        const target: V1GameState = {
          start: V1GameState.LIVE,
          pause: V1GameState.PAUSED,
          resume: V1GameState.LIVE,
          end: V1GameState.ENDED,
        }[command];
        this.assertLifecycle(game.sourceType, 'TOURNAMENT_COMMAND', game.state, target);
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
          const livePeriods = await tx.v1GamePeriod.findMany({
            where: { gameId: game.id, state: V1GamePeriodState.LIVE },
          });
          for (const period of livePeriods) {
            const resolved = this.resolveOpenPause(period, now);
            await tx.v1GamePeriod.update({
              where: { id: period.id },
              data: { state: V1GamePeriodState.ENDED, endedAt: now, ...(resolved ?? {}) },
            });
          }
          return this.deriveTournamentRevision(tx, updated, context);
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
        await this.assertEventReferences(tx, game, dto);
        const sequence = game.lastSequence + 1;
        await tx.v1GameEvent.create({
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
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { lastSequence: sequence, version: { increment: 1 } },
        });
        await this.writeOutbox(tx, `game:${gameId}:event:${sequence}`, gameId, 'GAME_EVENT_APPENDED', {
          sequence,
        });
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
          await this.assertEventReferences(tx, game, dto);
          const sequence = game.lastSequence + 1;
          await tx.v1GameEvent.create({
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
          await this.writeOutbox(tx, `game:${gameId}:event:${sequence}`, gameId, 'GAME_EVENT_APPENDED', {
            sequence,
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
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
        await this.writeOutbox(tx, `game:${gameId}:event:${sequence}`, gameId, 'GAME_EVENT_REVERSED', {
          sequence,
          reversesEventId: target.id,
        });
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
        const lineup = await tx.v1GameLineup.create({
          data: {
            gameId,
            sideId,
            revision: (previous?.revision ?? 0) + 1,
            supersedesId: previous?.id,
            formation: dto.formation,
          },
        });
        for (const participant of dto.participants) {
          await tx.v1GameParticipant.create({
            data: {
              gameId,
              sideId,
              lineupId: lineup.id,
              displayNameSnapshot: participant.displayNameSnapshot,
              jerseyNumber: participant.jerseyNumber,
              position: participant.position,
              positionX: participant.positionX,
              positionY: participant.positionY,
              started: participant.started,
            },
          });
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
        if (game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE && actorIsStaff) {
          // Task 20이 requireTakeover에 gameId를 추가해 인계 토큰을 게임 단위로
          // 검증하도록 좁혔다(2-arg). 통합 브랜치에 남아 있던 1-arg 호출은 그
          // 시그니처 변경 이전 형태라 여기서 함께 정리한다.
          // 참가팀(team_manager/team_owner)의 사전 라인업 제출은 이 불변식 대상이
          // 아니다 — takeover는 "현장 기기가 이 경기를 배타적으로 장악 중"이라는
          // 라이브 운영 개념이라 경기 전 로스터 준비와는 무관하다(Task 27 후속).
          this.requireTakeover(game.id, game.sourceType, context);
        }
        const lineup = await tx.v1GameLineup.findFirst({ where: { id: lineupId, gameId } });
        if (lineup === null) {
          throw this.notFound('GAME_LINEUP_NOT_FOUND');
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
  async resolveFixtureLineupAccess(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: {
        scheduledAt: true,
        game: { select: { id: true } },
        homeRegistration: { select: { teamId: true, team: { select: { name: true } } } },
        awayRegistration: { select: { teamId: true, team: { select: { name: true } } } },
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
    return {
      gameId,
      mySideId,
      isStaff: actor.role !== 'team_manager' && actor.role !== 'team_owner',
      scheduledAt: fixture.scheduledAt,
      homeSideId: homeSide?.id ?? null,
      homeTeamName: fixture.homeRegistration?.team.name ?? null,
      awaySideId: awaySide?.id ?? null,
      awayTeamName: fixture.awayRegistration?.team.name ?? null,
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
        if (latest !== null && latest.state !== V1GameResultRevisionState.CHANGE_REQUESTED) {
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
        await tx.v1GamePeriod.updateMany({
          where: { gameId, state: V1GamePeriodState.LIVE },
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
    return this.withParticipantCommand(
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
          const stillPending = Date.now() - last.effectiveAt.getTime() < 24 * 60 * 60 * 1000;
          if (stillPending) {
            throw new ConflictException({
              code: 'IDENTITY_LINK_REQUEST_PENDING',
              message: '이미 대기 중인 연결 요청이 있어요.',
            });
          }
          await this.appendIdentityEvent(tx, {
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
        const created = await this.appendIdentityEvent(tx, {
          participantId,
          linkId: requestId,
          requestId,
          action: V1IdentityLinkAction.REQUESTED,
          userId: user.id,
          actorType: V1IdentityActorType.USER,
          actorUserId: user.id,
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
          expiresAt: new Date(created.effectiveAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
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
        const expired = Date.now() - requested.effectiveAt.getTime() >= 24 * 60 * 60 * 1000;
        if (expired) {
          const expiredEvent = await this.appendIdentityEvent(tx, {
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
        await this.assertAttestorAuthority(tx, side?.teamId ?? null, actor);

        const action =
          dto.decision === 'approve' ? V1IdentityLinkAction.ATTESTED : V1IdentityLinkAction.REJECTED;
        const decided = await this.appendIdentityEvent(tx, {
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
        if (action === V1IdentityLinkAction.ATTESTED) {
          await this.writeOutbox(
            tx,
            `game:${gameId}:participant:${participantId}:identity:${requested.linkId}:attested`,
            gameId,
            'PARTICIPANT_IDENTITY_LINKED',
            { participantId, linkId: requested.linkId, userId: requested.userId },
          );
        }
        return response;
      },
    );
    if (result.outcome === 'expired') {
      throw new ConflictException({
        code: 'IDENTITY_LINK_REQUEST_EXPIRED',
        message: '연결 요청이 만료됐어요.',
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
        const revoked = await this.appendIdentityEvent(tx, {
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
        await this.writeOutbox(
          tx,
          `game:${gameId}:participant:${participantId}:identity:${linkId}:revoked`,
          gameId,
          'PARTICIPANT_IDENTITY_REVOKED',
          { participantId, linkId },
        );
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
        await this.writeOutbox(
          tx,
          `game:${gameId}:participant:${participantId}:consent:${created.consentVersion}:granted`,
          gameId,
          'PARTICIPANT_CONSENT_GRANTED',
          { participantId, consentVersion: created.consentVersion },
        );
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
        // Mirror grantParticipantConsent's `current.linkId !== dto.linkId`
        // check: a consent snapshot only authorizes revoke while it belongs
        // to the participant's CURRENT link. Without this, a stale grant
        // left GRANTED under a since-revoked link (revokeIdentityLink does
        // not itself revoke consent) would be the highest `consentVersion`
        // row and could be "revoked" by the holder of an unrelated new link
        // who never granted anything themselves - fabricating history
        // against a dead linkId. platform_ops with no current link at all
        // (current === null) is the sole exception, since there is then no
        // current linkId to scope by.
        const last = await tx.v1ParticipantConsentSnapshot.findFirst({
          where: current === null ? { participantId } : { participantId, linkId: current.linkId },
          orderBy: { consentVersion: 'desc' },
        });
        if (last === null || last.state !== V1ConsentState.GRANTED) {
          throw new ConflictException({
            code: 'CONSENT_NOT_GRANTED',
            message: '철회할 동의 내역이 없어요.',
          });
        }
        const created = await tx.v1ParticipantConsentSnapshot.create({
          data: {
            participantId,
            linkId: last.linkId,
            consentVersion: last.consentVersion + 1,
            state: V1ConsentState.REVOKED,
            policyHash: last.policyHash,
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
        await this.writeOutbox(
          tx,
          `game:${gameId}:participant:${participantId}:consent:${created.consentVersion}:revoked`,
          gameId,
          'PARTICIPANT_CONSENT_REVOKED',
          { participantId, consentVersion: created.consentVersion },
        );
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
        (error.code === 'P2034' || error.code === 'P2002')
      ) {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: 'A concurrent command won; reload the current version and retry',
        });
      }
      throw error;
    }
  }

  private async appendIdentityEvent(
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
            | typeof V1IdentityLinkAction.REJECTED
            | typeof V1IdentityLinkAction.REVOKED;
          actorType: typeof V1IdentityActorType.USER;
          actorUserId: string;
        }
      | {
          action: typeof V1IdentityLinkAction.EXPIRED;
          actorType: typeof V1IdentityActorType.SYSTEM;
          systemActor: 'IDENTITY_LINK_EXPIRY';
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
      throw this.mapIdentityEventError(error);
    }
  }

  private mapIdentityEventError(error: unknown) {
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    ) {
      return new ConflictException({
        code: 'IDENTITY_LINK_CONFLICT',
        message: '동시 요청이 충돌했어요. 다시 시도해 주세요.',
      });
    }
    return error;
  }

  private async assertAttestorAuthority(
    tx: Transaction,
    sideTeamId: string | null,
    actor: Extract<GameActorScope, { actorType: 'USER' }>,
  ) {
    if (actor.role === 'platform_ops') {
      return;
    }
    if (sideTeamId === null) {
      throw this.forbidden();
    }
    const membership = await tx.v1TeamMembership.findFirst({
      where: { teamId: sideTeamId, userId: actor.actorUserId, status: 'active', role: 'owner' },
    });
    if (membership === null) {
      throw this.forbidden();
    }
  }

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
            expectedVersion: input.expectedVersion,
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
        (error.code === 'P2034' || error.code === 'P2002')
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
        if (eligibleAdmin === null) {
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
    const role = managerRole(hostMembership) ?? managerRole(opponentMembership);
    // `participant_identity` (Task 14 identity-link/consent mutations) is
    // deliberately as permissive as `read` here: the actor only needs to be
    // an active member of one of the two match teams to self-request/revoke
    // their own identity link or consent, or to act as a distinct attestor.
    // Per-participant authority (self-only revoke/consent, distinct-side
    // owner attestation) is enforced inside each command body, not here.
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
      case 'participant_identity':
        // Unreachable in practice: resolveActor special-cases
        // 'participant_identity' before calling this mapper (see Task 14
        // note there), but the switch stays exhaustive over
        // GameAuthorizationAction and denies-by-default if that ever changes.
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

  private async assertEventReferences(
    tx: Transaction,
    game: LockedGame,
    dto: AppendGameEventDto,
  ) {
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
    if (period.state === V1GamePeriodState.SCHEDULED) {
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
      if (participant === null || participant.sideId !== dto.sideId) {
        throw new UnprocessableEntityException({
          code: 'PARTICIPANT_SIDE_MISMATCH',
          message: 'Event participant and side do not agree',
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
      game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE
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
        event.participantId === undefined,
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
  ): Promise<GameRevisionMutationResult> {
    const [events, participants, sides] = await Promise.all([
      tx.v1GameEvent.findMany({ where: { gameId: game.id }, orderBy: { sequence: 'asc' } }),
      tx.v1GameParticipant.findMany({ where: { gameId: game.id } }),
      tx.v1GameSide.findMany({ where: { gameId: game.id } }),
    ]);
    const score = this.scoreFromEvents(events, sides);
    const revision = await tx.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        score: jsonInput(score),
        eventsHash: canonicalGameCommandPayloadHash(events.map((event) => event.payloadHash)),
        missingScorer: events.some(
          (event) => event.type === V1GameEventType.GOAL && event.participantId === null,
        ),
        createdByActorType: context.actor.actorType,
        createdByUserId:
          context.actor.actorType === 'USER' ? context.actor.actorUserId : undefined,
        createdBySystemActor:
          context.actor.actorType === 'SYSTEM' ? context.actor.systemActor : undefined,
      },
    });
    const goalCount = new Map<string, number>();
    const cardCount = new Map<string, { yellow: number; red: number }>();
    const assistCount = new Map<string, number>();
    const foulCount = new Map<string, number>();
    for (const event of events) {
      if (event.type === V1GameEventType.GOAL && event.assistParticipantId !== null) {
        assistCount.set(
          event.assistParticipantId,
          (assistCount.get(event.assistParticipantId) ?? 0) + 1,
        );
      }
      if (event.participantId === null) {
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
    await tx.v1GameResultParticipant.createMany({
      data: participants.map((participant) => ({
        resultRevisionId: revision.id,
        participantId: participant.id,
        sideId: participant.sideId,
        started: true,
        goals: goalCount.get(participant.id) ?? 0,
        assists: assistCount.get(participant.id) ?? 0,
        fouls: foulCount.get(participant.id) ?? 0,
        cards: jsonInput(cardCount.get(participant.id) ?? { yellow: 0, red: 0 }),
        goalkeeper: false,
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
      if (event.type !== V1GameEventType.GOAL || event.sideId === null || reversed.has(event.id)) {
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
        return this.deriveTournamentRevision(tx, { ...game, version: updated.version }, context);
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

  private async writeOutbox(
    tx: Transaction,
    businessKey: string,
    gameId: string,
    type: string,
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
