import { describe, expect, it } from 'vitest';
import { findRecentGoalEvent } from './find-recent-goal-event';
import type { GameEventRecord } from '@/types/game-operations';

function goalEvent(id: string, participantId: string, clockMs: number): GameEventRecord {
  return {
    id, gameId: 'g-1', sequence: Number(id.replace('e', '')), clientEventId: id, payloadHash: 'h',
    type: 'GOAL', sideId: 's-home', participantId, assistParticipantId: null, period: 1, clockMs,
    occurredAt: '', receivedAt: '', actorUserId: 'u-1', reversesEventId: null, payload: {},
  };
}

describe('findRecentGoalEvent — B3 토스트 "어시스트 추가" 액션이 공유하는 매칭 로직', () => {
  it('participantId + clockMs가 같은 가장 최근 GOAL 이벤트를 찾는다', () => {
    const events = [goalEvent('e1', 'p-jung', 60000), goalEvent('e2', 'p-cho', 60000), goalEvent('e3', 'p-jung', 120000)];
    expect(findRecentGoalEvent(events, { participantId: 'p-jung', clockMs: 120000 })).toBe(events[2]);
  });

  it('participantId/clockMs가 같아도 GOAL이 아닌 이벤트는 무시한다', () => {
    const foul: GameEventRecord = { ...goalEvent('e1', 'p-jung', 60000), type: 'FOUL' };
    expect(findRecentGoalEvent([foul], { participantId: 'p-jung', clockMs: 60000 })).toBeUndefined();
  });

  it('일치하는 이벤트가 없으면 undefined를 반환한다', () => {
    expect(findRecentGoalEvent([], { participantId: 'p-jung', clockMs: 60000 })).toBeUndefined();
  });
});
