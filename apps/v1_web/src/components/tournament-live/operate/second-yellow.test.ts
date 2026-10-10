import { describe, expect, it } from 'vitest';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { GameEventRecord } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';
import { isSecondYellowWithoutRed } from './second-yellow';

let seq = 0;
function card(participantId: string | null, color: 'YELLOW' | 'RED', overrides: Partial<GameEventRecord> = {}): GameEventRecord {
  seq += 1;
  return {
    id: `event-${seq}`,
    gameId: 'game-1',
    sequence: seq,
    clientEventId: `client-${seq}`,
    payloadHash: 'hash',
    type: 'CARD',
    sideId: 'side-home',
    participantId,
    assistParticipantId: null,
    period: 1,
    clockMs: 60_000,
    occurredAt: '2026-10-11T00:00:00.000Z',
    receivedAt: '2026-10-11T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
    payload: { card: color },
    ...overrides,
  };
}

function reversal(target: GameEventRecord): GameEventRecord {
  return { ...card(target.participantId, 'YELLOW'), type: 'CORRECTION', reversesEventId: target.id, payload: {} };
}

function queued(participantId: string, color: 'YELLOW' | 'RED', status: QueuedGameEvent['status']): QueuedGameEvent {
  return {
    clientEventId: `q-${participantId}-${color}-${status}`,
    gameId: 'game-1',
    expectedVersion: 1,
    event: { type: 'CARD', sideId: 'side-home', participantId, period: 1, clockMs: 1, occurredAt: '', payload: { card: color } },
    payloadHash: 'h',
    status,
    queuedAt: '',
    attempts: 0,
    lastError: null,
    ackedSequence: null,
    ackedVersion: null,
  };
}

function committing(participantId: string | undefined, color: 'YELLOW' | 'RED' = 'YELLOW', type: EventCaptureCommitInput['type'] = 'CARD'): EventCaptureCommitInput {
  return {
    type,
    participantId,
    sideId: 'side-home',
    period: 1,
    clockMs: 90_000,
    occurredAt: '2026-10-11T00:01:30.000Z',
    payload: type === 'CARD' ? { card: color } : {},
  };
}

describe('isSecondYellowWithoutRed', () => {
  it('같은 선수의 첫 옐로에는 묻지 않는다', () => {
    expect(isSecondYellowWithoutRed([], [], committing('p-1'))).toBe(false);
  });

  it('같은 선수에게 이미 옐로가 하나 있으면 두 번째 옐로에서 묻는다', () => {
    expect(isSecondYellowWithoutRed([card('p-1', 'YELLOW')], [], committing('p-1'))).toBe(true);
  });

  it('다른 선수의 옐로는 세지 않는다', () => {
    expect(isSecondYellowWithoutRed([card('p-2', 'YELLOW')], [], committing('p-1'))).toBe(false);
  });

  it('이미 레드가 있는 선수에게는 묻지 않는다', () => {
    expect(isSecondYellowWithoutRed([card('p-1', 'YELLOW'), card('p-1', 'RED')], [], committing('p-1'))).toBe(false);
    expect(isSecondYellowWithoutRed([card('p-1', 'YELLOW')], [queued('p-1', 'RED', 'queued')], committing('p-1'))).toBe(false);
  });

  it('취소한 옐로는 세지 않는다', () => {
    const first = card('p-1', 'YELLOW');
    expect(isSecondYellowWithoutRed([first, reversal(first)], [], committing('p-1'))).toBe(false);
  });

  it('취소한 레드는 막지 않는다', () => {
    const red = card('p-1', 'RED');
    expect(isSecondYellowWithoutRed([card('p-1', 'YELLOW'), red, reversal(red)], [], committing('p-1'))).toBe(true);
  });

  it('아직 서버에 닿지 않은 대기·전송 중 옐로도 센다', () => {
    expect(isSecondYellowWithoutRed([], [queued('p-1', 'YELLOW', 'queued')], committing('p-1'))).toBe(true);
    expect(isSecondYellowWithoutRed([], [queued('p-1', 'YELLOW', 'sending')], committing('p-1'))).toBe(true);
  });

  it('실패한 전송은 기록되지 않았으니 세지 않고, 이미 확정된 항목은 이벤트 목록에서만 센다', () => {
    expect(isSecondYellowWithoutRed([], [queued('p-1', 'YELLOW', 'failed')], committing('p-1'))).toBe(false);
    expect(isSecondYellowWithoutRed([card('p-1', 'YELLOW')], [queued('p-1', 'YELLOW', 'acked')], committing('p-1'))).toBe(true);
  });

  it('세 번째 옐로(두 번째에서 옐로만 두기로 한 뒤)에는 다시 묻지 않는다', () => {
    expect(isSecondYellowWithoutRed([card('p-1', 'YELLOW'), card('p-1', 'YELLOW')], [], committing('p-1'))).toBe(false);
  });

  it('옐로가 아닌 기록에는 묻지 않는다', () => {
    const events = [card('p-1', 'YELLOW')];
    expect(isSecondYellowWithoutRed(events, [], committing('p-1', 'RED'))).toBe(false);
    expect(isSecondYellowWithoutRed(events, [], committing('p-1', 'YELLOW', 'FOUL'))).toBe(false);
  });

  it('선수 없이 기록되는 이벤트에는 묻지 않는다', () => {
    expect(isSecondYellowWithoutRed([card(null, 'YELLOW')], [], committing(undefined))).toBe(false);
  });
});
