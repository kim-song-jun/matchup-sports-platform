/**
 * 대회·리그 경기 명단 화면. 서버 알림 딥링크(`lineup-todo.service.ts` 의 `rosterScreenPath`)와
 * 같은 값이어야 한다 — 어긋나면 알림을 눌렀을 때와 화면 안 링크가 서로 다른 곳으로 간다.
 */
export function gameRosterScreenPath(teamId: string, gameId: string): string {
  return `/teams/${teamId}/games/${gameId}/roster`;
}
