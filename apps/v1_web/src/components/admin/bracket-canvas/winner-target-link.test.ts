import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture, V1BracketSource } from '@/types/api';
import { planWinnerTargetLink, winnerTargetOptions } from './winner-target-link';

const groups = [
  makeGroup({ id: 'g-semi', name: '4강', phase: 'semi' }),
  makeGroup({ id: 'g-final', name: '결승', phase: 'final' }),
  makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place' }),
];
const linkable = { game: { id: 'game', state: 'SCHEDULED', version: 1, hasLiveRecords: false, hasOfficialResult: false, latestRevision: null } } as const;
const fx = (id: string, groupId: string, fixtureNumber: number, bracketSources: V1BracketSource[] = [], extra: Partial<V1AdminBracketFixture> = {}) =>
  makeFixture({ id, groupId, fixtureNumber, bracketSources, ...linkable, ...extra });
const titleOf = (fixture: V1AdminBracketFixture) => `${fixture.fixtureNumber}번 경기`;
const win = (fixtureId: string, side: 'HOME' | 'AWAY'): V1BracketSource => ({ fixtureId, side, outcome: 'WINNER' });
const lose = (fixtureId: string, side: 'HOME' | 'AWAY'): V1BracketSource => ({ fixtureId, side, outcome: 'LOSER' });

describe('winnerTargetOptions', () => {
  const semi1 = fx('semi1', 'g-semi', 1);
  const semi2 = fx('semi2', 'g-semi', 2);

  it('4강 경기의 후보는 결승의 홈·원정 자리이고 3·4위전은 이긴 팀 후보가 아니다', () => {
    const final = fx('final', 'g-final', 3);
    const third = fx('third', 'g-third', 4);
    const result = winnerTargetOptions({ source: semi1, outcome: 'WINNER', groups, fixtures: [semi1, semi2, final, third], titleOf });
    expect(result.options).toEqual([
      { value: 'final:HOME', label: '3번 경기 · 홈 자리' },
      { value: 'final:AWAY', label: '3번 경기 · 원정 자리' },
    ]);
    expect(result.current).toBe('');
  });

  it('진 팀 후보는 3·4위전 자리뿐이다', () => {
    const final = fx('final', 'g-final', 3);
    const third = fx('third', 'g-third', 4);
    const result = winnerTargetOptions({ source: semi1, outcome: 'LOSER', groups, fixtures: [semi1, semi2, final, third], titleOf });
    expect(result.options.map(option => option.value)).toEqual(['third:HOME', 'third:AWAY']);
  });

  it('다른 4강이 이미 차지한 자리는 빠지고, 현재 연결은 항상 포함된다', () => {
    const final = fx('final', 'g-final', 3, [win('semi1', 'HOME'), win('semi2', 'AWAY')]);
    const forSemi1 = winnerTargetOptions({ source: semi1, outcome: 'WINNER', groups, fixtures: [semi1, semi2, final], titleOf });
    expect(forSemi1.options.map(option => option.value)).toEqual(['final:HOME']);
    expect(forSemi1.current).toBe('final:HOME');
    const forSemi2 = winnerTargetOptions({ source: semi2, outcome: 'WINNER', groups, fixtures: [semi1, semi2, final], titleOf });
    expect(forSemi2.options.map(option => option.value)).toEqual(['final:AWAY']);
    expect(forSemi2.current).toBe('final:AWAY');
  });

  it('결승 경기에는 후보가 없다(이 대회에서 결승 위 단계가 없다)', () => {
    const final = fx('final', 'g-final', 3);
    expect(winnerTargetOptions({ source: final, outcome: 'WINNER', groups, fixtures: [semi1, final], titleOf })).toEqual({ options: [], current: '' });
  });

  it('이미 시작된 대상 경기는 새 후보에서 빠지지만 현재 연결이면 남는다', () => {
    const started = fx('final', 'g-final', 3, [win('semi1', 'HOME')], { game: { ...linkable.game, state: 'LIVE' } });
    const fresh = winnerTargetOptions({ source: semi2, outcome: 'WINNER', groups, fixtures: [semi1, semi2, started], titleOf });
    expect(fresh.options).toEqual([]);
    const current = winnerTargetOptions({ source: semi1, outcome: 'WINNER', groups, fixtures: [semi1, semi2, started], titleOf });
    expect(current.options.map(option => option.value)).toEqual(['final:HOME']);
  });
});

