import { describe, expect, it } from 'vitest';
import type { MultiFinalView } from '@/hooks/use-multi-finals';
import { choosePick, describeTies, fillTieSeats, initialPicks, initialSeats, keepPicked, pickKey, placeTeam, requireSeats, tiedSeats, tiePicksPayload, tiePositionCaption, TIE_SEAT_REQUIRED } from './multi-final-ties';

type Final = MultiFinalView['finals'][number];
const names: Record<string, string> = { a1: '1팀', a2: '2팀', a3: '3팀', a4: '4팀', b1: '5팀', b2: '6팀', b3: '7팀', b4: '8팀' };
const row = (registrationId: string, position: number, tied: string[] = [], points = 7) =>
  ({ registrationId, teamName: names[registrationId], position, points, wins: 2, draws: 1, losses: 2, goalsFor: 6, goalsAgainst: 4, tiedRegistrationIds: tied });
const final = (name: string, rules: Array<[string, number]>, extra: Partial<Final> = {}): Final => ({
  id: name, colorIndex: 0, name, thirdPlace: false, rules: rules.map(([groupId, rank]) => ({ groupId, rank })), registrationIds: null,
  manual: false, standingsChanged: false, suggestedRegistrationIds: [], tiePicks: [], unresolved: [], ...extra });
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
    expect(() => requireSeats(['a1', null])).toThrow(TIE_SEAT_REQUIRED);
  });
});

describe('placeTeam', () => {
  // Seats 0 and 2 are open tie seats of two different groups; seat 1 was emptied by removing a team.
  const seats = [
    { seat: 0, rank: 3, groupId: 'gA', tiedRegistrationIds: ['a3', 'a4'] },
    { seat: 2, rank: 3, groupId: 'gB', tiedRegistrationIds: ['b3', 'b4'] },
  ];
  it('동률 후보는 자기 묶음의 빈 동률 자리에 앉는다', () => {
    expect(placeTeam([null, null, null], seats, 'b3')).toEqual([null, null, 'b3']);
    expect(placeTeam([null, null, null], seats, 'a4')).toEqual(['a4', null, null]);
  });
  it('동률 후보가 아닌 팀은 동률 자리를 건너뛰고 일반 빈 자리에 앉는다', () => {
    expect(placeTeam([null, null, null], seats, 'x1')).toEqual([null, 'x1', null]);
  });
  it('자기 묶음의 동률 자리가 이미 찼으면 일반 빈 자리에 앉는다', () => {
    expect(placeTeam(['a3', null, null], seats, 'a4')).toEqual(['a3', 'a4', null]);
  });
  it('일반 빈 자리가 없으면 맨 끝에 붙이고 동률 자리는 건드리지 않는다', () => {
    expect(placeTeam([null, 'x1', null], seats, 'x2')).toEqual([null, 'x1', null, 'x2']);
  });
  it('동률 자리가 없으면 첫 빈 자리, 빈 자리가 없으면 맨 끝에 붙인다', () => {
    expect(placeTeam(['a1', null, 'a3'], [], 'x1')).toEqual(['a1', 'x1', 'a3']);
    expect(placeTeam(['a1', 'a2'], [], 'x1')).toEqual(['a1', 'a2', 'x1']);
  });
});

