import { describe, expect, it } from 'vitest';
import { cardPlayerKey, pairSecondYellowRed, type CardFacts } from './second-yellow-red';

interface Row {
  readonly id: string;
  readonly facts: CardFacts | null;
}

const spot = { sideKey: 'home', period: 2, clockMs: 31 * 60_000 };
const card = (id: string, color: 'YELLOW' | 'RED', overrides: Partial<CardFacts> = {}): Row => ({
  id,
  facts: { color, playerKey: 'id:p7', ...spot, ...overrides },
});
const pair = (rows: Row[]) => pairSecondYellowRed(rows, (row) => row.facts);
const pairedIds = (rows: Row[]) => {
  const result = pair(rows);
  return Array.from(result.yellowOfRed, ([red, yellow]) => [red.id, yellow.id]);
};

describe('pairSecondYellowRed', () => {
  it('같은 선수의 두 번째 옐로와 같은 시각의 레드를 한 쌍으로 묶고 옐로를 줄에서 뺀다', () => {
    const first = card('y1', 'YELLOW', { period: 1, clockMs: 11 * 60_000 });
    const second = card('y2', 'YELLOW');
    const red = card('r1', 'RED');
    const result = pair([first, second, red]);
    expect(pairedIds([first, second, red])).toEqual([['r1', 'y2']]);
    expect(result.absorbedYellows.has(second)).toBe(true);
    expect(result.absorbedYellows.has(first)).toBe(false);
  });

  it('첫 옐로가 전반, 두 번째 옐로와 레드가 후반이어도 묶는다', () => {
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW'),
      card('r1', 'RED'),
    ])).toEqual([['r1', 'y2']]);
  });

  it('같은 시각 정렬이 뒤집혀 레드가 옐로보다 먼저 와도 묶는다', () => {
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('r1', 'RED'),
      card('y2', 'YELLOW'),
    ])).toEqual([['r1', 'y2']]);
  });

  it('옐로 한 장과 같은 시각의 레드는 경고 누적이 아니라서 묶지 않는다', () => {
    expect(pairedIds([card('y1', 'YELLOW'), card('r1', 'RED')])).toEqual([]);
  });

  it('옐로 없이 받은 직접 퇴장은 묶지 않는다', () => {
    expect(pairedIds([card('r1', 'RED')])).toEqual([]);
  });

  it('레드가 두 번째 옐로와 다른 시각이면 묶지 않는다', () => {
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW'),
      card('r1', 'RED', { clockMs: 33 * 60_000 }),
    ])).toEqual([]);
  });

  it('피리어드나 팀이 다르면 묶지 않는다', () => {
    const base = [card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }), card('y2', 'YELLOW')];
    expect(pairedIds([...base, card('r1', 'RED', { period: 1 })])).toEqual([]);
    expect(pairedIds([...base, card('r1', 'RED', { sideKey: 'away' })])).toEqual([]);
  });

  it('다른 선수의 옐로와는 묶지 않는다', () => {
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW'),
      card('r1', 'RED', { playerKey: 'id:p9' }),
    ])).toEqual([]);
  });

  it('선수를 알아볼 수 없는 기록(키 없음)은 묶지 않는다', () => {
    expect(pairedIds([
      card('y1', 'YELLOW', { playerKey: null, period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW', { playerKey: null }),
      card('r1', 'RED', { playerKey: null }),
    ])).toEqual([]);
  });

  it('시각이나 피리어드를 모르는 기록은 묶지 않는다', () => {
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW', { clockMs: null }),
      card('r1', 'RED', { clockMs: null }),
    ])).toEqual([]);
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW', { period: null }),
      card('r1', 'RED', { period: null }),
    ])).toEqual([]);
  });

  it('되돌려진 레드나 되돌려진 옐로는 묶지 않고, 되돌려진 옐로는 앞선 옐로 수에도 세지 않는다', () => {
    const first = card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 });
    expect(pairedIds([first, card('y2', 'YELLOW'), card('r1', 'RED', { cancelled: true })])).toEqual([]);
    expect(pairedIds([first, card('y2', 'YELLOW', { cancelled: true }), card('r1', 'RED')])).toEqual([]);
    // 첫 옐로가 되돌려졌다면 남은 옐로는 한 장뿐이라 경고 누적이 아니다.
    expect(pairedIds([
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000, cancelled: true }),
      card('y2', 'YELLOW'),
      card('r1', 'RED'),
    ])).toEqual([]);
  });

  it('카드가 아닌 항목과 색을 모르는 카드는 건너뛴다', () => {
    expect(pairedIds([
      { id: 'goal', facts: null },
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      { id: 'legacy', facts: { color: null, playerKey: 'id:p7', ...spot } },
      card('y2', 'YELLOW'),
      card('r1', 'RED'),
    ])).toEqual([['r1', 'y2']]);
  });

  it('서로 다른 두 선수의 경고 누적은 각각 묶는다', () => {
    const rows = [
      card('a1', 'YELLOW', { playerKey: 'id:a', period: 1, clockMs: 5 * 60_000 }),
      card('b1', 'YELLOW', { playerKey: 'id:b', sideKey: 'away', period: 1, clockMs: 6 * 60_000 }),
      card('a2', 'YELLOW', { playerKey: 'id:a' }),
      card('ar', 'RED', { playerKey: 'id:a' }),
      card('b2', 'YELLOW', { playerKey: 'id:b', sideKey: 'away' }),
      card('br', 'RED', { playerKey: 'id:b', sideKey: 'away' }),
    ];
    expect(pairedIds(rows)).toEqual([['ar', 'a2'], ['br', 'b2']]);
  });

  it('레드 하나는 옐로 하나만 흡수하고, 같은 옐로를 두 번 쓰지 않는다', () => {
    const rows = [
      card('y1', 'YELLOW', { period: 1, clockMs: 5 * 60_000 }),
      card('y2', 'YELLOW'),
      card('r1', 'RED'),
      card('r2', 'RED'),
    ];
    expect(pairedIds(rows)).toEqual([['r1', 'y2']]);
  });
});

describe('cardPlayerKey', () => {
  it('선수 id 가 있으면 id 로, 없으면 이름과 등번호로 알아보고, 둘 다 없으면 null 이다', () => {
    expect(cardPlayerKey({ participantId: 'p7', participantName: '홍길동', jerseyNumber: 7 })).toBe('id:p7');
    expect(cardPlayerKey({ participantId: null, participantName: '홍길동', jerseyNumber: 7 })).toBe('name:7:홍길동');
    expect(cardPlayerKey({ participantName: '홍길동', jerseyNumber: null })).toBe('name::홍길동');
    expect(cardPlayerKey({ participantId: null, participantName: null, jerseyNumber: 7 })).toBeNull();
    expect(cardPlayerKey({})).toBeNull();
  });
});
