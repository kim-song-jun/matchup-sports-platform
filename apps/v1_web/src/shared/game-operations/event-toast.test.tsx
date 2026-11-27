import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEventToast, EventToasts } from './event-toast';

describe('EventToasts — 액션 버튼 지원', () => {
  it('action이 있으면 버튼으로 렌더하고 클릭 시 onClick과 dismiss를 모두 수행한다', async () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useEventToast());
    act(() => {
      result.current.showToast('골 기록했어요', { action: { label: '어시스트 추가', onClick } });
    });
    const { rerender } = render(<EventToasts toasts={result.current.toasts} />);
    rerender(<EventToasts toasts={result.current.toasts} />);

    const actionButton = screen.getByRole('button', { name: '어시스트 추가' });
    await userEvent.click(actionButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('action이 없으면 기존처럼 메시지만 렌더한다(회귀 방지)', () => {
    const { result } = renderHook(() => useEventToast());
    act(() => {
      result.current.showToast('경기가 시작됐어요');
    });
    render(<EventToasts toasts={result.current.toasts} />);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('tm-native-toast-card');
    expect(status.parentElement).toHaveClass('tm-native-toast-stack');
    expect(screen.getByText('경기가 시작됐어요')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('액션 버튼은 44px 이상 터치 영역이다', () => {
    const { result } = renderHook(() => useEventToast());
    act(() => {
      result.current.showToast('골 기록했어요', { action: { label: '되돌리기', onClick: vi.fn() } });
    });
    render(<EventToasts toasts={result.current.toasts} />);
    expect(screen.getByRole('button', { name: '되돌리기' })).toHaveClass('min-h-[44px]', 'min-w-[44px]');
  });

  it('description 이 있으면 메시지 아래에 함께 보인다', () => {
    const { result } = renderHook(() => useEventToast());
    act(() => {
      result.current.showToast('골 · 잠실 레전드 · 7 김민수 기록했어요', { description: '잘못 눌렀으면 5초 안에 되돌려요' });
    });
    render(<EventToasts toasts={result.current.toasts} />);
    const message = screen.getByText('골 · 잠실 레전드 · 7 김민수 기록했어요');
    const description = screen.getByText('잘못 눌렀으면 5초 안에 되돌려요');
    expect(screen.getByRole('status')).toContainElement(description);
    expect(message.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('EventToasts — 자동 닫힘', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('5초 뒤 사라지고 그 뒤에는 액션 버튼이 없다', () => {
    vi.useFakeTimers();
    function Harness() {
      const { toasts, showToast, dismiss } = useEventToast();
      return (
        <>
          <button type="button" onClick={() => showToast('골 기록했어요', { action: { label: '되돌리기', onClick: () => undefined } })}>
            띄우기
          </button>
          <EventToasts toasts={toasts} onDismiss={dismiss} />
        </>
      );
    }
    render(<Harness />);
    act(() => {
      screen.getByRole('button', { name: '띄우기' }).click();
    });
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1 + 150);
    });
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
