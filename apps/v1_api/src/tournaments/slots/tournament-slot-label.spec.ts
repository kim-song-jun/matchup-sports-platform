import { slotLabelFromRow, tournamentSlotLabel } from './tournament-slot-label';

describe('tournamentSlotLabel', () => {
  const base = { groupName: null, groupPhase: null, sourceGroupName: null } as const;

  it.each([
    ['조별 그룹 ENTRY 는 조 이름과 번호', { ...base, kind: 'ENTRY', position: 1, groupName: 'A조', groupPhase: 'group' }, 'A조 1번'],
    ['결선 그룹 ENTRY 는 조 이름을 붙이지 않는다', { ...base, kind: 'ENTRY', position: 3, groupName: '8강', groupPhase: 'quarter' }, '3번 자리'],
    ['정규 리그 ENTRY(그룹 없음)', { ...base, kind: 'ENTRY', position: 2 }, '2번 자리'],
    ['조별 phase 라도 조 이름이 없으면 "null" 을 찍지 않는다', { ...base, kind: 'ENTRY', position: 1, groupPhase: 'group' }, '1번 자리'],
    ['BYE', { ...base, kind: 'BYE', position: 4, groupName: '12강', groupPhase: 'round12' }, '부전승 4'],
    ['GROUP_RANK 는 원천 조 이름과 순위', { ...base, kind: 'GROUP_RANK', position: 2, groupName: '4강', groupPhase: 'semi', sourceGroupName: 'B조' }, 'B조 2위'],
    ['원천 조가 비어 있으면 순위만', { ...base, kind: 'GROUP_RANK', position: 1, groupName: '4강', groupPhase: 'semi' }, '1위'],
  ] as const)('%s', (_name, input, expected) => {
    expect(tournamentSlotLabel(input)).toBe(expected);
  });
});

describe('slotLabelFromRow', () => {
  it('Prisma select 모양(중첩 group/sourceGroup)을 라벨 입력으로 펴 준다', () => {
    expect(
      slotLabelFromRow({ kind: 'GROUP_RANK', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } }),
    ).toBe('A조 1위');
    expect(
      slotLabelFromRow({ kind: 'ENTRY', position: 2, group: { name: 'A조', phase: 'group' }, sourceGroup: null }),
    ).toBe('A조 2번');
    expect(slotLabelFromRow({ kind: 'ENTRY', position: 5, group: null, sourceGroup: null })).toBe('5번 자리');
  });
});
