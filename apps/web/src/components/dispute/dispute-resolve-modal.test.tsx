import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisputeResolveModal } from './dispute-resolve-modal';

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

function makeMutation(overrides?: Record<string, unknown>) {
  return { mutate: vi.fn(), isPending: false, ...overrides };
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  disputeId: 'dispute-1',
  resolveDisputeMutation: makeMutation(),
};

describe('DisputeResolveModal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does not render when isOpen is false', () => {
    const { container } = render(<DisputeResolveModal {...defaultProps} isOpen={false} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders 3 decision options (refund, release, dismiss)', () => {
    render(<DisputeResolveModal {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('submit button disabled when no decision selected', () => {
    render(<DisputeResolveModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: '처리 확정' })).toBeDisabled();
  });

  it('submit button enabled when refund is selected', () => {
    render(<DisputeResolveModal {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]); // refund
    expect(screen.getByRole('button', { name: '처리 확정' })).not.toBeDisabled();
  });

  it('calls mutate with correct decision on submit (release)', () => {
    const mutate = vi.fn();
    render(<DisputeResolveModal {...defaultProps} resolveDisputeMutation={makeMutation({ mutate })} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]); // release
    fireEvent.click(screen.getByRole('button', { name: '처리 확정' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dispute-1', decision: 'release' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('calls mutate with decision=dismiss when dismiss is selected', () => {
    const mutate = vi.fn();
    render(<DisputeResolveModal {...defaultProps} resolveDisputeMutation={makeMutation({ mutate })} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[2]); // dismiss
    fireEvent.click(screen.getByRole('button', { name: '처리 확정' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dispute-1', decision: 'dismiss' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
