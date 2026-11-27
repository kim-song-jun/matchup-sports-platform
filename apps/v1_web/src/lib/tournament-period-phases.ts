import type { TournamentPeriodPhase } from '@/hooks/use-tournament-period-settings';

/**
 * 단계별 경기 시간을 정할 수 있는 대회 단계. 리그 생성과 대회 정보의 경기 시간 편집기가 같이 쓴다.
 * round16 은 정규리그 + N개 토너먼트에서 12팀 결선의 첫 라운드('12강')도 담는다 — 그 라운드의 단계 코드가 틀 기준(16칸)이다.
 */
export const TOURNAMENT_PERIOD_PHASES: ReadonlyArray<{ value: TournamentPeriodPhase; label: string; shortLabel: string }> = [
  { value: 'group', label: '조별리그', shortLabel: '조별리그' }, { value: 'round64', label: '64강', shortLabel: '64강' },
  { value: 'round32', label: '32강', shortLabel: '32강' }, { value: 'round16', label: '16강 · 12팀 결선의 12강', shortLabel: '16강' },
  { value: 'round12', label: '12강', shortLabel: '12강' }, { value: 'quarter', label: '8강 · 6팀 대진의 6강', shortLabel: '8강' },
  { value: 'semi', label: '4강', shortLabel: '4강' }, { value: 'final', label: '결승', shortLabel: '결승' },
  { value: 'third_place', label: '3·4위전', shortLabel: '3·4위전' },
];

/** 단계를 고르는 목록과 단계별 카드 제목처럼 목록에서 단계를 구분할 때 쓰는 이름. 문장·알림에는 `tournamentPeriodPhaseShortLabel` 을 쓴다. */
export function tournamentPeriodPhaseLabel(phase: TournamentPeriodPhase) {
  return TOURNAMENT_PERIOD_PHASES.find((option) => option.value === phase)?.label ?? phase;
}

/** 문장·알림·설정 제목에 쓰는 짧은 단계 이름 — 6팀 대진·12팀 결선 설명은 붙이지 않는다. */
export function tournamentPeriodPhaseShortLabel(phase: TournamentPeriodPhase) {
  return TOURNAMENT_PERIOD_PHASES.find((option) => option.value === phase)?.shortLabel ?? phase;
}

/** 경기 시간 입력칸 이름 — 2개면 전·후반, 1개면 단판, 그 밖(옛 설정)은 n부. */
export function periodLabels(count: number): string[] {
  if (count === 1) return ['단판'];
  if (count === 2) return ['전반', '후반'];
  return Array.from({ length: count }, (_, index) => `${index + 1}부`);
}

/** 전·후반 ↔ 단판 전환. 합계는 지킨다 — 20+20 을 단판으로 바꾸면 40, 단판 40 을 나누면 20+20. */
export function switchPeriodCount(periodMinutes: readonly string[], count: 1 | 2): string[] {
  const total = periodMinutes.reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (count === 1) return [String(total)];
  const first = Math.ceil(total / 2);
  return [String(first), String(total - first)];
}
