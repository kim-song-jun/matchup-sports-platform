import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingReviewsCard } from './pending-review-card';

const { useV1PendingTournamentReviewsMock, useV1ReviewsMock, hasStoredV1SessionMock } = vi.hoisted(() => ({
  useV1PendingTournamentReviewsMock: vi.fn(),
  useV1ReviewsMock: vi.fn(),
  hasStoredV1SessionMock: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1PendingTournamentReviews: useV1PendingTournamentReviewsMock,
  useV1Reviews: useV1ReviewsMock,
}));

vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: hasStoredV1SessionMock }));

function setup({
  tournaments = [] as Array<{ tournamentId: string; tournamentTitle: string }>,
  eventItems = [] as Array<{ remainingCount: number }>,
  hasSession = true,
} = {}) {
  hasStoredV1SessionMock.mockReturnValue(hasSession);
  useV1PendingTournamentReviewsMock.mockReturnValue({ data: tournaments });
  useV1ReviewsMock.mockReturnValue({ data: { items: eventItems } });
}

describe('PendingReviewsCard — 남은 후기 통합 배너', () => {
  beforeEach(() => vi.clearAllMocks());

  it('남은 후기가 없으면 아무것도 렌더하지 않는다', () => {
    setup();
    const { container } = render(<PendingReviewsCard />);
    expect(container).toBeEmptyDOMElement();
  });

  // 경기 후기는 소스가 /my/reviews 허브에 뜨지만, 대회 후기는 허브에 아예 안 뜬다.
  // 그래서 총계는 두 소스를 합쳐야 실제 할 일과 맞는다.
  it('경기 후기와 대회 후기를 합쳐 총계를 보여준다', () => {
    setup({
      tournaments: [{ tournamentId: 'tour-1', tournamentTitle: '여름 컵' }],
      eventItems: [{ remainingCount: 3 }, { remainingCount: 2 }],
    });

    render(<PendingReviewsCard />);

    // 경기 5(=3+2) + 대회 1
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('함께 뛴 상대 평가 5건 · 대회 후기 1건')).toBeInTheDocument();
  });

  // 한 경기에 상대 팀 1 + 상대 선수 여러 명이 걸린다 — 경기 수로 세면 할 일보다 적게 보인다.
  it('경기 후기는 경기 수가 아니라 남은 대상 수로 센다', () => {
    setup({ eventItems: [{ remainingCount: 6 }] });

    render(<PendingReviewsCard />);

    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 후기 6건 쓰기' })).toHaveAttribute('href', '/my/reviews');
  });

  it('두 소스의 작성 화면이 달라 CTA도 따로 나간다', () => {
    setup({
      tournaments: [{ tournamentId: 'tour-9', tournamentTitle: '가을 리그' }],
      eventItems: [{ remainingCount: 1 }],
    });

    render(<PendingReviewsCard />);

    expect(screen.getByRole('link', { name: '경기 후기 1건 쓰기' })).toHaveAttribute('href', '/my/reviews');
    expect(screen.getByRole('link', { name: '대회 후기 쓰기' })).toHaveAttribute(
      'href',
      '/tournaments/tour-9/awards',
    );
  });

  it('대회 후기만 남으면 그 CTA 하나만, 대회명을 함께 보여준다', () => {
    setup({ tournaments: [{ tournamentId: 'tour-2', tournamentTitle: '봄 챔피언십' }] });

    render(<PendingReviewsCard />);

    expect(screen.getByText('봄 챔피언십')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대회 후기 쓰기' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /경기 후기/ })).not.toBeInTheDocument();
  });

  // 비로그인 방문자가 인증 필요한 엔드포인트를 때리지 않아야 한다.
  it('비로그인이면 두 조회 모두 비활성화한다', () => {
    setup({ hasSession: false });

    render(<PendingReviewsCard />);

    expect(useV1PendingTournamentReviewsMock).toHaveBeenCalledWith(false);
    expect(useV1ReviewsMock).toHaveBeenCalledWith(expect.anything(), { enabled: false });
  });
});
