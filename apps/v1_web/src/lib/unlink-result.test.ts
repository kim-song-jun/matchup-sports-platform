import { describe, expect, it } from 'vitest';
import { V1ApiError } from './api-client';
import { unlinkResultFromError } from './unlink-result';

function apiError(statusCode: number, code: string) {
  return new V1ApiError({ status: 'error', statusCode, code, message: '메시지', timestamp: '2026-11-07T00:00:00.000Z' });
}

describe('unlinkResultFromError', () => {
  it.each([
    [403, 'RECENT_LOGIN_REQUIRED', 'recent_login'],
    [403, 'SOCIAL_LINK_ADMIN_FORBIDDEN', 'admin'],
    [409, 'LAST_LOGIN_METHOD', 'last'],
    [404, 'LOGIN_METHOD_NOT_FOUND', 'not_found'],
  ] as const)('%i %s -> %s', (statusCode, code, expected) => {
    expect(unlinkResultFromError(apiError(statusCode, code))).toBe(expected);
  });

  it.each([
    [500, 'INTERNAL_ERROR'],
    [429, 'THROTTLED'],
    [403, 'PERMISSION_DENIED'],
    [401, 'UNAUTHENTICATED'],
    // 코드만 같고 상태가 다르면 서버가 말한 그 거절이 아니다.
    [409, 'RECENT_LOGIN_REQUIRED'],
    [404, 'LAST_LOGIN_METHOD'],
  ])('%i %s 는 알 수 없는 실패로 둔다', (statusCode, code) => {
    expect(unlinkResultFromError(apiError(statusCode, code))).toBe('failed');
  });

  it('오류 객체가 아니면(네트워크 단절 등) 실패로 둔다', () => {
    expect(unlinkResultFromError(new TypeError('Failed to fetch'))).toBe('failed');
    expect(unlinkResultFromError(null)).toBe('failed');
  });
});
