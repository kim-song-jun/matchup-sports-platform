/**
 * 종목 칩의 계약은 두 가지다 — **종목만 담을 것**, 그리고 **걸리지 않는 링크를 만들지 말 것**.
 * 서버 프리렌더가 이 함수를 마스터 종목 없이도 호출하므로 두 경로를 모두 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { buildTeamSportChips, toTeam } from './teams.card-model';
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

/**
 * 소개문 폴백 (2026-09-07 · 사용자 확정).
 *
 * 예전엔 `introductionPreview` 가 없으면 `{지역}에서 활동하는 {종목} 팀이에요.` 를 만들어
 * 넣었다. 그 문장은 카드 바로 윗줄(`풋살 · 서울 전체 · 4/24명`)과 **같은 말**이라 정보가
 * 되지 않으면서 ~35px 를 먹었다 — alpha 실측에서 50팀 중 **25팀**이 그 문장을 보여줬다.
 * 모르는 것을 문장으로 만들지 않는다.
 */
describe('toTeam — 소개문', () => {
  const base = getTeamListViewModel().teams[0];
  // `as never` 로 캐스팅하면 타입 검사가 통째로 꺼져 `toTeam` 이 실제로 읽는 필드가 빠져도
  // 컴파일러가 못 잡는다(#1105 Copilot). 같은 파일 위쪽과 같은 `Partial<T>` → `T` 패턴을 쓴다.
  const api = (over: Partial<V1Team>): V1Team => ({
    id: 't1', name: '팀', sport: { id: 's', name: '풋살' }, region: { id: 'r', name: '서울 전체' },
    memberCount: 4, ...over,
  } as unknown as V1Team);

  it('서버가 소개를 안 주면 빈 문자열이다 — 지역·종목으로 문장을 만들지 않는다', () => {
    const intro = toTeam(api({}), base).intro;

    expect(intro).toBe('');
    expect(intro).not.toMatch(/에서 활동하는/);
  });

  it('서버가 준 소개는 그대로 쓴다', () => {
    expect(toTeam(api({ introductionPreview: '매주 토요일에 모여요' }), base).intro).toBe('매주 토요일에 모여요');
  });
});
