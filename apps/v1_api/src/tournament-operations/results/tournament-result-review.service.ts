import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1GameEventType, V1GameResultRevisionState, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import {
  canonicalGameCommandPayloadHash,
  gameOperationAuditActor,
  toGameHttpException,
} from '../../games/games.service';
import {
  assertGameCommandContext,
  assertRevisionSupersession,
  assertRevisionTransition,
  GameContractError,
  resolveGameIdempotency,
  validateGameResultInvariants,
  type RevisionFlow,
} from '../../games/core';
import type {
  GameActorScope,
  GameCommandContext,
  GameResultEvent,
  GameResultInvariantInput,
  GameResultParticipant,
  GameRevisionMutationResult,
} from '../../games/games.types';
import { PrismaService } from '../../prisma/prisma.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import type {
  CreateGameResultCorrectionDto,
  GameResultCorrectionChangesDto,
  OfficializeGameResultRevisionDto,
  ReviewDecisionGameResultRevisionDto,
  SupersedeAndSubmitGameResultRevisionDto,
  VoidGameResultRevisionDto,
} from './tournament-result-review.dto';

type Transaction = Prisma.TransactionClient;

type LockedTournamentGame = {
  id: string;
  sourceType: V1GameSourceType;
  tournamentFixtureId: string | null;
  state: string;
  version: number;
  currentOfficialRevisionId: string | null;
  competitionConfigVersionId: string;
};

/**
 * Same shape as `GamesService`'s local `jsonInput`: strips `undefined` so a
 * plain DTO-shaped object is safe to hand to a Prisma `Json` column. This is
 * a trivial, standalone duplicate (not a re-export) because the original is
 * an unexported module-scope helper inside `games.service.ts`, a file this
 * lane (Todo 22) does not own and must not edit -- see the relocation report
 * for the full ownership rationale.
 */
