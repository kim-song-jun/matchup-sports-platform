import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileDisputeModal } from './file-dispute-modal';

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Modal renders children unconditionally in tests (jsdom doesn't need portals)
vi.mock('@/components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title?: string }) =>
    isOpen ? (
      <div role="dialog" aria-modal="true">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    ) : null,
}));

function makeMutation(overrides?: Record<string, unknown>) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  orderId: 'order-abc',
  fileDisputeMutation: makeMutation(),
};

describe('FileDisputeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<FileDisputeModal {...defaultProps} isOpen={false} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders modal when isOpen is true', () => {
    render(<FileDisputeModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '분쟁 신청' })).toBeInTheDocument();
  });

  it('submit button is disabled when no type selected', () => {
    render(<FileDisputeModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: '분쟁 신청' })).toBeDisabled();
  });

  it('submit button is disabled when description is too short', () => {
    render(<FileDisputeModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/상품 미수령/));
    fireEvent.change(screen.getByLabelText(/상세 내용/), { target: { value: '짧음' } });
    expect(screen.getByRole('button', { name: '분쟁 신청' })).toBeDisabled();
  });

  it('submit button enabled when type and description are valid', () => {
    render(<FileDisputeModal {...defaultProps} />);
    // Select type via radio label
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);
    fireEvent.change(screen.getByLabelText(/상세 내용/), {
      target: { value: '배송이 7일이 지나도 오지 않아요 분쟁 신청합니다' },
    });
    expect(screen.getByRole('button', { name: '분쟁 신청' })).not.toBeDisabled();
  });

  it('calls mutate with correct args on submit', () => {
    const mutate = vi.fn();
    render(
      <FileDisputeModal
        {...defaultProps}
        fileDisputeMutation={makeMutation({ mutate })}
      />,
    );
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);
    fireEvent.change(screen.getByLabelText(/상세 내용/), {
      target: { value: '배송이 7일이 지나도 오지 않아요 분쟁 신청합니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '분쟁 신청' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-abc', type: 'item_not_received' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('shows spinner when isPending', () => {
    render(
      <FileDisputeModal
        {...defaultProps}
        fileDisputeMutation={makeMutation({ isPending: true })}
      />,
    );
    // Submit button should be disabled
    expect(screen.getByRole('button', { name: '분쟁 신청' })).toBeDisabled();
  });
});
