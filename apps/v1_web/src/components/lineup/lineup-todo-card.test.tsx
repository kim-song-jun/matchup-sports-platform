import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LineupTodoCard } from './lineup-todo-card';
import type { V1LineupTodo } from '@/hooks/use-v1-api';

/**
 * 여러 리그를 동시에 뛰는 팀장이 이 카드만 보고 "어느 경기의 라인업인지"를 고를 수 있어야
 * 한다. 서버가 리그 대진에 "리그명 N주차" 제목을 실어주기 시작했으므로, 카드가 그 제목을
 * 그대로 보여주는지(=리그명과 주차가 화면에 보이는지) 못박는다.
 */

const apiMocks = vi.hoisted(() => ({ useV1LineupTodos: vi.fn() }));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1LineupTodos: apiMocks.useV1LineupTodos,
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function todo(overrides: Partial<V1LineupTodo> & { gameId: string }): V1LineupTodo {
  return {
    source: 'TEAM_MATCH',
    teamId: 'team-home',
    teamName: '성수 FC',
    tournamentId: null,
    tournamentTitle: null,
    title: '팀 매치',
    opponentName: '망원 FC',
    scheduledAt: '2026-09-05T10:00:00.000Z',
    state: 'MISSING',
    deepLink: '/team-matches/match-1/lineup',
    ...overrides,
  };
}

describe('LineupTodoCard', () => {
  it('리그 대진은 리그명과 주차가 보이고, 친선 팀매치는 예전 라벨 그대로다', () => {
    apiMocks.useV1LineupTodos.mockReturnValue({
      data: {
        items: [
          todo({
            gameId: 'game-league',
            tournamentId: 'league-1',
            tournamentTitle: '가을 정규 리그',
            title: '가을 정규 리그 2주차',
            deepLink: '/team-matches/match-league/lineup',
          }),
          todo({ gameId: 'game-friendly', deepLink: '/team-matches/match-friendly/lineup' }),
        ],
      },
    });

    render(<LineupTodoCard />);

    expect(screen.getByText('가을 정규 리그 2주차')).toBeInTheDocument();
    expect(screen.getByText('팀 매치')).toBeInTheDocument();
    // 링크는 각 경기의 라인업 화면으로 그대로 꽂힌다.
    expect(screen.getByRole('link', { name: /가을 정규 리그 2주차/ })).toHaveAttribute(
      'href',
      '/team-matches/match-league/lineup',
    );
  });

  it('할 일이 없으면 아무것도 그리지 않는다', () => {
    apiMocks.useV1LineupTodos.mockReturnValue({ data: { items: [] } });

    const { container } = render(<LineupTodoCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
