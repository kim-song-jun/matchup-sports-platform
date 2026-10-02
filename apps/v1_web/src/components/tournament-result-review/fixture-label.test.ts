import { describe, expect, it } from 'vitest';
import { buildLeagueFixtureTitles, resolveFixtureLabel } from './fixture-label';
import type { V1LeagueFixture } from '@/types/league-match';

/**
 * **이 함수의 유일한 위험은 키 정합성이다.**
 *
 * 맵은 `fixture.teamMatchId` 로 만들고 조회는 보드 아이템의 `item.fixtureId` 로 한다 — 둘이
 * 같은 id 라는 전제 위에 서 있다(리그 보드 행이 팀매치 id 를 `fixtureId` 로 낸다). 픽커
 * 테스트는 **이미 만들어진 맵을 넘겨** 이 함수를 지나치므로, 그 전제가 깨지는 날
 * **전 리그 행이 조용히 "경기" 로 떨어지는데 아무 테스트도 안 깨진다.** 여기서 그 키를 못 박는다.
 */
const fixture = (over: Partial<V1LeagueFixture>): V1LeagueFixture =>
  ({ teamMatchId: 'tm-1', title: '2주차 1경기', ...over }) as V1LeagueFixture;

describe('buildLeagueFixtureTitles', () => {
  it('팀매치 id 를 키로 제목을 담는다 — 보드가 그 id 로 찾는다', () => {
    const map = buildLeagueFixtureTitles([fixture({})]);

    expect(map.get('tm-1')).toBe('2주차 1경기');
  });

  it('여러 대진을 각자의 id 로 담는다', () => {
    const map = buildLeagueFixtureTitles([
      fixture({ teamMatchId: 'tm-1', title: '1주차 1경기' }),
      fixture({ teamMatchId: 'tm-2', title: '2주차 1경기' }),
    ]);

    expect(map.get('tm-1')).toBe('1주차 1경기');
    expect(map.get('tm-2')).toBe('2주차 1경기');
    expect(map.size).toBe(2);
  });

  it('없으면 빈 맵 — 대회 상세에는 `leagueFixtures` 가 아예 없다', () => {
    expect(buildLeagueFixtureTitles(undefined).size).toBe(0);
  });
});

// 같은 경기는 어디서나 같은 이름이다(2026-10-02 확정) — 결과 검토 목록의 부제도 같은 규칙을 쓴다.
describe('resolveFixtureLabel — 경기 이름', () => {
  const item = (over: { round?: string; fixtureNumber?: number; legNumber?: number; groupName?: string | null }) => ({
    fixtureId: 'fx-1',
    round: 'league_r2',
    fixtureNumber: 3,
    legNumber: 1 as number | null,
    groupName: 'A조' as string | null,
    ...over,
  });
  const teams = { home: '성수 FC', away: '망원 FC' };

  it('조 경기는 조 이름과 라운드를 쓴다', () => {
    expect(resolveFixtureLabel(item({}), teams, new Map())).toEqual({
      title: '성수 FC vs 망원 FC',
      subtitle: 'A조 · 조별리그 2라운드 · 3번 경기',
    });
  });

  it('결선은 조 이름 없이 라운드만 쓴다', () => {
    expect(resolveFixtureLabel(item({ round: 'semi', fixtureNumber: 9, groupName: '본선' }), teams, new Map()).subtitle)
      .toBe('4강 · 9번 경기');
  });

  it('결선 2차전은 차수를 붙인다', () => {
    expect(resolveFixtureLabel(item({ round: 'semi', fixtureNumber: 10, legNumber: 2, groupName: null }), teams, new Map()).subtitle)
      .toBe('4강 2차 · 10번 경기');
  });

  it('조가 없으면 라운드만 쓴다 — 팀 이름을 모를 때도 같다', () => {
    expect(resolveFixtureLabel(item({ groupName: null }), undefined, new Map())).toEqual({
      title: '3번 경기',
      subtitle: '조별리그 2라운드 · 3번 경기',
    });
  });
});
