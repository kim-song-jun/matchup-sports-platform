import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { useTeamPlacement } from './use-team-placement';

const mocks = vi.hoisted(() => ({ assign: vi.fn(), update: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1UpdateFixture: () => ({ mutate: mocks.update, isPending: false }) }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }) }));

const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
const groupA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: [member('gA', 'r1')] });
const groupB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', groupTeams: [member('gB', 'r2')] });
const final = makeGroup({ id: 'g-final', name: '결승', phase: 'final' });
const third = makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place' });
const bracket = makeBracket({
  groups: [groupA, groupB, final, third],
  slots: [makeSlot({ id: 'sa', groupId: 'gA' }), makeSlot({ id: 'sf', groupId: 'g-final' })],
  fixtures: [
    makeFixture({ id: 'fa', groupId: 'gA', fixtureNumber: 1 }),
    makeFixture({ id: 'ff', groupId: 'g-final', fixtureNumber: 2, homeRegistrationId: 'r9' }),
    makeFixture({ id: 'ft', groupId: 'g-third', fixtureNumber: 3 }),
  ],
});
const showToast = vi.fn();
const onPlaced = vi.fn();
beforeEach(() => { vi.clearAllMocks(); });
const setup = () => renderHook(() => useTeamPlacement('t-1', bracket, showToast, onPlaced)).result.current;

describe('useTeamPlacement', () => {
  it('자리에 넣기: 다른 조 팀은 요청 없이 막고, 같은 조·미편성 팀은 슬롯 배정을 부른다(대조군)', () => {
    const placement = setup();
    placement.placeIntoSlot('sa', 'r2');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.', 'error');
    placement.placeIntoSlot('sa', 'r1');
    placement.placeIntoSlot('sa', 'r3');
    expect(mocks.assign).toHaveBeenCalledTimes(2);
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 'sa', registrationId: 'r3' }, expect.any(Object));
  });

  it('결선 자리는 한 팀 한 조 규칙을 받지 않는다', () => {
    setup().placeIntoSlot('sf', 'r2');
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 'sf', registrationId: 'r2' }, expect.any(Object));
  });

  it('성공하면 onPlaced 와 토스트, 실패하면 이유 토스트만(onPlaced 는 부르지 않는다)', () => {
    setup().placeIntoSlot('sf', 'r3');
    const { onSuccess, onError } = mocks.assign.mock.calls[0][1];
    act(() => onSuccess());
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenLastCalledWith('팀을 넣었어요.', 'success');
    act(() => onError(new Error('서버 오류')));
    expect(showToast).toHaveBeenLastCalledWith('서버 오류', 'error');
    expect(onPlaced).toHaveBeenCalledTimes(1);
  });

  it('경기에 직접 넣기: 홈은 homeRegistrationId, 원정은 awayRegistrationId 로 PATCH 한다', () => {
    const placement = setup();
    placement.placeDirect('ft', 'HOME', 'r3');
    placement.placeDirect('ft', 'AWAY', 'r4');
    expect(mocks.update).toHaveBeenNthCalledWith(1, { fixtureId: 'ft', homeRegistrationId: 'r3' }, expect.any(Object));
    expect(mocks.update).toHaveBeenNthCalledWith(2, { fixtureId: 'ft', awayRegistrationId: 'r4' }, expect.any(Object));
  });

  it('경기에 직접 넣기: 다른 조 팀과 결선에 올라간 팀(3·4위전)은 요청 없이 해요체로 막는다', () => {
    const placement = setup();
    placement.placeDirect('fa', 'HOME', 'r2');
    expect(showToast).toHaveBeenLastCalledWith('다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.', 'error');
    placement.placeDirect('ft', 'HOME', 'r9');
    expect(showToast).toHaveBeenLastCalledWith('결승에 올라간 팀은 3·4위전에 넣을 수 없어요. 3·4위전에는 4강에서 진 팀을 넣어 주세요.', 'error');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
