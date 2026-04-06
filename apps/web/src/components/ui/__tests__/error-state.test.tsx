import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '../error-state';

describe('ErrorState', () => {
  it('renders default error message when no message prop', () => {
    render(<ErrorState />);
    expect(screen.getByText('앗, 잠시 문제가 생겼어요')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도해주세요')).toBeInTheDocument();
  });

  it('renders custom error message', () => {
    render(<ErrorState message="데이터를 불러올 수 없습니다" />);
    expect(screen.getByText('데이터를 불러올 수 없습니다')).toBeInTheDocument();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    render(<ErrorState onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: /다시 불러오기/ })).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const handleRetry = vi.fn();
    render(<ErrorState onRetry={handleRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /다시 불러오기/ }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('retry button has minimum touch target height', () => {
    render(<ErrorState onRetry={() => {}} />);
    const button = screen.getByRole('button', { name: /다시 불러오기/ });
    expect(button.className).toContain('min-h-[44px]');
  });
});
