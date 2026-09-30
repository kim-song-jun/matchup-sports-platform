import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  V1_SESSION_HINT_KEY,
  V1_USER_EMAIL_KEY,
  V1_USER_ID_KEY,
  clearStoredV1Session,
  getTournamentOpsOrigin,
  hasStoredV1Session,
  sanitizeRedirectPath,
  withFromPath,
  saveStoredV1Session,
  saveTournamentOpsOrigin,
  shouldProbeV1Session,
  dismissRecordConsentNudge,
  lowerRecordConsentNudgeDismissal,
  recordConsentNudgeDismissedKey,
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

  // 입력은 사이트 안이지만 정규화 결과가 `//evil.com` 이 되는 dot-segment 형태.
  // 돌려준 값을 브라우저가 다시 해석하면 외부 origin 으로 떠난다.
  it('rejects dot-segment forms that normalize into a protocol-relative path', () => {
    for (const form of ['/..//example.com', '/.//example.com', '/%2e%2e//example.com', '/a/../..//example.com', '/./\\example.com']) {
      expect(sanitizeRedirectPath(form)).toBeNull();
    }
    expect(sanitizeRedirectPath('/teams/../my')).toBe('/my');
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
 * 기록 공개 배너는 횟수 상한이 없다 -- X 로 넘겨도 새로 공개를 기다리는 경기가 생기면 다시 뜬다
 * (2026-09-30 사용자 결정). 영구 종료는 서버의 응답 기록(`hasResponded`)이 맡으므로 여기서는
 * 다루지 않는다. 푸시 넛지(sessionStorage)와 저장소가 다른 이유는 세션이 끝나도 남아야 해서다.
 */
describe('recordConsentNudge 넘김 기준', () => {
  const USER = 'user-a';

  it('넘긴 적이 없으면 보여준다', () => {
    expect(shouldShowRecordConsentNudge(USER, 1)).toBe(true);
  });

  it('넘긴 뒤 같은 대기 경기 수에서는 뜨지 않고, 새 경기가 생겨 수가 늘면 다시 뜬다', () => {
    dismissRecordConsentNudge(USER, 2);
    expect(shouldShowRecordConsentNudge(USER, 2)).toBe(false);
    expect(shouldShowRecordConsentNudge(USER, 3)).toBe(true);
  });

  it('넘긴 뒤 여러 번 열어 봐도(설정에 다녀와도) 횟수로 소진되지 않는다', () => {
    dismissRecordConsentNudge(USER, 1);
    for (let visit = 0; visit < 5; visit += 1) {
      expect(shouldShowRecordConsentNudge(USER, 1)).toBe(false);
    }
    expect(shouldShowRecordConsentNudge(USER, 2)).toBe(true);
  });

  it('세션이 끝나도(=sessionStorage 비워져도) 넘김이 남는다', () => {
    dismissRecordConsentNudge(USER, 1);
    window.sessionStorage.clear();
    expect(shouldShowRecordConsentNudge(USER, 1)).toBe(false);
  });

  it('계정마다 따로 센다 -- 다른 계정이 넘긴 값이 내 배너를 가리지 않는다', () => {
    dismissRecordConsentNudge('user-b', 5);
    expect(shouldShowRecordConsentNudge(USER, 1)).toBe(true);
    expect(shouldShowRecordConsentNudge('user-b', 1)).toBe(false);
  });

  it('대기 경기가 줄었다가 다시 늘어도 새 경기로 인식한다', () => {
    dismissRecordConsentNudge(USER, 3);
    // 결과 정정으로 3 -> 2. 기준을 안 내리면 다음 새 경기(다시 3)가 옛 기준 3 에 걸려 안 뜬다.
    lowerRecordConsentNudgeDismissal(USER, 2);
    expect(shouldShowRecordConsentNudge(USER, 2)).toBe(false);
    expect(shouldShowRecordConsentNudge(USER, 3)).toBe(true);
  });

  it('기준을 내리는 함수는 대기 경기가 늘었을 때 기준을 올리지 않는다', () => {
    dismissRecordConsentNudge(USER, 2);
    lowerRecordConsentNudgeDismissal(USER, 4);
    expect(shouldShowRecordConsentNudge(USER, 3)).toBe(true);
  });

  it('저장된 값이 깨져 있으면 보여주지 않는다 (무한 노출 방지)', () => {
    window.localStorage.setItem(recordConsentNudgeDismissedKey(USER), 'nope');
    expect(shouldShowRecordConsentNudge(USER, 9)).toBe(false);
  });

  it('음수가 들어 있어도 보여주지 않는다', () => {
    window.localStorage.setItem(recordConsentNudgeDismissedKey(USER), '-5');
    expect(shouldShowRecordConsentNudge(USER, 9)).toBe(false);
  });

  it('스토리지 접근이 막힌 브라우저에서는 넘김을 기억할 수 없으니 보여주지 않는다', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(shouldShowRecordConsentNudge(USER, 1)).toBe(false);
    blocked.mockRestore();
  });
});

describe('withFromPath', () => {
  it('출처가 없으면 경로를 그대로 둔다', () => {
    expect(withFromPath('/teams/t1/members', null)).toBe('/teams/t1/members');
  });

  it('기존 쿼리 뒤에 이어 붙이고 hash 는 맨 뒤에 남긴다', () => {
    expect(withFromPath('/search?q=a', '/my')).toBe('/search?q=a&from=%2Fmy');
    expect(withFromPath('/teams/t1#members', '/my')).toBe('/teams/t1?from=%2Fmy#members');
  });

  // 받은 출처까지 담긴 URL 을 다시 출처로 넘겨도, 받는 쪽이 한 단계씩 원래 값으로 되돌릴 수 있어야 한다.
  it('중첩된 출처가 sanitizeRedirectPath 를 거쳐 한 단계씩 복원된다', () => {
    const detail = withFromPath('/teams/t1', '/my/teams');
    const members = withFromPath('/teams/t1/members', detail);
    const received = sanitizeRedirectPath(new URLSearchParams(members.split('?')[1]).get('from'));
    expect(received).toBe(detail);
    expect(sanitizeRedirectPath(new URLSearchParams(received!.split('?')[1]).get('from'))).toBe('/my/teams');
  });
});

describe('withFromPath 체인 상한', () => {
  // 팀 → 리그 → 팀으로 돌아오면 새로 감싸지 않고 처음 팀 방문 URL(원래 출처 포함)을 쓴다.
  it('이미 지나온 화면으로 가면 그때의 URL 로 접는다', () => {
    const team = withFromPath('/teams/t1', '/my/teams');
    const league = withFromPath('/league-matches/l1', team);
    expect(withFromPath('/teams/t1', league)).toBe(team);
  });

  // 중첩 from 은 URL 을 직접 고쳐 넣을 수 있다 — 렌더가 터지거나 표식·외부 주소가 경로로 섞이면 안 된다.
  it('조작된 중첩 출처는 그 단계에서 끊고 예외를 내지 않는다', () => {
    const crafted = `/teams/t1?from=${encodeURIComponent('http://[')}`;
    expect(() => withFromPath('/users/u1', crafted)).not.toThrow();
    expect(withFromPath('/users/u1', crafted)).toBe('/users/u1?from=%2Fteams%2Ft1');
    expect(withFromPath('/users/u1', '/teams/t1?from=tournament')).toBe('/users/u1?from=%2Fteams%2Ft1');
    expect(withFromPath('/users/u1', `/teams/t1?from=${encodeURIComponent('//evil.example')}`)).toBe('/users/u1?from=%2Fteams%2Ft1');
    expect(withFromPath('/users/u1', 'https://evil.example')).toBe('/users/u1');
    // 대상 경로가 URL 로 읽히지 않아도 렌더를 깨지 않고 그대로 돌려준다.
    expect(() => withFromPath('http://[', '/my')).not.toThrow();
    expect(withFromPath('http://[', '/my')).toBe('http://[');
  });

  it('체인을 줄여 다시 엮어도 각 단계의 hash 는 남는다', () => {
    let href = '/home#rail';
    for (let index = 0; index < 8; index += 1) href = withFromPath(`/teams/t${index}`, index === 0 ? href : `${href}#s${index}`);
    expect(decodeURIComponent(href)).toContain('#s');
  });

  it('서로 다른 화면을 계속 거쳐도 체인 깊이가 상한을 넘지 않는다', () => {
    let href = '/home';
    for (let index = 0; index < 20; index += 1) href = withFromPath(`/teams/t${index}`, href);
    let depth = 0;
    let cursor: string | null = href;
    while (cursor) {
      depth += 1;
      cursor = new URL(cursor, 'https://x.invalid').searchParams.get('from');
    }
    expect(depth).toBeLessThanOrEqual(6);
    expect(href.length).toBeLessThan(600);
  });
});

describe('sanitizeRedirectPath', () => {
  it('경로는 그대로, 외부 주소·경로가 아닌 표식은 버린다', () => {
    expect(sanitizeRedirectPath('notifications')).toBeNull();
    expect(sanitizeRedirectPath('/my/teams')).toBe('/my/teams');
    expect(sanitizeRedirectPath('tournament')).toBeNull();
    expect(sanitizeRedirectPath('//evil.example')).toBeNull();
    expect(sanitizeRedirectPath(null)).toBeNull();
  });
});
