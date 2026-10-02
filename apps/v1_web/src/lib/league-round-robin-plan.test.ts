import { describe, expect, it } from 'vitest';
import { plannedGameCount, repeatedRounds, resolveWeeksCount, suggestedWeeks } from './league-round-robin-plan';

describe('팀 수로 주차 수 제안(F40) — 서버 라운드로빈과 같은 셈', () => {
  it('2팀이면 단일 1주·홈앤어웨이 2주 — 옛 기본값 7(같은 대진 7번)이 아니다', () => {
    expect(suggestedWeeks(2, 1)).toBe(1);
    expect(suggestedWeeks(2, 2)).toBe(2);
    expect(plannedGameCount(2, 1)).toBe(1);
    expect(plannedGameCount(2, 2)).toBe(2);
  });

  it('홀수 팀은 부전 한 자리를 더한다 — 3팀 단일 3주·3경기, 5팀 홈앤어웨이 10주', () => {
    expect(suggestedWeeks(3, 1)).toBe(3);
    expect(plannedGameCount(3, 3)).toBe(3);
    expect(suggestedWeeks(5, 2)).toBe(10);
  });

  it('짝수 팀은 팀 수 − 1 라운드 — 4팀 단일 3주·6경기, 6팀 단일 5주·15경기', () => {
    expect(suggestedWeeks(4, 1)).toBe(3);
    expect(plannedGameCount(4, 3)).toBe(6);
    expect(suggestedWeeks(6, 1)).toBe(5);
    expect(plannedGameCount(6, 5)).toBe(15);
  });

  it('팀당 하루 여러 경기면 주차가 그만큼 줄어든다(올림) — 남는 칸은 서버가 앞 라운드를 다시 돌려 채운다', () => {
    // 4팀 단일 3라운드 · 하루 2경기 → 2주 = 4라운드: 서버가 4라운드째에 1라운드 대진을 한 번 더 만든다(6 + 2경기).
    expect(suggestedWeeks(4, 1, 2)).toBe(2);
    expect(plannedGameCount(4, 2, 2)).toBe(8);
    expect(repeatedRounds(4, 1, 2)).toBe(1);
    // 홈앤어웨이 6라운드 · 하루 4경기 → 2주 = 8라운드: 2개가 다시 열린다.
    expect(repeatedRounds(4, 2, 4)).toBe(2);
  });

  it('라운드가 주차에 딱 나눠지면 다시 여는 라운드가 없다', () => {
    expect(repeatedRounds(4, 1, 1)).toBe(0);
    expect(repeatedRounds(4, 1, 3)).toBe(0);
    expect(repeatedRounds(4, 2, 2)).toBe(0);
    expect(repeatedRounds(1, 1, 2)).toBe(0);
  });

  it('직접 입력한 주차는 그대로 쓰고, 기본은 단일 제안값이다', () => {
    expect(resolveWeeksCount({ kind: 'single' }, 2)).toBe(1);
    expect(resolveWeeksCount({ kind: 'double' }, 2)).toBe(2);
    expect(resolveWeeksCount({ kind: 'custom', weeks: 7 }, 2)).toBe(7);
  });

  it('팀이 2개 미만이면 만들 대진이 없지만 입력 칸은 1 이상으로 둔다', () => {
    expect(suggestedWeeks(1, 1)).toBe(1);
    expect(plannedGameCount(1, 1)).toBe(0);
  });
});
