import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../empty-state';
import type { LucideIcon } from 'lucide-react';

// Minimal LucideIcon stub — cast via unknown to satisfy ForwardRefExoticComponent shape
function MockIconBase({ size, className }: { size?: number | string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      data-testid="mock-icon"
    />
  );
}
const MockIcon = MockIconBase as unknown as LucideIcon;

// next/link stub
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        icon={MockIcon}
        title="매치가 없어요"
        description="아직 매치가 등록되지 않았습니다"
      />,
    );

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
    expect(screen.getByText('매치가 없어요')).toBeInTheDocument();
    expect(screen.getByText('아직 매치가 등록되지 않았습니다')).toBeInTheDocument();
  });

  it('renders without description when not provided', () => {
    render(<EmptyState icon={MockIcon} title="결과 없음" />);
    expect(screen.getByText('결과 없음')).toBeInTheDocument();
  });

  it('renders action link when action prop is provided', () => {
    render(
      <EmptyState
        icon={MockIcon}
        title="팀이 없어요"
        action={{ label: '팀 만들기', href: '/teams/new' }}
      />,
    );
    const link = screen.getByRole('link', { name: '팀 만들기' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/teams/new');
  });

  it('does not render action link when action prop is absent', () => {
    render(<EmptyState icon={MockIcon} title="팀이 없어요" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders secondaryAction button and calls onClick', async () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        icon={MockIcon}
        title="팀이 없어요"
        secondaryAction={{ label: '새로고침', onClick: handleClick }}
      />,
    );

    const button = screen.getByRole('button', { name: '새로고침' });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('icon has aria-hidden="true"', () => {
    render(<EmptyState icon={MockIcon} title="빈 상태" />);
    expect(screen.getByTestId('mock-icon')).toHaveAttribute('aria-hidden', 'true');
  });
});
