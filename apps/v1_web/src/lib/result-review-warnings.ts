/** D-9 안전망 — 확정을 막지 않는 정보성 경고. */
export function countMissingAssists(resultParticipants: readonly { goals: number; assists: number }[]): number {
  const totalGoals = resultParticipants.reduce((sum, row) => sum + row.goals, 0);
  const totalAssists = resultParticipants.reduce((sum, row) => sum + row.assists, 0);
  return Math.max(0, totalGoals - totalAssists);
}
