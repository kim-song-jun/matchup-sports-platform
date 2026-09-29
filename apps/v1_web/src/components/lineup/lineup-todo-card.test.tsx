import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LineupTodoCard } from './lineup-todo-card';
import type { V1LineupTodo } from '@/hooks/use-v1-api';

/**
 * 이 카드는 친선 팀매치의 미제출 참석명단만 받는다 — 대회·리그 경기는 명단이 참가 명단에서
 * 계산돼 서버가 싣지 않는다(Task 179 R1). 카드는 받은 할 일을 그 참석명단 화면으로 잇는다.
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
    title: '팀 매치',
    opponentName: '망원 FC',
    scheduledAt: '2026-09-05T10:00:00.000Z',
    state: 'MISSING',
    deepLink: '/team-matches/match-1/lineup',
    ...overrides,
  };
}

describe('LineupTodoCard', () => {
  it('친선 할 일마다 팀·상대와 상태를 보여 주고 그 경기 참석명단으로 잇는다', () => {
    apiMocks.useV1LineupTodos.mockReturnValue({
      data: {
        items: [
          todo({ gameId: 'game-1', deepLink: '/team-matches/match-1/lineup' }),
          todo({
            gameId: 'game-2',
            teamName: '망원 FC',
            opponentName: '합정 FC',
            state: 'DRAFT',
            deepLink: '/team-matches/match-2/lineup',
          }),
        ],
      },
    });

    render(<LineupTodoCard />);

    expect(screen.getByRole('heading', { name: '참석명단을 기다리는 경기' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/team-matches/match-1/lineup',
      '/team-matches/match-2/lineup',
    ]);
    expect(links[0]).toHaveTextContent('성수 FC · vs 망원 FC');
    expect(links[0]).toHaveTextContent('미작성');
    expect(links[1]).toHaveTextContent('망원 FC · vs 합정 FC');
    expect(links[1]).toHaveTextContent('제출 전');
  });

  it('할 일이 없으면 아무것도 그리지 않는다', () => {
    apiMocks.useV1LineupTodos.mockReturnValue({ data: { items: [] } });

    const { container } = render(<LineupTodoCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
