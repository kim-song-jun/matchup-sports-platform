import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NumberDisplay } from '../number-display';

// Skeleton stub
vi.mock('../skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe('NumberDisplay', () => {
  it('renders default integer format', () => {
    render(<NumberDisplay value={1234567} />);
    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('format="money" renders formatted currency for positive value', () => {
    render(<NumberDisplay value={1000000} format="money" />);
    expect(screen.getByText('1,000,000원')).toBeInTheDocument();
  });

  it('format="money" value=0 renders "무료"', () => {
    render(<NumberDisplay value={0} format="money" />);
    expect(screen.getByText('무료')).toBeInTheDocument();
  });

  it('tone="positive" applies positive color class', () => {
    const { container } = render(<NumberDisplay value={99} tone="positive" />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/text-success/);
  });

  it('loading=true renders Skeleton instead of value', () => {
    render(<NumberDisplay value={500} loading />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('500')).not.toBeInTheDocument();
  });

  it('auto-synthesizes aria-label from value and unit when ariaLabel is omitted', () => {
    const { container } = render(<NumberDisplay value={42} unit="개" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('aria-label')).toBe('42개');
  });
});
