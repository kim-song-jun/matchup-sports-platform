import { describe, expect, it } from 'vitest';
import { extractErrorCode } from './error-message';

describe('extractErrorCode', () => {
  it('V1ApiError 처럼 최상위 code 만 있는 에러는 그 값을 돌려준다', () => {
    expect(extractErrorCode({ code: 'VERIFICATION_RESEND_COOLDOWN' })).toBe(
      'VERIFICATION_RESEND_COOLDOWN',
    );
  });

  it('Axios 에러는 최상위 code(ERR_BAD_REQUEST) 가 아니라 응답 본문의 도메인 코드를 돌려준다', () => {
    // 순서를 뒤집으면 쿨다운을 오류로 오판해 빨간 배너가 뜬다 — 그 회귀를 여기서 고정한다.
    const axiosLike = {
      code: 'ERR_BAD_REQUEST',
      response: { data: { code: 'VERIFICATION_RESEND_COOLDOWN' } },
    };
    expect(extractErrorCode(axiosLike)).toBe('VERIFICATION_RESEND_COOLDOWN');
  });

  it('응답 본문에 코드가 없으면 최상위 code 로 폴백한다', () => {
    expect(extractErrorCode({ code: 'ECONNABORTED', response: { data: {} } })).toBe('ECONNABORTED');
  });

  it('코드를 찾을 수 없으면 null 이다 (호출부는 기본 오류 처리로 간다)', () => {
    expect(extractErrorCode(new Error('boom'))).toBeNull();
    expect(extractErrorCode(null)).toBeNull();
    expect(extractErrorCode('문자열 에러')).toBeNull();
  });
});
