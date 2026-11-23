import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 로그인 쿠키를 쓸 수 없는 곳(폰 캘린더 구독, 위젯)에 주는 읽기 전용 토큰 문자열.
 *
 * `<행 id>.<HMAC(secret, 종류+id)>` — DB 에 토큰 자체를 두지 않고 서버가 언제든 다시 만들 수 있어
 * "주소 복사"를 몇 번이든 할 수 있다. 행(`V1AccessToken`)을 폐기하면 그 id 의 토큰은 바로 못 쓴다.
 * 서명 키는 세션 쿠키와 같은 비밀(V1_SESSION_SECRET)이고, 종류를 서명에 넣어 서로 바꿔 쓰지 못하게 한다.
 */

const MINIMUM_SECRET_LENGTH = 32;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccessTokenKind = 'calendar_feed' | 'widget';

export function isUsableAccessTokenSecret(secret: string | null | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= MINIMUM_SECRET_LENGTH;
}

function sign(secret: string, kind: AccessTokenKind, id: string): string {
  return createHmac('sha256', secret).update(`access-token:${kind}:${id}`).digest('base64url');
}

export function issueAccessToken(secret: string, kind: AccessTokenKind, id: string): string {
  return `${id}.${sign(secret, kind, id)}`;
}

/** 서명이 맞으면 행 id, 아니면 null. 행이 폐기됐는지는 호출한 쪽이 DB 에서 본다. */
export function parseAccessToken(token: string, secret: string, kind: AccessTokenKind): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!ID_PATTERN.test(id)) return null;
  const expected = Buffer.from(sign(secret, kind, id), 'utf8');
  const provided = Buffer.from(token.slice(dot + 1), 'utf8');
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? id : null;
}
