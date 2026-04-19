import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './toggle';

describe('Toggle', () => {
  it('renders with role="switch" and correct aria-checked when enabled', () => {
    render(<Toggle enabled={true} onToggle={vi.fn()} label="테스트 토글" />);
    const btn = screen.getByRole('switch', { name: '테스트 토글 켜짐' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-checked', 'true');
  });

  it('renders with role="switch" and correct aria-checked when disabled state', () => {
    render(<Toggle enabled={false} onToggle={vi.fn()} label="테스트 토글" />);
    const btn = screen.getByRole('switch', { name: '테스트 토글 꺼짐' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(<Toggle enabled={false} onToggle={onToggle} label="테스트 토글" />);
    await user.click(screen.getByRole('switch'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle when disabled', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(<Toggle enabled={false} onToggle={onToggle} disabled label="테스트 토글" />);
    await user.click(screen.getByRole('switch'));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('meets 44x44px touch target — has min-h-[44px] and min-w-[44px] classes', () => {
    render(<Toggle enabled={true} onToggle={vi.fn()} label="터치 타겟" />);
    const btn = screen.getByRole('switch');
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });

  it('thumb span has aria-hidden="true" to avoid duplicate announcements', () => {
    const { container } = render(<Toggle enabled={true} onToggle={vi.fn()} label="장식" />);
    const thumb = container.querySelector('span > span');
    expect(thumb).toHaveAttribute('aria-hidden', 'true');
  });
});
