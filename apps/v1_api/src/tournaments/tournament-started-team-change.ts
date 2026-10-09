import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, V1GameResultRevisionState, V1GameSideKey } from '@prisma/client';
import { tallyLiveScore } from '../games/public-records/public-live-score';

type Tx = Prisma.TransactionClient;

export const TEAM_CHANGE_REASON_MAX_LENGTH = 200;

/** Revision states that still describe the old teams and cannot be voided (only OFFICIAL can). */
const PENDING_REVISION_STATES: readonly V1GameResultRevisionState[] = [
  V1GameResultRevisionState.DRAFT,
  V1GameResultRevisionState.SUBMITTED,
  V1GameResultRevisionState.CHANGE_REQUESTED,
];

export type StartedTeamChangeSummary = {
  gameState: string;
  reason: string;
  sides: Array<{ sideKey: V1GameSideKey; removedEventCount: number }>;
  removedEventCount: number;
  scoreBefore: { home: number; away: number };
  scoreAfter: { home: number; away: number };
};

/**
 * A fixture whose game already left SCHEDULED may change teams only while it has no result. A confirmed
 * (OFFICIAL) result must be voided first; a submitted-but-unconfirmed one still holds the old teams' score and
 * cannot be voided, so it blocks too. Nothing is voided automatically.
 */
export async function assertStartedTeamChangeAllowed(
  tx: Tx,
  input: { gameId: string; gameState: string; officialRevisionState: string | null; reason: string | null | undefined },
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
  const latest = await tx.v1GameResultRevision.findFirst({
    where: { gameId: input.gameId },
    orderBy: { revision: 'desc' },
    select: { state: true },
  });
  if (latest !== null && PENDING_REVISION_STATES.includes(latest.state)) {
    throw new ConflictException({
      code: 'FIXTURE_RESULT_PENDING',
      message: '제출된 결과가 있는 경기예요. 결과를 확정한 뒤 무효로 돌려 주세요.',
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
): Promise<Omit<StartedTeamChangeSummary, 'gameState' | 'reason'>> {
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
