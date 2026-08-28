import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  V1_PUSH_NUDGE_DISMISSED_KEY,
  V1_SESSION_HINT_KEY,
  V1_USER_EMAIL_KEY,
  V1_USER_ID_KEY,
  clearStoredV1Session,
  dismissPushNudge,
  getTournamentOpsOrigin,
  hasStoredV1Session,
  sanitizeRedirectPath,
  saveStoredV1Session,
  saveTournamentOpsOrigin,
  shouldProbeV1Session,
  shouldShowPushNudge,
  V1_RECORD_CONSENT_NUDGE_SEEN_KEY,
  dismissRecordConsentNudge,
  markRecordConsentNudgeSeen,
  shouldShowRecordConsentNudge,
} from './session-storage';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllEnvs();
});

describe('sanitizeRedirectPath', () => {
  it('keeps safe root redirects', () => {
    expect(sanitizeRedirectPath('/my?tab=teams')).toBe('/my?tab=teams');
  });

  it('rejects login redirect loops', () => {
    expect(sanitizeRedirectPath('/login?redirect=%2Fmy')).toBeNull();
  });

  it('rejects protocol-relative redirects', () => {
    expect(sanitizeRedirectPath('//example.com')).toBeNull();
  });

  // alpha 실측으로 재현한 우회: `/\evil.com` 은 예전 검사(`//` 로 시작하지 않고
  // `://` 를 담지 않음)를 전부 통과했는데, WHATWG URL 파서는 http(s) 에서 역슬래시를
  // 슬래시와 똑같이 취급하므로 결국 `//evil.com` 과 같은 곳으로 해석된다.
  // 로그인 직후 브라우저가 실제로 외부 origin 으로 떠나는 것을 확인했다.
  it('rejects backslash-disguised absolute redirects', () => {
    expect(sanitizeRedirectPath('/\\example.com')).toBeNull();
    expect(sanitizeRedirectPath('/\\/example.com')).toBeNull();
    expect(sanitizeRedirectPath('/\\\\example.com')).toBeNull();
  });

  // 위 셋과 `//example.com` 이 **같은 곳으로 해석된다**는 것이 이 규칙의 근거다 --
  // 하나만 막고 나머지를 두면 막았다고 착각하게 된다.
  it('treats every off-site form as the same thing', () => {
    const base = 'https://teameet.example';
    for (const form of ['//example.com', '/\\example.com', '/\\/example.com']) {
      expect(new URL(form, base).origin).toBe('https://example.com');
      expect(sanitizeRedirectPath(form)).toBeNull();
    }
  });

  // 원본 문자열을 돌려주면 호출부가 그 문자열을 다시 파싱하므로, 내가 검증한 것과
  // 실제로 쓰이는 것이 두 번의 파싱으로 갈릴 여지가 남는다. 정규화된 경로를 돌려줘
  // 그 틈 자체를 없앤다.
  it('returns the value it actually validated, not the raw input', () => {
    // 같은 곳을 가리키지만 표기가 다른 입력 — 돌려주는 값은 파서가 정규화한 하나다.
    expect(sanitizeRedirectPath('/teams/./abc')).toBe('/teams/abc');
    expect(sanitizeRedirectPath('/teams/x/../abc')).toBe('/teams/abc');
    // 통과한 값을 다시 해석해도 같은 곳이어야 한다(재파싱 안정성).
    const once = sanitizeRedirectPath('/my?tab=teams#top');
    expect(once).not.toBeNull();
    expect(sanitizeRedirectPath(once)).toBe(once);
  });

  it('still keeps ordinary in-site paths with query and hash', () => {
    expect(sanitizeRedirectPath('/teams/abc/schedules?tab=all#top')).toBe('/teams/abc/schedules?tab=all#top');
  });
});

