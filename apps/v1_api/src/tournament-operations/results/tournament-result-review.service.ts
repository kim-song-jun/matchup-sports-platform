import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { assertPenaltyShootoutPersistable } from '../../games/core/penalty-shootout-outcome';
import { parseResultPolicy } from '../../tournaments/competition-config/competition-config.parse';
import {
  Prisma,
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSourceType,
  V1TournamentFixtureStatus,
} from '@prisma/client';
import {
  OperationAuditWriterService,
  type CreateOperationAuditInput,
} from '../../common/audit/operation-audit-writer.service';
import {
  canonicalGameCommandPayloadHash,
  extractEndPenalties,
  gameOperationAuditActor,
  toGameHttpException,
} from '../../games/games.service';
import {
  assertBracketResolvable,
  assertPenaltiesNotAllowed,
  needsKnockoutFixtureFacts,
  readStoredPenalties,
  requiresDecisiveResult,
  type StoredPenalties,
} from '../../games/core/knockout-penalties';
import { readKnockoutFixtureFacts } from '../../tournaments/knockout-fixture';
import {
  assertGameCommandContext,
  assertRevisionSupersession,
  assertRevisionTransition,
  GameContractError,
  resolveGameIdempotency,
  validateGameResultInvariants,
  type RevisionFlow,
  type RevisionSupersessionPurpose,
} from '../../games/core';
import type {
  GameActorScope,
  GameCommandContext,
  GameResultEvent,
  GameResultInvariantInput,
  GameResultParticipant,
  GameRevisionMutationResult,
  GameScore,
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
 * The `V1GameOperationFlag` row's decision-relevant fields at the exact
 * moment `DIRECTOR_OFFICIALIZE` gated (or would have gated) a command. Both
 * the grant and denial audit rows for a director officialize/void carry this
 * so a later flag rollback/rollforward can never make an already-decided
 * command's audit trail look inconsistent with what actually gated it --
 * see G-3 in `.github/tasks/22-tournament-result-review-officialize.md`.
 */
type DirectorOfficializeFlagSnapshot = { value: string | null; version: number | null };

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
  // `penalties`의 모양을 손으로 다시 적지 않는다 — 같은 모양을 여러 곳에 적어 두면
  // 새 키(예: `firstKickSideKey`)가 중간 레인에서 조용히 떨어진다. 단일 소스는
  // `GameScore['penalties']`(= `StoredPenalties`)다.
  score: { home: number; away: number; penalties?: StoredPenalties };
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
        // 재제출도 정정과 같은 참가자 가드를 통과해야 한다. `validateGameResultInvariants`
        // 만으로는 부족하다 — 그건 `sideId`가 이 게임의 side인지만 보고
        // (`game-invariants.ts`) participantId가 **이 게임의 참가자인지**는 보지
        // 않는다. 그 구멍을 정정 레인에서만 막으면 재제출이라는 같은 HTTP
        // 도달 가능 레인으로 남의 경기 participantId가 그대로 들어온다.
        // `validateGameResultInvariants` **앞에** 두는 것은 의도적이다: 같은 결함에
        // 두 레인이 같은 코드(422 `PARTICIPANT_INVALID`)를 돌려주게 만든다.
        await this.assertRevisionParticipantsValid(tx, gameId, base.id, dto);
        const score = await this.assertPenaltiesForRevision(tx, game, base.score, dto.score);
        const invariant = await this.resultInvariantInput(tx, game, { ...dto, score });
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
            score: jsonInput(score),
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
            assists: participant.assists ?? 0,
            fouls: participant.fouls ?? 0,
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
        } else {
          // Issue #376 follow-up: `GamesService.syncAssistsIntoSubmittedRevision`
          // (ASSIST_SYNC purpose) can now supersede a SUBMITTED revision with a
          // fresh successor WITHOUT ever changing the predecessor's own `state`
          // column away from SUBMITTED -- see that method's doc comment for why
          // no other value in the enum honestly fits "auto-superseded, no
          // reviewer decision". That means a STANDARD-flow officialize target
          // can be stale (superseded) even while its own `state` still reads
          // SUBMITTED, which the CORRECTION-flow check above cannot catch (it
          // only runs for DRAFT). Mirror the same staleness check in the other
          // direction: refuse to officialize any revision that a NEWER revision
          // has already superseded, so a stale reviewer view (or a stale cached
          // revisionId) can never confirm outdated assist data as official --
          // exactly the class of bug this whole follow-up exists to close.
          const supersededBy = await tx.v1GameResultRevision.findFirst({
            where: { supersedesId: revision.id },
            select: { id: true },
          });
          if (supersededBy !== null) {
            throw new ConflictException({
              code: 'REVISION_MUST_BE_SUPERSEDED',
              message: 'This revision has already been superseded by a newer revision',
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
        // `GameResultBracketProjectionService.project` gates advancement on
        // the source fixture's own `status` being 'completed' -- that
        // column defaults to 'scheduled' and, per
        // docs/api/domains/tournament-operations.md, no other writer ever
        // advances it once the Game model became authoritative. Officialize
        // is this fixture's authoritative "result decided" moment, so the
        // fixture is marked completed in the *same* transaction as the
        // official pointer swap: the async bracket projection (dispatched
        // via the outbox event below) then always observes a consistent,
        // already-committed 'completed' status with no eventual-consistency
        // gap. Idempotent on repeat officialize (e.g. a later correction).
        if (game.tournamentFixtureId !== null) {
          await tx.v1TournamentFixture.update({
            where: { id: game.tournamentFixtureId },
            data: { status: V1TournamentFixtureStatus.completed },
          });
        }
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
            purpose:
              base.state === V1GameResultRevisionState.VOID
                ? ('VOID_REENTRY' satisfies RevisionSupersessionPurpose)
                : ('CORRECTION' satisfies RevisionSupersessionPurpose),
          });
        } catch (error) {
          if (error instanceof GameContractError) {
            throw toGameHttpException(error);
          }
          throw error;
        }
        await this.assertRevisionParticipantsValid(tx, gameId, base.id, dto.changes);
        const score = await this.assertPenaltiesForRevision(tx, game, base.score, dto.changes.score);
        // 이 레인은 `validateGameResultInvariants`를 **부르지 않는다**
        // (`assertCorrectionParticipantsValid` docblock의 이유: 이벤트 로그 자체가
        // 정정 대상일 수 있고 ENDED 게임은 새 이벤트를 받을 수 없다 — 켜면 정당한
        // 정정이 422로 막힌다). 그러나 `missingScorer`는 교차검증이 아니라 이벤트
        // 스트림에서 계산되는 **사실**이므로 supersede 경로와 같은 출처를 쓴다.
        // 예전엔 `false`를 하드코딩해, 정정 한 번으로 "득점자 미상 골이 있다"는
        // 경고가 조용히 사라졌다 — 그러면 아무도 그 골의 득점자를 채워 넣지 않는다.
        const invariant = await this.resultInvariantInput(tx, game, { ...dto.changes, score });
        const draft = await tx.v1GameResultRevision.create({
          data: {
            gameId,
            revision: await this.nextRevisionNumber(tx, gameId),
            score: jsonInput(score),
            eventsHash: dto.changes.eventsHash,
            missingScorer: invariant.missingScorer,
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
    // Populated only on the DIRECTOR_OFFICIALIZE denial path below, then
    // written *after* the `catch` observes the transaction has rolled back.
    // An interactive `$transaction` callback that throws rolls back every
    // write the callback made -- including an audit row inserted moments
    // before the throw -- so the denial audit cannot be written with `tx`
    // inside the same callback that then denies the command; it must be
    // written as its own, separate statement once the callback's rollback
    // has already happened.
    let deniedAuditInput: CreateOperationAuditInput | null = null;
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
          // The DIRECTOR_OFFICIALIZE gate is evaluated only after the command
          // context exists so both the grant and a denial can carry the same
          // stable `requestId` (the durable command ID) an eventual success
          // audit would use. A rejected officialize/void attempt is itself
          // security-relevant (director privilege-escalation probing) and
          // must leave the same kind of append-only `V1OperationAudit` trail
          // a successful command does -- not just a bare 403 with nothing
          // written. `directorOfficializeFlag` is the flag's exact
          // value/version *at the moment this command evaluated it*.
          let directorOfficializeFlag: DirectorOfficializeFlagSnapshot | null = null;
          if (input.staffAction === 'result_officialize' && principal.role === 'tournament_director') {
            directorOfficializeFlag = await this.readDirectorOfficializeFlagSnapshot(tx);
            if (directorOfficializeFlag.value !== 'on') {
              deniedAuditInput = {
                actor: gameOperationAuditActor(actor),
                requestId: context.durableCommandId,
                action: `${input.action.toUpperCase()}_DENIED`,
                targetType: 'GAME',
                targetId: input.gameId,
                occurredAt: new Date(),
                before: { version: game.version, state: game.state },
                after: {
                  denied: true,
                  code: 'DIRECTOR_OFFICIALIZE_DISABLED',
                  actorRole: principal.role,
                  authorizationSubject: principal.authorizationSubject,
                  directorOfficializeFlag,
                },
                tournamentId: fixture.tournamentId,
                fixtureId: game.tournamentFixtureId,
              };
              throw new ForbiddenException({
                code: 'DIRECTOR_OFFICIALIZE_DISABLED',
                message: 'Director officialize/void is not enabled for this tournament',
              });
            }
          }
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
              actorRole: principal.role,
              authorizationSubject: principal.authorizationSubject,
              ...(directorOfficializeFlag === null ? {} : { directorOfficializeFlag }),
            },
            tournamentId: fixture.tournamentId,
            fixtureId: game.tournamentFixtureId,
          });
          return { ...response, replayed: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (deniedAuditInput !== null) {
        // The rollback described above has already happened by this point,
        // so this write uses `this.prisma` directly (a fresh statement, not
        // `tx`) and is the *only* place the denial audit is ever persisted.
        await this.auditWriter.create(this.prisma, deniedAuditInput);
      }
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

  /**
   * Reads the DIRECTOR_OFFICIALIZE flag's current `{ value, version }` with
   * no caching -- callers re-evaluate this on every command, exactly as the
   * gate this replaces did (`assertDirectorOfficializeEnabled` originally),
   * so a flag rollback takes effect on the very next call.
   */
  private async readDirectorOfficializeFlagSnapshot(
    tx: Transaction,
  ): Promise<DirectorOfficializeFlagSnapshot> {
    const flag = await tx.v1GameOperationFlag.findUnique({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      select: { value: true, version: true },
    });
    return { value: flag?.value ?? null, version: flag?.version ?? null };
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
   * 이 파일이 새 리비전을 만드는 두 경로(`supersedeAndSubmit`,
   * `createResultCorrection`) 공용 승부차기 검증. **저장할 score를** 돌려주며,
   * 반환값을 그대로 저장해야 한다 — 클라이언트가 보낸 객체를 그대로 저장하면
   * 아래 두 구멍이 그대로 DB로 들어간다.
   *
   * 세 단계 모두 `end` 레인과 같은 함수를 쓴다(레인마다 규칙을 복제하지 않는
   * 것이 이 변경의 요점이다):
   *  1. `extractEndPenalties` — 형태·결정성. DTO를 강타입화해도
   *     (`GameScoreDto.penalties`) `penalties: null`은 여전히 통과하고
   *     (`@IsOptional()`이 null을 건너뛴다) `{home:3,away:3}`(동점 승부차기)도
   *     통과한다. 둘 다 저장되면 아웃박스의 `parseOfficialPenalties` /
   *     `resolveWinnerSide`가 throw해 잡이 6회 재시도 끝에 POISONED로 남는다.
   *     422 `TOURNAMENT_PENALTY_INVALID`로 커맨드 자리에서 거부한다.
   *  2. `assertPenaltiesNotAllowed` — 조별리그 픽스처거나 정규시간에 이미
   *     승자가 났으면 409 `TOURNAMENT_PENALTY_NOT_ALLOWED`.
   *  3. `assertBracketResolvable` — 승부차기로도 해결되지 않는 결선 무승부를 409
   *     `TOURNAMENT_PENALTY_REQUIRED`로 거부한다. 이 가드가 없으면 그 리비전이
   *     그대로 공식이 되고 브래킷 프로젝션이 POISONED로 죽어, 운영자는 "성공"만
   *     보고 다음 라운드 대진이 영영 비어 있는 것을 나중에 안다.
   *
   * ## base 리비전의 승부차기 승계 (이게 없으면 정정 자체가 막힌다)
   *
   * 정정·재제출 폼은 승부차기를 **보낼 수도, 생략할 수도 있다.** 예전에는 폼이 평평한
   * `{home, away}`만 보냈고(여분 필드는 `GameScoreDto`의 `forbidNonWhitelisted`에 걸려
   * 400이었다 — 알파 실측) 클라이언트 타입 `V1GameResultScoreInput`에 penalties 필드
   * 자체가 없었지만, 지금은 `PenaltyScoreDto`에 선언된 키(`home`/`away`/`firstKickSideKey`)를
   * 그대로 실어 보낸다(`result-edit-modal.tsx`의 `readSubmittablePenalties`). 한편 `end`
   * 레인이 이미 결선 무승부를 막으므로 **공식이 된 결선 무승부 경기는 예외 없이
   * `score.penalties`를 갖는다.**
   *
   * 그래서 클라이언트가 penalties를 생략했다는 사실만으로 3단계를 적용하면,
   * 승부차기로 결정된 모든 결선 경기가 "득점자 오기입 하나 고치기"조차 409로
   * 거부되고 폼에는 승부차기 입력란이 없어 그 지시를 만족시킬 방법이 없다 —
   * 사용자가 보고한 바로 그 화면이 영구히 막힌다. 그건 POISONED를 하드 블록으로
   * 바꾸는 게 아니라 정상 흐름을 차단하는 회귀다.
   *
   * 그래서 penalties가 생략됐고 **정정 후 정규시간이 여전히 동점일 때만** base
   * 리비전에 저장된 값을 승계한다(`readStoredPenalties`). 정정이 정규시간을
   * 결정적으로 바꿨다면(1-1 → 2-1) 승부차기는 의미가 없어 승계하지 않는다 —
   * 승계하면 `assertPenaltiesNotAllowed`가 "이미 승자가 났다"로 거부해 그것도
   * 막다른 길이 된다. 승계된 값은 다시 1·2단계를 통과하므로, 승계가 검증을
   * 우회하는 문은 아니다.
   */
  private async assertPenaltiesForRevision(
    tx: Transaction,
    game: LockedTournamentGame,
    baseScore: Prisma.JsonValue,
    score: { home: number; away: number; penalties?: StoredPenalties },
  ): Promise<GameScore> {
    const submitted = extractEndPenalties({ penalties: score.penalties });
    const regulation: GameScore = { home: score.home, away: score.away };
    // 결정적 스코어 + 승부차기 없음이면 어떤 fact도 판정을 바꾸지 않고 승계할
    // 것도 없다(승계는 정규시간 동점일 때만) — 잠금 구간에서 질의하지 않는다.
    if (!needsKnockoutFixtureFacts(regulation, submitted)) {
      return regulation;
    }
    const facts = await readKnockoutFixtureFacts(tx, game.tournamentFixtureId);
    if (submitted !== undefined) {
      // 클라이언트가 킥 수·우회 표식을 빠뜨렸으면 **base 에서 메운다.** 정정 폼에는
      // 승부차기 입력란이 아예 없어(2026-08-18 실측: 폼 필드 186개 중 0개) 폼이 보내는
      // 값은 언제나 base 를 재조립한 것인데, 재조립이 세 키만 옮기면 정정 한 번에
      // 킥 수와 "우회로 닫았다"는 감사 기록이 **영구히 사라진다**(되살릴 화면이 없다).
      //
      // 점수가 base 와 다를 때는 메우지 않는다 — 그때의 base 킥 수는 다른 승부차기를
      // 설명하는 값이라, 옮기면 `home <= takenHome` 같은 불변식이 조용히 깨진다.
      const carriedOver = this.carryPenaltyAuditFields(submitted, baseScore);
      const applied = assertPenaltiesNotAllowed(regulation, carriedOver, facts);
      // 정정이 승부차기를 **새로 쓰는가**를 base 와 비교해 판정한다. 새로 쓰는 것이면
      // `end` 와 똑같이 킥 수를 요구하고, base 를 그대로 옮기는 것이면 면제한다.
      //
      // 이 구분이 없으면 정정이 `end` 의 우회로가 된다 — 2026-08-18 알파 교차 측정에서
      // 같은 `{home:9, away:0}` 이 `end` 에선 422, 정정에선 201 로 저장됐다. 반대로
      // 무조건 요구하면 킥 수가 생기기 전에 저장된 리비전의 정정이 영구히 막힌다.
      const base = readStoredPenalties(baseScore);
      const inheritedFromBase =
        base !== undefined && base.home === carriedOver.home && base.away === carriedOver.away;
      // 정정 레인에도 **결판 판정을 건다.** 예전에는 이 레인이 `assertPenaltiesNotAllowed`
      // 하나만 통과시켜, `end` 가 422 로 막는 값(킥 수가 말이 안 되는 승부차기)을 정정으로는
      // 그대로 저장할 수 있었다 — 게이트를 한 레인에만 달면 다른 레인이 우회로가 된다.
      // 킥 수가 없는 레거시 승계는 `assertPenaltyShootoutConcluded` 가 그대로 통과시킨다.
      const config = await tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { result: true },
      });
      assertPenaltyShootoutPersistable(carriedOver, parseResultPolicy(config?.result ?? null), {
        requireKickCounts: !inheritedFromBase,
      });
      return applied;
    }
    // 승계는 "무승부를 그대로 두면 브래킷이 멈추는" 픽스처에서만 한다
    // (`requiresDecisiveResult` — `assertBracketResolvable`과 **같은** 술어).
    // 조별리그처럼 무승부가 정상인 픽스처에까지 승계하면
    // `assertPenaltiesNotAllowed`가 "조별리그엔 승부차기를 기록할 수 없다"로
    // 그 정정을 거부해, 승부차기가 잘못 저장된 레거시 조별 경기를 고칠 방법이
    // 사라진다(승계하지 않으면 그 정정이 잘못된 값을 정상적으로 걷어낸다).
    const carried =
      regulation.home === regulation.away && requiresDecisiveResult(facts)
        ? readStoredPenalties(baseScore)
        : undefined;
    if (carried === undefined) {
      assertBracketResolvable(regulation, facts);
      return regulation;
    }
    // 승계값도 예외가 아니다. 동점 승부차기가 저장돼 있던 레거시 리비전은 여기서
    // 해결 불가한 무승부로 거부된다(`assertBracketResolvable`의 동점 분기).
    assertBracketResolvable({ ...regulation, penalties: carried }, facts);
    return assertPenaltiesNotAllowed(regulation, carried, facts);
  }

  /**
   * 정정이 보낸 승부차기에 킥 수·우회 표식이 없으면 base 리비전에서 메운다.
   *
   * 왜 서버가 메우나 — 이 값들은 **정정 화면이 되살릴 수 없는 정보**다. 폼에 승부차기
   * 입력란이 없으므로 운영자는 다시 입력할 수단이 없고, 한 번 떨어지면 이후 모든 정정에서
   * 서버가 결판을 판정할 근거도 함께 사라진다. 클라이언트를 고치는 것과 별개로 서버가
   * 마지막 방어선을 갖는다 — 옛 번들을 띄워 둔 탭 하나가 감사 기록을 지울 수 있어서다.
   *
   * **점수가 같을 때만** 메운다. 점수가 다르면 base 의 킥 수는 다른 승부차기를 설명하는
   * 값이라, 그대로 옮기면 "성공 수가 시도 수를 넘는" 조합이 조용히 만들어진다.
   */
  private carryPenaltyAuditFields(submitted: StoredPenalties, baseScore: Prisma.JsonValue): StoredPenalties {
    const base = readStoredPenalties(baseScore);
    if (base === undefined) return submitted;
    if (base.home !== submitted.home || base.away !== submitted.away) return submitted;
    // **누락된 필드만 메우고 전달된 값은 보존한다.** 킥 수가 다 왔다고 조기 return 하면
    // `operatorOverride` 만 빠진 경우("우회로 닫았다"는 기록)를 되살리지 못한다 — 부분적으로
    // 업데이트된 클라이언트가 정확히 그 형태를 보낸다.
    const needsCounts = submitted.takenHome === undefined || submitted.takenAway === undefined;
    const counts =
      needsCounts && base.takenHome !== undefined && base.takenAway !== undefined
        ? { takenHome: base.takenHome, takenAway: base.takenAway }
        : {};
    const override =
      submitted.operatorOverride === undefined && base.operatorOverride === true
        ? { operatorOverride: true as const }
        : {};
    // base 값을 먼저 깔고 submitted 를 덮는 순서 — 전달된 값이 항상 이긴다.
    return { ...counts, ...override, ...submitted };
  }

  /**
   * Correction changes intentionally are not cross-validated against the
   * frozen event stream (the event log can be exactly what the correction
   * is fixing, and a game in ENDED/CANCELLED can no longer accept new
   * events) -- but participants must still be real, unique, and correctly
   * sided, and any MVP must be one of them.
   *
   * "real"이 실제로 강제되는 것은 이 변경부터다. 예전에는 중복과 "sideId가 이
   * 게임의 side인가"만 봐서 **다른 경기의 participantId**가 그대로 통과했고,
   * `v1_game_result_participants.participantId`에는 FK도 없어서 DB도 막지
   * 않았다(schema.prisma) — 그 결과가 남의 경기 성적을 이 경기 기록으로
   * 집계하는 것이었다(`public-user-records.service.ts`가 이 테이블을 직접
   * 읽는다). 이제 이 게임의 `v1GameParticipant` 집합을 읽어 소속과 진영까지
   * 대조한다. 참가자 집합을 라인업 revision으로 좁히지 않는 것은 정본
   * 프로듀서(`GamesService.deriveTournamentRevision`)와 같은 술어를 쓰기
   * 위해서다 — 더 좁히면 정당한 정정이 정본보다 먼저 막힌다.
   *
   * 별도의 side 조회는 없앴다. 참가자의 실제 `sideId`와 일치하는지 보면 그
   * `sideId`가 이 게임의 side라는 것은 자동으로 따라오므로, 남겨 두면 아무도
   * 읽지 않는 죽은 질의가 된다.
   *
   * 정정(correction)과 재제출(supersede) **양쪽**이 이 가드를 쓴다. 재제출은
   * `validateGameResultInvariants`도 함께 돌지만 그건 `sideId`의 존재만 보고
   * participantId의 소속은 보지 않아(`game-invariants.ts`) 같은 구멍이 남는다.
   */
  private async assertRevisionParticipantsValid(
    tx: Transaction,
    gameId: string,
    baseRevisionId: string,
    content: Pick<GameResultCorrectionChangesDto, 'actualParticipants' | 'mvpParticipantId'>,
  ): Promise<void> {
    // 빈 배열은 **base 리비전에 개인기록이 있었을 때만** 거부한다. 통과시키면 새
    // 리비전의 개인기록이 0행이 되어 그 경기의 선수 개개인 기록이 전멸하지만
    // (사용자 보고 증상), 무조건 거부하면 **정본 프로듀서가 정당하게 0행으로 만든
    // 경기**를 아무도 고칠 수 없게 된다: `deriveTournamentRevision`의 출전 게이트
    // (`appearedIds`)는 선발이 아무도 표시되지 않고 이벤트도 없으면 0행을 쓰고,
    // TBD 브래킷 픽스처나 로스터가 비어 있는 등록은 `v1GameParticipant` 자체가
    // 0행인 게임을 만든다(`tournament-bracket.service.ts`). 정정 폼은 base
    // 리비전에서만 참가자를 채우고 로스터 추가 수단이 없으므로
    // (`result-edit-modal.tsx`) 그런 경기의 점수 정정은 영구히 400/422가 된다.
    // 그래서 술어는 "비우지 말라"가 아니라 **"있던 것을 비우지 말라"**다.
    if (content.actualParticipants.length === 0) {
      const baseParticipantCount = await tx.v1GameResultParticipant.count({
        where: { resultRevisionId: baseRevisionId },
      });
      if (baseParticipantCount > 0) {
        throw new UnprocessableEntityException({
          code: 'PARTICIPANT_INVALID',
          message: 'actualParticipants must not drop every participant recorded on the base revision',
        });
      }
    }
    const participants = await tx.v1GameParticipant.findMany({
      where: { gameId },
      select: { id: true, sideId: true },
    });
    const sideByParticipantId = new Map(participants.map((participant) => [participant.id, participant.sideId]));
    const seen = new Set<string>();
    for (const participant of content.actualParticipants) {
      const actualSideId = sideByParticipantId.get(participant.participantId);
      if (
        seen.has(participant.participantId) ||
        actualSideId === undefined ||
        actualSideId !== participant.sideId
      ) {
        throw new UnprocessableEntityException({
          code: 'PARTICIPANT_INVALID',
          message: 'Revision participants must be unique participants of this game, on their own side',
        });
      }
      seen.add(participant.participantId);
    }
    if (content.mvpParticipantId !== undefined && !seen.has(content.mvpParticipantId)) {
      throw new UnprocessableEntityException({
        code: 'PARTICIPANT_INVALID',
        message: 'MVP must be one of the submitted actualParticipants',
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
      // Task 17이 GameResultInvariantInput에 sourceType을 필수로 추가했다
      // (TEAM_MATCH는 자체 보고라 이벤트-스코어 교차검증에서 면제,
      // TOURNAMENT_FIXTURE는 엄격 검증 유지 — game-invariants.ts 참조).
      // 이 레인은 위 docblock대로 항상 TOURNAMENT_FIXTURE지만, 하드코딩 대신
      // 잠근 게임의 실제 값을 넘겨 704행의 sourceType 가드와 단일 출처를 유지한다.
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
