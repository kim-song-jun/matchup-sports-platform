/**
 * 팀 파울 경고 기준 — 팀 누적 파울이 이 개수에 이르면 운영 콘솔이 "다음부터 10m 프리킥"으로 예고하고, 넘으면 "세컨 파울 · 10m 프리킥"으로 알린다.
 *
 * 대회·리그(`V1Tournament.teamFoulThreshold`)마다 다를 수 있다. 컬럼이 null 이면 기본값을 쓴다.
 * 기본값을 컬럼에 채우지 않고 여기서 정하는 이유: 기존 모든 대회가 값 없이 지금과 같은 5개로 동작해야
 * 하고, 운영자가 입력란을 비운다는 말이 곧 "기본값으로 돌린다"라서다.
 */
export const DEFAULT_TEAM_FOUL_THRESHOLD = 5;
export const MIN_TEAM_FOUL_THRESHOLD = 1;
export const MAX_TEAM_FOUL_THRESHOLD = 20;

/** 저장된 값(null 포함)을 콘솔이 쓸 개수로 바꾼다. 범위 밖 값이 들어 있어도 기본값으로 읽는다. */
export function resolveTeamFoulThreshold(stored: number | null | undefined): number {
  if (typeof stored !== 'number' || !Number.isInteger(stored)) return DEFAULT_TEAM_FOUL_THRESHOLD;
  if (stored < MIN_TEAM_FOUL_THRESHOLD || stored > MAX_TEAM_FOUL_THRESHOLD) return DEFAULT_TEAM_FOUL_THRESHOLD;
  return stored;
}
