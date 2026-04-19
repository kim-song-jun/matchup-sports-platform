import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayoutBatchBuilder, type PayoutEligibleSettlement } from './payout-batch-builder';

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

function makeSettlement(overrides: Partial<PayoutEligibleSettlement> & Pick<PayoutEligibleSettlement, 'recipientId'>): PayoutEligibleSettlement {
  return {
    recipientName: '홍길동',
    settlementCount: 2,
    grossAmount: 12000,
    platformFee: 1200,
    netAmount: 10800,
    oldestReleasedAt: '2026-04-18T10:00:00.000Z',
    ...overrides,
  };
}

function makeMutation(overrides?: Record<string, unknown>) {
  return { mutate: vi.fn(), isPending: false, ...overrides };
}

const settlements: PayoutEligibleSettlement[] = [
  makeSettlement({ recipientId: 'user-1', recipientName: '홍길동', netAmount: 10800, settlementCount: 2 }),
  makeSettlement({ recipientId: 'user-2', recipientName: '김철수', netAmount: 20000, settlementCount: 3 }),
];

describe('PayoutBatchBuilder', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows empty state when settlements is empty', () => {
    render(<PayoutBatchBuilder settlements={[]} createPayoutBatchMutation={makeMutation()} />);
    expect(screen.getByText('지급 대기 정산이 없어요')).toBeInTheDocument();
  });

  it('renders all settlement rows', () => {
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation()} />);
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();
  });

  it('does not show batch action bar when nothing selected', () => {
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation()} />);
    expect(screen.queryByRole('button', { name: /지급 배치 생성/ })).toBeNull();
  });

  it('shows batch action bar after selecting a row', () => {
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation()} />);
    const row1 = screen.getByText('홍길동').closest('tr')!;
    fireEvent.click(row1);
    expect(screen.getByRole('button', { name: /지급 배치 생성/ })).toBeInTheDocument();
  });

  it('shows combined total when two recipients selected', () => {
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation()} />);
    const row1 = screen.getByText('홍길동').closest('tr')!;
    const row2 = screen.getByText('김철수').closest('tr')!;
    fireEvent.click(row1); // user-1
    fireEvent.click(row2); // user-2
    // netAmount: 10800 + 20000 = 30800
    expect(screen.getByText(/30,800원/)).toBeInTheDocument();
  });

  it('opens confirmation modal when batch button clicked', () => {
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation()} />);
    const row1 = screen.getByText('홍길동').closest('tr')!;
    fireEvent.click(row1); // user-1
    fireEvent.click(screen.getByRole('button', { name: /지급 배치 생성/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '지급 배치 생성' })).toBeInTheDocument();
  });

  it('calls mutate with recipientIds after confirming in modal', () => {
    const mutate = vi.fn();
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation({ mutate })} />);
    const row1 = screen.getByText('홍길동').closest('tr')!;
    fireEvent.click(row1); // user-1
    // Step 1: open confirmation modal
    fireEvent.click(screen.getByRole('button', { name: /지급 배치 생성/ }));
    // Step 2: confirm inside modal
    fireEvent.click(screen.getByRole('button', { name: /^확인$/ }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['user-1'] }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('deselects all via toggle-all', () => {
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation()} />);
    // Select all via toggle-all button
    fireEvent.click(screen.getByLabelText('전체 선택'));
    // Both should be selected — action bar shows
    expect(screen.getByRole('button', { name: /지급 배치 생성/ })).toBeInTheDocument();
    // Toggle all again to deselect
    fireEvent.click(screen.getByLabelText('전체 선택'));
    expect(screen.queryByRole('button', { name: /지급 배치 생성/ })).toBeNull();
  });

  it('select all picks all recipients after modal confirm', () => {
    const mutate = vi.fn();
    render(<PayoutBatchBuilder settlements={settlements} createPayoutBatchMutation={makeMutation({ mutate })} />);
    fireEvent.click(screen.getByLabelText('전체 선택'));
    // Step 1: open confirmation modal
    fireEvent.click(screen.getByRole('button', { name: /지급 배치 생성/ }));
    // Step 2: confirm inside modal
    fireEvent.click(screen.getByRole('button', { name: /^확인$/ }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: expect.arrayContaining(['user-1', 'user-2']) }),
      expect.any(Object),
    );
  });
});
