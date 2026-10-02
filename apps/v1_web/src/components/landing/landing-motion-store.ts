/**
 * "움직임 멈추기" 상태. 버튼(내비)과 모션 컨트롤러(LandingRoot)가 서로 다른 섬이라
 * 모듈 하나를 공유 저장소로 쓴다. 새로고침하면 다시 재생 상태로 시작한다.
 */
type Listener = () => void;

let paused = false;
const listeners = new Set<Listener>();

export function getMotionPaused(): boolean {
  return paused;
}

export function setMotionPaused(next: boolean): void {
  if (next === paused) return;
  paused = next;
  for (const listener of listeners) listener();
}

export function subscribeMotionPaused(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
