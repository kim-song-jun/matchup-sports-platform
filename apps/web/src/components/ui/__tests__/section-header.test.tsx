import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '../section-header';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe('SectionHeader', () => {
  it('renders title, count, and more link', () => {
    render(
      <SectionHeader
        title="추천 매치"
        count={6}
        href="/matches"
        moreLabel="더보기"
      />,
    );

    expect(screen.getByText('추천 매치')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /더보기/i })).toHaveAttribute('href', '/matches');
  });

  it('renders custom action instead of the default link', () => {
    render(
      <SectionHeader
        title="장터"
        action={<button type="button">직접 액션</button>}
      />,
    );

    expect(screen.getByRole('button', { name: '직접 액션' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
