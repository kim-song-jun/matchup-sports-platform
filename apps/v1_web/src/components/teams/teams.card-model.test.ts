/**
 * 종목 칩의 계약은 두 가지다 — **종목만 담을 것**, 그리고 **걸리지 않는 링크를 만들지 말 것**.
 * 서버 프리렌더가 이 함수를 마스터 종목 없이도 호출하므로 두 경로를 모두 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { buildTeamSportChips } from './teams.card-model';
import { getTeamListViewModel } from './teams.view-model';
import type { V1Sport, V1Team } from '@/types/api';

const base = getTeamListViewModel();

function team(sportName: string, id = sportName): V1Team {
  return { id, teamId: id, name: `${sportName} 팀`, sportName, regionName: '서울', memberCount: 5 } as unknown as V1Team;
}

describe('buildTeamSportChips', () => {
  it('마스터 종목이 있으면 그 ID 로 필터 링크를 만든다', () => {
    const sports = [{ id: 'uuid-futsal', name: '풋살', levels: [] }] as unknown as V1Sport[];

    const chips = buildTeamSportChips([team('풋살')], base, new URLSearchParams(), undefined, sports);

    expect(chips[1]).toMatchObject({ label: '풋살', count: 1, href: '/teams?sportId=uuid-futsal' });
  });

  it('마스터 종목이 없으면 실제 팀 목록의 종목을 많은 순으로 쓴다', () => {
    const chips = buildTeamSportChips(
      [team('풋살', 'a'), team('풋살', 'b'), team('농구', 'c')],
      base,
      new URLSearchParams(),
    );

    expect(chips.slice(1).map((chip) => chip.label)).toEqual(['풋살', '농구']);
    expect(chips[1].count).toBe(2);
  });

  it('마스터 종목이 없으면 종목 칩에 링크를 붙이지 않는다 — ID 를 모르므로', () => {
    const chips = buildTeamSportChips([team('풋살')], base, new URLSearchParams());

    // '전체' 칩은 sportId 없이도 유효한 링크다.
    expect(chips[0].href).toBe('/teams');
    expect(chips.slice(1).every((chip) => chip.href === undefined)).toBe(true);
  });

  it('base 뷰모델의 비종목 칩을 종목 자리에 쓰지 않는다', () => {
    // base.chips 는 '가입 가능 / 내 주변 / 초보-중수 / 주 1회' — 종목이 아니다.
    const chips = buildTeamSportChips([team('풋살')], base, new URLSearchParams());

    const labels = chips.map((chip) => chip.label);
    for (const notASport of ['가입 가능', '내 주변', '초보-중수', '주 1회']) {
      expect(labels).not.toContain(notASport);
    }
  });

  it('팀이 하나도 없으면 종목 칩도 없다 — 없는 종목을 지어내지 않는다', () => {
    const chips = buildTeamSportChips([], base, new URLSearchParams());

    expect(chips).toHaveLength(1);
    expect(chips[0].count).toBe(0);
  });
});
