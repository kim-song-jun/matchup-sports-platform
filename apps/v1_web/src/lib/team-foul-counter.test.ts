import { describe, expect, it } from 'vitest';
import { deriveFoulCounts } from './team-foul-counter';
import type { GameEventRecord } from '@/types/game-operations';

function foul(id: string, sideId: string, period: number, reversesEventId: string | null = null): GameEventRecord {
  return {
    id, gameId: 'g-1', sequence: Number(id.replace('e', '')), clientEventId: id, payloadHash: 'h',
    type: 'FOUL', sideId, participantId: 'p-1', assistParticipantId: null, period, clockMs: 0,
    occurredAt: '', receivedAt: '', actorUserId: 'u-1', reversesEventId, payload: {},
  };
}

describe('deriveFoulCounts', () => {
  it('counts only FOUL events for the given period, grouped by side', () => {
    const events = [foul('e1', 's-home', 1), foul('e2', 's-home', 1), foul('e3', 's-away', 1), foul('e4', 's-home', 2)];
    expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 2, 's-away': 1 });
  });

  it('excludes a FOUL that has been reversed by a CORRECTION event', () => {
    const original = foul('e1', 's-home', 1);
    const reversal: GameEventRecord = { ...foul('e2', 's-home', 1), type: 'CORRECTION', reversesEventId: 'e1' };
    // 유일한 FOUL이 되돌려졌으므로 이 사이드는 아예 키를 갖지 않는다(0으로
    // 채워진 키가 아니라). TeamFoulCounterBar 등 소비처는 항상
    // `counts[side.id] ?? 0` 으로 읽으므로 이 둘은 동치다 — 여기서는 파생
    // 함수가 실제로 만드는 값을 그대로 검증한다.
    expect(deriveFoulCounts([original, reversal], 1)).toEqual({});
  });

  it('a side with an active (non-reversed) FOUL alongside another side\'s reversed one only counts the active side', () => {
    const activeFoul = foul('e1', 's-away', 1);
    const reversedOriginal = foul('e2', 's-home', 1);
    const reversal: GameEventRecord = { ...foul('e3', 's-home', 1), type: 'CORRECTION', reversesEventId: 'e2' };
    expect(deriveFoulCounts([activeFoul, reversedOriginal, reversal], 1)).toEqual({ 's-away': 1 });
  });
});
