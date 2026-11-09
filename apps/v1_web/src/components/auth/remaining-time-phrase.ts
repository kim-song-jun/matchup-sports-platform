/** 남은 시간을 모자라게 약속하는 말 — 9분 30초 남았으면 "9분 안에". 로그인 화면의 대기 안내들이 같이 쓴다. */
export function remainingTimePhrase(expiresAtMs: number, nowMs: number): string {
  const minutesLeft = Math.floor((expiresAtMs - nowMs) / 60_000);
  return minutesLeft >= 1 ? `${minutesLeft}분 안에` : '1분 이내에';
}