describe('planWinnerTargetLink', () => {
  const semi1 = fx('semi1', 'g-semi', 1);
  const semi2 = fx('semi2', 'g-semi', 2);

  it('4강 1번 → 결승 홈 자리: 결승 대상 patch 하나, 반대편 자리의 출처는 그대로', () => {
    const final = fx('final', 'g-final', 3, [win('semi2', 'AWAY')]);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, semi2, final], nextValue: 'final:HOME' }))
      .toEqual([{ fixtureId: 'final', homeSourceFixtureId: 'semi1', awaySourceFixtureId: 'semi2' }]);
  });

  it('반대편이 비어 있으면 null 로 보낸다', () => {
    const final = fx('final', 'g-final', 3);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, semi2, final], nextValue: 'final:AWAY' }))
      .toEqual([{ fixtureId: 'final', homeSourceFixtureId: null, awaySourceFixtureId: 'semi1' }]);
  });

  it('같은 경기 안에서 홈 → 원정으로 옮기면 한 건(홈 null, 원정 4강1)', () => {
    const final = fx('final', 'g-final', 3, [win('semi1', 'HOME')]);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, semi2, final], nextValue: 'final:AWAY' }))
      .toEqual([{ fixtureId: 'final', homeSourceFixtureId: null, awaySourceFixtureId: 'semi1' }]);
  });

  it('다른 경기로 바꾸면 [옛 대상 해제, 새 대상 설정] 순서', () => {
    const third = fx('third', 'g-third', 4);
    const final = fx('final', 'g-final', 3, [win('semi1', 'HOME'), win('semi2', 'AWAY')]);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, semi2, final, third], nextValue: 'third:HOME' }))
      .toEqual([
        { fixtureId: 'final', homeSourceFixtureId: null, awaySourceFixtureId: 'semi2' },
        { fixtureId: 'third', homeSourceFixtureId: 'semi1', awaySourceFixtureId: null },
      ]);
  });

  it('nextValue 가 비어 있으면 해제만 한다(반대편 출처는 보존)', () => {
    const final = fx('final', 'g-final', 3, [win('semi1', 'HOME'), win('semi2', 'AWAY')]);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, semi2, final], nextValue: '' }))
      .toEqual([{ fixtureId: 'final', homeSourceFixtureId: null, awaySourceFixtureId: 'semi2' }]);
  });

  it('연결이 없는데 비우거나, 지금과 같은 자리를 고르면 아무것도 하지 않는다', () => {
    const unlinked = fx('final', 'g-final', 3);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, unlinked], nextValue: '' })).toEqual([]);
    const linked = fx('final', 'g-final', 3, [win('semi1', 'HOME')]);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'WINNER', fixtures: [semi1, linked], nextValue: 'final:HOME' })).toEqual([]);
  });

  it('진 팀 연결은 이긴 팀 연결을 건드리지 않는다(결과 구분)', () => {
    const final = fx('final', 'g-final', 3, [win('semi1', 'HOME')]);
    const third = fx('third', 'g-third', 4, [lose('semi2', 'AWAY')]);
    expect(planWinnerTargetLink({ source: semi1, outcome: 'LOSER', fixtures: [semi1, semi2, final, third], nextValue: 'third:HOME' }))
      .toEqual([{ fixtureId: 'third', homeSourceFixtureId: 'semi1', awaySourceFixtureId: 'semi2' }]);
  });
});
