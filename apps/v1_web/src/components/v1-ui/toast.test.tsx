import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, useToast } from './toast';

function Host({ text, tone }: { text: string; tone?: 'success' | 'info' }) {
  const { showToast, toast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast(text, tone)}>보이기</button>
      {toast}
    </>
  );
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function show() {
  act(() => screen.getByRole('button', { name: '보이기' }).click());
}

describe('useToast', () => {
  it('톤을 주지 않으면 방금 한 일이 됐다는 확인(체크)으로 보인다', () => {
    render(<Host text="저장했어요" />);
    show();

    expect(screen.getByRole('status')).toHaveTextContent('저장했어요');
    expect(document.querySelector('.lucide-check')).not.toBeNull();
    expect(document.querySelector('.lucide-info')).toBeNull();
  });

  it('info 톤은 체크 대신 정보 표시로 보인다', () => {
    render(<Host text="이미 있어요" tone="info" />);
    show();

    expect(screen.getByRole('status')).toHaveTextContent('이미 있어요');
    expect(document.querySelector('.lucide-info')).not.toBeNull();
    expect(document.querySelector('.lucide-check')).toBeNull();
  });

  it('보인 지 정해진 시간이 지나면 사라진다', () => {
    render(<Host text="저장했어요" />);
    show();

    act(() => { vi.advanceTimersByTime(TOAST_DURATION_MS); });

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
