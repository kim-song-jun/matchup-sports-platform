/** 경기 화면과 참가 명단에서 같은 표시 이름과 순서를 사용한다. 실명은 관리용 보조 정보다. */
export function rosterDisplayName(player: { displayName?: string; nickname: string | null }): string {
  return player.displayName ?? player.nickname ?? '팀원';
}

export function compareRosterPlayers(
  a: { jerseyNumber: number | null; displayName: string; userId: string },
  b: { jerseyNumber: number | null; displayName: string; userId: string },
): number {
  if (a.jerseyNumber !== b.jerseyNumber) {
    if (a.jerseyNumber === null) return 1;
    if (b.jerseyNumber === null) return -1;
    return a.jerseyNumber - b.jerseyNumber;
  }
  return a.displayName.localeCompare(b.displayName, 'ko') || a.userId.localeCompare(b.userId);
}

export const GAME_ROSTER_TITLE = '이번 경기 출전 명단';
export const GAME_ROSTER_SCOPE = '출전 체크는 이번 경기에만 적용돼요.';
export const ROSTER_SAVE_LABEL = '변경사항 저장';
