import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { PASSWORD_FEEDBACK_DELAY_MS, usePasswordFeedback } from './use-password-feedback';

const COMMON_MESSAGE = '너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.';

function apiError(statusCode: number, code: string, message: string) {
  return new V1ApiError({ status: 'error', statusCode, code, message, timestamp: '2026-11-07T00:00:00.000Z' });
}

function setup(initial = '') {
  return renderHook(({ password }) => usePasswordFeedback(password), { initialProps: { password: initial } });
}

function pause() {
  act(() => { vi.advanceTimersByTime(PASSWORD_FEEDBACK_DELAY_MS); });
}

describe('usePasswordFeedback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('흔한 비밀번호는 입력하는 순간 사용할 수 없다고 판정하지만, 안내 문구는 입력이 멈춘 뒤에 나온다', () => {
    const view = setup();
    view.rerender({ password: '12345678' });

    expect(view.result.current.usable).toBe(false);
    expect(view.result.current.tooCommon).toBe(true);
    expect(view.result.current.blockedHint).toBe('다른 비밀번호를 정해 주세요.');
    expect(view.result.current.feedback).toBeNull();

    pause();
    expect(view.result.current.feedback).toEqual({ kind: 'error', message: COMMON_MESSAGE });
  });

  it('타이핑을 이어 가는 동안에는 지연이 계속 미뤄져 안내가 번쩍이지 않는다', () => {
    const view = setup();
    view.rerender({ password: 'abc' });
    act(() => { vi.advanceTimersByTime(PASSWORD_FEEDBACK_DELAY_MS - 50); });
    view.rerender({ password: 'abcd' });
    act(() => { vi.advanceTimersByTime(PASSWORD_FEEDBACK_DELAY_MS - 50); });

    expect(view.result.current.feedback).toBeNull();
    pause();
    expect(view.result.current.feedback).toEqual({ kind: 'error', message: '8자 이상 입력해 주세요.' });
  });

  it('이모지 네 개는 8자가 아니라 4자로 세어 서버와 같이 사용할 수 없다고 판정한다', () => {
    const view = setup();
    view.rerender({ password: '😀😀😀😀' });
    pause();

    expect(view.result.current.usable).toBe(false);
    expect(view.result.current.feedback).toEqual({ kind: 'error', message: '8자 이상 입력해 주세요.' });
  });

  it('쓸 수 있는 비밀번호는 멈춘 뒤에 칭찬하고, 흔한 값으로 고치면 칭찬이 바로 사라진다', () => {
    const view = setup();
    view.rerender({ password: 'Sunny-ride-4' });
    pause();
    expect(view.result.current.feedback).toEqual({ kind: 'success', message: '사용할 수 있는 비밀번호예요.' });

    view.rerender({ password: '12345678' });
    // 멈추기 전의 칭찬이 새 값에 남아 있으면 흔한 비밀번호에 "사용할 수 있어요"라고 말하게 된다.
    expect(view.result.current.feedback).toBeNull();
    expect(view.result.current.usable).toBe(false);
    pause();
    expect(view.result.current.feedback?.kind).toBe('error');
  });

  it('비우면 안내도 바로 사라진다', () => {
    const view = setup();
    view.rerender({ password: '12345678' });
    pause();
    view.rerender({ password: '' });

    expect(view.result.current.feedback).toBeNull();
  });

  describe('서버가 흔한 비밀번호로 거절하면', () => {
    const tooCommon = apiError(400, 'PASSWORD_TOO_COMMON', '서버가 적은 문구');

    it('서버 문구를 같은 칸 아래에 바로 올리고, 거절된 값을 고치기 전까지 잠근다', () => {
      const view = setup('Sunny-ride-4');
      pause();
      expect(view.result.current.usable).toBe(true);

      let handled = false;
      act(() => { handled = view.result.current.rejectIfTooCommon(tooCommon); });

      expect(handled).toBe(true);
      expect(view.result.current.feedback).toEqual({ kind: 'error', message: '서버가 적은 문구' });
      expect(view.result.current.usable).toBe(false);
      expect(view.result.current.blockedHint).toBe('다른 비밀번호를 정해 주세요.');

      view.rerender({ password: 'Sunny-ride-5' });
      expect(view.result.current.usable).toBe(true);
      pause();
      expect(view.result.current.feedback?.kind).toBe('success');
    });

    it('다른 사유의 거절은 가져가지 않아 호출부가 자기 오류로 다룬다', () => {
      const view = setup('Sunny-ride-4');
      let handled = true;
      act(() => { handled = view.result.current.rejectIfTooCommon(apiError(500, 'INTERNAL_ERROR', '서버 오류')); });

      expect(handled).toBe(false);
      expect(view.result.current.usable).toBe(true);
    });
  });
});
