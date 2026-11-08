import { orderRulesByRank } from './multi-finals-plan';
import { crossGroupTopThree, CROSS_GROUP_LANES, validCrossGroupTopThree } from './multi-finals-seeding';
import { savedTiePicks } from './multi-finals-standings';
import { crossSeedGroups, validateTiePicks, type TiePickFinal } from './multi-finals-tie-picks';

const GROUP_ORDER = ['A', 'B', 'C', 'D'];
const rules = GROUP_ORDER.flatMap(groupId => [1, 2, 3].map(rank => ({ groupId, rank })));
const tied = (groupId: string, rank: number, tiedRegistrationIds: string[]) => ({ groupId, rank, state: 'tied', tiedRegistrationIds });
/** Mirrors a view final: settled ranks are `<group><rank>`, the open seats are left out of `suggestedRegistrationIds` in rule order. */
function finalWith(open: Array<ReturnType<typeof tied>>): TiePickFinal {
  const isOpen = (rule: { groupId: string; rank: number }) => open.some(seat => seat.groupId === rule.groupId && seat.rank === rule.rank);
  return { rules, unresolved: open, suggestedRegistrationIds: rules.filter(rule => !isOpen(rule)).map(rule => `${rule.groupId}${rule.rank}`) };
}
// B's 2nd and 3rd places were separated only by the draw: b2 and b3 are tied.
const secondThirdTied = finalWith([tied('B', 2, ['B2', 'B3']), tied('B', 3, ['B2', 'B3'])]);
const bothPicked = [{ groupId: 'B', rank: 2, registrationId: 'B3' }, { groupId: 'B', rank: 3, registrationId: 'B2' }];

const rejection = (run: () => unknown) => { try { run(); } catch (error) { return error as { getStatus(): number; getResponse(): { code: string; message: string } }; } throw new Error('expected a rejection'); };

