import type { V1TournamentGroup } from '@/types/api';

/** 서버 `orderBy: [{ phase }, { sortOrder }, { bracketTrack }]` 의 phase 순서(Prisma enum 선언 순서). */
const PHASE_ORDER = ['group', 'round64', 'round32', 'round16', 'round12', 'quarter', 'semi', 'final', 'third_place'];

export type NamedFinalSpec = { name: string; teams: number };

/** 틀의 칸 수(팀 수 이상의 2의 거듭제곱)별 단계 코드 — `planNamedFinals` 와 같다. */
function phaseOfWidth(width: number): string {
  return width >= 64 ? 'round64' : width === 32 ? 'round32' : width === 16 ? 'round16' : width === 8 ? 'quarter' : width === 4 ? 'semi' : 'final';
}

/**
 * N개 토너먼트 대회의 결선 그룹을 서버가 내려주는 모양 그대로 만든다 — 트랙번호*100+단계 sortOrder,
 * 3·4위전은 +99, 응답 순서는 phase → sortOrder → 트랙 이름. 팀 수가 다르면 토너먼트마다 첫 단계가 달라
 * 응답 순서가 만든 순서와 갈린다. 이 공식의 정답은 서버 `planNamedFinals` 이고
 * `multi-finals-plan.spec.ts` 의 sortOrder 단언이 지킨다.
 */
export function namedFinalGroups(finals: NamedFinalSpec[]): V1TournamentGroup[] {
  const base = { advanceCount: null, groupTeams: [], standings: [], qualification: null };
  const groups: V1TournamentGroup[] = ['A조', 'B조'].map((name, index) => ({
    ...base, id: `group-${name}`, name, phase: 'group', sortOrder: index, bracketTrack: 'overall',
  }));
  finals.forEach((final, trackIndex) => {
    const chain: string[] = [];
    for (let width = 2 ** Math.ceil(Math.log2(final.teams)); width >= 2; width /= 2) chain.push(phaseOfWidth(width));
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
