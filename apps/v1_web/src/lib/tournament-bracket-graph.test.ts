import { describe, expect, it } from 'vitest';
import { buildBracketGraph, bracketConnectionPath } from './tournament-bracket-graph';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';
const fixture = (id: string, sources: V1TournamentFixture['bracketSources'] = []): V1TournamentFixture => ({ id, bracketSources: sources } as V1TournamentFixture);
const source = (fixtureId: string, side: 'HOME' | 'AWAY') => ({ fixtureId, side, outcome: 'WINNER' as const });

describe('경기별 진출 그래프', () => {
  it('8강 네 경기를 각각의 4강과 결승에 연결하며 교차 없이 부모를 가운데 배치한다', () => {
    const graph = buildBracketGraph([
      { key: 'quarter', label: '8강', fixtures: [fixture('q1'), fixture('q2'), fixture('q3'), fixture('q4')] },
      { key: 'semi', label: '4강', fixtures: [fixture('s1', [source('q1', 'HOME'), source('q2', 'AWAY')]), fixture('s2', [source('q3', 'HOME'), source('q4', 'AWAY')])] },
      { key: 'final', label: '결승', fixtures: [fixture('f', [source('s1', 'HOME'), source('s2', 'AWAY')])] },
    ], []);
    const y = (id: string) => graph.nodes.find((node) => node.id === id)!.y;
    expect(graph.edges.map((edge) => `${edge.source}:${edge.target}`)).toEqual(['q1:s1', 'q2:s1', 'q3:s2', 'q4:s2', 's1:f', 's2:f']);
    expect(y('s1')).toBe((y('q1') + y('q2')) / 2);
    expect(y('s2')).toBe((y('q3') + y('q4')) / 2);
    expect(y('f')).toBe((y('s1') + y('s2')) / 2);
    expect(y('q2')).toBeLessThan(y('q3'));
  });
  it('12강 부전승은 명시적 registration 배정으로만 8강 자리와 연결하며 점수 경기를 생성하지 않는다', () => {
    const graph = buildBracketGraph([
      { key: 'round12', label: '12강', fixtures: [fixture('r1')] },
      { key: 'quarter', label: '8강', fixtures: [{ ...fixture('q1', [source('r1', 'AWAY')]), homeRegistrationId: 'bye-team' }] },
    ], [{ phase: 'round12', groupTeams: [{ registrationId: 'bye-team', isBye: true }, { registrationId: 'unassigned', isBye: true }] } as V1TournamentGroup]);
    expect(graph.edges).toContainEqual({ source: 'bye:bye-team', target: 'q1', side: 'HOME', outcome: 'BYE' });
    expect(graph.edges.some((edge) => edge.source === 'bye:unassigned')).toBe(false);
    expect(graph.nodes.filter((node) => node.fixture)).toHaveLength(2);
    expect(graph.nodes.find((node) => node.id === 'bye:bye-team')!.y).toBeLessThan(graph.nodes.find((node) => node.id === 'r1')!.y);
  });
  it('연결 정보가 없는 수동 대진을 번호 순서로 연결하지 않는다', () => {
    expect(buildBracketGraph([{ key: 'semi', label: '4강', fixtures: [fixture('s1'), fixture('s2')] }, { key: 'final', label: '결승', fixtures: [fixture('f')] }], []).edges).toEqual([]);
  });
  it('중간 접합점을 통해 실제 팀 자리까지 연결선을 만든다', () => {
    expect(bracketConnectionPath({ x: 180, y: 50 }, { x: 236, y: 125 }, 'HOME')).toBe('M 180 50 H 202.4 V 125 H 236');
  });
});

it('12강 미연결 부전승 네 팀도 이미지의 경기 사이 위치에 놓는다', () => {
  const graph = buildBracketGraph([{ key: 'round12', label: '12강', fixtures: ['r1', 'r2', 'r3', 'r4'].map((id) => fixture(id)) }],
    [{ phase: 'round12', groupTeams: [0, 3, 4, 7].map((sortOrder, index) => ({ registrationId: 'b' + index, isBye: true, sortOrder })) } as V1TournamentGroup]);
  expect([...graph.nodes].sort((a, b) => a.y - b.y).map((node) => node.id)).toEqual(['bye:b0', 'r1', 'r2', 'bye:b1', 'bye:b2', 'r3', 'r4', 'bye:b3']);
  expect(graph.edges).toEqual([]);
});
it('8강과 4강 부전승은 각 다음 라운드의 실제 등록 팀 자리로 연결한다', () => {
  const graph = buildBracketGraph([
    { key: 'quarter', label: '8강', fixtures: [] },
    { key: 'semi', label: '4강', fixtures: [{ ...fixture('s'), homeRegistrationId: 'b8' }] },
    { key: 'final', label: '결승', fixtures: [{ ...fixture('f'), awayRegistrationId: 'b4' }] },
  ], [
    { phase: 'quarter', groupTeams: [{ registrationId: 'b8', isBye: true, sortOrder: 0 }] },
    { phase: 'semi', groupTeams: [{ registrationId: 'b4', isBye: true, sortOrder: 1 }] },
  ] as V1TournamentGroup[]);
  expect(graph.edges).toContainEqual({ source: 'bye:quarter:b8', target: 's', side: 'HOME', outcome: 'BYE' });
  expect(graph.edges).toContainEqual({ source: 'bye:semi:b4', target: 'f', side: 'AWAY', outcome: 'BYE' });
});

