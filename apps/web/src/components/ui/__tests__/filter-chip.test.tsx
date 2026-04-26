import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip } from '../filter-chip';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-label'?: string;
    'aria-pressed'?: boolean;
    onClick?: () => void;
  }) => (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      onClick={onClick}
    >
      {children}
    </a>
  ),
}));

describe('FilterChip', () => {
  it('renders inactive chip with correct text and aria-pressed=false', () => {
    render(<FilterChip active={false}>전체</FilterChip>);

    const chip = screen.getByRole('button', { name: '전체' });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies active variant classes when active=true', () => {
    render(<FilterChip active={true}>풋살</FilterChip>);

    const chip = screen.getByRole('button', { name: '풋살' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip.className).toContain('bg-blue-500');
    expect(chip.className).toContain('text-white');
  });

  it('renders count badge when count > 0', () => {
    render(
      <FilterChip active={false} count={3}>
        농구
      </FilterChip>,
    );

    const badge = screen.getByText('3');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge.className).toContain('rounded-full');
  });

  it('wraps with Link when asLink is provided', () => {
    render(
      <FilterChip active={false} asLink={{ href: '/matches?sport=futsal' }}>
        풋살
      </FilterChip>,
    );

    const link = screen.getByRole('link', { name: '풋살' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/matches?sport=futsal');
    expect(link).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onClick when button is clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <FilterChip active={false} onClick={onClick}>
        배드민턴
      </FilterChip>,
    );

    await user.click(screen.getByRole('button', { name: '배드민턴' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
