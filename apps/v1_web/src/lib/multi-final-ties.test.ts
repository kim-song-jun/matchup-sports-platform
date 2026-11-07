import { describe, expect, it } from 'vitest';
import type { MultiFinalView } from '@/hooks/use-multi-finals';
import { describeTies, initialSeats, requireSeats, tiedSeats } from './multi-final-ties';

type Final = MultiFinalView['finals'][number];
const names: Record<string, string> = { a1: '1팀', a2: '2팀', a3: '3팀', a4: '4팀', b1: '5팀', b2: '6팀', b3: '7팀', b4: '8팀' };
const row = (registrationId: string, position: number, tied: string[] = [], points = 7) =>
  ({ registrationId, teamName: names[registrationId], position, points, wins: 2, draws: 1, losses: 2, goalsFor: 6, goalsAgainst: 4, tiedRegistrationIds: tied });
const final = (name: string, rules: Array<[string, number]>, extra: Partial<Final> = {}): Final => ({
  id: name, colorIndex: 0, name, thirdPlace: false, rules: rules.map(([groupId, rank]) => ({ groupId, rank })), registrationIds: null,
  manual: false, standingsChanged: false, suggestedRegistrationIds: [], unresolved: [], ...extra });
const tied = (groupId: string, rank: number, ids: string[]) => ({ groupId, rank, state: 'tied', tiedRegistrationIds: ids });

// Group A's 3rd and 4th place (a3, a4) were separated only by the draw: 프리미어 takes rank 3, 챌린지 rank 4. Group B has no tie.
function boundaryView(): MultiFinalView {
  const premier = final('프리미어', [['gA', 1], ['gA', 2], ['gA', 3], ['gB', 1]], { suggestedRegistrationIds: ['a1', 'a2', 'b1'], unresolved: [tied('gA', 3, ['a3', 'a4'])] });
  const challenge = final('챌린지', [['gA', 4], ['gB', 4]], { suggestedRegistrationIds: ['b4'], unresolved: [tied('gA', 4, ['a3', 'a4'])] });
  return { revision: 1, generated: true, groups: [], registrations: Object.entries(names).map(([id, name]) => ({ id, team: { id, name } })), finals: [premier, challenge],
    groupStandings: [
      { groupId: 'gA', name: 'A조', complete: true, rows: [row('a1', 1, [], 9), row('a2', 2, [], 8), row('a3', 3, ['a3', 'a4']), row('a4', 4, ['a3', 'a4'])] },
      { groupId: 'gB', name: 'B조', complete: true, rows: [row('b1', 1), row('b2', 2), row('b3', 3), row('b4', 4)] },
    ] };
}

describe('tiedSeats', () => {
  it('규칙 순서(시드 번호)로 동률 자리만 돌려준다', () => {
    const view = boundaryView();
    expect(tiedSeats(view.finals[0])).toEqual([{ seat: 2, rank: 3, groupId: 'gA', tiedRegistrationIds: ['a3', 'a4'] }]);
    expect(tiedSeats(view.finals[1])).toEqual([{ seat: 0, rank: 4, groupId: 'gA', tiedRegistrationIds: ['a3', 'a4'] }]);
  });
  it('경기가 덜 끝난 자리는 동률 자리가 아니다', () => {
    const open = final('프리미어', [['gA', 1]], { unresolved: [{ groupId: 'gA', rank: 1, state: 'group_incomplete', tiedRegistrationIds: [] }] });
    expect(tiedSeats(open)).toEqual([]);
  });
});

describe('initialSeats', () => {
  it('저장된 명단이 있으면 그대로 쓴다', () => {
    expect(initialSeats(final('프리미어', [['gA', 1]], { registrationIds: ['a2'], unresolved: [tied('gA', 1, ['a1', 'a2'])] }))).toEqual(['a2']);
  });
  it('추천은 동률 자리를 null 로 비우고 나머지를 규칙 순서대로 둔다', () => {
    expect(initialSeats(boundaryView().finals[0])).toEqual(['a1', 'a2', null, 'b1']);
    expect(initialSeats(boundaryView().finals[1])).toEqual([null, 'b4']);
  });
  it('동률이 없으면 추천 목록 그대로다', () => {
    expect(initialSeats(final('프리미어', [['gA', 1], ['gA', 2]], { suggestedRegistrationIds: ['a1', 'a2'] }))).toEqual(['a1', 'a2']);
  });
  it('경기가 덜 끝난 자리가 섞여 있으면 완료된 추천만 보여 준다', () => {
    const mixed = final('프리미어', [['gA', 1], ['gB', 1]], { suggestedRegistrationIds: ['a1'],
      unresolved: [{ groupId: 'gB', rank: 1, state: 'group_incomplete', tiedRegistrationIds: [] }] });
    expect(initialSeats(mixed)).toEqual(['a1']);
  });
});

