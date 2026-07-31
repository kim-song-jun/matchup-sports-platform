import { V1GameEventType } from '@prisma/client';
import type {
  GameResultEvent,
  GameResultInvariantInput,
  GameScore,
} from '../games.types';
import { GameContractError } from './game-contract';

const eventTypes = new Set<string>(Object.values(V1GameEventType));
const sideScopedEventTypes = new Set<V1GameEventType>([
  V1GameEventType.GOAL,
  V1GameEventType.CARD,
  V1GameEventType.SUBSTITUTION,
]);

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GameContractError('SCORE_INVALID', `${label} must be a non-negative integer`);
  }
}

function validateScore(score: GameScore): void {
  assertNonNegativeInteger(score.home, 'home score');
  assertNonNegativeInteger(score.away, 'away score');
  if (score.penalties !== undefined) {
    assertNonNegativeInteger(score.penalties.home, 'home penalty score');
    assertNonNegativeInteger(score.penalties.away, 'away penalty score');
  }
}

function validateEventShape(event: GameResultEvent): void {
  if (!eventTypes.has(event.type)) {
    throw new GameContractError('EVENT_INVALID', `Unknown event type: ${event.type}`);
  }
  if (!Number.isSafeInteger(event.period) || event.period < 1) {
    throw new GameContractError('EVENT_INVALID', 'Event period must be a positive integer');
  }
  if (!Number.isSafeInteger(event.clockMs) || event.clockMs < 0) {
    throw new GameContractError('EVENT_INVALID', 'Event clock must be a non-negative integer');
  }
  if (sideScopedEventTypes.has(event.type as V1GameEventType) && event.sideId === undefined) {
    throw new GameContractError('EVENT_INVALID', `${event.type} requires a side`);
  }
  if (
    event.type === V1GameEventType.CARD &&
    (event.participantId === undefined || (event.card !== 'YELLOW' && event.card !== 'RED'))
  ) {
    throw new GameContractError('EVENT_INVALID', 'Card event requires a participant and card color');
  }
}

export function validateGameResultInvariants(input: GameResultInvariantInput): void {
  validateScore(input.score);

  const sideById = new Map(input.sides.map((side) => [side.id, side]));
  const sideKeys = new Set(input.sides.map((side) => side.sideKey));
  if (input.sides.length !== 2 || sideKeys.size !== 2) {
    throw new GameContractError('PARTICIPANT_INVALID', 'Result requires one HOME and one AWAY side');
  }

  const participantById = new Map<string, (typeof input.participants)[number]>();
  const participantGoals = new Map<string, number>();
  const participantCards = new Map<string, { yellow: number; red: number }>();
  for (const participant of input.participants) {
    if (participantById.has(participant.id) || !sideById.has(participant.sideId)) {
      throw new GameContractError('PARTICIPANT_INVALID', 'Participants must be unique and belong to a side');
    }
    assertNonNegativeInteger(participant.goals, 'participant goals');
    assertNonNegativeInteger(participant.cards.yellow, 'participant yellow cards');
    assertNonNegativeInteger(participant.cards.red, 'participant red cards');
    if (participant.minutesPlayed !== undefined) {
      assertNonNegativeInteger(participant.minutesPlayed, 'participant minutes');
    }
    participantById.set(participant.id, participant);
    participantGoals.set(participant.id, participant.goals);
    participantCards.set(participant.id, participant.cards);
  }

  if (input.mvpParticipantId !== undefined && !participantById.has(input.mvpParticipantId)) {
    throw new GameContractError('PARTICIPANT_INVALID', 'MVP must be an actual game participant');
  }

  const eventScore = { HOME: 0, AWAY: 0 };
  const eventGoalsByParticipant = new Map<string, number>();
  const eventCardsByParticipant = new Map<string, { yellow: number; red: number }>();
  let hasMissingScorer = false;
  for (const event of input.events) {
    validateEventShape(event);
    if (event.reversed === true) {
      continue;
    }
    const side = event.sideId === undefined ? undefined : sideById.get(event.sideId);
    if (event.sideId !== undefined && side === undefined) {
      throw new GameContractError('EVENT_INVALID', 'Event side does not belong to the game');
    }
    const participant =
      event.participantId === undefined ? undefined : participantById.get(event.participantId);
    if (event.participantId !== undefined && participant === undefined) {
      throw new GameContractError('PARTICIPANT_INVALID', 'Event participant does not belong to the game');
    }
    if (participant !== undefined && participant.sideId !== event.sideId) {
      throw new GameContractError(
        'PARTICIPANT_SIDE_MISMATCH',
        'Event participant and side do not agree',
      );
    }
    if (event.type === V1GameEventType.GOAL) {
      if (side === undefined) {
        throw new GameContractError('EVENT_INVALID', 'Goal requires a game side');
      }
      eventScore[side.sideKey] += 1;
      if (participant === undefined) {
        hasMissingScorer = true;
        if (input.scorerPolicy === 'required') {
          throw new GameContractError('PARTICIPANT_INVALID', 'Scorer is required for every goal');
        }
      } else {
        eventGoalsByParticipant.set(
          participant.id,
          (eventGoalsByParticipant.get(participant.id) ?? 0) + 1,
        );
      }
    }
    if (event.type === V1GameEventType.CARD && participant !== undefined) {
      const cards = eventCardsByParticipant.get(participant.id) ?? { yellow: 0, red: 0 };
      if (event.card === 'YELLOW') {
        cards.yellow += 1;
      } else {
        cards.red += 1;
      }
      eventCardsByParticipant.set(participant.id, cards);
    }
  }

  if (eventScore.HOME !== input.score.home || eventScore.AWAY !== input.score.away) {
    throw new GameContractError('SCORE_EVENT_MISMATCH', 'Score does not match active goal events');
  }
  for (const [participantId, goals] of participantGoals) {
    if ((eventGoalsByParticipant.get(participantId) ?? 0) !== goals) {
      throw new GameContractError(
        'SCORE_EVENT_MISMATCH',
        'Participant goal totals do not match active goal events',
      );
    }
  }
  for (const [participantId, cards] of participantCards) {
    const eventCards = eventCardsByParticipant.get(participantId) ?? { yellow: 0, red: 0 };
    if (eventCards.yellow !== cards.yellow || eventCards.red !== cards.red) {
      throw new GameContractError(
        'SCORE_EVENT_MISMATCH',
        'Participant card totals do not match active card events',
      );
    }
  }
  if (input.missingScorer !== hasMissingScorer) {
    throw new GameContractError(
      'SCORE_EVENT_MISMATCH',
      'missingScorer must exactly reflect active goals without a participant',
    );
  }
}
