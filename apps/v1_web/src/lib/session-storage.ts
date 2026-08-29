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

/**
 * `?redirect=` 로 받은 값을 **같은 사이트 안의 경로일 때만** 통과시킨다.
 *
 * 예전에는 금지 문자열을 하나씩 세는 방식이었다(`//` 로 시작하지 않고 `://` 를 담지
 * 않으면 통과). 그 방식은 `/\\evil.com` 을 막지 못했다 -- WHATWG URL 파서는 http(s)
 * 에서 역슬래시를 슬래시와 **똑같이** 취급하므로 이 값은 `https://evil.com/` 으로
 * 해석되는데, 두 번째 글자가 `/` 가 아니라 `\\` 라서 `//` 검사에 걸리지 않았다.
 * alpha 실측으로 재현했다: 로그인 직후 브라우저가 실제로 외부 origin 으로 떠났고,
 * 결과가 동일한 `//evil.com` 은 막히고 있었다.
 *
 * 그래서 금지 목록을 늘리는 대신 **파서에게 직접 묻는다**: 아무 데도 실재하지 않는
 * 기준 origin 에 붙여 해석해 보고, origin 이 그대로면 사이트 내부 경로다. 이렇게 하면
 * `//host`·`/\\host`·`https://host`·`javascript:` 가 한 규칙으로 전부 걸리고,
 * 앞으로 나올 변종에도 파서가 아는 만큼은 따라간다.
 */
const REDIRECT_BASE = new URL('https://redirect-guard.invalid');

export function sanitizeRedirectPath(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith('/')) return null;

  let resolved: URL;
  try {
    resolved = new URL(value, REDIRECT_BASE);
  } catch {
    return null;
  }
  if (resolved.origin !== REDIRECT_BASE.origin) return null;

  // 로그인 화면으로 되돌리면 로그인 → 로그인 고리가 된다.
  if (resolved.pathname.startsWith('/login')) return null;

  // **검증한 값을 그대로 돌려준다.** 원본 문자열을 돌려주면 호출부(router.replace 등)가
  // 그 문자열을 다시 파싱하므로, 내가 본 것과 실제로 쓰이는 것이 두 번의 파싱으로
  // 갈릴 여지가 남는다. 파서가 이미 정규화한 경로를 돌려주면 "검증한 값 == 쓰는 값"이
  // 되어 그 틈 자체가 없어진다.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
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

/**
 * 경기 기록 공개 동의 홈 넛지 노출 횟수 (Task 154 P0-3 / 사용자 결정 ②: "처음 1~2회만").
 *
 * 푸시 넛지와 달리 `sessionStorage` 가 아니라 `localStorage` 를 쓴다 -- 푸시는 "로그인마다
 * 한 번" 이라 세션 단위면 충분하지만, 이건 계정 수명 전체에서 총 2회만 보여야 하므로
 * 세션이 끝나도 값이 남아야 한다.
 *
 * 값이 깨져 있거나(수동 편집·다른 버전) 스토리지 접근이 막힌 경우(프라이빗 모드 등)는
 * "보여주지 않음" 쪽으로 붙는다 -- 유도 배너를 못 보는 것보다 무한 반복 노출이 더 나쁘다.
 */
export const V1_RECORD_CONSENT_NUDGE_SEEN_KEY = 'teameet.v1.recordConsentNudgeSeen';
const RECORD_CONSENT_NUDGE_MAX_VIEWS = 2;

function readRecordConsentNudgeSeen(): number {
  if (typeof window === 'undefined') return RECORD_CONSENT_NUDGE_MAX_VIEWS;
  try {
    const raw = window.localStorage.getItem(V1_RECORD_CONSENT_NUDGE_SEEN_KEY);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : RECORD_CONSENT_NUDGE_MAX_VIEWS;
  } catch {
    return RECORD_CONSENT_NUDGE_MAX_VIEWS;
  }
}

export function shouldShowRecordConsentNudge(): boolean {
  return readRecordConsentNudgeSeen() < RECORD_CONSENT_NUDGE_MAX_VIEWS;
}

/** 배너를 실제로 렌더한 시점에 1 올린다. */
export function markRecordConsentNudgeSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    const next = Math.min(readRecordConsentNudgeSeen() + 1, RECORD_CONSENT_NUDGE_MAX_VIEWS);
    window.localStorage.setItem(V1_RECORD_CONSENT_NUDGE_SEEN_KEY, String(next));
  } catch {
    // 스토리지가 막힌 브라우저에서는 카운트를 못 올린다. 그래도 위 read 가
    // MAX 를 돌려주므로 배너 자체가 안 뜬다 -- 무한 노출로는 이어지지 않는다.
  }
}

/** 사용자가 X 로 닫으면 남은 횟수와 무관하게 끝낸다. */
export function dismissRecordConsentNudge(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(V1_RECORD_CONSENT_NUDGE_SEEN_KEY, String(RECORD_CONSENT_NUDGE_MAX_VIEWS));
  } catch {
    // 위와 같다 -- 실패해도 무한 노출로 이어지지 않는다.
  }
}
