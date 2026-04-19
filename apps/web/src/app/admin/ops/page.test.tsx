import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import AdminOpsPage from './page';
import type { AdminOpsSummary, RecentPushFailure } from '@/types/admin-ops';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
const mockMutate = vi.fn();
const mockUseAdminOpsSummary = vi.fn();
const mockUseRecentPushFailures = vi.fn();
const mockUseAckPushFailures = vi.fn();

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock the entire use-api module so no QueryClient is required
vi.mock('@/hooks/use-api', () => ({
  useAdminOpsSummary: () => mockUseAdminOpsSummary(),
  useRecentPushFailures: (_limit?: number) => mockUseRecentPushFailures(),
  useAckPushFailures: () => mockUseAckPushFailures(),
}));

vi.mock('@/components/admin/kpi-card', () => ({
  KpiCard: ({
    label,
    value,
    tone,
    isLoading,
  }: {
    label: string;
    value: number;
    tone?: string;
    href?: string;
    icon?: React.ReactNode;
    isLoading?: boolean;
  }) => (
    <div data-testid="kpi-card" data-tone={tone ?? 'default'} data-loading={isLoading ? 'true' : 'false'} aria-label={label}>
      <span data-testid="kpi-label">{label}</span>
      {isLoading ? (
        <span data-testid="kpi-skeleton" />
      ) : (
        <span data-testid="kpi-value">{value}</span>
      )}
    </div>
  ),
}));

