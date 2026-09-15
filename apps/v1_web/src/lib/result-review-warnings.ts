/**
 * D-9 안전망 — 확정을 막지 않는 정보성 경고.
 *
 * 어시스트 입력란이 있는 이벤트 소스(대회 라이브 기록 콘솔)의 결과에만 사용한다.
 * 친선 팀매치 자가 제출 폼처럼 어시스트 입력 자체가 없는 소스에 쓰면
 * totalAssists가 항상 0이라 골이 하나만 있어도 예외 없이 경고가 뜬다 —
 * 그런 소스에는 이 함수를 호출하지 않는다(team-match-result-client.tsx 참고).
 */
export function countMissingAssists(resultParticipants: readonly { goals: number; assists: number }[]): number {
  const totalGoals = resultParticipants.reduce((sum, row) => sum + row.goals, 0);
  const totalAssists = resultParticipants.reduce((sum, row) => sum + row.assists, 0);
  return Math.max(0, totalGoals - totalAssists);
}
