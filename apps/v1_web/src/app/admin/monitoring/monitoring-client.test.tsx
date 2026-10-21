import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { V1AdminMonitoringSummary } from '@/types/api';
import { MonitoringClient } from './monitoring-client';

// 탭 본문 4개는 각자 자기 페이지였던 완결 화면(각자 훅·폴링 보유)이라 여기서는
// 스텁으로 대체한다 — 이 테스트의 계약은 "허브가 신호를 보여주고 올바른 본문을
// 갈아끼우는가"이지 본문 내부 동작이 아니다(본문은 각자의 테스트가 있다).
vi.mock('./error-logs-client', () => ({ ErrorLogsClient: () => <div>stub-errors-body</div> }));
vi.mock('./audit-log-view', () => ({ AuditLogView: () => <div>stub-audit-body</div> }));
vi.mock('@/components/admin/push-failure-table', () => ({
  PushFailureTable: () => <div>stub-push-body</div>,
}));
vi.mock('@/components/admin/sms-failure-table', () => ({
  SmsFailureTable: () => <div>stub-sms-body</div>,
}));

const summaryMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMonitoringSummary: () => summaryMock(),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/monitoring',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

const SUMMARY: V1AdminMonitoringSummary = {
  errorsLast24h: 4,
  pushUnacked: 2,
  smsUnacked: 0,
  auditToday: 11,
  loginAnomalies: {
    last24hCount: 2,
    // 2026-10-21 05:03 UTC = 14:03 KST
    latest: { startedAt: '2026-10-21T05:03:00.000Z', failureCount: 63, accountCount: 14 },
  },
};

describe('MonitoringClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    summaryMock.mockReturnValue({ data: SUMMARY, isPending: false, isError: false, refetch: vi.fn() });
  });

  it('renders the four signal counts and starts on the error tab', () => {
    render(<MonitoringClient />);

    expect(screen.getByRole('button', { name: /에러\(최근 24시간\): 4건/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /웹 푸시 실패\(미확인 누적\): 2건/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SMS · 인증 실패\(미확인 누적\): 0건/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /운영 활동\(오늘\): 11건/ })).toBeInTheDocument();
    expect(screen.getByText('stub-errors-body')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '에러 로그' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches the mounted body when a tab is clicked and mirrors the tab into the URL', async () => {
    const user = userEvent.setup();
    render(<MonitoringClient />);

    await user.click(screen.getByRole('tab', { name: '감사 로그' }));

    expect(screen.getByText('stub-audit-body')).toBeInTheDocument();
    expect(screen.queryByText('stub-errors-body')).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/admin/monitoring?tab=audit', { scroll: false });
  });

  it('a signal card click opens the matching tab (스트립 = 탭 바로가기)', async () => {
    const user = userEvent.setup();
    render(<MonitoringClient />);

    await user.click(screen.getByRole('button', { name: /웹 푸시 실패\(미확인 누적\)/ }));

    expect(screen.getByText('stub-push-body')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '웹 푸시 실패' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lands on the tab named by ?tab= so old-URL redirects and deep links arrive intact', () => {
    searchParams = new URLSearchParams('tab=sms');
    render(<MonitoringClient />);

    expect(screen.getByText('stub-sms-body')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'SMS · 인증 실패' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the error tab on an unknown ?tab= value', () => {
    searchParams = new URLSearchParams('tab=nonsense');
    render(<MonitoringClient />);

    expect(screen.getByText('stub-errors-body')).toBeInTheDocument();
  });

  describe('로그인 이상 신호', () => {
    it('shows the 24h count with the latest detection time, failure count and account count', () => {
      render(<MonitoringClient />);

      const tile = screen.getByRole('group', { name: '로그인 이상(최근 24시간): 2건' });
      expect(tile).toHaveTextContent('마지막 감지 10.21 14:03');
      expect(tile).toHaveTextContent('실패 63건 · 계정 14개');
    });

    it('is display-only: it opens no tab and the strip keeps its own tab shortcuts', async () => {
      const user = userEvent.setup();
      render(<MonitoringClient />);

      await user.click(screen.getByRole('group', { name: /로그인 이상/ }));

      expect(replaceMock).not.toHaveBeenCalled();
      expect(screen.getByText('stub-errors-body')).toBeInTheDocument();
    });

    it('says nothing has been detected yet when there is no record', () => {
      summaryMock.mockReturnValue({
        data: { ...SUMMARY, loginAnomalies: { last24hCount: 0, latest: null } },
        isPending: false, isError: false, refetch: vi.fn(),
      });
      render(<MonitoringClient />);

      const tile = screen.getByRole('group', { name: '로그인 이상(최근 24시간): 0건' });
      expect(tile).toHaveTextContent('감지된 적이 없어요');
    });

    it('keeps the older detection visible when the last 24 hours were quiet', () => {
      summaryMock.mockReturnValue({
        data: {
          ...SUMMARY,
          loginAnomalies: {
            last24hCount: 0,
            latest: { startedAt: '2026-10-19T05:03:00.000Z', failureCount: 41, accountCount: 12 },
          },
        },
        isPending: false, isError: false, refetch: vi.fn(),
      });
      render(<MonitoringClient />);

      const tile = screen.getByRole('group', { name: '로그인 이상(최근 24시간): 0건' });
      expect(tile).toHaveTextContent('마지막 감지 10.19 14:03');
      expect(tile).toHaveTextContent('실패 41건 · 계정 12개');
    });

    it('shows a placeholder instead of a count while the summary is loading', () => {
      summaryMock.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
      render(<MonitoringClient />);

      expect(screen.getByRole('group', { name: '로그인 이상(최근 24시간): 집계 중' })).toHaveTextContent('—');
    });
  });
});
