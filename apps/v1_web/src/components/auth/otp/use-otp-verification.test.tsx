import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { useOtpVerification } from './use-otp-verification';

const T0 = new Date('2026-11-08T00:00:00.000Z').getTime();
const CODE_TTL_MS = 5 * 60 * 1000;

function setup() {
  const onRequestCode = vi.fn(async () => ({ expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString() }));
  const onSubmitCode = vi.fn(async () => true);
  const hook = renderHook(() => useOtpVerification({
    resetKey: 'public:01012345678',
    onRequestCode,
    onSubmitCode,
    requestFailureMessage: '인증번호 발송에 실패했어요.',
    verifyFailureMessage: '인증번호가 올바르지 않아요.',
  }));
  return { ...hook, onRequestCode, onSubmitCode };
}

describe('useOtpVerification reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('인증이 끝난 흐름도 처음으로 돌려, 같은 대상으로 새 코드를 받아 다시 확인할 수 있다', async () => {
    const { result, onRequestCode, onSubmitCode } = setup();
    await act(async () => { await result.current.requestCode(); });
    act(() => { result.current.setCode('123456'); });
    await act(async () => { await result.current.submitCode(); });
    expect(result.current.phase).toBe('sent');
    expect(result.current.verified).toBe(true);
    expect(result.current.resendRemainingMs).toBeGreaterThan(0);

    act(() => { result.current.reset(); });

    expect(result.current.phase).toBe('idle');
    expect(result.current.code).toBe('');
    expect(result.current.verified).toBe(false);
    expect(result.current.expired).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.resendRemainingMs).toBe(0);

    await act(async () => { await result.current.requestCode(); });
    expect(onRequestCode).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('sent');
    expect(result.current.verified).toBe(false);
    act(() => { result.current.setCode('654321'); });
    await act(async () => { await result.current.submitCode(); });
    expect(onSubmitCode).toHaveBeenLastCalledWith('654321');
    expect(result.current.verified).toBe(true);
  });

  it('코드가 만료돼 다시 받기만 남은 상태도 처음으로 돌린다', async () => {
    const { result } = setup();
    await act(async () => { await result.current.requestCode(); });
    act(() => { vi.advanceTimersByTime(CODE_TTL_MS + 1_000); });
    expect(result.current.expired).toBe(true);

    act(() => { result.current.reset(); });

    expect(result.current.expired).toBe(false);
    expect(result.current.phase).toBe('idle');
  });

  it('지난 시도의 오류 문구·코드·톤을 지운다', async () => {
    const { result, onRequestCode } = setup();
    onRequestCode.mockRejectedValueOnce(new V1ApiError({
      message: '잠시 후 다시 시도해 주세요.',
      status: 'error',
      statusCode: 429,
      code: 'VERIFICATION_RESEND_COOLDOWN',
      timestamp: '2026-11-08T00:00:00.000Z',
    }));
    await act(async () => { await result.current.requestCode(); });
    expect(result.current.error).toBe('잠시 후 다시 시도해 주세요.');
    expect(result.current.errorTone).toBe('info');
    expect(result.current.errorCode).toBe('VERIFICATION_RESEND_COOLDOWN');

    act(() => { result.current.reset(); });

    expect(result.current.error).toBeNull();
    expect(result.current.errorTone).toBe('error');
    expect(result.current.errorCode).toBeNull();
  });

  it('reset 은 다시 그려도 같은 함수라 부모가 effect 의존성에 넣어도 매 렌더 되풀이 호출되지 않는다', async () => {
    const { result, rerender } = setup();
    const first = result.current.reset;

    rerender();
    await act(async () => { await result.current.requestCode(); });

    expect(result.current.reset).toBe(first);
  });
});
