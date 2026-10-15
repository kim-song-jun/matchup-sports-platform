/** 경기 화면과 참가 명단에서 같은 표시 이름과 순서를 사용한다. 실명은 관리용 보조 정보다. */
export function rosterDisplayName(player: { displayName?: string; nickname: string | null }): string {
  return player.displayName ?? player.nickname ?? '팀원';
}

/**
 * 운영진에게는 실명이 같이 내려온다(`realName`) — 현장에서 사람을 확인하는 쪽이라 `실명 (닉네임)` 으로 그린다.
 * 팀 화면에는 실명이 없어 표시 이름 그대로다. 실명과 닉네임이 같으면 한 번만 쓴다.
 */
export function rosterPersonLabel(person: { displayName: string; realName?: string }): string {
  return person.realName === undefined || person.realName === person.displayName
    ? person.displayName
    : `${person.realName} (${person.displayName})`;
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
