import type { GameCommandName, GameDetail, GameEventRecord, GameLineup, GameMutationResult } from '@/types/game-operations';
import { countActiveSubstitutions } from '@/lib/on-pitch-state';

export const FIELD_DEMO_PATH = '/field-console-demo';
export const FIELD_DEMO_GAME_ID = 'sample-field-game';
export const FIELD_DEMO_ACTOR_ID = 'sample-field-operator';
export type FieldDemoState = { game: GameDetail; events: GameEventRecord[] };

export function createFieldDemo(): FieldDemoState {
  const gameId = FIELD_DEMO_GAME_ID;
  const stamp = '2026-11-08T00:00:00.000Z';
  const sides: GameDetail['sides'] = ['블루 FC', '오렌지 FS'].map((name, i) => ({
    id: `sample-side-${i}`, gameId, sideKey: i === 0 ? 'HOME' : 'AWAY', teamId: `sample-team-${i}`,
    displayNameSnapshot: name, createdAt: stamp, updatedAt: stamp,
  }));
  const names = [['김하늘', '이바다', '박산', '정여름', '최가을', '윤겨울'], ['강별', '한달', '오빛', '서봄', '임솔', '송나무']];
  const lineups: GameLineup[] = sides.map((side, i) => ({
    id: `sample-lineup-${i}`, gameId, sideId: side.id, revision: 1, state: 'LOCKED', version: 1,
    submittedAt: stamp, supersedesId: null, formation: null, createdAt: stamp, updatedAt: stamp, invalidatedAt: null,
    participants: names[i].map((name, j) => ({
      id: `sample-player-${i}-${j}`, gameId, sideId: side.id, lineupId: `sample-lineup-${i}`,
      userId: null, displayNameSnapshot: name, jerseyNumber: j + 1, position: null,
      positionX: null, positionY: null, started: j < 5, arrivedAt: stamp, createdAt: stamp, updatedAt: stamp,
    })),
  }));
  return { events: [], game: {
    id: gameId, sourceType: 'TOURNAMENT_FIXTURE', actorRole: 'field_operator', state: 'SCHEDULED',
    version: 1, lastSequence: 0, competitionConfigVersionId: 'sample-football-config', currentOfficialRevisionId: null,
    sides, lineups, periods: [1, 2].map((number) => ({
      id: `sample-period-${number}`, gameId, number, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null,
    })), periodDurations: [{ durationMinutes: 20, extraTime: false }, { durationMinutes: 20, extraTime: false }],
    realtimeAuthorization: { kind: 'unavailable' }, substitutionPolicy: { mode: 'limited', maxSubstitutions: 3 }, isKnockoutFixture: false,
  } };
}

/** Sample-only state machine. It neither imports transports nor impersonates a real API success. */
export function commandFieldDemo(state: FieldDemoState, command: GameCommandName, expectedVersion: number, now = new Date().toISOString()): FieldDemoState {
  if (state.game.version !== expectedVersion) throw new Error('샘플 경기 상태가 변경됐어요. 다시 시도해 주세요.');
  const game = structuredClone(state.game);
  const active = game.periods.find((p) => p.state === 'LIVE');
  const halftime = game.periods.find((p) => p.state === 'HALFTIME');
  const invalid = () => { throw new Error('현재 샘플 경기 상태에서는 이 동작을 할 수 없어요.'); };
  switch (command) {
    case 'start':
      if (game.state !== 'SCHEDULED') invalid();
      game.state = 'LIVE'; game.periods[0].state = 'LIVE'; game.periods[0].startedAt = now; break;
    case 'pause':
      if (game.state !== 'LIVE' || !active) return invalid();
      game.state = 'PAUSED'; active.pausedAt = now; break;
    case 'resume':
      if (game.state !== 'PAUSED' || !active?.pausedAt) return invalid();
      active.pausedTotalMs += Date.parse(now) - Date.parse(active.pausedAt); active.pausedAt = null; game.state = 'LIVE'; break;
    case 'end-period': {
      if (game.state !== 'LIVE' || !active) return invalid();
      active.state = 'ENDED'; active.endedAt = now;
      const next = game.periods.find((p) => p.number === active.number + 1);
      if (next) next.state = 'HALFTIME'; break;
    }
    case 'start-period':
      if (game.state !== 'LIVE' || !halftime) return invalid();
      halftime.state = 'LIVE'; halftime.startedAt = now; break;
    case 'revert-period': {
      if (game.state !== 'LIVE' || !halftime) return invalid();
      const previous = game.periods.find((p) => p.number === halftime.number - 1);
      if (!previous) return invalid();
      halftime.state = 'SCHEDULED'; previous.state = 'LIVE'; previous.endedAt = null; break;
    }
    case 'end':
      if (game.state !== 'LIVE' && game.state !== 'PAUSED') invalid();
      game.state = 'ENDED';
      for (const period of game.periods) if (period.startedAt && period.state !== 'ENDED') {
        if (period.pausedAt) period.pausedTotalMs += Date.parse(now) - Date.parse(period.pausedAt);
        period.pausedAt = null; period.state = 'ENDED'; period.endedAt = now;
      }
      break;
    default: return invalid();
  }
  game.version++;
  return { game, events: state.events };
}

export type FieldDemoEventInput = Pick<GameEventRecord, 'type' | 'period' | 'clockMs' | 'occurredAt' | 'payload'> &
  Partial<Pick<GameEventRecord, 'sideId' | 'participantId' | 'assistParticipantId' | 'reversesEventId'>>;

export function appendFieldDemoEvent(state: FieldDemoState, input: FieldDemoEventInput): FieldDemoState {
  const correction = input.type === 'CORRECTION';
  if (!correction && (state.game.state !== 'LIVE' || !state.game.periods.some((p) => p.state === 'LIVE'))) {
    throw new Error('경기를 시작하거나 재개한 다음 기록해 주세요.');
  }
  if (state.game.state === 'ENDED') throw new Error('종료된 샘플 경기에는 기록을 추가할 수 없어요.');
  if (input.sideId && !state.game.sides.some((s) => s.id === input.sideId)) throw new Error('샘플 팀을 선택해 주세요.');
  if (input.type === 'SUBSTITUTION' && input.sideId && countActiveSubstitutions(input.sideId, state.events) >= 3) {
    throw new Error('샘플 경기의 팀별 교체 3회를 모두 사용했어요.');
  }
  const sequence = state.game.lastSequence + 1;
  const event: GameEventRecord = {
    ...input, payload: structuredClone(input.payload), id: `sample-event-${sequence}`, gameId: state.game.id,
    sequence, clientEventId: `sample-client-${sequence}`, payloadHash: 'sample', receivedAt: input.occurredAt,
    actorUserId: FIELD_DEMO_ACTOR_ID, sideId: input.sideId ?? null, participantId: input.participantId ?? null,
    assistParticipantId: input.assistParticipantId ?? null, reversesEventId: input.reversesEventId ?? null,
  };
  return { game: { ...state.game, version: state.game.version + 1, lastSequence: sequence }, events: [...state.events, event] };
}

export function fieldDemoCommandResult(state: FieldDemoState): GameMutationResult {
  return { gameId: state.game.id, state: state.game.state, version: state.game.version, durableCommandId: `sample-command-${state.game.version}`, replayed: false };
}
