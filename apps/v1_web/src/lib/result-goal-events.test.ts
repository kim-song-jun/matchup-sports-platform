import { describe, expect, it } from 'vitest';
import type { GameResultGoalEventInput } from '@/hooks/use-tournament-result-review';
import { correctionGoalEventsPayload } from './result-goal-events';

const goal = { id: 'g1', sideId: 'home', ownGoal: false, anonymous: true } as GameResultGoalEventInput;

describe('correctionGoalEventsPayload (MD-QA #94)', () => {
  it('득점 기록 없이 점수만 확정된 경기에서 행을 추가하지 않으면 필드를 생략한다', () => {
    expect(correctionGoalEventsPayload([], [])).toBeUndefined();
  });

  it('점수만 확정된 경기라도 득점 행을 추가했으면 그대로 보낸다', () => {
    expect(correctionGoalEventsPayload([], [goal])).toEqual([goal]);
  });

  it('원래 득점 기록이 있던 경기에서 전부 지웠으면 빈 배열을 보내 서버 검증을 받는다', () => {
    expect(correctionGoalEventsPayload([goal], [])).toEqual([]);
  });
});
