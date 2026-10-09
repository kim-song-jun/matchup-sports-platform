import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, V1GameResultRevisionState, V1GameSideKey } from '@prisma/client';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { assertRevisionTransition } from '../games/core/revision-state-machine';
import { tallyLiveScore } from '../games/public-records/public-live-score';
import { closeRevisionReviewSla } from '../tournament-operations/results/close-review-sla';

type Tx = Prisma.TransactionClient;

export const TEAM_CHANGE_REASON_MAX_LENGTH = 200;

export type StartedTeamChangeSummary = {
  gameState: string;
  reason: string;
  /** Unconfirmed result revisions discarded by the swap (empty when the game had none). */
  discardedRevisions: Array<{ id: string; state: string }>;
  sides: Array<{ sideKey: V1GameSideKey; removedEventCount: number }>;
  removedEventCount: number;
  scoreBefore: { home: number; away: number };
  scoreAfter: { home: number; away: number };
};

/**
 * A fixture whose game already left SCHEDULED may change teams unless it has a confirmed (OFFICIAL) result, which
 * must be voided explicitly first (never automatically). Unconfirmed revisions are discarded by
 * `discardUnconfirmedResultRevisions` once the swap is allowed.
 */
export async function assertStartedTeamChangeAllowed(
  tx: Tx,
  input: { gameState: string; officialRevisionState: string | null; reason: string | null | undefined },
): Promise<string> {
  if (input.gameState === 'CANCELLED') {
    throw new ConflictException({ code: 'FIXTURE_CANCELLED', message: '취소된 경기는 팀을 바꿀 수 없어요.' });
  }
  if (input.officialRevisionState === V1GameResultRevisionState.OFFICIAL) {
    throw new ConflictException({
      code: 'FIXTURE_RESULT_MUST_BE_VOIDED',
      message: '공식 결과가 확정된 경기예요. 결과를 먼저 무효로 돌려 주세요.',
    });
  }
  const reason = input.reason?.trim() ?? '';
  if (reason.length === 0 || reason.length > TEAM_CHANGE_REASON_MAX_LENGTH) {
    throw new BadRequestException({
      code: 'TEAM_CHANGE_REASON_REQUIRED',
      message: `시작된 경기의 팀을 바꾸려면 사유를 ${TEAM_CHANGE_REASON_MAX_LENGTH}자 이내로 입력해 주세요.`,
    });
  }
  return reason;
}

/**
 * Deletes the game events that belong to the replaced sides and returns what went away. An event goes when it is
 * credited to a replaced side (its goals, including own goals by the opponent's players) or when it names a
 * participant of a replaced side (cards, fouls, substitutions, and own goals that credited the opponent). Reversal
 * events follow their targets. Events with neither side nor participant (period/pause/resume) and the opponent's
 * own goals, cards and assists stay, so the opponent's score is recomputed from what is left.
 */
export async function purgeReplacedSideEvents(
  tx: Tx,
  input: { gameId: string; sides: ReadonlyArray<{ id: string; sideKey: V1GameSideKey }> },
): Promise<Omit<StartedTeamChangeSummary, 'gameState' | 'reason' | 'discardedRevisions'>> {
  const allSides = await tx.v1GameSide.findMany({ where: { gameId: input.gameId }, select: { id: true, sideKey: true } });
  const sideKeyById = new Map(allSides.map((side) => [side.id, side.sideKey]));
  const replacedSideIds = new Set(input.sides.map((side) => side.id));
  const participants = await tx.v1GameParticipant.findMany({
    where: { gameId: input.gameId, sideId: { in: [...replacedSideIds] } },
    select: { id: true },
  });
  const replacedParticipantIds = new Set(participants.map((participant) => participant.id));
  const events = await tx.v1GameEvent.findMany({
    where: { gameId: input.gameId },
    select: { id: true, type: true, sideId: true, participantId: true, assistParticipantId: true, reversesEventId: true },
  });

  const removed = new Set(
    events
      .filter((event) => (event.sideId !== null && replacedSideIds.has(event.sideId))
        || (event.participantId !== null && replacedParticipantIds.has(event.participantId))
        || (event.assistParticipantId !== null && replacedParticipantIds.has(event.assistParticipantId)))
      .map((event) => event.id),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const event of events) {
      if (!removed.has(event.id) && event.reversesEventId !== null && removed.has(event.reversesEventId)) {
        removed.add(event.id);
        grew = true;
      }
    }
  }

  const scoreBefore = tallyLiveScore(events, sideKeyById);
  const kept = events.filter((event) => !removed.has(event.id));
  const scoreAfter = tallyLiveScore(kept, sideKeyById);
  if (removed.size > 0) await tx.v1GameEvent.deleteMany({ where: { gameId: input.gameId, id: { in: [...removed] } } });

  return {
    sides: input.sides.map((side) => ({
      sideKey: side.sideKey,
      removedEventCount: events.filter((event) => removed.has(event.id) && event.sideId === side.id).length,
    })),
    removedEventCount: removed.size,
    scoreBefore,
    scoreAfter,
  };
}

