export const V1_USER_ID_KEY = 'teameet.v1.userId';
export const V1_USER_EMAIL_KEY = 'teameet.v1.userEmail';
export const V1_SESSION_HINT_KEY = 'teameet.v1.session';
// sessionStorage (not localStorage): the push nudge banner should reappear on
// every fresh login, not stay dismissed forever — sessionStorage clears itself
// when the tab/browser closes, and saveStoredV1Session() below also clears it
// explicitly on every successful login so a logout+login within the same tab
// resets it too.
export const V1_PUSH_NUDGE_DISMISSED_KEY = 'teameet.v1.pushNudgeDismissed';

export type StoredV1Session = {
  userId: string | null;
  userEmail: string | null;
};

export function getStoredV1Session(): StoredV1Session {
  if (typeof window === 'undefined') return { userId: null, userEmail: null };

  return {
    userId: window.localStorage.getItem(V1_USER_ID_KEY),
    userEmail: window.localStorage.getItem(V1_USER_EMAIL_KEY),
  };
}

export function hasStoredV1Session() {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') {
    return window.localStorage.getItem(V1_SESSION_HINT_KEY) === 'active';
  }
  const session = getStoredV1Session();
  return Boolean(session.userId || session.userEmail);
}

export function shouldProbeV1Session() {
  return process.env.NODE_ENV === 'production' || hasStoredV1Session();
}

export function saveStoredV1Session(session: { userId: string; userEmail?: string | null }) {
  window.localStorage.setItem(V1_SESSION_HINT_KEY, 'active');
  window.sessionStorage.removeItem(V1_PUSH_NUDGE_DISMISSED_KEY);
  if (process.env.NODE_ENV === 'production') {
    window.localStorage.removeItem(V1_USER_ID_KEY);
    window.localStorage.removeItem(V1_USER_EMAIL_KEY);
    return;
  }

  window.localStorage.setItem(V1_USER_ID_KEY, session.userId);
  if (session.userEmail) {
    window.localStorage.setItem(V1_USER_EMAIL_KEY, session.userEmail);
  } else {
    window.localStorage.removeItem(V1_USER_EMAIL_KEY);
  }
}

export function clearStoredV1Session() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(V1_SESSION_HINT_KEY);
  window.localStorage.removeItem(V1_USER_ID_KEY);
  window.localStorage.removeItem(V1_USER_EMAIL_KEY);
}

export function shouldShowPushNudge() {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(V1_PUSH_NUDGE_DISMISSED_KEY) !== 'true';
}

export function dismissPushNudge() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(V1_PUSH_NUDGE_DISMISSED_KEY, 'true');
}

export function sanitizeRedirectPath(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('://')) return null;

  if (value.startsWith('/login')) return null;
  return value;
}

export function getCurrentRedirectPath() {
  if (typeof window === 'undefined') return '/home';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getLoginPathForRedirect(target: string) {
  const redirect = sanitizeRedirectPath(target);
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
}

// T6-2: 대회별 tournament-ops 진입 출처. `_gate.tsx`가 `?from=admin` 쿼리를
// 감지한 첫 진입 시점에 기록해 두면, 셸 안에서 다른 nav 항목(결과 검토/스태프
// 등)으로 이동해 쿼리가 사라진 뒤에도 "돌아가기" 목적지가 유지된다.
// sessionStorage를 쓰는 이유는 탭을 닫으면 자연히 사라져야 하기 때문 —
// 다른 대회의 admin 화면을 나중에 열었을 때 엉뚱한 출처가 남아있으면 안 된다.
const TOURNAMENT_OPS_ORIGIN_PREFIX = 'teameet.v1.tournamentOpsOrigin.';

export type TournamentOpsOrigin = 'admin' | 'home';

export function saveTournamentOpsOrigin(tournamentId: string, origin: 'admin') {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(`${TOURNAMENT_OPS_ORIGIN_PREFIX}${tournamentId}`, origin);
}

export function getTournamentOpsOrigin(tournamentId: string): TournamentOpsOrigin {
  if (typeof window === 'undefined') return 'home';
  return window.sessionStorage.getItem(`${TOURNAMENT_OPS_ORIGIN_PREFIX}${tournamentId}`) === 'admin'
    ? 'admin'
    : 'home';
}
