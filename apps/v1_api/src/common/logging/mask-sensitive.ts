/**
 * V1ErrorLog 는 보존 기간이 무기한이다 (docs/superpowers/specs/2026-07-26-v1-admin-error-log-viewer-design.md
 * 참조) — 자동 삭제 cron 이 없으므로 여기서 마스킹을 놓치면 민감정보가 영구 저장된다.
 * 이 파일이 유일한 방어선이다: 신규 필드를 적재 경로에 추가할 때마다 SENSITIVE_KEYS 를 점검할 것.
 */

// 키 이름은 대소문자 무시로 매칭한다 (Authorization / authorization / AUTHORIZATION 전부 대상).
// 카카오 인가코드(code)·세션 쿠키(cookie/setCookie)가 실제로 콜백 URL·헤더로 들어오므로 반드시 포함.
export const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwordConfirm',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'code',
  'authorization',
  'cookie',
  'setCookie',
  'secret',
  'apiKey',
  'phone',
  'phoneNumber',
  'ssn',
  'birthDate',
  'cardNumber',
  'cvc',
];

const REDACTED = '[REDACTED]' as const;

const SENSITIVE_KEY_SET = new Set(SENSITIVE_KEYS.map((key) => normalizeKey(key)));

/**
 * 키를 비교하기 전에 대소문자와 구분자(-, _)를 지운다.
 *
 * HTTP 헤더는 `set-cookie`·`x-api-key`처럼 하이픈으로 오고 JS 객체는 `setCookie`처럼
 * camelCase로 온다. 소문자 정확 일치만 하면 같은 뜻의 키가 표기만 달라 마스킹을 통째로
 * 빠져나간다 — 실제로 `set-cookie` 헤더가 그렇게 새어 나갈 수 있었다.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_SET.has(normalizeKey(key));
}

/**
 * 값을 재귀적으로 순회하며 SENSITIVE_KEYS 에 해당하는 키의 값을 '[REDACTED]' 로 치환한 새 값을
 * 반환한다. 원본은 변형(mutate)하지 않는다. 순환 참조를 만나면 이미 방문한 노드는 그대로 두어
 * 무한루프에 빠지지 않는다.
 */
export function maskSensitive<T>(value: T): T {
  return maskInternal(value, new WeakMap()) as T;
}

function maskInternal(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(maskInternal(item, seen));
    }
    return result;
  }

  if (typeof value === 'object') {
    const existing = seen.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const result: Record<string, unknown> = {};
    seen.set(value, result);
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = maskInternal(val, seen);
      }
    }
    return result;
  }

  // 문자열 leaf는 키 이름 기준 마스킹이 닿지 않는 자리다. 대표적으로 `referer` 헤더에는
  // 카카오 콜백 URL이 통째로 담겨(`/callback/kakao?code=...&state=...`) 인가코드가 값
  // 안쪽에 박혀 들어온다 — 키가 'referer'라 위 isSensitiveKey를 통과하지 못한다.
  // 보존이 무기한이라 여기서 놓치면 영구 저장이므로, 문자열은 텍스트 스크러빙을 한 번 더 건다.
  if (typeof value === 'string') {
    return maskSensitiveText(value);
  }

  // number / boolean / bigint / symbol / function 등 나머지 원시값은 그대로 반환한다.
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENSITIVE_KEY_ALTERNATION = SENSITIVE_KEYS.map(escapeRegExp).join('|');

// message/stack은 객체가 아니라 평문 문자열이라 maskSensitive()의 키 순회 마스킹이 닿지
// 않는다. 그런데 NestJS 내장 404 처리(`Cannot ${method} ${url}`, url = originalUrl —
// 쿼리스트링 포함)처럼 시크릿이 쿼리스트링 형태로 메시지 텍스트 안에 그대로 박혀 들어오는
// 경로가 있다. 아래 두 패턴으로 "쿼리스트링 key=value" / "JSON 텍스트 \"key\":\"value\""
// 형태에서 SENSITIVE_KEYS 이름의 값만 골라 [REDACTED]로 치환한다.
// URL 쿼리스트링에서만 추가로 가리는 키. OAuth 콜백의 state 는 CSRF 토큰이라 콜백 URL 에
// 실려 오면 가려야 하지만, SENSITIVE_KEYS 에 넣으면 객체 필드의 state 까지 전부 가려진다 —
// 이 코드베이스에서 state 는 대회·분쟁 상태 등으로 흔히 쓰이는 이름이라(v1_api 만 13곳)
// 정작 조사에 필요한 값이 사라진다. 그래서 URL 형태에서만 가린다.
const QUERY_ONLY_SENSITIVE_KEYS: readonly string[] = ['state'];
const QUERY_KEY_ALTERNATION = [...SENSITIVE_KEYS, ...QUERY_ONLY_SENSITIVE_KEYS]
  .map(escapeRegExp)
  .join('|');
const QUERY_PAIR_PATTERN = new RegExp(`([?&](?:${QUERY_KEY_ALTERNATION}))=([^&\\s]*)`, 'gi');
const JSON_TEXT_PAIR_PATTERN = new RegExp(`("(?:${SENSITIVE_KEY_ALTERNATION})"\\s*:\\s*")([^"]*)(")`, 'gi');

/**
 * message/stack처럼 이미 문자열로 조립된 텍스트에서 SENSITIVE_KEYS 이름의 key=value /
 * "key":"value" 패턴을 찾아 값만 [REDACTED]로 치환한다. maskSensitive()와 달리 구조를
 * 모르는 자유 텍스트를 대상으로 하므로 완전한 스크러빙은 보장하지 않지만(오탐 위험이 큰
 * 전체 콘텐츠 스크러빙은 지양), 이미 알려진 민감 키 이름이 노출되는 대표 경로(쿼리스트링
 * 시크릿, 직렬화된 헤더/바디 일부가 텍스트로 섞여 들어오는 경우)는 확실히 막는다.
 */
export function maskSensitiveText(value: string): string {
  return value
    .replace(QUERY_PAIR_PATTERN, (_match, prefix: string) => `${prefix}=[REDACTED]`)
    .replace(JSON_TEXT_PAIR_PATTERN, (_match, prefix: string, _val: string, suffix: string) => `${prefix}[REDACTED]${suffix}`);
}

const MAX_LOG_LENGTH = 4000;

/**
 * 로그 저장용으로 값을 JSON 직렬화한 뒤 4000자 상한으로 절단한 문자열을 반환한다. 이미 string 인
 * 값은 재직렬화(따옴표 추가)하지 않고 그대로 상한만 적용한다. BigInt·순환 참조 등
 * JSON.stringify 가 실패하는 값에서도 죽지 않고 사람이 읽을 수 있는 대체 문자열을 반환한다.
 */
export function truncateForLog(value: unknown, max: number = MAX_LOG_LENGTH): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  let serialized: string;
  if (typeof value === 'string') {
    serialized = value;
  } else {
    try {
      serialized =
        JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)) ?? 'undefined';
    } catch {
      // 순환 참조 등 직렬화 자체가 실패하는 경우: 조용히 삼키지 않고 원인을 남긴 대체 문자열로 대체.
      serialized = '[UNSERIALIZABLE]';
    }
  }

  if (serialized.length <= max) {
    return serialized;
  }

  return `${serialized.slice(0, max)}…[TRUNCATED]`;
}
