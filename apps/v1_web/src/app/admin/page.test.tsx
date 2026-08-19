import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminOverviewPage from './page';

const overview = {
  users: { active: 10, suspended: 0, blocked: 0, withdrawalPending: 0 },
  matches: { active: 3, cancelled: 0 },
  teams: { active: 5 },
  teamMatches: { recruiting: 2 },
  recentActions: [],
};

const overviewHook = {
  data: overview,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};

const opsSummaryMock = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminOverview: () => overviewHook,
  useV1AdminOpsSummary: () => opsSummaryMock(),
}));

describe('AdminOverviewPage — ops summary 실패 무신호 금지', () => {
  it('shows an explicit alert with retry when the ops summary query fails, instead of silently hiding the cards', () => {
    const opsRefetch = vi.fn();
    opsSummaryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: opsRefetch,
    });

    render(<AdminOverviewPage />);

    // 실패가 초록 '조치 필요 없음' 뒤에 숨지 않고 명시적 alert로 드러나야 한다
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('운영 실패 지표(웹 푸시 · SMS)를 불러오지 못했어요');
    // 다른 경고가 0이면 초록 상태 자체는 유지하되, alert가 그 위를 한정한다
    expect(screen.getByText('지금은 조치가 필요한 항목이 없어요.')).toBeInTheDocument();

    screen.getByRole('button', { name: '다시 시도' }).click();
    expect(opsRefetch).toHaveBeenCalled();
  });

  it('renders ops warning cards without the alert when the summary loads', () => {
    opsSummaryMock.mockReturnValue({
      data: { pushFailures5m: 4, smsFailures5m: 0 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdminOverviewPage />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('웹 푸시 실패')).toBeInTheDocument();
    expect(screen.getByText('SMS · 인증 실패')).toBeInTheDocument();
  });
});
