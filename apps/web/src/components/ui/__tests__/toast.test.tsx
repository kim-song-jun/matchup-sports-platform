import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../toast';

// Helper component to trigger toasts in tests
function ToastTrigger({ type, message }: { type: 'success' | 'error' | 'info'; message: string }) {
  const { toast } = useToast();
  return (
    <button onClick={() => toast(type, message)}>
      show toast
    </button>
  );
}

function renderWithProvider(type: 'success' | 'error' | 'info', message: string) {
  return render(
    <ToastProvider>
      <ToastTrigger type={type} message={message} />
    </ToastProvider>,
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
  });

  it('shows toast message after trigger', () => {
    renderWithProvider('success', '저장되었습니다');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByText('저장되었습니다')).toBeInTheDocument();
  });

  it('renders success variant', () => {
    renderWithProvider('success', '성공 메시지');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByText('성공 메시지')).toBeInTheDocument();
  });

  it('renders error variant', () => {
    renderWithProvider('error', '오류가 발생했습니다');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
  });

  it('renders info variant', () => {
    renderWithProvider('info', '정보 메시지');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByText('정보 메시지')).toBeInTheDocument();
  });

  it('auto-dismisses after 3 seconds', () => {
    renderWithProvider('success', '자동 사라짐');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByText('자동 사라짐')).toBeInTheDocument();

    // Advance past dismiss timeout (3000ms) + exit animation (200ms)
    act(() => {
      vi.advanceTimersByTime(3300);
    });

    expect(screen.queryByText('자동 사라짐')).not.toBeInTheDocument();
  });

  it('dismiss button has accessible label', () => {
    renderWithProvider('info', '닫기 버튼 테스트');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByRole('button', { name: '알림 닫기' })).toBeInTheDocument();
  });

  it('dismisses toast immediately when close button is clicked', () => {
    renderWithProvider('success', '수동 닫기');
    fireEvent.click(screen.getByRole('button', { name: 'show toast' }));
    expect(screen.getByText('수동 닫기')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('수동 닫기')).not.toBeInTheDocument();
  });
});
