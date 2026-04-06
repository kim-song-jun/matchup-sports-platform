import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransferOwnershipModal } from '../transfer-ownership-modal';

// Mock useTransferTeamOwnership
const mockMutate = vi.fn();
let mockIsPending = false;

vi.mock('@/hooks/use-api', () => ({
  useTransferTeamOwnership: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Stub Modal to render children directly
vi.mock('@/components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title: string }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('TransferOwnershipModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    teamId: 'team-1',
    targetUser: { userId: 'user-2', nickname: '김철수' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
  });

  it('renders target user nickname', () => {
    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    expect(screen.getByText(/김철수/)).toBeInTheDocument();
  });

  it('defaults to "manager" demotion option', () => {
    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    const managerRadio = screen.getByRole('radio', { name: /운영자/i });
    expect((managerRadio as HTMLInputElement).checked).toBe(true);
  });

  it('can switch demotion to "member"', () => {
    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    const memberRadio = screen.getByRole('radio', { name: /일반 멤버/i });
    fireEvent.click(memberRadio);
    expect((memberRadio as HTMLInputElement).checked).toBe(true);
  });

  it('calls mutate with correct args on confirm (manager demotion)', async () => {
    mockMutate.mockImplementation((_args: unknown, { onSuccess }: { onSuccess: () => void }) => {
      onSuccess();
    });

    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /소유권 양도하기/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { teamId: 'team-1', toUserId: 'user-2', demoteTo: 'manager' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  it('calls mutate with member demotion when selected', async () => {
    mockMutate.mockImplementation((_args: unknown, { onSuccess }: { onSuccess: () => void }) => {
      onSuccess();
    });

    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('radio', { name: /일반 멤버/i }));
    fireEvent.click(screen.getByRole('button', { name: /소유권 양도하기/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { teamId: 'team-1', toUserId: 'user-2', demoteTo: 'member' },
        expect.any(Object),
      );
    });
  });

  it('shows success toast and calls onClose on success', async () => {
    mockMutate.mockImplementation((_args: unknown, { onSuccess }: { onSuccess: () => void }) => {
      onSuccess();
    });

    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /소유권 양도하기/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('success', expect.stringContaining('김철수'));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('shows error toast on failure', async () => {
    mockMutate.mockImplementation((_args: unknown, { onError }: { onError: () => void }) => {
      onError();
    });

    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /소유권 양도하기/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('error', expect.any(String));
    });
  });

  it('cancel button calls onClose', () => {
    render(<TransferOwnershipModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /돌아가기/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    render(<TransferOwnershipModal {...defaultProps} isOpen={false} />, { wrapper });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
