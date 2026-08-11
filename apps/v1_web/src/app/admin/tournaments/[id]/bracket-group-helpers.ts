/**
 * 대진 관리 "조 카드" 플로우의 순수 함수 모음.
 *
 * 여기 있는 함수는 전부 입력→출력만 있는 순수 함수라 컴포넌트 렌더링 없이 단위 테스트로
 * 검증할 수 있다(bracket-group-helpers.test.ts 참고). `roundRobinRounds`/`knockoutSeedPairs`
 * (lib/tournament-bracket-gen.ts)는 이미 검증된 페어링 로직이라 건드리지 않는다 — 이 파일은
 * 그 호출을 더 쉽게 만드는 상위 UX 레이어(조 이름 자동 채움·진출팀 추천·준비완료 판정)만 담당한다.
 */
import type {
  V1AdminBracketFixture,
  V1AdminBracketGroup,
  V1AdminBracketStanding,
  V1TournamentGroupPhase,
} from '@/types/api';

/** "+ 조 추가" 원클릭 템플릿 4종 — 기존 단계 select의 옵션 라벨을 그대로 재사용(신규 문구 0). */
export const GROUP_PHASE_TEMPLATES: { phase: V1TournamentGroupPhase; label: string }[] = [
  { phase: 'group', label: '조별' },
  { phase: 'semi', label: '준결승' },
  { phase: 'final', label: '결승' },
  { phase: 'third_place', label: '3위 결정전' },
];

const KNOCKOUT_PHASE_BASE_NAME: Record<'semi' | 'final' | 'third_place', string> = {
  semi: '4강',
  final: '결승',
  third_place: '3위 결정전',
};

/**
 * 단계를 고르면 이름까지 자동으로 채운다. 조별은 A조→B조→C조 순번, 결선 단계는 라벨
 * 그대로 쓰다가 이름이 겹치면 "4강 2"처럼 뒤에 번호를 붙인다.
 */
export function templateFor(
  phase: V1TournamentGroupPhase,
  existingGroups: Pick<V1AdminBracketGroup, 'name' | 'phase'>[],
): { name: string; phase: V1TournamentGroupPhase } {
  if (phase === 'group') {
    const n = existingGroups.filter((g) => g.phase === 'group').length;
    return { name: `${String.fromCharCode(65 + n)}조`, phase };
  }
  const base = KNOCKOUT_PHASE_BASE_NAME[phase];
  if (!existingGroups.some((g) => g.name === base)) return { name: base, phase };
  let n = 2;
  while (existingGroups.some((g) => g.name === `${base} ${n}`)) n += 1;
  return { name: `${base} ${n}`, phase };
}

/** 팀이 1명 이상 배정됐고 경기 일정도 1개 이상 있으면 "준비완료"로 본다(카드 기본 접힘 판정 기준). */
export function isGroupReady(group: V1AdminBracketGroup, fixtures: V1AdminBracketFixture[]): boolean {
  return group.groupTeams.length > 0 && fixtures.some((f) => f.groupId === group.id);
}

export interface QualifyingCandidate {
  id: string;
  label: string;
}

/**
 * 결선(semi/final/third_place) 조에 "예선 상위 진출팀" 추천 후보를 계산한다.
 * 클라이언트 추정치다 — 백엔드에 "이 결선 조가 어느 예선 조에서 올라오는지" 명시하는 관계
 * 필드가 없어서, 모든 group-phase 조의 상위 advanceCount(기본 2)명을 합쳐 이미 이 조에
 * 배정된 팀을 제외한 목록으로 근사한다. 강제가 아니라 추천이라 "다른 팀 검색"으로 언제나
 * 수동 우회 가능 — 예선 브라켓이 여러 개로 분리된 대형 대회에선 후보가 넓게 나올 수 있다.
 */
export function computeQualifyingShortlist(
  group: Pick<V1AdminBracketGroup, 'phase' | 'groupTeams'>,
  allGroups: V1AdminBracketGroup[],
  standings: V1AdminBracketStanding[],
): QualifyingCandidate[] {
  if (group.phase === 'group') return [];
  const already = new Set(group.groupTeams.map((gt) => gt.registrationId));
  const seen = new Set<string>();
  const pool: QualifyingCandidate[] = [];
  for (const g of allGroups) {
    if (g.phase !== 'group') continue;
    const topOfGroup = standings
      .filter((s) => s.groupId === g.id)
      .sort((a, b) => a.position - b.position)
      .slice(0, g.advanceCount ?? 2);
    for (const s of topOfGroup) {
      if (already.has(s.registrationId) || seen.has(s.registrationId)) continue;
      seen.add(s.registrationId);
      pool.push({ id: s.registrationId, label: s.teamName });
    }
  }
  return pool;
}
