import { describe, expect, it } from 'vitest';
import type { GameSide } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';
import { commitActionConfirmCopy } from './confirm-copy';

const sides: GameSide[] = [
  {
    id: 'side-home',
    gameId: 'game-1',
    sideKey: 'HOME',
    teamId: null,
    displayNameSnapshot: '홈팀',
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
  },
];

function input(overrides: Pick<EventCaptureCommitInput, 'type'> & Partial<EventCaptureCommitInput>): EventCaptureCommitInput {
  return {
    sideId: 'side-home',
    period: 1,
    clockMs: 60_000,
    occurredAt: '2026-09-30T00:01:00.000Z',
    payload: {},
    ...overrides,
  };
}

describe('commitActionConfirmCopy — 받침에 맞는 조사', () => {
  it('받침 있는 골·파울은 "을", 받침 없는 옐로카드·레드카드는 "를"을 붙인다', () => {
    const title = (event: EventCaptureCommitInput) => commitActionConfirmCopy(event, sides, [], null).title;

    expect(title(input({ type: 'GOAL' }))).toBe('골을 기록할까요?');
    expect(title(input({ type: 'FOUL' }))).toBe('파울을 기록할까요?');
    expect(title(input({ type: 'CARD', payload: { card: 'YELLOW' } }))).toBe('옐로카드를 기록할까요?');
    expect(title(input({ type: 'CARD', payload: { card: 'RED' } }))).toBe('레드카드를 기록할까요?');
  });

  it('시계 경고 병합 문구에도 같은 조사를 쓴다', () => {
    const { message } = commitActionConfirmCopy(input({ type: 'GOAL' }), sides, [], 40);

    expect(message).toContain('전반 1:00에 골을 기록해요.');
    expect(message).not.toContain('(를)');
  });
});
