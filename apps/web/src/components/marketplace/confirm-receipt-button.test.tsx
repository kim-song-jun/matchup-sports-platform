import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmReceiptButton } from './confirm-receipt-button';

// Stub toast context
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function makeMutation(overrides?: Partial<ConfirmReceiptButtonProps['confirmReceiptMutation']>) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

type ConfirmReceiptButtonProps = React.ComponentProps<typeof ConfirmReceiptButton>;

describe('ConfirmReceiptButton', () => {
  it('renders nothing when status is paid', () => {
    const { container } = render(
      <ConfirmReceiptButton orderId="o1" status="paid" confirmReceiptMutation={makeMutation()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is pending', () => {
    const { container } = render(
      <ConfirmReceiptButton orderId="o1" status="pending" confirmReceiptMutation={makeMutation()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders button when status is shipped', () => {
    render(
      <ConfirmReceiptButton orderId="o1" status="shipped" confirmReceiptMutation={makeMutation()} />,
    );
    expect(screen.getByRole('button', { name: '수령 확인하기' })).toBeInTheDocument();
  });

  it('renders button when status is delivered', () => {
    render(
      <ConfirmReceiptButton orderId="o1" status="delivered" confirmReceiptMutation={makeMutation()} />,
    );
    expect(screen.getByRole('button', { name: '수령 확인하기' })).toBeInTheDocument();
  });

  it('opens confirmation modal on click', () => {
    render(
      <ConfirmReceiptButton orderId="o1" status="shipped" confirmReceiptMutation={makeMutation()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '수령 확인하기' }));
    expect(screen.getByText(/상품을 실제로 받으셨나요/)).toBeInTheDocument();
  });

  it('calls mutate when confirming', () => {
    const mutate = vi.fn();
    render(
      <ConfirmReceiptButton
        orderId="order-123"
        status="shipped"
        confirmReceiptMutation={makeMutation({ mutate })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '수령 확인하기' }));
    fireEvent.click(screen.getByRole('button', { name: /네, 받았어요/ }));
    expect(mutate).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('shows spinner when isPending', () => {
    render(
      <ConfirmReceiptButton
        orderId="o1"
        status="shipped"
        confirmReceiptMutation={makeMutation({ isPending: true })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '수령 확인하기' }));
    // Confirm button should be disabled
    expect(screen.getByRole('button', { name: /네, 받았어요/ })).toBeDisabled();
  });
});
