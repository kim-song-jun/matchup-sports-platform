import type { V1TournamentGroup } from '@/types/api';

/** 서버 `orderBy: [{ phase }, { sortOrder }, { bracketTrack }]` 의 phase 순서(Prisma enum 선언 순서). */
const PHASE_ORDER = ['group', 'round64', 'round32', 'round16', 'round12', 'quarter', 'semi', 'final', 'third_place'];

export type NamedFinalSpec = { name: string; teams: number };

/**
 * N개 토너먼트 대회의 결선 그룹을 서버가 내려주는 모양 그대로 만든다 — 트랙번호*100+단계 sortOrder,
 * 3·4위전은 +99, 응답 순서는 phase → sortOrder → 트랙 이름. 팀 수가 다르면 토너먼트마다 첫 단계가 달라
 * 응답 순서가 만든 순서와 갈린다.
 */
export function namedFinalGroups(finals: NamedFinalSpec[]): V1TournamentGroup[] {
  const base = { advanceCount: null, groupTeams: [], standings: [], qualification: null };
  const groups: V1TournamentGroup[] = ['A조', 'B조'].map((name, index) => ({
    ...base, id: `group-${name}`, name, phase: 'group', sortOrder: index, bracketTrack: 'overall',
  }));
  finals.forEach((final, trackIndex) => {
    const chain = final.teams > 8 ? ['round16', 'quarter', 'semi', 'final'] : ['quarter', 'semi', 'final'];
    chain.forEach((phase, roundIndex) => {
      groups.push({ ...base, id: `${final.name}-${phase}`, name: `${final.name} · ${phase}`, phase, sortOrder: trackIndex * 100 + roundIndex, bracketTrack: final.name });
    });
    groups.push({ ...base, id: `${final.name}-third_place`, name: `${final.name} · 3·4위전`, phase: 'third_place', sortOrder: trackIndex * 100 + 99, bracketTrack: final.name });
  });
  return groups.sort((a, b) =>
    PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase)
    || a.sortOrder - b.sortOrder
    || (a.bracketTrack ?? '').localeCompare(b.bracketTrack ?? '', 'ko'));
}