describe('requireSeats', () => {
  it('빈 자리가 없으면 그대로 돌려주고, 빈 자리가 있으면 확정하지 못하게 던진다', () => {
    expect(requireSeats(['a1', 'a2'])).toEqual(['a1', 'a2']);
    expect(() => requireSeats(['a1', null])).toThrow('동률 자리를 골라야');
  });
});

describe('describeTies', () => {
  it('프리미어·챌린지에 걸친 동률은 갈라지는 목적지와 고를 자리, 고르지 않은 팀의 행선지를 알려 준다', () => {
    const view = boundaryView();
    const [notice] = describeTies(view, view.finals[0]);
    expect(describeTies(view, view.finals[0])).toHaveLength(1);
    expect(notice.banner).toBe('A조 3위·4위가 완전 동률이에요. 3위는 프리미어, 4위는 챌린지로 갈라지는 자리라 직접 골라야 해요.');
    expect(notice.detail).toBe('승점 7 · 골득실 +2 · 득점 6 · 맞대결·페어플레이까지 같아서 추첨으로만 갈렸어요.');
    expect(notice.seats).toEqual([{ seat: 2, label: '프리미어 3위 자리(3번 시드)에 보낼 팀', hint: '고르지 않은 팀은 챌린지 4위 자리(1번 시드)로 가요.', candidates: ['a3', 'a4'] }]);
  });
  it('반대편 토너먼트에서 보면 같은 동률이 그쪽 자리로 보인다', () => {
    const view = boundaryView();
    const [notice] = describeTies(view, view.finals[1]);
    expect(notice.seats).toEqual([{ seat: 0, label: '챌린지 4위 자리(1번 시드)에 보낼 팀', hint: '고르지 않은 팀은 프리미어 3위 자리(3번 시드)로 가요.', candidates: ['a3', 'a4'] }]);
  });
  it('같은 토너먼트 안의 동률은 시드가 달라지는 자리라고 알리고 자리마다 고르게 한다', () => {
    const view = boundaryView();
    view.finals[0] = final('프리미어', [['gA', 1], ['gA', 2], ['gA', 3]], { suggestedRegistrationIds: ['a3'], unresolved: [tied('gA', 1, ['a1', 'a2']), tied('gA', 2, ['a1', 'a2'])] });
    view.groupStandings![0].rows = [row('a1', 1, ['a1', 'a2']), row('a2', 2, ['a1', 'a2']), row('a3', 3), row('a4', 4)];
    const [notice] = describeTies(view, view.finals[0]);
    expect(notice.banner).toBe('A조 1위·2위가 완전 동률이에요. 같은 토너먼트 안에서 시드가 달라지는 자리라 직접 골라야 해요.');
    expect(notice.seats.map(seat => [seat.seat, seat.label, seat.hint])).toEqual([
      [0, '프리미어 1위 자리(1번 시드)에 보낼 팀', null], [1, '프리미어 2위 자리(2번 시드)에 보낼 팀', null]]);
  });
  it('토너먼트 경계에서 진출 없음 쪽으로 갈라지면 그 팀은 진출하지 못한다고 알린다', () => {
    const view = boundaryView();
    view.finals = [view.finals[0]];
    const [notice] = describeTies(view, view.finals[0]);
    expect(notice.banner).toBe('A조 3위·4위가 완전 동률이에요. 3위는 프리미어, 4위는 진출 없음으로 갈라지는 자리라 직접 골라야 해요.');
    expect(notice.seats[0].hint).toBe('고르지 않은 팀은 진출하지 못해요.');
  });
  it('이 토너먼트와 상관없는 동률이나 동률 없는 조는 안내를 만들지 않는다', () => {
    const view = boundaryView();
    const control = final('프렌즈', [['gB', 1], ['gB', 2]], { suggestedRegistrationIds: ['b1', 'b2'] });
    expect(describeTies({ ...view, finals: [...view.finals, control] }, control)).toEqual([]);
  });
  it('서로 다른 두 조의 동률은 안내도 둘로 나뉜다', () => {
    const view = boundaryView();
    view.finals[0] = final('프리미어', [['gA', 3], ['gB', 3]], { unresolved: [tied('gA', 3, ['a3', 'a4']), tied('gB', 3, ['b3', 'b4'])] });
    view.finals[1] = final('챌린지', [['gA', 4], ['gB', 4]], { unresolved: [tied('gA', 4, ['a3', 'a4']), tied('gB', 4, ['b3', 'b4'])] });
    view.groupStandings![1].rows = [row('b1', 1), row('b2', 2), row('b3', 3, ['b3', 'b4']), row('b4', 4, ['b3', 'b4'])];
    expect(describeTies(view, view.finals[0]).map(notice => notice.banner.split(' ')[0])).toEqual(['A조', 'B조']);
  });
});
