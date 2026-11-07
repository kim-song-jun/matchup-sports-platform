export const OPEN_IN_APP_HIDDEN_UNTIL_KEY = 'teameet:v1:open-in-app:hidden-until';
export const OPEN_IN_APP_HIDE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// localStorage 를 못 쓰는 환경(사파리 개인 모드 등)에서는 같은 페이지 수명 동안만 다시 안 띄운다.
let hiddenInMemory = false;

export function isOpenInAppHidden(now = Date.now()): boolean {
  if (hiddenInMemory) return true;
  try {
    const hiddenUntil = Number(window.localStorage.getItem(OPEN_IN_APP_HIDDEN_UNTIL_KEY));
    // 숨김 기간보다 먼 미래 값은 기기 시계가 어긋났거나 잘못 쓰인 값이라 믿지 않는다 — 배너가 영영 안 뜨게 되기 때문이다.
    return hiddenUntil > now && hiddenUntil <= now + OPEN_IN_APP_HIDE_DURATION_MS;
  } catch {
    return false;
  }
}

export function hideOpenInApp(now = Date.now()): void {
  try {
    window.localStorage.setItem(OPEN_IN_APP_HIDDEN_UNTIL_KEY, String(now + OPEN_IN_APP_HIDE_DURATION_MS));
  } catch {
    hiddenInMemory = true;
  }
}
