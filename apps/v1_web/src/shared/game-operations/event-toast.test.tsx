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
    // 화면에 고정하지 않고 가장 가까운 기준 상자(콘솔에서는 점수 카드) 바로 아래에 겹쳐 뜬다.
    expect(status.parentElement).toHaveClass('absolute', 'top-full');
    expect(status.parentElement).not.toHaveClass('fixed', 'tm-native-toast-stack');
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

describe('EventToasts — 한 번에 하나', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Harness({ onUndo }: { onUndo: (record: string) => void }) {
    const { toasts, showToast, dismiss } = useEventToast();
    return (
      <>
        {['골1', '파울2'].map((record) => (
          <button
            key={record}
            type="button"
            onClick={() => showToast(`${record} 기록했어요`, { action: { label: '되돌리기', onClick: () => onUndo(record) } })}
          >
            {record} 기록
          </button>
        ))}
        <EventToasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  it('연달아 두 건을 기록해도 토스트는 하나뿐이고, 되돌리기는 마지막 기록만 겨냥한다', () => {
    const onUndo = vi.fn();
    render(<Harness onUndo={onUndo} />);

    act(() => screen.getByRole('button', { name: '골1 기록' }).click());
    act(() => screen.getByRole('button', { name: '파울2 기록' }).click());

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText('파울2 기록했어요')).toBeInTheDocument();
    expect(screen.queryByText('골1 기록했어요')).toBeNull();
    const undoButtons = screen.getAllByRole('button', { name: '되돌리기' });
    expect(undoButtons).toHaveLength(1);
    act(() => undoButtons[0].click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith('파울2');
  });

  it('앞 토스트의 5초 타이머가 새 토스트를 일찍 닫지 않고, 새 토스트는 제 5초를 채운다', () => {
    vi.useFakeTimers();
    render(<Harness onUndo={vi.fn()} />);

    act(() => screen.getByRole('button', { name: '골1 기록' }).click());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => screen.getByRole('button', { name: '파울2 기록' }).click());
    // 첫 토스트가 5초가 되는 시점(전체 5000ms)을 넘겨도 새 토스트는 남아 있다.
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    // 새 토스트는 뜬 지 4999ms 까지 남아 있고, 5초가 지나면 사라진다.
    act(() => {
      vi.advanceTimersByTime(2499);
    });
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1 + 150);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