describe('describeTies', () => {
  it('프리미어·챌린지에 걸친 동률은 갈라지는 목적지와 고를 자리, 고르지 않은 팀의 행선지를 알려 준다', () => {
    const view = boundaryView();
    const [notice] = describeTies(view, view.finals[0]);
    expect(describeTies(view, view.finals[0])).toHaveLength(1);
    expect(notice.banner).toBe('A조 3위·4위가 완전 동률이에요. 3위는 프리미어, 4위는 챌린지로 갈라지는 자리라 직접 골라야 해요.');
    expect(notice.detail).toBe('승점 7 · 골득실 +2 · 득점 6 · 동점 기준이 모두 같아서 추첨으로만 갈렸어요.');
    expect(notice.seats).toEqual([{ seat: 2, groupId: 'gA', rank: 3, label: '프리미어 3위 자리에 보낼 팀', hint: '고르지 않은 팀은 챌린지 4위 자리로 가요.', candidates: ['a3', 'a4'] }]);
  });
  it('반대편 토너먼트에서 보면 같은 동률이 그쪽 자리로 보인다', () => {
    const view = boundaryView();
    const [notice] = describeTies(view, view.finals[1]);
    expect(notice.seats).toEqual([{ seat: 0, groupId: 'gA', rank: 4, label: '챌린지 4위 자리에 보낼 팀', hint: '고르지 않은 팀은 프리미어 3위 자리로 가요.', candidates: ['a3', 'a4'] }]);
  });
  it('같은 토너먼트 안의 동률은 시드가 달라지는 자리라고 알리고 자리마다 고르게 한다', () => {
    const view = boundaryView();
    view.finals[0] = final('프리미어', [['gA', 1], ['gA', 2], ['gA', 3]], { suggestedRegistrationIds: ['a3'], unresolved: [tied('gA', 1, ['a1', 'a2']), tied('gA', 2, ['a1', 'a2'])] });
    view.groupStandings![0].rows = [row('a1', 1, ['a1', 'a2']), row('a2', 2, ['a1', 'a2']), row('a3', 3), row('a4', 4)];
    const [notice] = describeTies(view, view.finals[0]);
    expect(notice.banner).toBe('A조 1위·2위가 완전 동률이에요. 같은 토너먼트 안에서 시드가 달라지는 자리라 직접 골라야 해요.');
    expect(notice.seats.map(seat => [seat.seat, seat.label, seat.hint])).toEqual([
      [0, '프리미어 1위 자리에 보낼 팀', null], [1, '프리미어 2위 자리에 보낼 팀', null]]);
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

// 프리미어 takes A-group rank 3 (rule seat 2), tied with a4. Seats are rule order; a cross roster puts the same team at another seed.
describe('동률 선택(picks)', () => {
  const seat = tiedSeats(boundaryView().finals[0])[0];
  const premier = (extra: Partial<Final> = {}) => ({ ...boundaryView().finals[0], ...extra });

  it('pickKey 는 조와 순위로 만든다', () => {
    expect(pickKey(seat)).toBe('gA:3');
  });

  describe('initialPicks', () => {
    it('저장된 선택을 현재 동률 자리 범위에서만 읽는다', () => {
      const saved = premier({ registrationIds: ['a1', 'b1', 'a2', 'a4'], assignmentPolicy: 'cross_group_top3',
        tiePicks: [{ groupId: 'gA', rank: 3, registrationId: 'a4' }, { groupId: 'gB', rank: 3, registrationId: 'b3' }, { groupId: 'gA', rank: 2, registrationId: 'a2' }] });
      expect(initialPicks(saved, saved.registrationIds!)).toEqual({ 'gA:3': 'a4' });
    });
    it('동률 후보가 아닌 팀을 가리키는 선택은 버린다', () => {
      const stale = premier({ registrationIds: ['a1', 'a2', 'x', 'b1'], tiePicks: [{ groupId: 'gA', rank: 3, registrationId: 'b1' }] });
      expect(initialPicks(stale, stale.registrationIds!)).toEqual({});
    });
    it('선택이 저장되지 않은 옛 기본 순위 명단은 규칙 순서 자리의 동률 후보를 선택으로 읽는다', () => {
      const legacy = premier({ registrationIds: ['a1', 'a2', 'a3', 'b1'] });
      expect(initialPicks(legacy, legacy.registrationIds!)).toEqual({ 'gA:3': 'a3' });
    });
    it('선택이 없는 교차 명단은 규칙 순서 자리를 선택으로 읽지 않는다', () => {
      const cross = premier({ registrationIds: ['a1', 'a3', 'a2', 'b1'], assignmentPolicy: 'cross_group_top3' });
      expect(initialPicks(cross, cross.registrationIds!)).toEqual({});
    });
    it('저장된 명단이 없으면 추천에서 비워 둔 동률 자리는 선택도 없다', () => {
      const fresh = premier();
      expect(initialPicks(fresh, initialSeats(fresh))).toEqual({});
    });
  });

  it('keepPicked 는 이번 편집이 명단에서 뺀 팀의 선택만 지우고, 아직 명단에 오기 전인 선택은 남긴다', () => {
    expect(keepPicked({ 'gA:3': 'a3', 'gB:3': 'b3' }, ['a1', 'a3', 'b3'], ['a1', 'a3', null])).toEqual({ 'gA:3': 'a3' });
    // A cross pick waits for the redraw: its team was never on the roster, so moving other seeds keeps it.
    expect(keepPicked({ 'gB:3': 'b4' }, ['a1', 'b3', 'a2'], ['a1', 'a2', 'b3'])).toEqual({ 'gB:3': 'b4' });
  });

  it('tiePicksPayload 는 선택한 동률 자리만 서버 모양으로 보내고, 없으면 보내지 않는다', () => {
    const seats = [seat, { seat: 4, rank: 3, groupId: 'gB', tiedRegistrationIds: ['b3', 'b4'] }];
    expect(tiePicksPayload(seats, { 'gB:3': 'b4' })).toEqual([{ groupId: 'gB', rank: 3, registrationId: 'b4' }]);
    expect(tiePicksPayload(seats, {})).toBeUndefined();
    expect(tiePicksPayload([], { 'gA:3': 'a3' })).toBeUndefined();
  });

  describe('choosePick', () => {
    const at = (seat: number, previous: string | undefined, id: string, mates: string[] = [], capacity = 4) => ({ seat, mates, previous, id, capacity });
    it('이전에 고른 팀이 옮겨 앉은 자리에서 바로 바꾼다', () => {
      expect(choosePick(['a1', 'a3', 'a2', 'b1'], at(2, 'a3', 'a4'))).toEqual(['a1', 'a4', 'a2', 'b1']);
    });
    it('고른 팀이 이미 명단에 있으면 아무것도 옮기지 않는다', () => {
      expect(choosePick(['a1', 'b4', 'a2', 'b1'], at(2, undefined, 'b4', ['b3', 'b4']))).toEqual(['a1', 'b4', 'a2', 'b1']);
    });
    it('같은 동률의 다른 팀이 명단에 있으면 그 자리를 넘겨받는다', () => {
      expect(choosePick(['a1', 'b3', 'a2', 'b1'], at(3, undefined, 'b4', ['b3', 'b4']))).toEqual(['a1', 'b4', 'a2', 'b1']);
    });
    it('고른 적이 없으면 비어 있는 동률 자리를 채운다', () => {
      expect(choosePick(['a1', 'a2', null, 'b1'], at(2, undefined, 'a3'))).toEqual(['a1', 'a2', 'a3', 'b1']);
    });
    it('동률 자리가 이미 찼으면 첫 빈 시드를 쓰고, 명단이 다 차 있으면 자리 수를 넘겨 늘리지 않는다', () => {
      expect(choosePick([null, 'a2', 'x', 'b1'], at(2, undefined, 'a3'))).toEqual(['a3', 'a2', 'x', 'b1']);
      expect(choosePick(['a1', 'a2', 'x', 'b1'], at(2, undefined, 'a3'))).toEqual(['a1', 'a2', 'x', 'b1']);
      expect(choosePick(['a1', 'a2', 'x'], at(1, undefined, 'a3'))).toEqual(['a1', 'a2', 'x', 'a3']);
    });
    it('명단이 동률 자리보다 짧으면 그 자리까지 늘려 채운다', () => {
      expect(choosePick(['a1'], at(2, undefined, 'a3'))).toEqual(['a1', null, 'a3']);
    });
    it('선택을 비우면 그 팀이 앉은 시드만 비운다', () => {
      expect(choosePick(['a1', 'a3', 'a2'], at(2, 'a3', ''))).toEqual(['a1', null, 'a2']);
      expect(choosePick(['a1', 'a2'], at(2, undefined, ''))).toEqual(['a1', 'a2']);
    });
  });

  it('fillTieSeats 는 추천이 비워 둔 동률 자리에 고른 팀을 되돌리고, 선택이 없으면 비워 둔다', () => {
    const seats = [seat, { seat: 0, rank: 4, groupId: 'gA', tiedRegistrationIds: ['a3', 'a4'] }];
    expect(fillTieSeats([null, 'a2', null, 'b1'], seats, { 'gA:3': 'a3' })).toEqual([null, 'a2', 'a3', 'b1']);
    expect(fillTieSeats(['a1', 'a2', 'x'], seats, { 'gA:3': 'a3' })).toEqual(['a1', 'a2', 'x']);
  });

  describe('tiePositionCaption', () => {
    const base = { seat: 2, ids: ['a1', 'a3', 'a2', 'b1'] as Array<string | null>, stale: false };
    it('추천이 정해진 명단에서는 고른 팀의 실제 시드를 알려 준다', () => {
      expect(tiePositionCaption({ ...base, policy: 'cross_group_top3', pick: 'a3' })).toBe('지금 2번 시드예요.');
      expect(tiePositionCaption({ ...base, policy: 'rank_order', pick: 'a3' })).toBe('지금 2번 시드예요.');
    });
    it('교차 배치는 추천을 만들기 전에는 시드를 말하지 않고, 고르지 않았으면 아무 말도 하지 않는다', () => {
      expect(tiePositionCaption({ ...base, policy: 'cross_group_top3', pick: 'a3', stale: true })).toBe('교차 배치 추천을 만들면 시드가 정해져요.');
      expect(tiePositionCaption({ ...base, policy: 'cross_group_top3', pick: 'a4' })).toBe('교차 배치 추천을 만들면 시드가 정해져요.');
      expect(tiePositionCaption({ ...base, policy: 'cross_group_top3', pick: undefined })).toBeNull();
    });
    it('기본 순위 순서는 고르기 전에는 규칙 순서 자리를, 추천을 다시 만들기 전에는 그 자리에 들어간다고 알려 준다', () => {
      expect(tiePositionCaption({ ...base, policy: 'rank_order', pick: undefined })).toBe('고르면 3번 시드에 들어가요.');
      expect(tiePositionCaption({ ...base, policy: 'rank_order', pick: 'a3', stale: true })).toBe('추천 배치를 만들면 3번 시드에 들어가요.');
    });
  });
});