/**
 * Discards the game's unconfirmed result so the swapped-in teams start from "no confirmed result". DRAFT and
 * SUBMITTED rows go VOID in place (nothing else reads a VOID row as a result), a trailing CHANGE_REQUESTED row is
 * terminal so only a VOID successor is appended, and `currentOfficialRevisionId` moves to a result-less VOID
 * revision exactly like an official void does — that is the state quick-result entry and VOID_REENTRY
 * corrections accept. The VOID successor deliberately has no result participants (suspension counting reads the
 * pointer revision's participants). Returns what was discarded.
 */
export async function discardUnconfirmedResultRevisions(
  tx: Tx,
  input: { gameId: string; actorUserId: string; reason: string },
): Promise<Array<{ id: string; state: string }>> {
  const latest = await tx.v1GameResultRevision.findFirst({ where: { gameId: input.gameId }, orderBy: { revision: 'desc' } });
  if (latest === null || latest.state === V1GameResultRevisionState.VOID) return [];
  if (latest.state === V1GameResultRevisionState.OFFICIAL) {
    throw new ConflictException({
      code: 'FIXTURE_RESULT_MUST_BE_VOIDED',
      message: '공식 결과가 확정된 경기예요. 결과를 먼저 무효로 돌려 주세요.',
    });
  }
  const unconfirmed = await tx.v1GameResultRevision.findMany({
    where: { gameId: input.gameId, state: { in: [V1GameResultRevisionState.DRAFT, V1GameResultRevisionState.SUBMITTED] } },
    select: { id: true, state: true },
    orderBy: { revision: 'asc' },
  });
  const discarded: Array<{ id: string; state: string }> = [];
  for (const row of unconfirmed) {
    assertRevisionTransition({ from: row.state, to: V1GameResultRevisionState.VOID, flow: 'TEAM_CHANGE' });
    await tx.v1GameResultRevision.update({ where: { id: row.id }, data: { state: V1GameResultRevisionState.VOID } });
    await closeRevisionReviewSla(tx, row.id, input.reason);
    discarded.push(row);
  }
  if (latest.state === V1GameResultRevisionState.CHANGE_REQUESTED) {
    discarded.push({ id: latest.id, state: latest.state });
    await closeRevisionReviewSla(tx, latest.id, input.reason);
  }
  const voidRevision = await tx.v1GameResultRevision.create({
    data: {
      gameId: input.gameId,
      revision: latest.revision + 1,
      state: V1GameResultRevisionState.VOID,
      // Result-less snapshot: copying the discarded revision would leave its score on the pointer revision, which
      // the operate console shows as the header score.
      score: { regulation: null, penalty: null, goals: [], incomplete: true } satisfies Prisma.InputJsonObject,
      eventsHash: canonicalGameCommandPayloadHash([]),
      missingScorer: false,
      reason: input.reason,
      createdByActorType: 'USER',
      createdByUserId: input.actorUserId,
      supersedesId: latest.id,
      submittedAt: new Date(),
    },
    select: { id: true },
  });
  await tx.v1Game.update({ where: { id: input.gameId }, data: { currentOfficialRevisionId: voidRevision.id } });
  return discarded;
}
