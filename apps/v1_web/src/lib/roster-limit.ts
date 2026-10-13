/**
 * 팀 명단 인원 표기. 리그는 정원을 '제한 없음'(maxPlayers = null)으로 둘 수 있어, 화면마다 다른 범위 문구 대신
 * 이 한 줄을 쓴다.
 */
export function rosterLimitText(
  minPlayers: number,
  maxPlayers: number | null,
  format: (min: number, max: number) => string,
): string {
  return maxPlayers === null ? '인원 제한 없음' : format(minPlayers, maxPlayers);
}
