import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamUpcomingGamesCard } from './team-upcoming-games-card';

/**
 * 다가오는 경기의 명단·전술 진입점이 **조용히 사라지거나 잘못된 곳으로 보내지 않는지** 못박는다.
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
    competitionKind: 'LEAGUE' as const,
    teamMatchId: 'team-match-1',
    sideId: 'side-1',
    title: '(테스트) 가을 리그 1주차',
    opponentName: '망원 FC',
    scheduledAt: '2026-09-02T13:00:00.000Z',
    tournamentId: null,
    tournamentTitle: null,
    lineupState: 'MISSING' as const,
    rosterSummary: { participating: 11, excluded: 1, unavailable: 0, suspended: 0 },
    ...overrides,
  };
}

function show(items: ReturnType<typeof game>[]) {
  apiMocks.useV1TeamUpcomingGames.mockReturnValue({ isLoading: false, isError: false, data: { items } });
}

describe('TeamUpcomingGamesCard — 없을 때는 조용히', () => {
  it('로딩 중에는 아무것도 렌더하지 않는다', () => {
    apiMocks.useV1TeamUpcomingGames.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);
    expect(container).toBeEmptyDOMElement();
  });

  it('조회가 실패해도 팀 상세에 에러를 얹지 않는다', () => {
    apiMocks.useV1TeamUpcomingGames.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);
    expect(container).toBeEmptyDOMElement();
  });

  it('다가오는 경기가 없으면 섹션 자체가 뜨지 않는다', () => {
    show([]);
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TeamUpcomingGamesCard — 종류별 명단 입구(Task 179 팀 A)', () => {
  const items = [
    game({ gameId: 'g-t', competitionKind: 'TOURNAMENT', opponentName: '번개FC', rosterSummary: { participating: 10, excluded: 1, unavailable: 0, suspended: 0 } }),
    game({ gameId: 'g-l', competitionKind: 'LEAGUE', opponentName: '한강유나이티드', rosterSummary: { participating: 9, excluded: 0, unavailable: 1, suspended: 1 } }),
    game({ gameId: 'g-f', competitionKind: 'FRIENDLY', opponentName: '성수FS', teamMatchId: 'tm-f', sideId: null, rosterSummary: null, lineupState: 'MISSING' }),
  ];

  function row(opponent: string) {
    return screen.getByText(`vs ${opponent}`).closest('li') as HTMLElement;
  }

  it('팀장·매니저는 대회·리그는 경기 명단, 친선은 참석명단으로 간다', () => {
    show(items);
    render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);

    const tournament = within(row('번개FC'));
    expect(tournament.getByText('대회')).toBeInTheDocument();
    expect(tournament.getByText('10명 출전 · 1명 빠짐')).toBeInTheDocument();
    expect(tournament.getByRole('link', { name: 'vs 번개FC 명단' })).toHaveAttribute('href', `/teams/${TEAM_ID}/games/g-t/roster`);
    expect(tournament.getByRole('link', { name: 'vs 번개FC 전술' })).toHaveAttribute('href', `/teams/${TEAM_ID}/tactics/g-t`);

    const league = within(row('한강유나이티드'));
    expect(league.getByText('리그')).toBeInTheDocument();
    // 결장·출전정지도 요약에 함께 보인다(0 인 항목은 빠진다).
    expect(league.getByText('9명 출전 · 결장 1명 · 출전정지 1명')).toBeInTheDocument();
    expect(league.getByRole('link', { name: 'vs 한강유나이티드 명단' })).toHaveAttribute('href', `/teams/${TEAM_ID}/games/g-l/roster`);

    const friendly = within(row('성수FS'));
    expect(friendly.getByText('친선')).toBeInTheDocument();
    expect(friendly.getByText('참석명단 미제출')).toBeInTheDocument();
    expect(friendly.getByRole('link', { name: 'vs 성수FS 참석명단' })).toHaveAttribute('href', '/team-matches/tm-f/lineup');
    expect(friendly.queryByRole('link', { name: 'vs 성수FS 명단' })).toBeNull();
  });

  it('명단 버튼은 행마다 보조(outline) 스타일 — 미제출 친선이 여럿이어도 주 CTA 를 늘리지 않는다', () => {
    show([
      ...items,
      game({ gameId: 'g-f2', competitionKind: 'FRIENDLY', opponentName: '합정FC', teamMatchId: 'tm-f2', sideId: null, rosterSummary: null, lineupState: 'MISSING' }),
    ]);
    const { container } = render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);

    expect(container.querySelector('.tm-btn-primary')).toBeNull();
    for (const opponent of ['성수FS', '합정FC']) {
      const link = within(row(opponent)).getByRole('link', { name: `vs ${opponent} 참석명단` });
      expect(link).toHaveClass('tm-btn-outline');
      // 미제출은 버튼 색이 아니라 상태 글자로 알린다.
      expect(within(row(opponent)).getByText('참석명단 미제출')).toBeInTheDocument();
    }
  });

  it('팀원은 요약만 보고 명단 버튼은 없다 — 전술보드(읽기)는 그대로 들어간다', () => {
    show(items);
    render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters={false} />);

    expect(screen.getByText('10명 출전 · 1명 빠짐')).toBeInTheDocument();
    expect(screen.getByText('참석명단 미제출')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /명단$/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /전술$/ })).toHaveLength(3);
  });

  it('제출한 친선은 "참석명단 제출", 명단이 확정 전인 대회 경기는 명단 버튼 없이 안내만', () => {
    show([
      game({ gameId: 'g-f', competitionKind: 'FRIENDLY', opponentName: '성수FS', rosterSummary: null, lineupState: 'DONE', teamMatchId: 'tm-f' }),
      game({ gameId: 'g-t', competitionKind: 'TOURNAMENT', opponentName: '번개FC', rosterSummary: null }),
    ]);
    render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);

    expect(within(row('성수FS')).getByText('참석명단 제출')).toBeInTheDocument();
    const tournament = within(row('번개FC'));
    expect(tournament.getByText('참가 명단 확정 전')).toBeInTheDocument();
    // 기준 명단이 없으면 경기 명단 화면이 404 라 버튼을 내지 않는다.
    expect(tournament.queryByRole('link', { name: 'vs 번개FC 명단' })).toBeNull();
  });

  it('상대가 없으면 경기 제목, 시간이 없으면 "시간 미정"', () => {
    show([game({ gameId: 'g-x', opponentName: null, scheduledAt: null })]);
    render(<TeamUpcomingGamesCard teamId={TEAM_ID} canManageRosters />);
    expect(screen.getByText('(테스트) 가을 리그 1주차')).toBeInTheDocument();
    expect(screen.getByText('시간 미정')).toBeInTheDocument();
  });
});
