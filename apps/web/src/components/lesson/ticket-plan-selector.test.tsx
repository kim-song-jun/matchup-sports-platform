import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketPlanSelector } from './ticket-plan-selector';

describe('TicketPlanSelector', () => {
  it('shows an honest empty state when no active plans are provided', () => {
    render(<TicketPlanSelector plans={[]} onSelect={vi.fn()} onPurchase={vi.fn()} />);

    expect(screen.getByText('현재 판매 중인 수강권이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('일일 체험')).not.toBeInTheDocument();
    expect(screen.queryByText('정기수강')).not.toBeInTheDocument();
  });

  it('purchases the selected real plan without falling back to mock labels', () => {
    const onPurchase = vi.fn();

    render(
      <TicketPlanSelector
        plans={[
          {
            id: 'plan-1',
            lessonId: 'lesson-1',
            name: '10회 정기권',
            type: 'multi',
            price: 80000,
            totalSessions: 10,
            isActive: true,
            sortOrder: 0,
          },
        ]}
        onSelect={vi.fn()}
        onPurchase={onPurchase}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /10회 수강권 구매/i }));

    expect(onPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plan-1',
        name: '10회 정기권',
      }),
    );
  });

  it('shows an honest disabled CTA when purchase is not allowed', () => {
    render(
      <TicketPlanSelector
        plans={[
          {
            id: 'plan-1',
            lessonId: 'lesson-1',
            name: '10회 정기권',
            type: 'multi',
            price: 80000,
            totalSessions: 10,
            isActive: true,
            sortOrder: 0,
          },
        ]}
        onSelect={vi.fn()}
        onPurchase={vi.fn()}
        purchaseDisabled
        purchaseDisabledLabel="등록한 강좌는 구매할 수 없어요"
      />,
    );

    expect(screen.getByRole('button', { name: '등록한 강좌는 구매할 수 없어요' })).toBeDisabled();
  });
});
