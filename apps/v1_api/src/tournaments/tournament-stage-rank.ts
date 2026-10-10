import { tournamentRoundLabel } from './tournament-round-label';

const PHASE_RANK: Readonly<Record<string, number>> = {
  group: 0,
  round16: 1,
  round12: 2,
  quarter: 3,
  semi: 4,
  third_place: 5,
  final: 5,
};

const ROUND_RANK: Readonly<Record<string, number>> = {
  '조별리그': 0,
  '16강': 1,
  '12강': 2,
  '8강': 3,
  '4강': 4,
  '준결승': 4,
  '3·4위전': 5,
  '결승': 5,
};

/**
 * 대회 안에서 경기가 속한 단계의 진행 순서(조별리그 0 → 결승 5). 3·4위전과 결승은 같은 단계다.
 * 조의 `phase` 가 있으면 그것을, 없으면(조 없는 토너먼트 경기) 라운드 이름을 읽는다.
 * 어느 쪽으로도 단계를 알 수 없는 운영자 입력 라운드는 `null` — 호출자가 비교에서 빼야 한다.
 */
export function competitionStageRank(input: { phase: string | null | undefined; round: string }): number | null {
  if (input.phase != null && input.phase in PHASE_RANK) return PHASE_RANK[input.phase];
  const round = input.round.trim();
  if (/^league_r\d+$/.test(round)) return 0;
  return ROUND_RANK[tournamentRoundLabel(round)] ?? null;
}
