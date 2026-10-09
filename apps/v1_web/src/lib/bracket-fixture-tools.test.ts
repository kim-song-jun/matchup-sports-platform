import { describe, expect, it } from 'vitest';
import { makeFixture, makeGame, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketResult } from '@/types/api';
import { bracketSourceCandidates, knockoutRoundLabel, nextFixtureNumber } from './bracket-fixture-tools';

describe('knockoutRoundLabel', () => {
  it.each([
    ['round16', '16강'],
    ['round12', '12강'],
    ['quarter', '8강'],
    ['semi', '4강'],
    ['final', '결승'],
    ['third_place', '3·4위전'],
  ])('%s → %s', (phase, label) => {
    expect(knockoutRoundLabel(phase)).toBe(label);
  });

  it('조별리그 단계는 null — 캔버스에서 경기를 추가하지 않는다', () => {
    expect(knockoutRoundLabel('group')).toBeNull();
  });
});

describe('nextFixtureNumber', () => {
  it('가장 큰 번호 다음 번호를 돌려준다(번호가 비어 있어도 최대값 기준)', () => {
    expect(nextFixtureNumber([{ fixtureNumber: 1 }, { fixtureNumber: 7 }, { fixtureNumber: 3 }])).toBe(8);
  });

  it('경기가 없으면 1', () => {
    expect(nextFixtureNumber([])).toBe(1);
  });
});

describe('bracketSourceCandidates', () => {
  const qf = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
  const sf = makeGroup({ id: 'g-sf', name: '4강', phase: 'semi' });
  const fin = makeGroup({ id: 'g-fin', name: '결승', phase: 'final' });
  const q1 = makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1 });
  const q2 = makeFixture({ id: 'q2', groupId: 'g-qf', fixtureNumber: 2 });
  const s1 = makeFixture({ id: 's1', groupId: 'g-sf', fixtureNumber: 5 });
  const f1 = makeFixture({ id: 'f1', groupId: 'g-fin', fixtureNumber: 7 });
  const groups = [qf, sf, fin];

  it('바로 앞 단계 경기만 후보다 — 4강 경기의 후보는 8강, 결승의 후보는 4강', () => {
    const fixtures = [q1, q2, s1, f1];
    expect(bracketSourceCandidates({ target: s1, groups, fixtures }).map((f) => f.id)).toEqual(['q1', 'q2']);
    expect(bracketSourceCandidates({ target: f1, groups, fixtures }).map((f) => f.id)).toEqual(['s1']);
  });

  it('이미 시작했거나 결과가 있거나 2회전·하위 경기인 앞 단계 경기는 뺀다', () => {
    const started = makeFixture({ id: 'q3', groupId: 'g-qf', fixtureNumber: 3, status: 'in_progress' });
    const withGame = makeFixture({ id: 'q4', groupId: 'g-qf', fixtureNumber: 4, game: makeGame({ state: 'LIVE' }) });
    const withResult = makeFixture({
      id: 'q7',
      groupId: 'g-qf',
      fixtureNumber: 7,
      result: { id: 'r', fixtureId: 'q7', homeScore: 1, awayScore: 0, hasPenalty: false } as V1AdminBracketResult,
    });
    const leg2 = makeFixture({ id: 'q5', groupId: 'g-qf', fixtureNumber: 5, legNumber: 2 });
    const child = makeFixture({ id: 'q6', groupId: 'g-qf', fixtureNumber: 6, parentFixtureId: 'q1' });
    const candidates = bracketSourceCandidates({ target: s1, groups, fixtures: [q1, started, withGame, withResult, leg2, child, s1] });
    expect(candidates.map((f) => f.id)).toEqual(['q1']);
  });

  it('8강 경기의 후보는 16강 경기다(quarter ← round16)', () => {
    const r16 = makeGroup({ id: 'g-r16', name: '16강', phase: 'round16' });
    const r1 = makeFixture({ id: 'r1', groupId: 'g-r16', fixtureNumber: 1 });
    const r2 = makeFixture({ id: 'r2', groupId: 'g-r16', fixtureNumber: 2 });
    expect(bracketSourceCandidates({ target: q1, groups: [r16, qf], fixtures: [r1, r2, q1] }).map((f) => f.id)).toEqual(['r1', 'r2']);
  });

  it('앞 단계가 없는 8강 경기(12강·16강 없는 대진)나 조별리그 경기는 후보가 없다', () => {
    expect(bracketSourceCandidates({ target: q1, groups, fixtures: [q1, q2] })).toEqual([]);
  });
});