function jsonInput(value: unknown): Prisma.InputJsonValue {
  return canonicalize(value) as Prisma.InputJsonValue;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

// Content shape shared by every endpoint that produces a fresh
// result-revision draft in this file: only `supersedeAndSubmit`
// (tournament resubmission after reject/request_supplement) today.
type ResultRevisionContentInput = {
  score: { home: number; away: number; penalties?: { home: number; away: number } };
  actualParticipants: ReadonlyArray<{
    participantId: string;
    sideId: string;
    started: boolean;
    minutesPlayed?: number;
    goals: number;
    cards: { yellow: number; red: number };
    goalkeeper: boolean;
  }>;
  mvpParticipantId?: string;
};

type ResultCommandBoundaryInput = {
  gameId: string;
  action: string;
  staffAction: 'result_review' | 'result_officialize';
  userId: string;
  expectedVersion: number;
  headerIdempotencyKey: string | undefined;
  bodyCommandId: string;
  payload: unknown;
};

/**
 * Tournament result review, officialize, correction, and void -- Task 22.
 *
 * This service intentionally does NOT reuse `GamesService.withCommand`/
 * `resolveActor` (both `private`, and `games.service.ts` has no further
 * serial-ownership transfer to Todo 22 in the frozen plan). It reimplements
 * the same generic command-boundary shape (row lock, expectedVersion CAS,
 * `V1IdempotencyRecord` replay, transactional outbox, actor audit) using
 * only already-public, already-shipped building blocks: `games/core`'s
 * exported contract functions, `canonicalGameCommandPayloadHash`/
 * `gameOperationAuditActor`/`toGameHttpException` (all public exports of
 * `games.service.ts`, unmodified here), `OperationAuditWriterService`
 * (shared common infra), and `TournamentStaffAccessService` (Task 7's
 * already-shipped, already-audited staff/platform_ops authorization core)
 * for actor resolution in place of `GamesService.resolveActor`'s
 * tournament branch.
 */
@Injectable()
export class TournamentResultReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAccess: TournamentStaffAccessService,
    private readonly auditWriter: OperationAuditWriterService,
  ) {}

  /**
   * Tournament review reject/request_supplement. Never approves -- approval
   * for a tournament fixture goes through `officializeResultRevision`
   * instead, because normal `end` already auto-derives+submits and the
   * separate reviewer decides pass/reject/supplement from there.
   */
  async reviewDecision(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: ReviewDecisionGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withResultCommand(
      {
        gameId,
        action: `result_revision_${dto.decision}`,
        staffAction: 'result_review',
        userId: user.id,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${revisionId} FOR UPDATE`;
        const revision = await tx.v1GameResultRevision.findFirst({ where: { id: revisionId, gameId } });
        if (revision === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        const target =
          dto.decision === 'reject'
            ? V1GameResultRevisionState.REJECTED
            : V1GameResultRevisionState.SUPPLEMENT_REQUESTED;
        this.assertTransition({ from: revision.state, to: target, flow: 'STANDARD' });
        const decided = await tx.v1GameResultRevision.update({
          where: { id: revision.id },
          data: { state: target },
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
          data: { version: { increment: 1 } },
        });
        // reject/request_supplement are both terminal for this revision: no
        // public numeric result is exposed and currentOfficialRevisionId is
        // left untouched, so the review SLA for this revision must close now
        // rather than keep reminding/escalating a decided review.
        await this.closeReviewSla(tx, decided.id, dto.reason);
        await this.writeOutbox(
          tx,
          `game:${gameId}:revision:${decided.revision}:${dto.decision === 'reject' ? 'rejected' : 'supplement-requested'}`,
          gameId,
          dto.decision === 'reject' ? 'GAME_RESULT_REJECTED' : 'GAME_RESULT_SUPPLEMENT_REQUESTED',
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

  /**
   * Creates and submits a superseding revision atomically from a REJECTED
   * or SUPPLEMENT_REQUESTED base, starting a fresh review SLA. A stale or
   * wrong-state base writes zero new rows (the state check throws before
   * any create()).
   */
  async supersedeAndSubmit(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: SupersedeAndSubmitGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withResultCommand(
      {
        gameId,
        action: 'result_revision_supersede_and_submit',
        staffAction: 'result_review',
        userId: user.id,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${revisionId} FOR UPDATE`;
        const base = await tx.v1GameResultRevision.findFirst({ where: { id: revisionId, gameId } });
        if (base === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        // The frozen contract names a dedicated code for this exact
        // precondition (distinct from the generic REVISION_MUST_BE_SUPERSEDED
        // used by void/correction): base must be REJECTED or
        // SUPPLEMENT_REQUESTED, otherwise 409 RESULT_RESUBMISSION_NOT_ALLOWED
        // with zero new rows.
        if (
          base.state !== V1GameResultRevisionState.REJECTED &&
          base.state !== V1GameResultRevisionState.SUPPLEMENT_REQUESTED
        ) {
          throw new ConflictException({
            code: 'RESULT_RESUBMISSION_NOT_ALLOWED',
            message: 'supersede-and-submit requires a REJECTED or SUPPLEMENT_REQUESTED base revision',
          });
        }
        try {
          assertRevisionSupersession({
            baseGameId: base.gameId,
            successorGameId: gameId,
            baseRevisionId: base.id,
            supersedesRevisionId: base.id,
            baseState: base.state,
            successorState: V1GameResultRevisionState.DRAFT,
            purpose: 'TOURNAMENT_RESUBMISSION',
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
        // The `v1_guard_result_participant_mutation` trigger (see
        // prisma/migrations/20260729000100_v1_game_operations) only permits
        // inserting `v1_game_result_participants` rows while the owning
        // revision is still DRAFT. The successor must therefore be created
        // in DRAFT (the schema default), get its participants attached, and
        // only then transition to SUBMITTED -- creating it pre-SUBMITTED
        // and attaching participants after would violate the trigger.
        const successor = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: await this.nextRevisionNumber(tx, gameId),
            score: jsonInput(dto.score),
            eventsHash: dto.eventsHash,
            missingScorer: invariant.missingScorer,
            mvpParticipantId: dto.mvpParticipantId,
            reason: dto.reason,
            createdByActorType: 'USER',
            createdByUserId: user.id,
            supersedesId: base.id,
          },
        });
        await tx.v1GameResultParticipant.createMany({
          data: dto.actualParticipants.map((participant) => ({
            resultRevisionId: successor.id,
            participantId: participant.participantId,
            sideId: participant.sideId,
            started: participant.started,
            minutesPlayed: participant.minutesPlayed,
            goals: participant.goals,
            cards: jsonInput(participant.cards),
            goalkeeper: participant.goalkeeper,
          })),
        });
        this.assertTransition({
          from: successor.state,
          to: V1GameResultRevisionState.SUBMITTED,
          flow: 'STANDARD',
        });
        const submitted = await tx.v1GameResultRevision.update({
          where: { id: successor.id },
          data: { state: V1GameResultRevisionState.SUBMITTED, submittedAt: new Date() },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 } },
        });
        // Fresh 24h/48h SLA, exactly like the original GAME_RESULT_SUBMITTED
        // path -- the resubmission is a brand-new review, not a continuation.
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

  /**
   * Officializes a SUBMITTED revision (STANDARD flow, tournament review
   * pass) or a correction DRAFT created via createResultCorrection
   * (CORRECTION flow). platform_ops always; tournament_director only while
   * DIRECTOR_OFFICIALIZE is 'on'. Atomically swaps the game's current
   * official pointer and writes the same GAME_RESULT_OFFICIAL outbox event
   * the team-match approve path already uses, so the existing projection
   * worker (facts/cache/bracket/terminal/watermarks) applies unchanged.
   */
  async officializeResultRevision(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: OfficializeGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withResultCommand(
      {
        gameId,
        action: 'result_revision_officialize',
        staffAction: 'result_officialize',
        userId: user.id,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${revisionId} FOR UPDATE`;
        const revision = await tx.v1GameResultRevision.findFirst({ where: { id: revisionId, gameId } });
        if (revision === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        const expectedPreviewHash = this.projectionPreviewHash(revision);
        if (dto.projectionPreviewHash.toLowerCase() !== expectedPreviewHash) {
          throw new ConflictException({
            code: 'PROJECTION_PREVIEW_MISMATCH',
            message: 'The projection preview hash does not match the current revision content',
          });
        }
        const flow: RevisionFlow =
          revision.state === V1GameResultRevisionState.DRAFT ? 'CORRECTION' : 'STANDARD';
        this.assertTransition({ from: revision.state, to: V1GameResultRevisionState.OFFICIAL, flow });
        if (flow === 'CORRECTION') {
          // A correction draft must still be superseding the game's *current*
          // official pointer at officialize time -- if that pointer moved
          // (e.g. a void landed first), this correction is stale and must
          // not silently resurrect an old base.
          if (revision.supersedesId === null || revision.supersedesId !== game.currentOfficialRevisionId) {
            throw new ConflictException({
              code: 'REVISION_MUST_BE_SUPERSEDED',
              message: 'This correction no longer supersedes the current official revision',
            });
          }
        }
        const officialized = await tx.v1GameResultRevision.update({
          where: { id: revision.id },
          data: { state: V1GameResultRevisionState.OFFICIAL, officialAt: new Date() },
        });
        const updated = await tx.v1Game.update({
          where: { id: gameId },
          data: { version: { increment: 1 }, currentOfficialRevisionId: revision.id },
        });
        await this.writeOutbox(
          tx,
          `game:${gameId}:revision:${officialized.revision}:officialize`,
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

  /**
   * Voids the game's current OFFICIAL revision by appending an immutable
   * VOID revision and swapping the current pointer to it. Blocks with
   * 409 NEXT_FIXTURE_CONFLICT before the pointer swap when a downstream
   * bracket fixture already advanced past 'scheduled' -- un-advancing a
   * team that is already live/finished downstream is not safe.
   *
   * The base-state check is inlined here (`base.state !== OFFICIAL`) rather
   * than routed through `games/core`'s `assertRevisionSupersession`, so this
   * lane needs no `'VOID'` member added to that shared, already-shipped
   * (Todo 6) `RevisionSupersessionPurpose` union -- see the relocation
   * report for why that avoids touching a file outside this lane's
   * ownership.
   */
  async voidResultRevision(
    user: V1AuthUser,
    gameId: string,
    revisionId: string,
    headerIdempotencyKey: string | undefined,
    dto: VoidGameResultRevisionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withResultCommand(
      {
        gameId,
        action: 'result_revision_void',
        staffAction: 'result_officialize',
        userId: user.id,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: { revisionId, ...dto },
      },
      async (tx, game, context) => {
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${revisionId} FOR UPDATE`;
        const revision = await tx.v1GameResultRevision.findFirst({ where: { id: revisionId, gameId } });
        if (revision === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        if (game.currentOfficialRevisionId !== revisionId || revision.state !== V1GameResultRevisionState.OFFICIAL) {
          throw new ConflictException({
            code: 'REVISION_MUST_BE_SUPERSEDED',
            message: 'Only the current official revision can be voided',
          });
        }
        if (game.tournamentFixtureId !== null) {
          await this.assertNoLockedDownstreamFixture(tx, game.tournamentFixtureId);
        }
        const voidRevision = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: await this.nextRevisionNumber(tx, gameId),
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
        await this.closeReviewSla(tx, revision.id, dto.reason);
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
   * Creates a same-game superseding DRAFT correction of the current
   * OFFICIAL revision. The prior official pointer stays authoritative
   * until the correction is separately officialized -- creation alone
   * never swaps currentOfficialRevisionId.
   *
   * `baseRevisionId` must be the game's CURRENT `currentOfficialRevisionId`,
   * not merely any revision whose stored `state` happens to be `OFFICIAL`:
   * once a revision is superseded (by a later correction's officialize, or
   * by a void), its own `state` column stays `OFFICIAL` forever -- only the
   * game's separate `currentOfficialRevisionId` pointer moves. Checking
   * `base.state === OFFICIAL` alone (the original defect this fixes) would
   * let an operator open a correction draft against a stale, already
   * superseded revision; `officializeResultRevision`'s own CORRECTION-flow
   * re-check blocks that draft from ever being officialized later
   * (`409 REVISION_MUST_BE_SUPERSEDED`), so the defect was not exploitable
   * end-to-end, but the stale draft could still be created and left
   * dangling with no test covering the path. This method now rejects it at
   * creation time instead.
   */
  async createResultCorrection(
    user: V1AuthUser,
    gameId: string,
    headerIdempotencyKey: string | undefined,
    dto: CreateGameResultCorrectionDto,
  ): Promise<GameRevisionMutationResult> {
    return this.withResultCommand(
      {
        gameId,
        action: 'result_correction_create',
        staffAction: 'result_review',
        userId: user.id,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: dto,
      },
      async (tx, game, context) => {
        await tx.$queryRaw`SELECT id FROM v1_game_result_revisions WHERE id = ${dto.baseRevisionId} FOR UPDATE`;
        const base = await tx.v1GameResultRevision.findFirst({
          where: { id: dto.baseRevisionId, gameId },
        });
        if (base === null) {
          throw this.notFound('RESULT_REVISION_NOT_FOUND');
        }
        // See the method doc: the base must be the game's CURRENT official
        // pointer, not merely stuck at OFFICIAL in its own `state` column.
        if (game.currentOfficialRevisionId !== base.id) {
          throw new ConflictException({
            code: 'REVISION_MUST_BE_SUPERSEDED',
            message: 'baseRevisionId must be the game current official revision',
          });
        }
        try {
          assertRevisionSupersession({
            baseGameId: base.gameId,
            successorGameId: gameId,
            baseRevisionId: base.id,
            supersedesRevisionId: base.id,
            baseState: base.state,
            successorState: V1GameResultRevisionState.DRAFT,
            purpose: 'CORRECTION',
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        await this.assertCorrectionParticipantsValid(tx, gameId, dto.changes);
        const draft = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: await this.nextRevisionNumber(tx, gameId),
            score: jsonInput(dto.changes.score),
            eventsHash: dto.changes.eventsHash,
            missingScorer: false,
            mvpParticipantId: dto.changes.mvpParticipantId,
            reason: dto.reason,
            createdByActorType: 'USER',
            createdByUserId: user.id,
            supersedesId: base.id,
          },
        });
        await tx.v1GameResultParticipant.createMany({
          data: dto.changes.actualParticipants.map((participant) => ({
            resultRevisionId: draft.id,
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
          revisionId: draft.id,
          revision: draft.revision,
          revisionState: draft.state,
        };
      },
    );
  }

  // ─── command boundary ─────────────────────────────────────────────────────

  /**
   * Reimplements `GamesService.withCommand`'s generic shape (row lock,
   * expectedVersion CAS, `V1IdempotencyRecord` replay, transactional
   * outbox-adjacent audit) for tournament-scoped result actions, resolving
   * the actor through `TournamentStaffAccessService` instead of
   * `GamesService.resolveActor` -- see the class doc for why this is a
   * parallel implementation rather than a call into `GamesService`.
   */
  private async withResultCommand<T extends GameRevisionMutationResult>(
    input: ResultCommandBoundaryInput,
    mutate: (tx: Transaction, game: LockedTournamentGame, context: GameCommandContext) => Promise<T>,
  ): Promise<T & { replayed: boolean }> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${input.gameId} FOR UPDATE`;
          const game = await tx.v1Game.findUnique({
            where: { id: input.gameId },
            select: {
              id: true,
              sourceType: true,
              tournamentFixtureId: true,
              state: true,
              version: true,
              currentOfficialRevisionId: true,
              competitionConfigVersionId: true,
            },
          });
          if (game === null || game.sourceType !== V1GameSourceType.TOURNAMENT_FIXTURE || game.tournamentFixtureId === null) {
            throw this.notFound();
          }
          const fixture = await tx.v1TournamentFixture.findUnique({
            where: { id: game.tournamentFixtureId },
            select: { tournamentId: true },
          });
          if (fixture === null) {
            throw this.notFound();
          }
          const principal = await this.staffAccess.assertAccess(
            {
              userId: input.userId,
              action: input.staffAction,
              resource: { tournamentId: fixture.tournamentId, fixtureId: game.tournamentFixtureId },
            },
            tx,
          );
          if (input.staffAction === 'result_officialize' && principal.role === 'tournament_director') {
            await this.assertDirectorOfficializeEnabled(tx);
          }
          const actor: GameActorScope = {
            actorType: 'USER',
            actorUserId: input.userId,
            role: principal.role,
            tournamentId: fixture.tournamentId,
            fixtureId: game.tournamentFixtureId,
            authorizationSubject: principal.authorizationSubject,
          };
          const payloadHash = canonicalGameCommandPayloadHash(input.payload);
          const context = this.assertCommandContext({
            actor,
            expectedVersion: input.expectedVersion,
            currentVersion: game.version,
            headerIdempotencyKey: input.headerIdempotencyKey ?? '',
            bodyClientCommandId: input.bodyCommandId,
            payloadHash,
          });
          const existing = await tx.v1IdempotencyRecord.findUnique({
            where: {
              actorUserId_action_resourceType_resourceId_idempotencyKey: {
                actorUserId: input.userId,
                action: input.action,
                resourceType: 'GAME',
                resourceId: input.gameId,
                idempotencyKey: context.durableCommandId,
              },
            },
          });
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
          const response = await mutate(tx, game, context);
          await tx.v1IdempotencyRecord.create({
            data: {
              actorUserId: input.userId,
              action: input.action,
              resourceType: 'GAME',
              resourceId: input.gameId,
              idempotencyKey: context.durableCommandId,
              payloadHash,
              responseStatus: 200,
              responseBody: jsonInput(response),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
          await this.auditWriter.create(tx, {
            actor: gameOperationAuditActor(actor),
            requestId: context.durableCommandId,
            action: input.action.toUpperCase(),
            targetType: 'GAME',
            targetId: input.gameId,
            occurredAt: new Date(),
            before: { version: game.version, state: game.state },
            after: {
              revisionId: response.revisionId,
              revision: response.revision,
              revisionState: response.revisionState,
              version: response.version,
            },
            tournamentId: fixture.tournamentId,
            fixtureId: game.tournamentFixtureId,
          });
          return { ...response, replayed: false };
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

  private assertCommandContext(input: {
    actor: GameActorScope;
    expectedVersion: number;
    currentVersion: number;
    headerIdempotencyKey: string;
    bodyClientCommandId: string;
    payloadHash: string;
  }): GameCommandContext {
    try {
      return assertGameCommandContext(input);
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
  }

  private async assertDirectorOfficializeEnabled(tx: Transaction): Promise<void> {
    const flag = await tx.v1GameOperationFlag.findUnique({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      select: { value: true },
    });
    if (flag?.value !== 'on') {
      throw new ForbiddenException({
        code: 'DIRECTOR_OFFICIALIZE_DISABLED',
        message: 'Director officialize/void is not enabled for this tournament',
      });
    }
  }

  private assertTransition(input: { from: V1GameResultRevisionState; to: V1GameResultRevisionState; flow: RevisionFlow }): void {
    try {
      assertRevisionTransition(input);
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
  }

  private async nextRevisionNumber(tx: Transaction, gameId: string): Promise<number> {
    const latest = await tx.v1GameResultRevision.findFirst({
      where: { gameId },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    return (latest?.revision ?? 0) + 1;
  }

  /**
   * The reconstructable "projection preview" confirmation hash for
   * officialize: a client can independently recompute this from the
   * `GET .../result-revisions` response (score/eventsHash/mvpParticipantId
   * are already frozen once the revision left DRAFT), so a stale or
   * tampered confirmation is rejected before OFFICIAL is ever written.
   */
  private projectionPreviewHash(revision: {
    score: Prisma.JsonValue;
    eventsHash: string;
    mvpParticipantId: string | null;
  }): string {
    return canonicalGameCommandPayloadHash({
      score: revision.score,
      eventsHash: revision.eventsHash,
      mvpParticipantId: revision.mvpParticipantId,
    });
  }

  /**
   * Cancels pending/acknowledged review escalations and their not-yet-fired
   * reminder/escalation outbox jobs for a revision whose review just ended
   * terminally outside the OFFICIAL path (reject/request_supplement/void).
   * Mirrors `GameResultEscalationTerminalService.close()` but runs inline in
   * the same command transaction instead of the async projection worker,
   * because reject/request_supplement/void never emit GAME_RESULT_OFFICIAL.
   */
  private async closeReviewSla(tx: Transaction, revisionId: string, reason: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE v1_result_escalations
      SET status = 'CLOSED'::"V1EscalationStatus",
          reason = ${reason},
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

  /**
   * Blocks voiding the current official revision of a tournament fixture
   * whose bracket advancement already reached a downstream fixture that is
   * no longer 'scheduled' -- un-advancing a team that is already
   * live/finished downstream is not safe. Locks every candidate target row
   * so a concurrent advancement cannot race past this check.
   */
  private async assertNoLockedDownstreamFixture(tx: Transaction, sourceFixtureId: string): Promise<void> {
    const edges = await tx.v1TournamentFixtureAdvancementEdge.findMany({
      where: { sourceFixtureId },
      select: { targetFixtureId: true },
    });
    if (edges.length === 0) {
      return;
    }
    const targetIds = [...new Set(edges.map((edge) => edge.targetFixtureId))].sort();
    const targets = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status::text AS status
      FROM v1_tournament_fixtures
      WHERE id IN (${Prisma.join(targetIds)})
      ORDER BY id ASC
      FOR UPDATE
    `;
    if (targets.some((target) => target.status !== 'scheduled')) {
      throw new ConflictException({
        code: 'NEXT_FIXTURE_CONFLICT',
        message: 'A downstream bracket fixture already advanced past scheduled',
      });
    }
  }

  /**
   * Correction changes intentionally are not cross-validated against the
   * frozen event stream (the event log can be exactly what the correction
   * is fixing, and a game in ENDED/CANCELLED can no longer accept new
   * events) -- but participants must still be real, unique, and correctly
   * sided, and any MVP must be one of them.
   */
  private async assertCorrectionParticipantsValid(
    tx: Transaction,
    gameId: string,
    changes: GameResultCorrectionChangesDto,
  ): Promise<void> {
    const sides = await tx.v1GameSide.findMany({ where: { gameId }, select: { id: true } });
    const sideIds = new Set(sides.map((side) => side.id));
    const seen = new Set<string>();
    for (const participant of changes.actualParticipants) {
      if (seen.has(participant.participantId) || !sideIds.has(participant.sideId)) {
        throw new UnprocessableEntityException({
          code: 'PARTICIPANT_INVALID',
          message: 'Correction participants must be unique and belong to a game side',
        });
      }
      seen.add(participant.participantId);
    }
    if (changes.mvpParticipantId !== undefined && !seen.has(changes.mvpParticipantId)) {
      throw new UnprocessableEntityException({
        code: 'PARTICIPANT_INVALID',
        message: 'MVP must be one of the correction actualParticipants',
      });
    }
  }

  /**
   * Reads the same inputs `GamesService.resultInvariantInput` reads for a
   * team match, but keyed on the TOURNAMENT scorer policy column
   * (`tournamentScorerPolicy`) instead of `teamMatchScorerPolicy`, since
   * every game this lane ever touches is `TOURNAMENT_FIXTURE`-sourced.
   */
  private async resultInvariantInput(
    tx: Transaction,
    game: LockedTournamentGame,
    dto: ResultRevisionContentInput,
  ): Promise<GameResultInvariantInput> {
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
        ...(payload.card === 'YELLOW' || payload.card === 'RED' ? { card: payload.card } : {}),
      };
    });
    const resultConfig = config === null ? {} : jsonObject(config.result);
    const scorerPolicy: 'required' | 'optional_with_warning' =
      resultConfig.tournamentScorerPolicy === 'required' ? 'required' : 'optional_with_warning';
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
      ...(participant.minutesPlayed === undefined ? {} : { minutesPlayed: participant.minutesPlayed }),
    }));
    return {
      score: dto.score,
      sides: sides.map((side) => ({ id: side.id, sideKey: side.sideKey })),
      participants,
      events: mappedEvents,
      scorerPolicy,
      missingScorer,
      ...(dto.mvpParticipantId === undefined ? {} : { mvpParticipantId: dto.mvpParticipantId }),
    };
  }

  private async writeOutbox(
    tx: Transaction,
    businessKey: string,
    gameId: string,
    type: string,
    payload: unknown,
    revisionId?: string,
  ): Promise<void> {
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
}
