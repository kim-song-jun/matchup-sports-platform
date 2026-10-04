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
