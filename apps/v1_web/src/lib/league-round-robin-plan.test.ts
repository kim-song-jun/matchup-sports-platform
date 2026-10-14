import { describe, expect, it } from 'vitest';
import { plannedGameCount, resolveFixturePlan } from './league-round-robin-plan';

describe('리그 대진 계획 — 서버 라운드로빈과 같은 셈', () => {
  it('하루 경기 수가 없으면 하루 한 라운드 — 2팀 단일 1주·홈앤어웨이 2주(옛 기본값 7이 아니다)', () => {
    expect(resolveFixturePlan({ kind: 'single' }, 2, null)).toEqual({ rounds: 1, games: 1, days: 1 });
    expect(resolveFixturePlan({ kind: 'double' }, 2, null)).toEqual({ rounds: 2, games: 2, days: 2 });
  });

  it('홀수 팀은 부전 한 자리를 더한다 — 3팀 단일 3주·3경기, 5팀 홈앤어웨이 10주·20경기', () => {
    expect(resolveFixturePlan({ kind: 'single' }, 3, null)).toEqual({ rounds: 3, games: 3, days: 3 });
    expect(resolveFixturePlan({ kind: 'double' }, 5, null)).toEqual({ rounds: 10, games: 20, days: 10 });
  });

  it('하루 경기 수가 있으면 날짜는 총 경기 ÷ 하루 경기(올림)이고 라운드는 한 바퀴 그대로다', () => {
    // 6팀 단일 = 5라운드 15경기. 하루 4경기면 4일(4+4+4+3).
    expect(resolveFixturePlan({ kind: 'single' }, 6, 4)).toEqual({ rounds: 5, games: 15, days: 4 });
    // 4팀 단일 6경기 · 하루 6경기면 하루에 끝난다.
    expect(resolveFixturePlan({ kind: 'single' }, 4, 6)).toEqual({ rounds: 3, games: 6, days: 1 });
    // 하루 1경기면 경기마다 하루.
    expect(resolveFixturePlan({ kind: 'single' }, 4, 1)).toEqual({ rounds: 3, games: 6, days: 6 });
  });

  it('직접 입력한 주차 수는 날짜 수 — 경기 수는 주차 × 하루 경기 수다', () => {
    expect(resolveFixturePlan({ kind: 'custom', weeks: 7 }, 2, null)).toEqual({ rounds: 7, games: 7, days: 7 });
    // 4팀(라운드당 2경기) · 5주 · 하루 3경기 = 15경기 → 8라운드를 만들어 15경기에서 자른다.
    expect(resolveFixturePlan({ kind: 'custom', weeks: 5 }, 4, 3)).toEqual({ rounds: 8, games: 15, days: 5 });
  });

  it('총 경기 수 방식은 그 수를 채우는 라운드만 만든다 — 4팀 총 5경기면 3라운드, 하루 2경기면 3일', () => {
    expect(resolveFixturePlan({ kind: 'fixtures', count: 5 }, 4, null)).toEqual({ rounds: 3, games: 5, days: 3 });
    expect(resolveFixturePlan({ kind: 'fixtures', count: 5 }, 4, 2)).toEqual({ rounds: 3, games: 5, days: 3 });
    expect(resolveFixturePlan({ kind: 'fixtures', count: 5 }, 4, 5)).toEqual({ rounds: 3, games: 5, days: 1 });
  });

  it('팀이 2개 미만이면 만들 대진이 없지만 입력 칸은 1 이상으로 둔다', () => {
    expect(resolveFixturePlan({ kind: 'single' }, 1, null)).toEqual({ rounds: 1, games: 0, days: 1 });
    expect(plannedGameCount(1, 1)).toBe(0);
  });
});
