/**
 * 대회·리그 경기 명단 화면. 서버 알림 딥링크(`lineup-todo.service.ts` 의 `rosterScreenPath`)와
 * 같은 값이어야 한다 — 어긋나면 알림을 눌렀을 때와 화면 안 링크가 서로 다른 곳으로 간다.
 */
export function gameRosterScreenPath(teamId: string, gameId: string): string {
  return `/teams/${teamId}/games/${gameId}/roster`;
}

/** 대회·리그 참가 명단(등번호+이름) 화면. 신청 id 를 모르면 그 대회의 내 신청 화면에서 팀을 고른다. */
export function registrationRosterPath(competitionId: string, registrationId: string | null): string {
  return registrationId === null
    ? `/tournaments/${competitionId}/my`
    : `/tournaments/${competitionId}/registrations/${registrationId}/roster`;
}
