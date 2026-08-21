import { V1GameEventType, V1GameSourceType } from '@prisma/client';
import type {
  GameResultEvent,
  GameResultInvariantInput,
  GameScore,
} from '../games.types';
import { GameContractError } from './game-contract';

const eventTypes = new Set<string>(Object.values(V1GameEventType));
const sideScopedEventTypes = new Set<V1GameEventType>([
  V1GameEventType.GOAL,
  V1GameEventType.OWN_GOAL,
  V1GameEventType.CARD,
  V1GameEventType.SUBSTITUTION,
  V1GameEventType.FOUL,
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
  // Deliberately no upper bound here (alpha "452′" incident, 2026-08): an
  // operator who forgets to end a period before recording another event
  // will produce a huge-but-real clockMs. Hard-rejecting it here (422) would
  // make the record UNRECORDABLE, which is worse than a wrong-looking
  // number — and an already-appended event must never be retroactively
  // rejected either (it's the immutable source of truth once committed).
  // The response to an implausible clockMs lives elsewhere, as a
  // non-blocking signal: the operator console asks for confirmation before
  // submit when the value runs far past its period's configured
  // `durationMinutes` (`operate-console.tsx`, `game-operations-clock.ts`'s
  // `isClockSuspicious`), and the public schedule/match-detail screens flag
  // an already-recorded outlier instead of hiding or “fixing” it
  // (`public-game-records/format.ts`'s `isClockAbnormal`).
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
  if (event.type === V1GameEventType.FOUL && event.participantId === undefined) {
    throw new GameContractError('EVENT_INVALID', 'Foul event requires a participant');
  }
  if (event.type === V1GameEventType.OWN_GOAL && event.participantId === undefined) {
    throw new GameContractError('EVENT_INVALID', 'Own goal event requires a participant');
  }
  if (event.assistParticipantId !== undefined && event.type !== V1GameEventType.GOAL) {
    throw new GameContractError('EVENT_INVALID', 'Assist can only be recorded on a GOAL event');
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
  const participantAssists = new Map<string, number>();
  const participantFouls = new Map<string, number>();
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
    if (participant.assists !== undefined) {
      assertNonNegativeInteger(participant.assists, 'participant assists');
      participantAssists.set(participant.id, participant.assists);
    }
    if (participant.fouls !== undefined) {
      assertNonNegativeInteger(participant.fouls, 'participant fouls');
      participantFouls.set(participant.id, participant.fouls);
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
  const eventAssistsByParticipant = new Map<string, number>();
  const eventFoulsByParticipant = new Map<string, number>();
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
    const participantMustBeOpposingSide = event.type === V1GameEventType.OWN_GOAL;
    if (
      participant !== undefined &&
      (participantMustBeOpposingSide
        ? participant.sideId === event.sideId
        : participant.sideId !== event.sideId)
    ) {
      throw new GameContractError(
        'PARTICIPANT_SIDE_MISMATCH',
        participantMustBeOpposingSide
          ? 'Own-goal participant must belong to the opposing side'
          : 'Event participant and side do not agree',
      );
    }
    if (event.type === V1GameEventType.GOAL || event.type === V1GameEventType.OWN_GOAL) {
      if (side === undefined) {
        throw new GameContractError('EVENT_INVALID', 'Goal requires a game side');
      }
      eventScore[side.sideKey] += 1;
      if (event.type === V1GameEventType.OWN_GOAL) {
        // 자책골은 상대 팀 점수만 올리고 행위 선수의 개인 득점에는 넣지 않는다.
      } else if (participant === undefined) {
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
    if (event.type === V1GameEventType.GOAL && event.assistParticipantId !== undefined) {
      const assistParticipant = participantById.get(event.assistParticipantId);
      if (assistParticipant === undefined) {
        throw new GameContractError('PARTICIPANT_INVALID', 'Assist participant does not belong to the game');
      }
      if (side !== undefined && assistParticipant.sideId !== side.id) {
        throw new GameContractError('PARTICIPANT_SIDE_MISMATCH', 'Assist participant and side do not agree');
      }
      eventAssistsByParticipant.set(
        event.assistParticipantId,
        (eventAssistsByParticipant.get(event.assistParticipantId) ?? 0) + 1,
      );
    }
    if (event.type === V1GameEventType.FOUL && participant !== undefined) {
      eventFoulsByParticipant.set(participant.id, (eventFoulsByParticipant.get(participant.id) ?? 0) + 1);
    }
  }

  // Task 17 (Option A): a TEAM_MATCH has no live officiating — the host
  // self-reports the score and the opponent approves it — so in the ordinary
  // flow it carries zero V1GameEvent rows. Cross-checking the submitted score
  // against an empty event stream rejected every non-0:0 team-match result
  // with SCORE_EVENT_MISMATCH, so for a team match with no events the
  // SUBMITTED score is authoritative and these four event-derived checks are
  // skipped.
  //
  // The exemption is deliberately gated on the events actually being absent,
  // NOT on sourceType alone. An earlier draft assumed a team match "can never"
  // carry events because resolveActor forbids event_append/event_reverse on
  // that path — but that forbid is only reached by team members. An active
  // non-support platform_ops admin hits an earlier unconditional early-return
  // (games.service.ts, between the tournament-fixture block and
  // `const match = game.teamMatch`), and POST /games/:gameId/events has no
  // sourceType guard, so an admin CAN append real events to a team match.
  // Skipping on sourceType alone would then let a submitted score silently
  // contradict events someone deliberately recorded. If events exist, they are
  // evidence and the score must agree with them.
  //
  // TOURNAMENT_FIXTURE keeps the exact event-based verification below
  // unchanged. Every other invariant above (score sign, side topology,
  // participant uniqueness/side membership, non-negative goals/cards/minutes,
  // MVP referencing a real participant, event shape validation) stays in force
  // for both source types because none of it depends on an event stream.
  const teamMatchWithoutEvents =
    input.sourceType === V1GameSourceType.TEAM_MATCH && input.events.length === 0;
  if (!teamMatchWithoutEvents) {
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
    for (const [participantId, assists] of participantAssists) {
      if ((eventAssistsByParticipant.get(participantId) ?? 0) !== assists) {
        throw new GameContractError('SCORE_EVENT_MISMATCH', 'Participant assist totals do not match active assist events');
      }
    }
    for (const [participantId, fouls] of participantFouls) {
      if ((eventFoulsByParticipant.get(participantId) ?? 0) !== fouls) {
        throw new GameContractError('SCORE_EVENT_MISMATCH', 'Participant foul totals do not match active foul events');
      }
    }
    if (input.missingScorer !== hasMissingScorer) {
      throw new GameContractError(
        'SCORE_EVENT_MISMATCH',
        'missingScorer must exactly reflect active goals without a participant',
      );
    }
  }
}
