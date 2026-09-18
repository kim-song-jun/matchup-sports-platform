import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
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

const SUMMARY = { errorsLast24h: 4, pushUnacked: 2, smsUnacked: 0, auditToday: 11 };

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
});
