import { describe, expect, it } from 'vitest';
import { makeBracket, makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { teamFillTargets } from './team-fill-targets';

const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
const groupA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: [member('gA', 'r1')] });
const groupB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('gB', 'r2')] });
const semi = makeGroup({ id: 'gS', name: '4강', phase: 'semi', sortOrder: 2 });
const slotA = makeSlot({ id: 'sa', groupId: 'gA', label: 'A조 1번' });
const slotB = makeSlot({ id: 'sb', groupId: 'gB', label: 'B조 1번' });
const slotSemi = makeSlot({ id: 'ss', groupId: 'gS', label: '4강 1번' });

const bracket = makeBracket({
  groups: [groupA, groupB, semi],
  slots: [slotA, slotB, slotSemi],
  fixtures: [
    makeFixture({ id: 'fa', groupId: 'gA', fixtureNumber: 1, homeSlotId: 'sa', awaySlotId: null, game: makeGame() }),
    makeFixture({ id: 'fb', groupId: 'gB', fixtureNumber: 2, homeSlotId: 'sb', awaySlotId: null, game: makeGame() }),
    makeFixture({ id: 'fs', groupId: 'gS', fixtureNumber: 3, homeSlotId: 'ss', awaySlotId: null, game: makeGame() }),
  ],
});
const targetsFor = (registrationId: string, overrides: Partial<typeof bracket> = {}) => teamFillTargets({ ...bracket, ...overrides, registrationId });
const slotIds = (targets: ReturnType<typeof targetsFor>) => targets.filter((target) => target.slotId !== null).map((target) => target.slotId);

