/**
 * 홈 카드의 인원 표기("1/6명" · "마감 임박")를 한 곳에서 판단한다.
 *
 * 인원을 **모르는 상태**와 **0명인 상태**는 다르다. 서버가 참가 인원·정원을 주지 않으면
 * 숫자를 지어내지 말고 null 을 돌려주고, 화면은 인원 줄과 배지를 통째로 그리지 않는다 —
 * 예전에는 여기서 0/1 을 채워 넣어, 실제로는 1/6명인 매치가 홈에서 "0/1명 · 마감 임박"
 * 으로 보였다(2026-09-07 프로덕션 제보).
 */
export type HomeCapacity = {
  current: number;
  max: number;
  /** 잔여 3자리 이하 + 아직 자리가 남은 경우에만 참. */
  almostFull: boolean;
};

export function homeCapacity(current: number | null, max: number | null): HomeCapacity | null {
  if (current === null || max === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;
  if (max <= 0) return null;

  return { current, max, almostFull: max - current <= 3 && current < max };
}
