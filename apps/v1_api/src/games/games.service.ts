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
  V1GameResultRevisionState,
  V1GameSourceType,
  V1GameState,
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

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function scoreFromJson(value: Prisma.JsonValue): GameScore {
  const score = jsonObject(value);
  return {
    home: typeof score.home === 'number' ? score.home : 0,
    away: typeof score.away === 'number' ? score.away : 0,
  };
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAuditWriter: OperationAuditWriterService,
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
      return { ...game, actorRole: actor.role };
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
    command: 'start' | 'pause' | 'resume' | 'end',
    headerIdempotencyKey: string | undefined,
    dto: GameCommandDto,
  ): Promise<GameMutationResult | GameRevisionMutationResult> {
    const target = {
      start: V1GameState.LIVE,
      pause: V1GameState.PAUSED,
      resume: V1GameState.LIVE,
      end: V1GameState.ENDED,
    }[command];
    return this.withCommand<GameMutationResult | GameRevisionMutationResult>(
      {
        gameId,
        action: `game_${command}`,
        actor: await this.resolveActor(this.prisma, gameId, user.id, 'tournament_command'),
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        takeoverToken: dto.takeoverToken,
        payload: { command, ...dto },
      },
      async (tx, game, context) => {
        if (game.sourceType === V1GameSourceType.TEAM_MATCH) {
          throw new ConflictException({
            code: 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN',
            message: 'Team matches end only through validated result submission',
          });
        }
        this.requireTakeover(context);
        this.assertLifecycle(game.sourceType, 'TOURNAMENT_COMMAND', game.state, target);
        const updated = await tx.v1Game.update({
          where: { id: game.id },
          data: { state: target, version: { increment: 1 } },
        });
        if (target === V1GameState.ENDED) {
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
        this.requireTakeover(context);
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
          this.requireTakeover(context);
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
        this.requireTakeover(context);
        const target = await tx.v1GameEvent.findFirst({ where: { id: eventId, gameId } });
        if (target === null) {
          throw this.notFound('GAME_EVENT_NOT_FOUND');
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

  async listLineups(user: V1AuthUser, gameId: string) {
    await this.resolveActor(this.prisma, gameId, user.id, 'read');
    return this.prisma.v1GameLineup.findMany({
      where: { gameId },
      orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
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
        if (game.sourceType === V1GameSourceType.TEAM_MATCH) {
          throw new ConflictException({
            code: 'TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN',
            message:
              'Team matches manage lineups only through /team-matches/:teamMatchId/lineup, which enforces roster/eligibility/deadline invariants this generic route does not.',
          });
        }
        this.requireTakeover(context);
        const lineup = await tx.v1GameLineup.findFirst({ where: { id: lineupId, gameId } });
        if (lineup === null) {
          throw this.notFound('GAME_LINEUP_NOT_FOUND');
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
        tournamentFixture: { select: { id: true, tournamentId: true, fieldId: true } },
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
    if (action === 'team_result_submit') {
      // Task 16: draft creation and submission are host-only. The opponent side's
      // sole authority over the result is the decision surface above
      // (approve/change_request) — an opponent manager must never be able to draft
      // or submit the result their own team is being evaluated against.
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
    if (
      role === null ||
      action === 'event_append' ||
      action === 'event_reverse'
    ) {
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
    for (const event of events) {
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
    }
    await tx.v1GameResultParticipant.createMany({
      data: participants.map((participant) => ({
        resultRevisionId: revision.id,
        participantId: participant.id,
        sideId: participant.sideId,
        started: true,
        goals: goalCount.get(participant.id) ?? 0,
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

  private requireTakeover(context: GameCommandContext) {
    if (context.takeoverToken === undefined || context.takeoverToken.trim().length === 0) {
      throw new ForbiddenException({
        code: 'TAKEOVER_TOKEN_EXPIRED',
        message: 'A valid exclusive takeover token is required',
      });
    }
  }

  private periodCount(periods: Prisma.JsonValue): number {
    if (Array.isArray(periods)) {
      return Math.max(1, periods.length);
    }
    const config = jsonObject(periods);
    const count = config.count;
    return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 2;
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
