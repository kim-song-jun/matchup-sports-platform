import { describe, expect, it } from 'vitest';
import type { V1GameRosterPerson } from '@/hooks/use-v1-game-roster';
import { nextPlayerWithoutJersey } from './game-roster-jersey-sheet';

const person = (userId: string, jerseyNumber: number | null, overrides: Partial<V1GameRosterPerson> = {}): V1GameRosterPerson => ({
  userId,
  displayName: userId,
  jerseyNumber,
  accountLinked: true,
  participantId: `tp-${userId}`,
  ...overrides,
});

describe('nextPlayerWithoutJersey', () => {
  const list = [person('a', 4), person('b', null), person('c', 9), person('d', null), person('e', null)];

  it('현재 선수 뒤에서 번호 없는 다음 선수를 고른다 — 번호가 있는 선수는 건너뛴다', () => {
    expect(nextPlayerWithoutJersey(list, 'b')?.userId).toBe('d');
    expect(nextPlayerWithoutJersey(list, 'a')?.userId).toBe('b');
  });

  it('뒤에 없으면 앞쪽의 번호 없는 선수로 돌아간다', () => {
    expect(nextPlayerWithoutJersey(list, 'e')?.userId).toBe('b');
  });

  it('번호 없는 선수가 현재 선수뿐이면 null', () => {
    expect(nextPlayerWithoutJersey([person('a', 4), person('b', null)], 'b')).toBeNull();
    expect(nextPlayerWithoutJersey([], 'b')).toBeNull();
  });

  it('참가 명단 행이 없는(저장할 수 없는) 선수는 다음 대상이 아니다', () => {
    const withFallback = [person('a', null), person('b', null, { participantId: null, accountLinked: false }), person('c', null)];
    expect(nextPlayerWithoutJersey(withFallback, 'a')?.userId).toBe('c');
  });
});
