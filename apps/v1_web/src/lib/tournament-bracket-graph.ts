import { byeRound } from './tournament-bracket-rounds';
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
  const seen = new Set<string>();
  for (const group of groups) {
    const meta = byeRound(group.phase);
    if (!meta || !rounds.some((round) => round.key === group.phase)) continue;
    for (const bye of group.groupTeams.filter((team) => team.isBye)) {
      const key = group.phase + ':' + (bye.registrationId ?? bye.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const node: BracketGraphNode = { id: bye.id ? 'bye-slot:' + bye.id : group.phase === 'round12' ? 'bye:' + bye.registrationId : 'bye:' + key, round: group.phase, bye, y: 0 };
      nodes.push(node); byId.set(node.id, node);
      for (const target of nodes.filter((candidate) => candidate.round === meta.next && candidate.fixture)) {
        for (const side of ['HOME', 'AWAY'] as const) {
          const registration = side === 'HOME' ? target.fixture!.homeRegistrationId : target.fixture!.awayRegistrationId;
          if (bye.registrationId && registration === bye.registrationId && !edges.some((edge) => edge.target === target.id && edge.side === side)) edges.push({ source: node.id, target: target.id, side, outcome: 'BYE' });
        }
      }
    }
  }
  // sortOrder is the insertion position among matches and byes.
  const rank = new Map<string, number>();
  rounds.forEach((round, roundIndex) => {
    const ordered = nodes.filter((node) => node.round === round.key && node.fixture);
    const byes = nodes.filter((node) => node.round === round.key && node.bye)
      .sort((a, b) => (a.bye!.sortOrder ?? 0) - (b.bye!.sortOrder ?? 0) || a.id.localeCompare(b.id));
    const legacyDefaultPositions = byes.length > 1 && byes.every((node) => (node.bye!.sortOrder ?? 0) === 0);
    let previousPosition = -1;
    for (const [index, node] of byes.entries()) {
      const requested = node.bye!.sortOrder ?? 0;
      // Earlier group-team rows stored roster order, not a bracket position.
      const meta = byeRound(round.key);
      const legacyPosition = round.key === 'round12' ? [0, 3, 4, 7][index] ?? index * 2 : index * 2;
      const insertion = meta && (legacyDefaultPositions || requested >= meta.positions) ? legacyPosition : requested;
      const position = Math.max(insertion, previousPosition + 1);
      ordered.splice(Math.min(position, ordered.length), 0, node);
      previousPosition = position;
    }
    ordered.forEach((node, index) => rank.set(node.id, roundIndex * 1000 + index));
  });
  // An entirely TBD bracket has no advancement edges yet. Keep every round
  // within the same vertical canvas without inventing winner relationships.
  if (edges.length === 0) {
    const columns = rounds.map((round) => nodes.filter((node) => node.round === round.key).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!));
    const columnHeights = columns.map((column) => column.reduce((sum, node) => sum + (node.bye ? 80 : 144), 0));
    const height = Math.max(144, ...columnHeights);
    columns.forEach((column, index) => {
      const gap = column.length ? (height - columnHeights[index]) / column.length : 0;
      let cursor = 0;
      for (const node of column) {
        const slotHeight = (node.bye ? 80 : 144) + gap;
        node.y = cursor + slotHeight / 2;
        cursor += slotHeight;
      }
    });
    return { nodes, edges, height };
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
  const rootRank = (node: BracketGraphNode): number => {
    const parents = edges.filter((edge) => edge.target === node.id).map((edge) => byId.get(edge.source)!);
    return parents.length ? Math.min(...parents.map(rootRank)) : rank.get(node.id)!;
  };
  const roots = nodes.filter((node) => !edges.some((edge) => edge.source === node.id));
  roots.sort((a, b) => rootRank(a) - rootRank(b)).forEach(position);
  return { nodes, edges, height: Math.max(cursor, 144) };
}

export function bracketConnectionPath(start: { x: number; y: number }, end: { x: number; y: number }, side: 'HOME' | 'AWAY') {
  const junction = start.x + (end.x - start.x) * (side === 'HOME' ? 0.4 : 0.6);
  return `M ${start.x} ${start.y} H ${junction} V ${end.y} H ${end.x}`;
}
