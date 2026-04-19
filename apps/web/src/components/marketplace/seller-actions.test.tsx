import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SellerActions } from './seller-actions';

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title?: string }) =>
    isOpen ? (
      <div role="dialog" aria-modal="true">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    ) : null,
}));

function makeShipMutation(overrides?: Record<string, unknown>) {
  return { mutate: vi.fn(), isPending: false, ...overrides };
}

function makeDeliverMutation(overrides?: Record<string, unknown>) {
  return { mutate: vi.fn(), isPending: false, ...overrides };
}

const defaultProps = {
  orderId: 'order-xyz',
  status: 'escrow_held',
  shipOrderMutation: makeShipMutation(),
  deliverOrderMutation: makeDeliverMutation(),
};

describe('SellerActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when status is not escrow_held or shipped', () => {
    const { container } = render(
      <SellerActions {...defaultProps} status="pending" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is delivered', () => {
    const { container } = render(
      <SellerActions {...defaultProps} status="delivered" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows "발송 처리" button when status is escrow_held', () => {
    render(<SellerActions {...defaultProps} status="escrow_held" />);
    expect(screen.getByRole('button', { name: '발송 처리하기' })).toBeInTheDocument();
  });

  it('shows "배달 완료" button when status is shipped', () => {
    render(<SellerActions {...defaultProps} status="shipped" />);
    expect(screen.getByRole('button', { name: '배달 완료 처리하기' })).toBeInTheDocument();
  });

  it('does not show deliver button when status is escrow_held', () => {
    render(<SellerActions {...defaultProps} status="escrow_held" />);
    expect(screen.queryByRole('button', { name: '배달 완료 처리하기' })).toBeNull();
  });

  it('opens ship modal on click', () => {
    render(<SellerActions {...defaultProps} status="escrow_held" />);
    fireEvent.click(screen.getByRole('button', { name: '발송 처리하기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '발송 처리' })).toBeInTheDocument();
  });

  it('calls shipOrderMutation.mutate on confirm', () => {
    const mutate = vi.fn();
    render(
      <SellerActions
        {...defaultProps}
        status="escrow_held"
        shipOrderMutation={makeShipMutation({ mutate })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '발송 처리하기' }));
    fireEvent.click(screen.getByRole('button', { name: /발송 완료/ }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-xyz' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('opens deliver modal on click', () => {
    render(<SellerActions {...defaultProps} status="shipped" />);
    fireEvent.click(screen.getByRole('button', { name: '배달 완료 처리하기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '배달 완료 처리' })).toBeInTheDocument();
  });

  it('calls deliverOrderMutation.mutate on confirm', () => {
    const mutate = vi.fn();
    render(
      <SellerActions
        {...defaultProps}
        status="shipped"
        deliverOrderMutation={makeDeliverMutation({ mutate })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '배달 완료 처리하기' }));
    fireEvent.click(screen.getByRole('button', { name: /네, 완료됐어요/ }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-xyz' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
