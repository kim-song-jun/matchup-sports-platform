/**
 * 탈퇴 유예가 끝나는 시각(ISO)으로 쓸 수 있는 값. 문자열이 아니거나 읽을 수 없거나 이미 지난(지금과 같은 순간 포함)
 * 시각이면 null — 화면은 그것을 "끝나는 날을 모른다"와 같게 다뤄 날짜가 든 안내를 그리지 않는다.
 * 서버 응답·저장값·렌더 어디서든 날짜를 쓰기 전에 이 한 곳을 거친다.
 */
export function usableWithdrawalDate(value: unknown, nowMs: number = Date.now()): string | null {
  if (typeof value !== 'string') return null;
  const endsAt = Date.parse(value);
  return Number.isNaN(endsAt) || endsAt <= nowMs ? null : value;
}
