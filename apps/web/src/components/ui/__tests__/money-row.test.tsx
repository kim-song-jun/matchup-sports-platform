import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoneyRow } from '../money-row';

describe('MoneyRow', () => {
  it('renders label and formatted amount with default tone', () => {
    render(<MoneyRow label="매치 참가비" amount={15000} />);

    expect(screen.getByText('매치 참가비')).toBeInTheDocument();
    // formatCurrency embeds '원' inside the formatted string
    expect(screen.getByText('15,000원')).toBeInTheDocument();
  });

  it('applies font-bold to the amount when strong=true', () => {
    const { container } = render(
      <MoneyRow label="총 결제 금액" amount={30000} strong />,
    );

    // The amount span should have font-bold class
    const amountSpan = container.querySelector('.font-bold');
    expect(amountSpan).not.toBeNull();
    expect(amountSpan?.textContent).toBe('30,000원');
  });

  it('renders description below the label', () => {
    render(
      <MoneyRow
        label="수수료"
        amount={1500}
        description="부가세 포함 10%"
      />,
    );

    expect(screen.getByText('수수료')).toBeInTheDocument();
    expect(screen.getByText('부가세 포함 10%')).toBeInTheDocument();
  });

  it('renders rightSlot next to the amount', () => {
    render(
      <MoneyRow
        label="에스크로 보증금"
        amount={5000}
        rightSlot={<span data-testid="badge">보증</span>}
      />,
    );

    expect(screen.getByTestId('badge')).toBeInTheDocument();
    expect(screen.getByText('5,000원')).toBeInTheDocument();
  });

  it('applies text-success class to amount when tone=positive', () => {
    const { container } = render(
      <MoneyRow label="환급 금액" amount={10000} tone="positive" />,
    );

    const amountSpan = container.querySelector('.text-success');
    expect(amountSpan).not.toBeNull();
    expect(amountSpan?.textContent).toBe('10,000원');
  });
});
