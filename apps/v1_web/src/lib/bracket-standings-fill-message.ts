import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';

/** 순위대로 채운 결과를 토스트 한 줄로. `assignments` 는 이미 맞게 들어 있던 자리까지 포함한 최종 배정이다. */
export function describeStandingsFill(result: V1FillSlotsFromStandingsResult): string {
  if (result.assignments.length === 0) return '채울 수 있는 자리가 없었어요.';
  const filled = `${result.assignments.length}개 자리를 순위대로 채웠어요.`;
  return result.skipped.length === 0 ? filled : `${filled} ${result.skipped.length}개 자리는 건너뛰었어요.`;
}