describe('teamFillTargets', () => {
  it('다른 조 팀은 그 조 자리에 안 나오고, 같은 조 팀과 어느 조에도 없는 팀은 나온다(양쪽 단언)', () => {
    expect(slotIds(targetsFor('r1'))).toContain('sa');
    expect(slotIds(targetsFor('r1'))).not.toContain('sb');
    expect(slotIds(targetsFor('r2'))).toContain('sb');
    expect(slotIds(targetsFor('r2'))).not.toContain('sa');
    expect(slotIds(targetsFor('r3'))).toEqual(expect.arrayContaining(['sa', 'sb', 'ss']));
  });

  it('결선 자리는 한 팀 한 조 규칙을 받지 않는다', () => {
    expect(slotIds(targetsFor('r1'))).toContain('ss');
    expect(slotIds(targetsFor('r2'))).toContain('ss');
  });

  it('이미 팀이 있는 자리와 시작된 경기·취소된 경기는 빠진다', () => {
    const occupied = makeBracket({ ...bracket, slots: [{ ...slotA, registrationId: 'r1', teamName: 'r1' }, slotB, slotSemi] });
    expect(slotIds(targetsFor('r3', occupied))).toEqual(['sb', 'ss']);
    const started = makeBracket({ ...bracket, fixtures: [{ ...bracket.fixtures[0], game: makeGame({ state: 'LIVE' }) }, ...bracket.fixtures.slice(1)] });
    expect(slotIds(targetsFor('r3', started))).toEqual(['sb', 'ss']);
    const cancelled = makeBracket({ ...bracket, fixtures: [{ ...bracket.fixtures[0], status: 'cancelled' }, ...bracket.fixtures.slice(1)] });
    expect(slotIds(targetsFor('r3', cancelled))).toEqual(['sb', 'ss']);
  });

  it('단계 관리 경기(bracketTrack stage:)와 이름 있는 결선은 빠진다(대조군: 같은 경기가 일반 단계면 나온다)', () => {
    const staged = makeBracket({ ...bracket, groups: [groupA, groupB, { ...semi, bracketTrack: 'stage:one' }] });
    expect(slotIds(targetsFor('r3', staged))).toEqual(['sa', 'sb']);
    const named = makeBracket({ ...bracket, groups: [groupA, groupB, { ...semi, bracketTrack: '프리미어' }] });
    expect(slotIds(targetsFor('r3', named))).toEqual(['sa', 'sb']);
    const upper = makeBracket({ ...bracket, groups: [groupA, groupB, { ...semi, bracketTrack: 'upper' }] });
    expect(slotIds(targetsFor('r3', upper))).toContain('ss');
  });

  it('조 순위·앞 경기 결과로 채워지는 칸은 빠진다', () => {
    const ranked = makeBracket({
      ...bracket,
      slots: [...bracket.slots, makeSlot({ id: 'rank', kind: 'GROUP_RANK', groupId: 'gS' })],
      fixtures: [...bracket.fixtures, makeFixture({ id: 'fr', groupId: 'gS', fixtureNumber: 4, homeSlotId: 'rank', awaySlotId: null, game: makeGame() })],
    });
    expect(slotIds(targetsFor('r3', ranked))).not.toContain('rank');
    const fed = makeBracket({ ...bracket, fixtures: [...bracket.fixtures, makeFixture({ id: 'ff', groupId: 'gS', fixtureNumber: 4, bracketSources: [{ fixtureId: 'fa', side: 'HOME', outcome: 'WINNER' }], game: makeGame() })] });
    expect(targetsFor('r3', fed).filter((target) => target.fixtureId === 'ff').map((target) => target.side)).toEqual(['AWAY']);
  });

  it('같은 자리를 쓰는 여러 경기는 한 번만 나온다(번호가 앞선 경기 기준)', () => {
    const shared = makeBracket({ ...bracket, fixtures: [...bracket.fixtures, makeFixture({ id: 'fa2', groupId: 'gA', fixtureNumber: 9, homeSlotId: 'sa', awaySlotId: null, game: makeGame() })] });
    expect(targetsFor('r3', shared).filter((target) => target.slotId === 'sa')).toHaveLength(1);
  });

  it('자리 없는 경기는 팀이 비어 있는 쪽만 직접 칸으로 나오고, 반대편에 이미 있는 팀은 같은 경기에 못 들어간다', () => {
    const direct = makeBracket({
      groups: [semi], slots: [],
      fixtures: [makeFixture({ id: 'fd', groupId: 'gS', fixtureNumber: 1, homeRegistrationId: 'r1', homeTeamName: 'r1', game: makeGame() })],
    });
    const targets = teamFillTargets({ ...direct, registrationId: 'r3' });
    expect(targets).toEqual([expect.objectContaining({ fixtureId: 'fd', side: 'AWAY', slotId: null, label: expect.stringMatching(/ · 원정$/) })]);
    expect(teamFillTargets({ ...direct, registrationId: 'r1' })).toEqual([]);
  });

  it('직접 칸도 한 팀 한 조와 결승·3·4위전 충돌을 지킨다', () => {
    const final = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 3 });
    const third = makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place', sortOrder: 4 });
    const direct = makeBracket({
      groups: [groupA, groupB, final, third], slots: [],
      fixtures: [
        makeFixture({ id: 'fa', groupId: 'gA', fixtureNumber: 1, game: makeGame() }),
        makeFixture({ id: 'ff', groupId: 'g-final', fixtureNumber: 2, homeRegistrationId: 'r9', game: makeGame() }),
        makeFixture({ id: 'ft', groupId: 'g-third', fixtureNumber: 3, game: makeGame() }),
      ],
    });
    expect(teamFillTargets({ ...direct, registrationId: 'r2' }).map((target) => target.fixtureId)).not.toContain('fa');
    expect(teamFillTargets({ ...direct, registrationId: 'r1' }).map((target) => target.fixtureId)).toContain('fa');
    expect(teamFillTargets({ ...direct, registrationId: 'r9' }).map((target) => target.fixtureId)).not.toContain('ft');
    expect(teamFillTargets({ ...direct, registrationId: 'r4' }).map((target) => target.fixtureId)).toContain('ft');
  });

  it('라벨에 경기 이름과 홈·원정이 들어간다', () => {
    const [first] = targetsFor('r1');
    expect(first.label).toMatch(/1번 경기 · 홈$/);
  });
});
