import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CorrectionsPageClient } from './corrections-page-client';

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1Tournament: vi.fn(),
  useTournamentEndedFixtures: vi.fn(),
  useSearchParams: vi.fn(),
}));

// `CorrectionsPageClient`도 자체적으로 `<RequireAuth>`로 감싸므로(Task 1과 동일한
// 셸 미도입 상태) `RequireAuth`가 의존하는 `useV1AuthMe`를 함께 목한다.
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
vi.mock('@/components/tournament-result-review/game-result-correction-panel', () => ({
  GameResultCorrectionPanel: ({ gameId }: { gameId: string }) => <div data-testid="panel">panel:{gameId}</div>,
}));

const ITEM = (fixtureId: string, gameId: string, fixtureNumber: number, revisionId: string | null) => ({
  fixtureId, tournamentId: 't-1', round: '조별 A', fixtureNumber, gameId, gameState: 'ENDED',
  fieldId: null, fieldName: null, homeRegistrationId: null, awayRegistrationId: null,
  scheduledAt: null, currentScore: null, warnings: [], version: 1, revisionId, stableRevision: 'x',
});
// fx-1은 공식 결과가 있고(revisionId 존재), fx-2는 아직 없다 — hasOfficialResult 필터를 실제로 태운다.
const ITEMS = [ITEM('fx-1', 'game-1', 1, 'rev-1'), ITEM('fx-2', 'game-2', 2, null)];

describe('CorrectionsPageClient fixtureId 딥링크 (T6-2)', () => {
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

  it('?fixtureId= 매치가 공식 결과를 가진 경기면 정정 패널을 자동으로 연다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-1'));
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-1');
  });

  it('공식 결과가 없는 fixtureId로 딥링크하면 "정정 목록에 없어요" 안내를 보여준다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-2'));
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(screen.getByText(/정정 목록에 없어요/)).toBeInTheDocument();
  });

  it('fixtureId가 없으면 기존처럼 미선택 상태다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  // Fix round 1 — `useTournamentEndedFixtures`는 staleTime: 15_000이라 창 포커스 등으로
  // 백그라운드 refetch가 돈다. 딥링크 진입 시점엔 공식 결과가 없어 "정정 목록에 없어요"
  // 배너가 뜬 뒤, refetch로 공식 결과가 확정되면(revisionId 채워짐) 배너가 사라지고
  // 패널만 남아야 한다(예전엔 deepLinkNotFound가 한번 true가 되면 안 돌아와 배너+패널이
  // 동시에 보였다).
  it('공식 결과가 없어 안내가 뜬 뒤, refetch로 공식 결과가 확정되면 안내가 사라지고 패널만 남는다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-2'));
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false, isSuccess: true, isError: false, data: { items: ITEMS }, refetch: vi.fn(),
    });
    const { rerender } = render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.getByText(/정정 목록에 없어요/)).toBeInTheDocument();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();

    // 백그라운드 refetch로 fx-2의 공식 결과가 확정된 상황을 시뮬레이션.
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { items: [ITEM('fx-1', 'game-1', 1, 'rev-1'), ITEM('fx-2', 'game-2', 2, 'rev-2')] },
      refetch: vi.fn(),
    });
    rerender(<CorrectionsPageClient tournamentId="t-1" />);

    expect(screen.queryByText(/정정 목록에 없어요/)).not.toBeInTheDocument();
    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-2');
  });
});
