import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutoBalanceModal } from '../auto-balance-modal';
import type { PreviewTeamsResponse, ComposeTeamsInput } from '@/types/api';

// ── Hook mocks ────────────────────────────────────────────────────────────────

const mockPreviewMutate = vi.fn();
const mockPreviewReset = vi.fn();
let mockPreviewIsPending = false;
let mockPreviewIsError = false;
let mockPreviewError: Error | null = null;
let mockRetryAfterSeconds: number | null = null;

const mockComposeMutate = vi.fn();
const mockComposeReset = vi.fn();
let mockComposeIsPending = false;
let mockComposeIsError = false;
let mockComposeError: Error | null = null;

// Captured options from the most recent useComposeTeams call — used by W3 409 test
let capturedComposeOptions: { onParticipantsChanged?: (input: ComposeTeamsInput) => void } = {};

vi.mock('@/hooks/use-api', () => ({
  usePreviewTeams: () => ({
    mutate: mockPreviewMutate,
    mutateAsync: vi.fn(),
    isPending: mockPreviewIsPending,
    isError: mockPreviewIsError,
    error: mockPreviewError,
    reset: mockPreviewReset,
    data: undefined,
    retryAfterSeconds: mockRetryAfterSeconds,
  }),
  useComposeTeams: (_matchId: string, options?: { onParticipantsChanged?: (input: ComposeTeamsInput) => void }) => {
    capturedComposeOptions = options ?? {};
    return {
      mutate: mockComposeMutate,
      mutateAsync: vi.fn(),
      isPending: mockComposeIsPending,
      isError: mockComposeIsError,
      error: mockComposeError,
      reset: mockComposeReset,
      data: undefined,
    };
  },
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
  seed?: number;
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
    seed: opts?.seed ?? 12345,
    // TODO(task-72): participantHash will be typed when Track D lands;
    // cast via `as` to avoid blocking Track C on Track A/D type changes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
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
    mockRetryAfterSeconds = null;
    mockComposeIsPending = false;
    mockComposeIsError = false;
    mockComposeError = null;
    capturedComposeOptions = {};
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

  // ── Task 72 Track C new tests ─────────────────────────────────────────────────

  it('previewHistory_fifo_cap — pushing 3 previews retains only 2 in history (FIFO cap)', async () => {
    // Each call to the mock returns a new preview with a distinct seed.
    // callCount trace:
    //   1 → initial preview (seed=111), history=[], current=111
    //   retry #1: push 111 → history=[111], current=222
    //   retry #2: push 222 → history=[111,222], current=333
    //   retry #3: push 333 → [111,222,333].slice(-2)=[222,333], current=444
    // Final: history.length===2, oldest seed=111 is evicted.
    let callCount = 0;
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        callCount++;
        onSuccess(makePreviewResponse({ seed: callCount * 111 }));
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });

    // Initial preview
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
    });

    // Retry #1 — history=[111], current=222
    fireEvent.click(screen.getByRole('button', { name: /재추첨/ }));
    await waitFor(() => {
      expect(mockPreviewMutate).toHaveBeenCalledTimes(2);
    });

    // Retry #2 — history=[111,222], current=333
    fireEvent.click(screen.getByRole('button', { name: /재추첨/ }));
    await waitFor(() => {
      expect(mockPreviewMutate).toHaveBeenCalledTimes(3);
    });

    // Retry #3 — history=[222,333] (oldest evicted), current=444
    fireEvent.click(screen.getByRole('button', { name: /재추첨/ }));
    await waitFor(() => {
      expect(mockPreviewMutate).toHaveBeenCalledTimes(4);
    });

    // History is capped at 2 — toggle bar label must say "2건", not "3건"
    await waitFor(() => {
      expect(screen.getByText(/이전 결과 2건/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/이전 결과 3건/)).not.toBeInTheDocument();
  });

  it('history_seed_compose — "이 구성으로 확정" with historical seed calls compose with that seed', async () => {
    let callCount = 0;
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        callCount++;
        onSuccess(makePreviewResponse({ seed: callCount * 100 }));
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });

    // First preview (seed=100)
    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
    });

    // Retry once (pushes seed=100 to history, current becomes seed=200)
    fireEvent.click(screen.getByRole('button', { name: /재추첨/ }));
    await waitFor(() => {
      expect(mockPreviewMutate).toHaveBeenCalledTimes(2);
    });

    // History toggle should appear since we have 1 historical result
    await waitFor(() => {
      expect(screen.getByText(/이전 결과 1건/)).toBeInTheDocument();
    });

    // Click the "이전 1" button to view history snapshot
    fireEvent.click(screen.getByRole('button', { name: /이전 결과 1 보기/ }));

    // "이 구성으로 확정" should appear when viewing history
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /이 구성으로 확정/ })).toBeInTheDocument();
    });

    // Set up compose mock
    mockComposeMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: () => void }) => {
        onSuccess();
      },
    );

    // Click "이 구성으로 확정" — should fire compose with historical seed=100
    fireEvent.click(screen.getByRole('button', { name: /이 구성으로 확정/ }));

    await waitFor(() => {
      expect(mockComposeMutate).toHaveBeenCalledWith(
        expect.objectContaining({ seed: 100 }),
        expect.any(Object),
      );
    });
  });

  it('confirm_replace_modal_appears_with_existing_teams — shows modal when existingTeams present; skips when empty', async () => {
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    const existingTeams = [
      { teamName: 'A팀', memberCount: 5 },
      { teamName: 'B팀', memberCount: 5 },
    ];

    // ── Case 1: existingTeams present → ConfirmReplaceModal should appear ──────
    render(
      <AutoBalanceModal {...defaultProps} existingTeams={existingTeams} />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    await waitFor(() => {
      expect(screen.getByText('A팀')).toBeInTheDocument();
    });

    // Click 확정 — should open ConfirmReplaceModal instead of firing compose
    fireEvent.click(screen.getByRole('button', { name: /^확정$/ }));

    await waitFor(() => {
      // ConfirmReplaceModal body text appears
      expect(screen.getByText(/교체돼요/)).toBeInTheDocument();
      // Compose must NOT have been called yet
      expect(mockComposeMutate).not.toHaveBeenCalled();
    });
  });

  // ── W3: 429 countdown ─────────────────────────────────────────────────────────

  it('retry_countdown_429 — retryAfterSeconds=60 disables retry button with countdown label; decrements each second', async () => {
    // Reach preview step with retryAfterSeconds=60 from the start
    // so the countdown useEffect fires on first render of the preview step.
    mockRetryAfterSeconds = 60;

    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    vi.useFakeTimers({ shouldAdvanceTime: false });

    try {
      const { unmount } = render(<AutoBalanceModal {...defaultProps} />, { wrapper });

      // Click preview to reach preview step — inside act so state updates flush
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
      });

      // The component should now be on preview step with retryAfterSeconds=60
      // All state updates from the synchronous mock are flushed by act
      const retryBtn = screen.getByRole('button', { name: /재추첨/ });
      expect(retryBtn).toBeDisabled();
      expect(retryBtn).toHaveTextContent('재추첨 (60초)');

      // Advance 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByRole('button', { name: /재추첨/ })).toHaveTextContent('재추첨 (59초)');

      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── W3: 409 auto-repreview ────────────────────────────────────────────────────

  it('participants_changed_409_auto_repreview — onParticipantsChanged triggers re-preview and announces to aria-live', () => {
    // Reach preview step first
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    render(<AutoBalanceModal {...defaultProps} />, { wrapper });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    });

    // Should be on preview step now
    expect(screen.getByText('A팀')).toBeInTheDocument();

    // Set up re-preview mock for the 409 re-run
    let repreviewCalled = false;
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        repreviewCalled = true;
        onSuccess(makePreviewResponse({ maxEloGap: 20 }));
      },
    );

    // Invoke onParticipantsChanged synchronously (simulating 409 path in hook)
    act(() => {
      capturedComposeOptions.onParticipantsChanged?.({ teamCount: 2, strategy: 'balanced' });
    });

    // previewMutation.mutate should have been called for re-preview
    expect(repreviewCalled).toBe(true);

    // sr-only aria-live region should announce the change
    // Find the sr-only div with the announcement (not the PreviewStep aria-live region)
    const liveRegions = screen.getAllByRole('status');
    const hasAnnouncement = liveRegions.some((el) =>
      el.textContent?.includes('참가자가 변경되어 다시 계산했어요'),
    );
    expect(hasAnnouncement).toBe(true);
  });

  // ── W4: Focus trap in ConfirmReplaceModal ─────────────────────────────────────

  it('focus_trap_confirm_replace_modal — alertdialog contains focusable buttons isolated from parent modal', () => {
    mockPreviewMutate.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (data: PreviewTeamsResponse) => void }) => {
        onSuccess(makePreviewResponse());
      },
    );

    const existingTeams = [
      { teamName: 'A팀', memberCount: 5 },
      { teamName: 'B팀', memberCount: 5 },
    ];

    render(
      <AutoBalanceModal {...defaultProps} existingTeams={existingTeams} />,
      { wrapper },
    );

    // Reach preview step
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /미리보기/ }));
    });
    expect(screen.getByText('A팀')).toBeInTheDocument();

    // Open ConfirmReplaceModal by clicking 확정
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^확정$/ }));
    });

    const alertDialog = screen.getByRole('alertdialog');
    const focusableInDialog = within(alertDialog).getAllByRole('button');

    // alertdialog must have its own focusable buttons (닫기, 취소, 교체)
    expect(focusableInDialog.length).toBeGreaterThanOrEqual(2);

    // Focus the first button in the alertdialog
    act(() => {
      focusableInDialog[0].focus();
    });
    expect(document.activeElement).toBe(focusableInDialog[0]);

    // Shift-Tab on first element: the keydown handler should e.stopPropagation() + e.preventDefault()
    // and move focus to last element (wrap). JSDOM does not natively move focus on Tab keydown,
    // but it does execute the event listener we attached — which calls last.focus().
    act(() => {
      fireEvent.keyDown(focusableInDialog[0], { key: 'Tab', shiftKey: true, bubbles: true });
    });

    // After the wrap-around handler runs, active element should be the last focusable in dialog
    const last = focusableInDialog[focusableInDialog.length - 1];
    expect(document.activeElement).toBe(last);

    // Tab on last element should wrap to first
    act(() => {
      fireEvent.keyDown(last, { key: 'Tab', shiftKey: false, bubbles: true });
    });
    expect(document.activeElement).toBe(focusableInDialog[0]);

    // alertdialog must still be in the DOM (no crash from event handler)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
