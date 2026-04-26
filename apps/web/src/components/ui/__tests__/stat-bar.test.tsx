import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatBar } from '../stat-bar';

describe('StatBar', () => {
  it('renders label and value/max', () => {
    render(<StatBar label="매너점수" value={75} max={100} />);
    expect(screen.getByText('매너점수')).toBeInTheDocument();
    expect(screen.getByText('75 / 100')).toBeInTheDocument();
  });

  it('tone="positive" applies bg-success fill class', () => {
    const { container } = render(
      <StatBar label="실력" value={60} max={100} tone="positive" />,
    );
    const fill = container.querySelector('[role="progressbar"] > div');
    expect(fill?.className).toMatch(/bg-success/);
  });

  it('showValue=false hides the right-side value display', () => {
    render(<StatBar label="체력" value={40} max={100} showValue={false} />);
    expect(screen.queryByText('40 / 100')).not.toBeInTheDocument();
    expect(screen.getByText('체력')).toBeInTheDocument();
  });

  it('has role="progressbar" with correct aria attributes', () => {
    render(<StatBar label="레이팅" value={30} max={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '50');
    expect(bar).toHaveAttribute('aria-valuenow', '30');
  });

  it('renders sub text when sub prop is provided', () => {
    render(<StatBar label="공격" value={80} max={100} sub="최근 5경기 평균" />);
    expect(screen.getByText('최근 5경기 평균')).toBeInTheDocument();
  });
});
