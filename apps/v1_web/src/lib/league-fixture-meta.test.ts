import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1LeagueFixture } from '@/types/league-match';
import { fixtureResultLabel, isUpcomingFixture } from './league-fixture-meta';

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
