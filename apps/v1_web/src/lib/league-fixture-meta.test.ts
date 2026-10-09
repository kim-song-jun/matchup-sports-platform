import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1LeagueFixture } from '@/types/league-match';
import { fixtureResultLabel, isUpcomingFixture, leagueFixtureMatchupLabel, leagueSideLabel } from './league-fixture-meta';

function fixture(overrides: Partial<V1LeagueFixture>): V1LeagueFixture {
  return {
    teamMatchId: 'tm-1',
    title: '1라운드',
    homeTeamId: 't1',
    awayTeamId: 't2',
    startAt: '2026-09-01T20:00:00.000Z',
    placeName: '성수 풋살장',
    status: 'matched',
    ...overrides,
  };
}

describe('fixtureResultLabel / isUpcomingFixture', () => {
  beforeEach(() => {
    // "지금"을 고정해 startAt 비교가 실행 시각에 흔들리지 않게 한다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('점수가 가려진 대진은 숫자도 "결과 대기"도 아닌 "점수 비공개"다', () => {
    // 서버는 가릴 때 점수를 null 로 내리지 않고 값째 보낼 수도 있다(어드민 상세와 같은
    // 타입을 쓴다) — 플래그가 숫자보다 먼저 판정돼야 확정 점수가 새지 않는다.
    const f = fixture({ startAt: '2026-08-20T20:00:00.000Z', status: 'completed', homeScore: 1, awayScore: 0, scoreHidden: true });
    const result = fixtureResultLabel(f);
    expect(result.text).toBe('점수 비공개');
    expect(result.text).not.toContain('1');
    expect(result).toMatchObject({ hasScore: false, isForfeit: false });
    // '예정' 필터가 이 대진을 주워 담으면 "예정만 보기"에 이미 끝난 경기가 섞인다.
    expect(isUpcomingFixture(f)).toBe(false);
  });

  it('scoreHidden 이 없으면 기존 판정 그대로다', () => {
    const f = fixture({ startAt: '2026-08-20T20:00:00.000Z', status: 'completed', homeScore: 1, awayScore: 0 });
    expect(fixtureResultLabel(f).text).toBe('1 : 0');
  });

  it('킥오프가 미래인 status="matched" 대진은 "예정"이다', () => {
    const f = fixture({ startAt: '2026-09-01T20:00:00.000Z', status: 'matched' });
    expect(fixtureResultLabel(f).text).toBe('예정');
    expect(isUpcomingFixture(f)).toBe(true);
  });

  /**
   * 감사 L-I 핵심 회귀 — 킥오프는 지났는데 결과가 아예 제출되지 않아 status가 여전히
   * 'matched'로 남은 대진. 이 저장소의 리그 대진은 결과가 제출돼야 비로소 status가
   * 'completed'로 바뀌므로(결과 미입력 리마인더가 킥오프+24h에 발화하도록 설계돼 있을
   * 만큼 이 구간은 매 대진마다 최소 하루는 정상적으로 발생한다), status만 보던 이전
   * 버전은 이 케이스를 '예정'으로 잘못 분류했다.
   */
  it('킥오프가 과거인데 결과가 아예 제출되지 않은(status="matched") 대진은 "결과 대기"다 — 예정 아님', () => {
    const f = fixture({ startAt: '2026-08-20T20:00:00.000Z', status: 'matched' });
    expect(fixtureResultLabel(f).text).toBe('결과 대기');
    expect(isUpcomingFixture(f)).toBe(false);
  });

  it('킥오프가 과거이고 status="completed"인데 스코어 미확정인 대진은 "결과 대기"다(기존 동작 유지)', () => {
    const f = fixture({ startAt: '2026-08-20T20:00:00.000Z', status: 'completed' });
    expect(fixtureResultLabel(f).text).toBe('결과 대기');
    expect(isUpcomingFixture(f)).toBe(false);
  });

  it('킥오프 시각이 정확히 지금이면 "결과 대기"로 본다(경계값)', () => {
    const f = fixture({ startAt: '2026-08-27T00:00:00.000Z', status: 'matched' });
    expect(fixtureResultLabel(f).text).toBe('결과 대기');
  });

  it('스코어가 확정된 대진은 킥오프 시각과 무관하게 점수 문구를 보여준다', () => {
    const f = fixture({ startAt: '2026-08-01T20:00:00.000Z', status: 'completed', homeScore: 3, awayScore: 1 });
    expect(fixtureResultLabel(f).text).toBe('3 : 1');
    expect(isUpcomingFixture(f)).toBe(false);
  });

  it('취소된 대진은 킥오프가 지나도 "집계 제외"를 유지한다', () => {
    const f = fixture({ startAt: '2026-08-01T20:00:00.000Z', status: 'cancelled' });
    expect(fixtureResultLabel(f).text).toBe('집계 제외');
    expect(isUpcomingFixture(f)).toBe(false);
  });
});

describe('leagueSideLabel / leagueFixtureMatchupLabel', () => {
  const names = new Map([['t1', '독수리FC'], ['t2', '호랑이FC']]);

  it('팀 id 가 null 이면 자리만 있는 "미정"이고, 모르는 id 와 구분된다', () => {
    const labels = { tbd: '홈팀 미정', unknown: '홈팀' };
    expect(leagueSideLabel(null, names, labels)).toBe('홈팀 미정');
    expect(leagueSideLabel('t1', names, labels)).toBe('독수리FC');
    // 이름 맵에 없는 id 는 "미정"이 아니다 — 팀은 정해졌는데 이름을 못 읽은 것이다.
    expect(leagueSideLabel('ghost', names, labels)).toBe('홈팀');
  });

  it('두 팀이 정해진 경기는 이름 vs 이름이다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: 't2', awaySlotId: null }, names)).toBe('독수리FC vs 호랑이FC');
  });

  it('원정 자리가 없는 기존 부전(bye) 경기는 예전대로 "부전승"이다 — 자리 도입이 기존 표기를 바꾸지 않는다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: null, awaySlotId: null }, names)).toBe('독수리FC 부전승');
    // 구버전 응답처럼 필드 자체가 없는 경우도 같다.
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: null }, names)).toBe('독수리FC 부전승');
  });

  it('원정 자리가 있는데 팀이 비면 부전승이 아니라 "원정팀 미정"이다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: null, awaySlotId: 'slot-2' }, names)).toBe('독수리FC vs 원정팀 미정');
  });

  it('양쪽이 모두 비면 홈팀 미정 vs 원정팀 미정이다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: null, awayTeamId: null, awaySlotId: 'slot-2' }, names)).toBe('홈팀 미정 vs 원정팀 미정');
  });
});
