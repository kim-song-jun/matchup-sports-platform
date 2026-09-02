import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
});
