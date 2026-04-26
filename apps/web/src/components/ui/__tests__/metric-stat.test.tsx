import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricStat } from '../metric-stat';

// Stub next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Stub NumberDisplay — renders value + unit in a span for assertion
vi.mock('../number-display', () => ({
  NumberDisplay: ({
    value,
    unit,
    className,
  }: {
    value: number;
    unit?: string;
    size?: string;
    tone?: string;
    className?: string;
  }) => (
    <span data-testid="number-display" className={className}>
      {value.toLocaleString('ko-KR')}
      {unit}
    </span>
  ),
}));

// Stub Skeleton
vi.mock('../skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe('MetricStat', () => {
  it('renders label, numeric value, and unit', () => {
    render(<MetricStat label="총 매치 수" value={1234} unit="건" />);

    expect(screen.getByText('총 매치 수')).toBeInTheDocument();
    // NumberDisplay stub renders "1,234건"
    expect(screen.getByTestId('number-display')).toHaveTextContent('1,234건');
  });

  it('renders delta>0 with upward arrow and positive class', () => {
    render(<MetricStat label="신규 가입" value={50} delta={12.5} deltaLabel="vs 어제" />);

    const deltaEl = screen.getByText(/\+12\.5%/);
    expect(deltaEl).toBeInTheDocument();
    // Parent row should carry text-success
    expect(deltaEl.closest('p')).toHaveClass('text-success');
    expect(screen.getByText('vs 어제')).toBeInTheDocument();
  });

  it('renders delta<0 with downward arrow and error class', () => {
    render(<MetricStat label="결제 성공률" value={88} unit="%" delta={-3.2} />);

    const deltaEl = screen.getByText(/-3\.2%/);
    expect(deltaEl).toBeInTheDocument();
    expect(deltaEl.closest('p')).toHaveClass('text-error');
  });

  it('renders delta===0 as "변동 없음" with muted class', () => {
    render(<MetricStat label="미해결 분쟁" value={5} delta={0} />);

    const noChangeEl = screen.getByText('변동 없음');
    expect(noChangeEl).toBeInTheDocument();
    expect(noChangeEl.closest('p')).toHaveClass('text-gray-500');
  });

  it('tone="warning" applies warning background class to card container', () => {
    const { container } = render(
      <MetricStat label="결제 보류" value={7} tone="warning" />,
    );

    // The inner card div should carry bg-warning/5
    const card = container.querySelector('.bg-warning\\/5');
    expect(card).toBeInTheDocument();
  });

  it('href wraps content in an anchor element', () => {
    render(
      <MetricStat label="분쟁 현황" value={3} href="/admin/disputes" />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/disputes');
    // Card content is inside the link
    expect(link).toHaveTextContent('분쟁 현황');
  });
});
