import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ResultReviewPageClient } from './result-review-page-client';

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1Tournament: vi.fn(),
  useTournamentEndedFixtures: vi.fn(),
  useSearchParams: vi.fn(),
}));

// `ResultReviewPageClient`가 자체적으로 `<RequireAuth>`로 감싸므로(공유 셸 미도입
// 상태, 파일 상단 주석 참고) `RequireAuth`가 의존하는 `useV1AuthMe`도 함께 목한다.
// 실제 세션 로직(session-storage)은 그대로 두고 localStorage에 유효한 세션
// 힌트를 심어 `hasSessionHint`가 true가 되게 한다 — 이 테스트의 관심사는
// fixtureId 딥링크 동작이지 인증 자체가 아니다.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
  useV1Tournament: (...args: unknown[]) => mocks.useV1Tournament(...args),
}));
vi.mock('@/hooks/use-tournament-result-review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-tournament-result-review')>();
  return { ...actual, useTournamentEndedFixtures: (...args: unknown[]) => mocks.useTournamentEndedFixtures(...args) };
});
vi.mock('next/navigation', () => ({
  useSearchParams: (...args: unknown[]) => mocks.useSearchParams(...args),
}));
vi.mock('@/components/tournament-result-review/game-result-review-panel', () => ({
  GameResultReviewPanel: ({ gameId }: { gameId: string }) => <div data-testid="panel">panel:{gameId}</div>,
}));

const ITEM = (fixtureId: string, gameId: string, fixtureNumber: number) => ({
  fixtureId, tournamentId: 't-1', round: '조별 A', fixtureNumber, gameId, gameState: 'ENDED',
  fieldId: null, fieldName: null, homeRegistrationId: null, awayRegistrationId: null,
  scheduledAt: null, currentScore: null, warnings: [], version: 1, revisionId: null, stableRevision: 'x',
});
const ITEMS = [ITEM('fx-1', 'game-1', 1), ITEM('fx-2', 'game-2', 2)];

describe('ResultReviewPageClient fixtureId 딥링크 (T6-1)', () => {
  beforeEach(() => {
    window.localStorage.setItem('teameet.v1.userId', 'user-1');
    mocks.useV1AuthMe.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
      isSuccess: true,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 대회' } });
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false, isSuccess: true, isError: false, data: { items: ITEMS }, refetch: vi.fn(),
    });
  });

  it('?fixtureId= 매치가 있으면 그 경기의 패널을 자동으로 연다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-2'));
    render(<ResultReviewPageClient tournamentId="t-1" />);
    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-2');
  });

  it('목록에 없는 fixtureId면 안내 문구를 보여준다(조용히 드롭하지 않는다)', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-missing'));
    render(<ResultReviewPageClient tournamentId="t-1" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(screen.getByText(/검토 목록에 없어요/)).toBeInTheDocument();
  });

  it('fixtureId가 없으면 기존처럼 아무것도 선택돼 있지 않다(수동 선택 동작 불변)', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    render(<ResultReviewPageClient tournamentId="t-1" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });
});
