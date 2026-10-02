import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { isAccessDeniedError, isHiddenFromViewerError } from './access-denied-error';

function apiError(statusCode: number, code: string) {
  return new V1ApiError({ status: 'error', statusCode, code, message: 'x', timestamp: '2026-09-30T00:00:00.000Z' });
}

describe('접근 거절 판정', () => {
  it('403 과 권한 코드는 거절이고 서버 오류·네트워크 오류는 아니다', () => {
    expect(isAccessDeniedError(apiError(403, 'PERMISSION_DENIED'))).toBe(true);
    expect(isAccessDeniedError(apiError(403, 'SOMETHING'))).toBe(true);
    expect(isAccessDeniedError(apiError(400, 'NOT_TEAM_MEMBER'))).toBe(true);
    expect(isAccessDeniedError(apiError(500, 'INTERNAL_ERROR'))).toBe(false);
    expect(isAccessDeniedError(apiError(404, 'NOT_FOUND'))).toBe(false);
    expect(isAccessDeniedError(new Error('Network Error'))).toBe(false);
    expect(isAccessDeniedError(undefined)).toBe(false);
  });

  it('숨김 판정은 거절에 404 를 더하되 5xx 는 여전히 일시 오류로 둔다', () => {
    expect(isHiddenFromViewerError(apiError(404, 'NOT_FOUND_OR_ARCHIVED'))).toBe(true);
    expect(isHiddenFromViewerError(apiError(403, 'PERMISSION_DENIED'))).toBe(true);
    expect(isHiddenFromViewerError(apiError(503, 'UNAVAILABLE'))).toBe(false);
    expect(isHiddenFromViewerError(null)).toBe(false);
  });
});
