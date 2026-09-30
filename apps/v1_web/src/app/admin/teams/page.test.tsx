import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminTeamsPage from './page';

const hooks = vi.hoisted(() => ({
  teams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTeams: (filters: unknown) => hooks.teams(filters),
  useV1ChangeTeamStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useV1AdminMe: () => ({ data: { capabilities: [] } }),
}));

describe('AdminTeamsPage — 주소로 들어온 검색어', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hooks.teams.mockReturnValue({
      data: { items: [], pageInfo: { page: 1, totalPages: 1, total: 0, limit: 20 }, summary: { total: 0, byStatus: {} } },
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('?q= 를 검색창에 채우고 debounce 뒤 목록 조회 필터로 보낸다', () => {
    window.history.replaceState(null, '', '/admin/teams?q=%EB%A7%88%ED%8F%AC');

    render(<AdminTeamsPage />);
    expect(screen.getByRole('searchbox', { name: '팀명 검색' })).toHaveValue('마포');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(hooks.teams).toHaveBeenLastCalledWith(expect.objectContaining({ q: '마포' }));
  });

  it('?q= 가 없으면 검색어 없이 조회한다', () => {
    window.history.replaceState(null, '', '/admin/teams');

    render(<AdminTeamsPage />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole('searchbox', { name: '팀명 검색' })).toHaveValue('');
    expect(hooks.teams).toHaveBeenLastCalledWith(expect.not.objectContaining({ q: expect.anything() }));
  });
});