it('이미지의 12강 배치가 네 8강 가지와 각각 연결된다', () => {
  const q = (id: string, sourceId: string, side: 'HOME' | 'AWAY', byeId: string): V1TournamentFixture => ({
    ...fixture(id, [source(sourceId, side)]),
    ...(side === 'HOME' ? { awayRegistrationId: byeId } : { homeRegistrationId: byeId }),
  });
  const graph = buildBracketGraph([
    { key: 'round12', label: '12강', fixtures: ['r1', 'r2', 'r3', 'r4'].map((id) => fixture(id)) },
    { key: 'quarter', label: '8강', fixtures: [q('q1', 'r1', 'AWAY', 'b0'), q('q2', 'r2', 'HOME', 'b1'), q('q3', 'r3', 'AWAY', 'b2'), q('q4', 'r4', 'HOME', 'b3')] },
    { key: 'semi', label: '4강', fixtures: [fixture('s1', [source('q1', 'HOME'), source('q2', 'AWAY')]), fixture('s2', [source('q3', 'HOME'), source('q4', 'AWAY')])] },
    { key: 'final', label: '결승', fixtures: [fixture('f', [source('s1', 'HOME'), source('s2', 'AWAY')])] },
  ], [{ phase: 'round12', groupTeams: [0, 3, 4, 7].map((sortOrder, i) => ({ registrationId: 'b' + i, isBye: true, sortOrder })) } as V1TournamentGroup]);
  const first = graph.nodes.filter((node) => node.round === 'round12').sort((a, b) => a.y - b.y);
  expect(first.map((node) => node.id)).toEqual(['bye:b0', 'r1', 'r2', 'bye:b1', 'bye:b2', 'r3', 'r4', 'bye:b3']);
  expect(graph.edges).toHaveLength(14);
  expect(graph.nodes.filter((node) => node.fixture)).toHaveLength(11);
  for (const id of ['q1', 'q2', 'q3', 'q4']) {
    const sources = graph.edges.filter((edge) => edge.target === id).map((edge) => graph.nodes.find((node) => node.id === edge.source)!.y);
    expect(graph.nodes.find((node) => node.id === id)!.y).toBe((sources[0] + sources[1]) / 2);
  }
});

it('기존 팀 명단 순번 10·11로 저장된 12강 부전승도 아래에 모으지 않는다', () => {
  const graph = buildBracketGraph([{ key: 'round12', label: '12강', fixtures: [fixture('r1'), fixture('r2')] }],
    [{ phase: 'round12', groupTeams: [10, 11].map((sortOrder, i) => ({ registrationId: 'b' + i, isBye: true, sortOrder })) } as V1TournamentGroup]);
  expect([...graph.nodes].sort((a, b) => a.y - b.y).map((node) => node.id)).toEqual(['bye:b0', 'r1', 'r2', 'bye:b1']);
});

it('기존 부전승 모두 기본 위치 0이면 이미지의 경기 사이 자리로 나눈다', () => {
  const graph = buildBracketGraph([{ key: 'round12', label: '12강', fixtures: ['r1', 'r2', 'r3', 'r4'].map((id) => fixture(id)) }],
    [{ phase: 'round12', groupTeams: Array.from({ length: 4 }, (_, i) => ({ registrationId: 'b' + i, isBye: true, sortOrder: 0 })) } as V1TournamentGroup]);
  expect([...graph.nodes].sort((a, b) => a.y - b.y).map((node) => node.id)).toEqual(['bye:b0', 'r1', 'r2', 'bye:b1', 'bye:b2', 'r3', 'r4', 'bye:b3']);
});

it('미정 12강 4경기·부전승 4자리와 8강4·4강2·결승1·3위전1을 먼저 만든다', () => {
  const rounds = [['round12', 4], ['quarter', 4], ['semi', 2], ['final', 1], ['third_place', 1]].map(([key, count]) => ({ key: String(key), label: String(key), fixtures: Array.from({ length: Number(count) }, (_, i) => ({ ...fixture(String(key) + i), homeRegistrationId: null, awayRegistrationId: null })) }));
  const groups = [{ phase: 'round12', groupTeams: [0, 3, 4, 7].map((sortOrder, i) => ({ id: 'slot-' + i, registrationId: null, isBye: true, sortOrder })) }] as V1TournamentGroup[];
  const graph = buildBracketGraph(rounds, groups);
  expect(graph.nodes.filter((node) => node.fixture)).toHaveLength(12);
  expect(graph.nodes.filter((node) => node.bye)).toHaveLength(4);
  expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(16);
  expect(graph.edges).toEqual([]);
  expect(graph.nodes.filter((node) => node.round === 'round12').sort((a,b) => a.y-b.y).map((node) => node.id)).toEqual(['bye-slot:slot-0', 'round120', 'round121', 'bye-slot:slot-1', 'bye-slot:slot-2', 'round122', 'round123', 'bye-slot:slot-3']);
  expect(graph.height).toBe(896);
  expect(graph.nodes.filter((node) => node.round === 'quarter').map((node) => node.y)).toEqual([112, 336, 560, 784]);
  expect(graph.nodes.find((node) => node.round === 'final')?.y).toBe(448);
  groups[0].groupTeams[0].registrationId = 'assigned-team';
  expect(buildBracketGraph(rounds, groups).nodes.find((node) => node.id === 'bye-slot:slot-0')?.bye?.registrationId).toBe('assigned-team');
});
