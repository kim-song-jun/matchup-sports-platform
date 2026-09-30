import { compareRosterOrder, type RosterOrderKey } from './roster-order';

const player = (id: string, jerseyNumber: number | null, name: string): RosterOrderKey => ({ id, jerseyNumber, name });

describe('compareRosterOrder', () => {
  it('등번호 오름차순이고 번호 없는 선수는 맨 뒤다 — 저장 순서와 무관하다', () => {
    const stored = [player('p-none', null, '가나다'), player('p-10', 10, '김'), player('p-1', 1, '이'), player('p-7', 7, '박')];

    expect([...stored].sort(compareRosterOrder).map((row) => row.id)).toEqual(['p-1', 'p-7', 'p-10', 'p-none']);
    // 두 자리 번호가 문자열 비교("10" < "7")로 앞서지 않는다.
    expect([...stored].reverse().sort(compareRosterOrder).map((row) => row.id)).toEqual(['p-1', 'p-7', 'p-10', 'p-none']);
  });

  it('번호가 같거나 둘 다 없으면 이름순, 이름도 같으면 id 순이다', () => {
    const sameNumber = [player('p-b', 9, '하나'), player('p-a', 9, '가람')];
    const noNumber = [player('p-2', null, '동명'), player('p-1', null, '동명'), player('p-3', null, '가람')];

    expect([...sameNumber].sort(compareRosterOrder).map((row) => row.id)).toEqual(['p-a', 'p-b']);
    expect([...noNumber].sort(compareRosterOrder).map((row) => row.id)).toEqual(['p-3', 'p-1', 'p-2']);
  });

  it('0번은 번호 없음이 아니라 가장 앞선 번호다', () => {
    const rows = [player('p-none', null, '가'), player('p-1', 1, '가'), player('p-0', 0, '가')];

    expect(rows.sort(compareRosterOrder).map((row) => row.id)).toEqual(['p-0', 'p-1', 'p-none']);
  });
});
