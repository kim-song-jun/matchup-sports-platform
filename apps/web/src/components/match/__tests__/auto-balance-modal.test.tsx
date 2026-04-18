import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutoBalanceModal } from '../auto-balance-modal';
import type { PreviewTeamsResponse } from '@/types/api';

// ── Hook mocks ────────────────────────────────────────────────────────────────

const mockPreviewMutate = vi.fn();
const mockPreviewReset = vi.fn();
let mockPreviewIsPending = false;
let mockPreviewIsError = false;
let mockPreviewError: Error | null = null;

const mockComposeMutate = vi.fn();
const mockComposeReset = vi.fn();
let mockComposeIsPending = false;
let mockComposeIsError = false;
let mockComposeError: Error | null = null;

vi.mock('@/hooks/use-api', () => ({
  usePreviewTeams: () => ({
    mutate: mockPreviewMutate,
    mutateAsync: vi.fn(),
    isPending: mockPreviewIsPending,
    isError: mockPreviewIsError,
    error: mockPreviewError,
    reset: mockPreviewReset,
    data: undefined,
  }),
  useComposeTeams: () => ({
    mutate: mockComposeMutate,
    mutateAsync: vi.fn(),
    isPending: mockComposeIsPending,
    isError: mockComposeIsError,
    error: mockComposeError,
    reset: mockComposeReset,
    data: undefined,
  }),
}));