vi.mock('@/components/admin/push-failure-table', () => ({
  PushFailureTable: ({
    rows,
    isLoading,
    onAck,
    isAcking,
  }: {
    rows: RecentPushFailure[];
    isLoading: boolean;
    onAck: () => void;
    isAcking: boolean;
  }) => (
    <div data-testid="push-failure-table">
      <span data-testid="push-failure-count">{rows.length}</span>
      {isLoading && <span data-testid="push-failure-loading">loading</span>}
      <button onClick={onAck} disabled={isAcking} aria-label="일괄 확인">
        일괄 확인
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({
    message,
    onRetry,
  }: {
    message: string;
    onRetry: () => void;
  }) => (
    <div data-testid="error-state">
      <span>{message}</span>
      <button onClick={onRetry}>재시도</button>
    </div>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSummary: AdminOpsSummary = {
  matchesInProgress: 12,
  paymentsPending: 3,
  disputesOpen: 2,
  settlementsPending: 17,
  payoutsFailed: 1,
  pushFailures5m: 4,
};

// pushFailures5m > 10 (PUSH_WARN_THRESHOLD) triggers warning tone
const mockSummaryHighPush: AdminOpsSummary = {
  ...mockSummary,
  pushFailures5m: 11,
};

const mockFailures: RecentPushFailure[] = [
  {
    id: 'wpf-1',
    endpointSuffix: 'abc123',
    userIdHash: 'a1b2c3d4',
    statusCode: 500,
    errorCode: 'InternalServerError',
    occurredAt: '2026-04-19T09:00:00.000Z',
    acknowledgedAt: null,
  },
  {
    id: 'wpf-2',
    endpointSuffix: 'def456',
    userIdHash: 'e5f6a7b8',
    statusCode: 410,
    errorCode: 'UnsubscribeExpired',
    occurredAt: '2026-04-19T09:01:00.000Z',
    acknowledgedAt: null,
  },
];

function setDefaultMocks(
  overrides?: Partial<{
    summaryData: AdminOpsSummary | undefined;
    summaryLoading: boolean;
    summaryError: boolean;
    failuresData: RecentPushFailure[];
    failuresLoading: boolean;
    mutate: ReturnType<typeof vi.fn>;
    isPending: boolean;
  }>,
) {
  const opts = {
    summaryData: mockSummary,
    summaryLoading: false,
    summaryError: false,
    failuresData: mockFailures,
    failuresLoading: false,
    mutate: mockMutate,
    isPending: false,
    ...overrides,
  };

  mockUseAdminOpsSummary.mockReturnValue({
    data: opts.summaryData,
    isLoading: opts.summaryLoading,
    isError: opts.summaryError,
    refetch: vi.fn(),
  });

  mockUseRecentPushFailures.mockReturnValue({
    data: opts.failuresData,
    isLoading: opts.failuresLoading,
  });

  mockUseAckPushFailures.mockReturnValue({
    mutate: opts.mutate,
    isPending: opts.isPending,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminOpsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultMocks();
  });

  it('renders 6 KPI cards with correct values from summary', () => {
    render(<AdminOpsPage />);

    const cards = screen.getAllByTestId('kpi-card');
    expect(cards).toHaveLength(6);

    const values = screen.getAllByTestId('kpi-value').map((el) => el.textContent);
    expect(values).toContain('12');
    expect(values).toContain('3');
    expect(values).toContain('2');
    expect(values).toContain('17');
    expect(values).toContain('1');
    expect(values).toContain('4');
  });

  it('renders all 6 KPI label texts', () => {
    render(<AdminOpsPage />);

    expect(screen.getByText('진행 중 매치')).toBeInTheDocument();
    expect(screen.getByText('대기 결제 (24h)')).toBeInTheDocument();
    expect(screen.getByText('열린 분쟁')).toBeInTheDocument();
    expect(screen.getByText('정산 대기')).toBeInTheDocument();
    expect(screen.getByText('실패 payout')).toBeInTheDocument();
    expect(screen.getByText('최근 5분 푸시 실패')).toBeInTheDocument();
  });

  it('renders push failure table with correct row count', () => {
    render(<AdminOpsPage />);

    expect(screen.getByTestId('push-failure-table')).toBeInTheDocument();
    expect(screen.getByTestId('push-failure-count').textContent).toBe('2');
  });

  it('pushFailures5m >= 10 shows warning tone on the push KPI card', () => {
    setDefaultMocks({ summaryData: mockSummaryHighPush });

    render(<AdminOpsPage />);

    // The last KPI card is the push failures card
    const cards = screen.getAllByTestId('kpi-card');
    const pushCard = cards[cards.length - 1];
    expect(pushCard.dataset.tone).toBe('warning');
  });

  it('pushFailures5m < 10 keeps default tone on the push KPI card', () => {
    render(<AdminOpsPage />);

    const cards = screen.getAllByTestId('kpi-card');
    const pushCard = cards[cards.length - 1];
    expect(pushCard.dataset.tone).toBe('default');
  });

  it('"일괄 확인" button click triggers useAckPushFailures mutate', async () => {
    const user = userEvent.setup();
    render(<AdminOpsPage />);

    await user.click(screen.getByRole('button', { name: '일괄 확인' }));

    expect(mockMutate).toHaveBeenCalledOnce();
  });

  it('shows success toast after ack mutate calls onSuccess callback', async () => {
    const user = userEvent.setup();
    mockUseAckPushFailures.mockReturnValue({
      mutate: vi.fn((_payload, callbacks) => {
        callbacks?.onSuccess?.({ acknowledged: 4 }, undefined, undefined);
      }),
      isPending: false,
    });

    render(<AdminOpsPage />);

    await user.click(screen.getByRole('button', { name: '일괄 확인' }));

    expect(mockToast).toHaveBeenCalledWith('success', '실패 로그를 확인 처리했어요');
  });

  it('shows error toast when ack mutate calls onError callback', async () => {
    const user = userEvent.setup();
    mockUseAckPushFailures.mockReturnValue({
      mutate: vi.fn((_payload, callbacks) => {
        callbacks?.onError?.(new Error('Unauthorized'), undefined, undefined);
      }),
      isPending: false,
    });

    render(<AdminOpsPage />);

    await user.click(screen.getByRole('button', { name: '일괄 확인' }));

    expect(mockToast).toHaveBeenCalledWith('error', expect.stringContaining('실패'));
  });

  it('renders error state when summary query fails', () => {
    setDefaultMocks({ summaryError: true, summaryData: undefined });

    render(<AdminOpsPage />);

    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText('운영 지표를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-card')).not.toBeInTheDocument();
  });

  it('shows skeleton placeholders for all KPI cards while summary is loading', () => {
    setDefaultMocks({ summaryLoading: true, summaryData: undefined });

    render(<AdminOpsPage />);

    const skeletons = screen.getAllByTestId('kpi-skeleton');
    expect(skeletons).toHaveLength(6);
    expect(screen.queryByTestId('kpi-value')).not.toBeInTheDocument();
  });
});
