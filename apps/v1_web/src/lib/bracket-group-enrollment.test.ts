import { describe, expect, it } from 'vitest';
import { makeGroup } from '@/test/bracket-canvas-fixtures';
import { registrationIdsBlockedForGroup } from './bracket-group-enrollment';

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