// Stub Modal — render children directly for testability
vi.mock('@/components/ui/modal', () => ({
  Modal: ({
    isOpen,
    children,
    title,
    onClose,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-modal="true" aria-label={title}>
        <button onClick={onClose} aria-label="닫기">닫기</button>
        {children}
      </div>
    ) : null,
}));

// ── Sample data ───────────────────────────────────────────────────────────────

function makePreviewResponse(opts?: {
  coldStartCount?: number;
  maxEloGap?: number;
}): PreviewTeamsResponse {
  const coldStart = opts?.coldStartCount ?? 0;
  const gap = opts?.maxEloGap ?? 30;

  return {
    teams: [
      {
        index: 0,
        name: 'A팀',
        color: '#3182F6',
        avgElo: 1050,
        members: [
          {
            userId: 'u1',
            nickname: '김철수',
            profileImageUrl: null,
            eloRating: 1100,
            hasProfile: true,
          },
          {
            userId: 'u2',
            nickname: '이영희',
            profileImageUrl: null,
            eloRating: 1000,
            hasProfile: coldStart === 0,
          },
        ],
      },
      {
        index: 1,
        name: 'B팀',
        color: '#EF4444',
        avgElo: 1020,
        members: [
          {
            userId: 'u3',
            nickname: '박민수',
            profileImageUrl: null,
            eloRating: 1040,
            hasProfile: true,
          },
          {
            userId: 'u4',
            nickname: '최지수',
            profileImageUrl: null,
            eloRating: 1000,
            hasProfile: coldStart === 0,
          },
        ],
      },
    ],
    metrics: {
      maxEloGap: gap,
      variance: 1000,
      stdDev: 31.6,
      teamAvgElos: [1050, 1020],
      coldStartCount: coldStart,
    },
    seed: 12345,
  };
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const defaultProps = {
  matchId: 'match-1',
  open: true,
  onClose: vi.fn(),
  onConfirmed: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AutoBalanceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewIsPending = false;
    mockPreviewIsError = false;
    mockPreviewError = null;
    mockComposeIsPending = false;
    mockComposeIsError = false;
    mockComposeError = null;
  });

  it('renders_config_step_initially — shows teamCount buttons, strategy toggle, preview CTA', () => {
    render(<AutoBalanceModal {...defaultProps} />, { wrapper });

    // Team count options
    expect(screen.getByRole('button', { name: /2팀/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3팀/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4팀/ })).toBeInTheDocument();

    // Strategy toggle
    expect(screen.getByRole('button', { name: /ELO 균형/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /랜덤/ })).toBeInTheDocument();

    // Preview CTA
    expect(screen.getByRole('button', { name: /미리보기/ })).toBeInTheDocument();
  });

  it('preview_triggers_mutation_and_shows_teams — clicking preview calls mutate; on success shows team cards', async () => {
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));

    await waitFor(() => {
      expect(mockPreviewMutate).toHaveBeenCalledWith(
        { teamCount: 2, strategy: 'balanced' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
      expect(screen.getByText('B팀')).toBeInTheDocument();
    });
  });

  it('cold_start_banner_when_coldStartCount_gt_0 — banner with correct text visible', async () => {
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse({ coldStartCount: 5 }));
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/ELO 미등록/),
      ).toBeInTheDocument();
      expect(screen.getByText(/5명/)).toBeInTheDocument();
    });
  });

  it('balance_badge_reflects_gap_threshold — maxEloGap=30 → 균형 양호; 100 → 균형 보통; 200 → 균형 주의', async () => {
    const { rerender, unmount } = render(
      <AutoBalanceModal {...defaultProps} />,
      { wrapper },
    );

    // Case 1: maxEloGap=30 → "균형 양호"
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse({ maxEloGap: 30 }));
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('균형 양호')).toBeInTheDocument();
    });

    unmount();

    // Case 2: maxEloGap=100 → "균형 보통"
    const { rerender: rerender2, unmount: unmount2 } = render(
      <AutoBalanceModal {...defaultProps} />,
      { wrapper },
    );
    vi.clearAllMocks();
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse({ maxEloGap: 100 }));
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('균형 보통')).toBeInTheDocument();
    });
    unmount2();

    // Case 3: maxEloGap=200 → "균형 주의"
    const { unmount: unmount3 } = render(
      <AutoBalanceModal {...defaultProps} />,
      { wrapper },
    );
    vi.clearAllMocks();
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse({ maxEloGap: 200 }));
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('균형 주의')).toBeInTheDocument();
    });
    unmount3();

    void rerender;
    void rerender2;
  });

  it('retry_generates_new_preview — 재추첨 button calls preview mutation without seed', async () => {
    // First preview succeeds
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));

    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
    });

    // Reset and mock second preview call
    const secondCallArg = vi.fn();
    mockPreviewMutate.mockImplementation(
      (input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        secondCallArg(input);
        onSuccess(makePreviewResponse({ maxEloGap: 60 }));
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /재추첨/ }));

    await waitFor(() => {
      const calledArg = secondCallArg.mock.calls[0]?.[0] as Record<string, unknown>;
      // No seed should be passed on retry
      expect(calledArg.seed).toBeUndefined();
    });
  });

  it('confirm_calls_compose_with_preview_seed — 확정 calls compose mutation with the preview seed', async () => {
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse()); // seed = 12345
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));

    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
    });

    mockComposeMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: () => void }) => {
        onSuccess();
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /^확정$/ }));

    await waitFor(() => {
      expect(mockComposeMutate).toHaveBeenCalledWith(
        expect.objectContaining({ seed: 12345 }),
        expect.any(Object),
      );
    });
  });

  it('error_state_on_preview_failure — ErrorState visible when preview errors', () => {
    mockPreviewIsError = true;
    mockPreviewError = new Error('서버 오류');

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });

    expect(screen.getByText(/팀 미리보기를 가져오지 못했어요/)).toBeInTheDocument();
  });

  it('disabled_button_when_fewer_than_2_participants — preview button disabled with hint text', () => {
    render(
      <AutoBalanceModal {...defaultProps} participantCount={1} />,
      { wrapper },
    );

    const previewBtn = screen.getByRole('button', { name: /미리보기/ });
    expect(previewBtn).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(/확정 참가자가 2명 이상이어야/),
    ).toBeInTheDocument();
  });

  it('back_button_returns_to_config_preserving_settings — 설정 변경 returns to config step with teamCount/strategy intact', async () => {
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    render(<AutoBalanceModal {...defaultProps} defaultTeamCount={3} />, { wrapper });

    // Change strategy to 랜덤
    fireEvent.click(screen.getByRole('button', { name: /랜덤/ }));

    // Proceed to preview
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
    });

    // Click 설정 변경
    fireEvent.click(screen.getByRole('button', { name: /설정 변경/ }));

    // Should be back on config step
    expect(screen.getByRole('button', { name: /미리보기/ })).toBeInTheDocument();

    // teamCount=3 is still selected
    expect(screen.getByRole('button', { name: /3팀/ })).toHaveAttribute('aria-pressed', 'true');

    // strategy=random is still selected
    expect(screen.getByRole('button', { name: /랜덤/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('rewinds_to_preview_on_compose_error — compose rejection keeps preview state and shows compose error banner', async () => {
    // Preview succeeds
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    const { rerender } = render(<AutoBalanceModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));

    // Team cards are visible (preview step)
    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
      expect(screen.getByText('B팀')).toBeInTheDocument();
    });

    // Set up compose to reject and mark error state
    mockComposeIsError = true;
    mockComposeMutate.mockImplementation(
      (_input: unknown, { onError }: { onError: () => void }) => {
        onError();
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /^확정$/ }));

    // Force a re-render so the component sees the updated mockComposeIsError
    await act(async () => {
      rerender(<AutoBalanceModal {...defaultProps} />);
    });

    // Team cards still visible after rewind
    expect(screen.getByText('A팀')).toBeInTheDocument();
    expect(screen.getByText('B팀')).toBeInTheDocument();

    // Compose error banner is visible
    expect(screen.getByText(/팀 구성을 확정하지 못했어요/)).toBeInTheDocument();
  });
});
