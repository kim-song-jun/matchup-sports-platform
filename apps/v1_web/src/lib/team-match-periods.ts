// The persisted v1 competition-period validator casts durationMinutes to PostgreSQL int4.
export const MAX_TEAM_MATCH_PERIOD_MINUTES = 2147483647;

export const TEAM_MATCH_PERIOD_MINUTES_ERROR =
  `경기 시간은 1분 이상 ${MAX_TEAM_MATCH_PERIOD_MINUTES}분 이하의 정수로 입력해 주세요.`;

export function validTeamMatchPeriodMinutes(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_TEAM_MATCH_PERIOD_MINUTES;
}