describe('동률 자리에서 고른 팀 검증', () => {
  it('동률 자리의 후보 팀을 자리마다 한 팀씩 고르면 자리 → 팀 표가 된다', () => {
    expect([...validateTiePicks(secondThirdTied, bothPicked)]).toEqual([['B:2', 'B3'], ['B:3', 'B2']]);
    expect(validateTiePicks(secondThirdTied, []).size).toBe(0);
  });

  it('동률 팀이 아닌 팀을 고르면 422 MULTI_FINAL_INVALID 로 거절한다', () => {
    const error = rejection(() => validateTiePicks(secondThirdTied, [{ groupId: 'B', rank: 2, registrationId: 'B1' }]));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID', message: '그 자리의 동률 팀 중에서 골라 주세요.' });
  });

  it('같은 팀을 두 자리에 고르면 거절한다', () => {
    const error = rejection(() => validateTiePicks(secondThirdTied, [bothPicked[0], { groupId: 'B', rank: 3, registrationId: 'B3' }]));
    expect(error.getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID', message: '동률 자리마다 다른 팀을 골라 주세요.' });
  });

  it('한 자리를 두 번 고르면 거절한다', () => {
    const error = rejection(() => validateTiePicks(secondThirdTied, [bothPicked[0], { groupId: 'B', rank: 2, registrationId: 'B2' }]));
    expect(error.getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID', message: '동률 자리마다 다른 팀을 골라 주세요.' });
  });

  it('동률이 아닌 자리와 이 토너먼트에 없는 자리를 고르려 하면 거절한다', () => {
    for (const pick of [{ groupId: 'B', rank: 1, registrationId: 'B1' }, { groupId: 'Z', rank: 2, registrationId: 'B2' }, { groupId: 'B', rank: 9, registrationId: 'B2' }]) {
      expect(rejection(() => validateTiePicks(secondThirdTied, [pick])).getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID', message: '동률인 자리에서만 팀을 고를 수 있어요.' });
    }
  });

  it('예선이 덜 끝나 동률이 아닌 이유로 비워진 자리는 고를 수 없다', () => {
    const incomplete = { ...secondThirdTied, unresolved: [{ groupId: 'B', rank: 2, state: 'group_incomplete', tiedRegistrationIds: [] }] };
    expect(() => validateTiePicks(incomplete, [bothPicked[0]])).toThrow();
  });
});

describe('교차 배치용 조별 1~3위 (crossSeedGroups)', () => {
  it('동률이 없으면 추천 순위가 그대로 조 순서대로 나온다', () => {
    const groups = crossSeedGroups(finalWith([]), GROUP_ORDER);
    expect(groups).toEqual(GROUP_ORDER.map(id => ({ id, ranks: [`${id}1`, `${id}2`, `${id}3`] })));
  });

  it('규칙이 서버가 저장하는 순위 우선 시드 순서여도 자리마다 같은 팀이 나온다', () => {
    const stored = orderRulesByRank(rules, GROUP_ORDER);
    expect(stored.slice(0, 5)).toEqual([{ groupId: 'A', rank: 1 }, { groupId: 'B', rank: 1 }, { groupId: 'C', rank: 1 }, { groupId: 'D', rank: 1 }, { groupId: 'A', rank: 2 }]);
    const open = [tied('B', 2, ['B2', 'B3']), tied('B', 3, ['B2', 'B3'])];
    const isOpen = (rule: { groupId: string; rank: number }) => open.some(seat => seat.groupId === rule.groupId && seat.rank === rule.rank);
    const final = { rules: stored, unresolved: open, suggestedRegistrationIds: stored.filter(rule => !isOpen(rule)).map(rule => `${rule.groupId}${rule.rank}`) };
    expect(crossSeedGroups(final, GROUP_ORDER, bothPicked)).toEqual(crossSeedGroups(secondThirdTied, GROUP_ORDER, bothPicked));
  });

  it('조 순서는 규칙 배열이 아니라 넘겨준 조 순서를 따른다', () => {
    expect(crossSeedGroups(finalWith([]), ['D', 'C', 'B', 'A']).map(group => group.id)).toEqual(['D', 'C', 'B', 'A']);
  });

  it('고른 팀이 그 순위 자리에 들어가고 나머지 순위는 그대로다', () => {
    const groups = crossSeedGroups(secondThirdTied, GROUP_ORDER, bothPicked);
    expect(groups.find(group => group.id === 'B')!.ranks).toEqual(['B1', 'B3', 'B2']);
    expect(groups.filter(group => group.id !== 'B').map(group => group.ranks)).toEqual([['A1', 'A2', 'A3'], ['C1', 'C2', 'C3'], ['D1', 'D2', 'D3']]);
  });

  it('동률 자리를 하나라도 고르지 않았으면 409 MULTI_FINAL_RANK_TIED 와 안내 문구로 막는다', () => {
    for (const picks of [[], [bothPicked[0]], [bothPicked[1]]]) {
      const error = rejection(() => crossSeedGroups(secondThirdTied, GROUP_ORDER, picks));
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toEqual({ code: 'MULTI_FINAL_RANK_TIED', message: '동률 자리에 올릴 팀을 먼저 골라 주세요.' });
    }
  });

  it('동률이 아닌 이유로 비워진 자리가 있으면 동률 안내가 아니라 422 로 막는다', () => {
    const incomplete = { ...secondThirdTied, unresolved: [{ groupId: 'B', rank: 2, state: 'group_incomplete', tiedRegistrationIds: [] }] };
    const error = rejection(() => crossSeedGroups(incomplete, GROUP_ORDER));
    expect(error.getStatus()).toBe(422);
  });

  it('고른 팀은 추첨 결과와 상관없이 고른 순위의 칸에 앉는다', () => {
    // B is the 2nd lane group (index 1): its 2nd place sits in the previous group's lane, its 3rd place in one of the four 3rd-place seats.
    const groups = crossSeedGroups(secondThirdTied, GROUP_ORDER, bothPicked);
    let possibilities = 0;
    crossGroupTopThree(groups, limit => { possibilities = limit; return 0; });
    expect(possibilities).toBeGreaterThan(1);
    for (let choice = 0; choice < possibilities; choice++) {
      const seeds = crossGroupTopThree(groups, () => choice);
      expect(validCrossGroupTopThree(groups, seeds)).toBe(true);
      expect(seeds[1]).toBe('B1');
      expect(seeds[CROSS_GROUP_LANES[0].second - 1]).toBe('B3');
      expect(CROSS_GROUP_LANES.map(lane => seeds[lane.third - 1])).toContain('B2');
      expect(new Set(seeds).size).toBe(12);
    }
  });

  it('맞바꿔 고르면 두 팀의 칸도 맞바뀐다', () => {
    const swapped = crossSeedGroups(secondThirdTied, GROUP_ORDER, [{ groupId: 'B', rank: 2, registrationId: 'B2' }, { groupId: 'B', rank: 3, registrationId: 'B3' }]);
    const seeds = crossGroupTopThree(swapped, () => 0);
    expect(seeds[CROSS_GROUP_LANES[0].second - 1]).toBe('B2');
    expect(CROSS_GROUP_LANES.map(lane => seeds[lane.third - 1])).toContain('B3');
  });
});

describe('저장된 동률 선택 읽기 (savedTiePicks)', () => {
  const roster = ['r1', 'r2'];
  const picks = [{ groupId: 'B', rank: 2, registrationId: 'r1' }];
  const audit = (extra: Record<string, unknown>, registrationIds: unknown = roster) => ({ finalName: '프리미어', registrationIds, ...extra });

  it('감사 기록의 명단이 지금 저장 명단과 같을 때만 고른 팀을 돌려준다', () => {
    expect(savedTiePicks(audit({ tiePicks: picks }), roster)).toEqual(picks);
    expect(savedTiePicks(audit({ tiePicks: picks }), ['r2', 'r1'])).toEqual([]);
    expect(savedTiePicks(audit({ tiePicks: picks }), ['r1'])).toEqual([]);
    expect(savedTiePicks(audit({ tiePicks: picks }, ['r1', 'r3']), roster)).toEqual([]);
  });

  it('동률 선택이 없던 옛 기록과 기록 자체가 없는 경우는 빈 목록이다', () => {
    expect(savedTiePicks(audit({}), roster)).toEqual([]);
    expect(savedTiePicks(audit({ tiePicks: [] }), roster)).toEqual([]);
    expect(savedTiePicks(undefined, roster)).toEqual([]);
    expect(savedTiePicks(null, roster)).toEqual([]);
    expect(savedTiePicks('picks', roster)).toEqual([]);
  });

  it('모양이 어긋난 기록은 일부만 살리지 않고 통째로 버린다', () => {
    const malformed: unknown[] = [
      'B:2', { groupId: 'B' }, [null], [{ ...picks[0], rank: '2' }], [{ ...picks[0], rank: 2.5 }], [{ ...picks[0], registrationId: 7 }], [{ ...picks[0], groupId: null }],
      [...picks, { groupId: 'C', rank: 1 }],
    ];
    for (const tiePicks of malformed) expect(savedTiePicks(audit({ tiePicks }), roster)).toEqual([]);
  });

  it('알 수 없는 속성은 떼고 세 필드만 돌려준다', () => {
    expect(savedTiePicks(audit({ tiePicks: [{ ...picks[0], extra: 'x' }] }), roster)).toStrictEqual(picks);
  });
});
