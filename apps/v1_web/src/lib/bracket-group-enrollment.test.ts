import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { registrationIdsBlockedForGroup, registrationIdsInOppositeFinalStage } from './bracket-group-enrollment';

const member = (groupId: string, registrationId: string | null) => ({ id: `gt-${groupId}-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: [member('gA', 'r1')] });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('gB', 'r2'), member('gB', 'r3')] });
const quarter = makeGroup({ id: 'gQ', name: '8강', phase: 'quarter', sortOrder: 2, groupTeams: [member('gQ', 'r4')] });
const ids = (set: ReadonlySet<string>) => [...set].sort();

describe('registrationIdsBlockedForGroup', () => {
  it('조별 조에는 다른 조별 조의 팀만 못 넣고, 이 조의 팀과 어느 조에도 없는 팀은 그대로다', () => {
    expect(ids(registrationIdsBlockedForGroup([gA, gB], 'gA'))).toEqual(['r2', 'r3']);
    expect(ids(registrationIdsBlockedForGroup([gA, gB], 'gB'))).toEqual(['r1']);
  });

  it('결선 단계 조에 편성된 팀은 세지 않는다', () => {
    expect(ids(registrationIdsBlockedForGroup([gA, gB, quarter], 'gA'))).toEqual(['r2', 'r3']);
  });

  it('이 조에도 편성된 팀은 다른 조와 겹쳐 있어도 막지 않는다 — 이미 겹친 옛 데이터', () => {
    const crossed = makeGroup({ id: 'gC', name: 'C조', phase: 'group', sortOrder: 3, groupTeams: [member('gC', 'r1'), member('gC', 'r2')] });
    expect(ids(registrationIdsBlockedForGroup([gA, gB, crossed], 'gA'))).toEqual(['r2', 'r3']);
    expect(ids(registrationIdsBlockedForGroup([gA, gB, crossed], 'gC'))).toEqual(['r3']);
  });

  it('결선 조·조 없음·모르는 id 는 아무것도 막지 않고, 미정 부전승 자리(registrationId null)는 무시한다', () => {
    expect(registrationIdsBlockedForGroup([gA, gB, quarter], 'gQ').size).toBe(0);
    expect(registrationIdsBlockedForGroup([gA, gB], null).size).toBe(0);
    expect(registrationIdsBlockedForGroup([gA, gB], 'ghost').size).toBe(0);
    const withEmptySlot = makeGroup({ id: 'gD', name: 'D조', phase: 'group', sortOrder: 4, groupTeams: [member('gD', null)] });
    expect(ids(registrationIdsBlockedForGroup([gA, withEmptySlot], 'gA'))).toEqual([]);
  });
});

describe('registrationIdsInOppositeFinalStage', () => {
  const finalGroup = makeGroup({ id: 'gF', name: '결승', phase: 'final', sortOrder: 5, groupTeams: [member('gF', 'r9')] });
  const thirdGroup = makeGroup({ id: 'gT', name: '3·4위전', phase: 'third_place', sortOrder: 6, groupTeams: [member('gT', 'r8')] });
  const semiGroup = makeGroup({ id: 'gS', name: '4강', phase: 'semi', sortOrder: 4 });
  const groups = [gA, semiGroup, finalGroup, thirdGroup];
  const fixtures = [
    makeFixture({ id: 'fx-final', groupId: 'gF', fixtureNumber: 1, homeRegistrationId: 'r1', awayRegistrationId: 'r2' }),
    makeFixture({ id: 'fx-third', groupId: 'gT', fixtureNumber: 1, homeRegistrationId: 'r3', awayRegistrationId: null }),
    makeFixture({ id: 'fx-semi', groupId: 'gS', fixtureNumber: 1, homeRegistrationId: 'r1', awayRegistrationId: 'r3' }),
  ];

  it('3·4위전 조 — 결승 경기의 팀과 결승 조에 편성된 팀을 돌려주고, 4강·3·4위전 팀은 세지 않는다', () => {
    expect(ids(registrationIdsInOppositeFinalStage(groups, fixtures, 'gT'))).toEqual(['r1', 'r2', 'r9']);
  });

  it('결승 조 — 반대로 3·4위전 경기의 팀과 3·4위전 조에 편성된 팀을 돌려준다', () => {
    expect(ids(registrationIdsInOppositeFinalStage(groups, fixtures, 'gF'))).toEqual(['r3', 'r8']);
  });

  it('결승·3·4위전이 아닌 조, 조 없음, 모르는 id 는 아무것도 막지 않는다', () => {
    expect(registrationIdsInOppositeFinalStage(groups, fixtures, 'gS').size).toBe(0);
    expect(registrationIdsInOppositeFinalStage(groups, fixtures, 'gA').size).toBe(0);
    expect(registrationIdsInOppositeFinalStage(groups, fixtures, null).size).toBe(0);
    expect(registrationIdsInOppositeFinalStage(groups, fixtures, 'ghost').size).toBe(0);
  });

  it('반대쪽 경기에 팀이 비어 있으면 빈 자리는 무시한다', () => {
    const half = [makeFixture({ id: 'fx-final', groupId: 'gF', fixtureNumber: 1, homeRegistrationId: 'r1', awayRegistrationId: null })];
    expect(ids(registrationIdsInOppositeFinalStage([finalGroup, thirdGroup], half, 'gT'))).toEqual(['r1', 'r9']);
  });
});
