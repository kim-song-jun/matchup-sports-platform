import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamUpcomingGamesCard } from './team-upcoming-games-card';

/**
 * 전술보드 진입점이 **조용히 사라지거나 잘못된 곳으로 보내지 않는지** 못박는다.
 *
 * 이 컴포넌트의 핵심은 "없을 때 아무것도 안 띄운다"는 판단이다 — 팀 상세는 이미 길고,
 * 전술보드는 그 화면의 본론이 아니라 지름길이라 빈 카드나 에러를 하나 더 얹지 않는다.
 * 그런데 그 판단은 **조회 실패까지 숨기므로**, 반대로 "경기가 있는데도 안 뜨는" 회귀와
 * 구분되지 않는다. 그래서 네 상태를 각각 고정한다.
 */

const apiMocks = vi.hoisted(() => ({ useV1TeamUpcomingGames: vi.fn() }));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

const TEAM_ID = 'team-1';

function game(overrides: Record<string, unknown> = {}) {
  return {
    gameId: 'game-1',
    source: 'TEAM_MATCH' as const,
    title: '(테스트) 가을 리그 1주차',
    opponentName: '망원 FC',
    scheduledAt: '2026-09-02T13:00:00.000Z',
    tournamentId: null,
    tournamentTitle: null,
    lineupState: 'MISSING' as const,
    ...overrides,
  };
}

describe('TeamUpcomingGamesCard — 없을 때는 조용히, 있을 때는 전술보드로', () => {
  it('로딩 중에는 아무것도 렌더하지 않는다', () => {
    apiMocks.useV1TeamUpcomingGames.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('조회가 실패해도 팀 상세에 에러를 얹지 않는다', () => {
    apiMocks.useV1TeamUpcomingGames.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('다가오는 경기가 없으면 섹션 자체가 뜨지 않는다', () => {
    apiMocks.useV1TeamUpcomingGames.mockReturnValue({ isLoading: false, isError: false, data: { items: [] } });
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('경기가 있으면 그 경기의 전술보드로 가는 링크를 낸다', () => {
    apiMocks.useV1TeamUpcomingGames.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [game(), game({ gameId: 'game-2', opponentName: null, scheduledAt: null })] },
    });
    render(<TeamUpcomingGamesCard teamId={TEAM_ID} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    // 경로가 틀리면 사용자가 남의 팀 보드나 없는 화면으로 간다 — 여기서 고정한다.
    expect(links[0]).toHaveAttribute('href', `/teams/${TEAM_ID}/tactics/game-1`);
    expect(links[1]).toHaveAttribute('href', `/teams/${TEAM_ID}/tactics/game-2`);

    // 상대가 있으면 "vs 상대", 없으면 경기 제목으로 떨어진다.
    expect(screen.getByText('vs 망원 FC')).toBeInTheDocument();
    expect(screen.getByText('(테스트) 가을 리그 1주차')).toBeInTheDocument();
    // 시간이 없는 경기도 빈칸이 아니라 말이 되는 문구여야 한다.
    expect(screen.getByText('시간 미정')).toBeInTheDocument();
  });
});
