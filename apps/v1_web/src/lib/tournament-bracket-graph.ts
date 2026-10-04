import type { V1TournamentFixture, V1TournamentGroup, V1TournamentGroupTeam } from '@/types/api';

export type BracketGraphRound = { key: string; label: string; fixtures: V1TournamentFixture[] };
export type BracketGraphNode = { id: string; round: string; y: number; fixture?: V1TournamentFixture; bye?: V1TournamentGroupTeam };
export type BracketGraphEdge = { source: string; target: string; side: 'HOME' | 'AWAY'; outcome: 'WINNER' | 'LOSER' | 'BYE' };

/** Edges come from stored advancement sources or an explicitly assigned bye team. */
export function buildBracketGraph(rounds: BracketGraphRound[], groups: V1TournamentGroup[]) {
  const nodes: BracketGraphNode[] = rounds.flatMap((round) => round.fixtures.map((fixture) => ({ id: fixture.id, round: round.key, fixture, y: 0 })));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: BracketGraphEdge[] = [];
  for (const node of nodes) {
    for (const source of node.fixture?.bracketSources ?? []) {
      const sourceNode = byId.get(source.fixtureId);
      const sourceIndex = rounds.findIndex((round) => round.key === sourceNode?.round);
      const targetIndex = rounds.findIndex((round) => round.key === node.round);
      if (sourceNode && sourceIndex + 1 === targetIndex) edges.push({ source: source.fixtureId, target: node.id, side: source.side, outcome: source.outcome });
    }
  }
  if (rounds.some((round) => round.key === 'round12')) {
    const seen = new Set<string>();
    for (const bye of groups.filter((group) => group.phase === 'round12').flatMap((group) => group.groupTeams.filter((team) => team.isBye))) {
      if (seen.has(bye.registrationId)) continue;
      seen.add(bye.registrationId);
      const node: BracketGraphNode = { id: `bye:${bye.registrationId}`, round: 'round12', bye, y: 0 };
      nodes.push(node); byId.set(node.id, node);
      for (const target of nodes.filter((candidate) => candidate.round === 'quarter' && candidate.fixture)) {
        for (const side of ['HOME', 'AWAY'] as const) {
          const registration = side === 'HOME' ? target.fixture!.homeRegistrationId : target.fixture!.awayRegistrationId;
          if (registration === bye.registrationId && !edges.some((edge) => edge.target === target.id && edge.side === side)) edges.push({ source: node.id, target: target.id, side, outcome: 'BYE' });
        }
      }
    }
  }
  // Traverse each destination backwards in HOME/AWAY order. Every pair shares
  // its own junction; there is no common spine connecting unrelated matches.
  let cursor = 0;
  const visited = new Set<string>();
  const position = (node: BracketGraphNode): number => {
    if (visited.has(node.id)) return node.y;
    visited.add(node.id);
    const parents = edges.filter((edge) => edge.target === node.id).sort((a, b) => a.side === b.side ? 0 : a.side === 'HOME' ? -1 : 1).map((edge) => byId.get(edge.source)!);
    if (parents.length) {
      const ys = parents.map(position);
      node.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    } else {
      const height = node.bye ? 80 : 144;
      node.y = cursor + height / 2;
      cursor += height;
    }
    return node.y;
  };
  for (const round of [...rounds].reverse()) for (const node of nodes.filter((candidate) => candidate.round === round.key)) position(node);
  return { nodes, edges, height: Math.max(cursor, 144) };
}

export function bracketConnectionPath(start: { x: number; y: number }, end: { x: number; y: number }, side: 'HOME' | 'AWAY') {
  const junction = start.x + (end.x - start.x) * (side === 'HOME' ? 0.4 : 0.6);
  return `M ${start.x} ${start.y} H ${junction} V ${end.y} H ${end.x}`;
}