describe('production session hint', () => {
  it('does not persist the user id or email outside development persona mode', () => {
    vi.stubEnv('NODE_ENV', 'production');

    saveStoredV1Session({ userId: 'user-1', userEmail: 'user@example.com' });

    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(window.localStorage.getItem(V1_USER_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(V1_USER_EMAIL_KEY)).toBeNull();
    expect(hasStoredV1Session()).toBe(true);
  });

  it('clears the non-sensitive hint together with development persona keys', () => {
    window.localStorage.setItem(V1_SESSION_HINT_KEY, 'active');
    window.localStorage.setItem(V1_USER_ID_KEY, 'user-1');
    window.localStorage.setItem(V1_USER_EMAIL_KEY, 'user@example.com');

    clearStoredV1Session();

    expect(window.localStorage.length).toBe(0);
  });

  it('still probes the HttpOnly cookie when browser storage was cleared', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(hasStoredV1Session()).toBe(false);
    expect(shouldProbeV1Session()).toBe(true);
  });
});

describe('push nudge visibility', () => {
  it('shows the nudge by default', () => {
    expect(shouldShowPushNudge()).toBe(true);
  });

  it('hides the nudge for the rest of the session after it is dismissed', () => {
    dismissPushNudge();

    expect(window.sessionStorage.getItem(V1_PUSH_NUDGE_DISMISSED_KEY)).toBe('true');
    expect(shouldShowPushNudge()).toBe(false);
  });

  it('resets the dismissal on every fresh login, so a re-login shows the nudge again', () => {
    dismissPushNudge();
    expect(shouldShowPushNudge()).toBe(false);

    saveStoredV1Session({ userId: 'user-1', userEmail: 'user@example.com' });

    expect(shouldShowPushNudge()).toBe(true);
  });
});

describe('tournament-ops 진입 출처 (T6-2)', () => {
  it('기록한 적 없으면 home을 기본값으로 반환한다', () => {
    expect(getTournamentOpsOrigin('t-1')).toBe('home');
  });

  it('admin으로 기록하면 그대로 조회된다', () => {
    saveTournamentOpsOrigin('t-1', 'admin');
    expect(getTournamentOpsOrigin('t-1')).toBe('admin');
  });

  it('대회 id별로 독립적으로 기록된다', () => {
    saveTournamentOpsOrigin('t-1', 'admin');
    expect(getTournamentOpsOrigin('t-2')).toBe('home');
  });
});

/**
 * 기록 공개 넛지는 "계정 수명 전체에서 총 2회" 라는 사용자 결정(②)을 지켜야 한다.
 * 푸시 넛지(sessionStorage, 로그인마다 1회)와 저장소가 다른 이유가 여기 있다 --
 * 세션 단위로 세면 로그아웃할 때마다 다시 2회가 살아나 사실상 무한 노출이 된다.
 */
describe('recordConsentNudge 노출 횟수', () => {
  it('처음에는 보여준다', () => {
    expect(shouldShowRecordConsentNudge()).toBe(true);
  });

  it('2회까지만 보여주고 3회째부터 멈춘다', () => {
    markRecordConsentNudgeSeen();
    expect(shouldShowRecordConsentNudge()).toBe(true);
    markRecordConsentNudgeSeen();
    expect(shouldShowRecordConsentNudge()).toBe(false);
    markRecordConsentNudgeSeen();
    expect(shouldShowRecordConsentNudge()).toBe(false);
  });

  it('사용자가 닫으면 남은 횟수와 무관하게 끝난다', () => {
    dismissRecordConsentNudge();
    expect(shouldShowRecordConsentNudge()).toBe(false);
  });

  it('세션이 끝나도(=sessionStorage 비워져도) 횟수가 남는다', () => {
    markRecordConsentNudgeSeen();
    markRecordConsentNudgeSeen();
    window.sessionStorage.clear();
    expect(shouldShowRecordConsentNudge()).toBe(false);
  });

  it('저장된 값이 깨져 있으면 보여주지 않는다 (무한 노출 방지)', () => {
    // 손으로 편집했거나 옛 버전이 남긴 값. 파싱 실패를 "0회" 로 읽으면 영원히 뜬다.
    window.localStorage.setItem(V1_RECORD_CONSENT_NUDGE_SEEN_KEY, 'nope');
    expect(shouldShowRecordConsentNudge()).toBe(false);
  });

  it('음수가 들어 있어도 보여주지 않는다', () => {
    window.localStorage.setItem(V1_RECORD_CONSENT_NUDGE_SEEN_KEY, '-5');
    expect(shouldShowRecordConsentNudge()).toBe(false);
  });
});
