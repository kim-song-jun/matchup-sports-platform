import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminTournamentsPage from './page';

let canWrite = true;

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: canWrite ? ['status:write'] : [] } }),
  useV1MockSeedAvailability: () => ({ data: { enabled: false } }),
  useV1CreateMockTournament: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UpdateTournamentVisibility: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1AdminTournaments: () => ({
    data: { items: [], pageInfo: { page: 1, limit: 20, totalPages: 1, total: 0 }, summary: { total: 0, byStatus: {} } },
    isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  canWrite = true;
  window.history.replaceState(null, '', '/admin/tournaments');
});
afterEach(() => cleanup());

describe('대회 목록의 만들기 입구', () => {
  it('쓰기 권한이 있으면 대회 만들기와 정규 리그 만들기가 각자의 화면으로 가고, 단계형 입구는 없다', () => {
    render(<AdminTournamentsPage />);
    expect(screen.getByRole('link', { name: '새 대회 만들기' })).toHaveAttribute('href', '/admin/tournaments/new');
    expect(screen.getByRole('link', { name: '정규 리그 만들기' })).toHaveAttribute('href', '/admin/league-matches/new');
    expect(screen.queryByRole('link', { name: /단계형 대회 만들기/ })).toBeNull();
  });

  it('쓰기 권한이 없으면 만들기 입구가 하나도 없다', () => {
    canWrite = false;
    render(<AdminTournamentsPage />);
    expect(screen.queryByRole('link', { name: '새 대회 만들기' })).toBeNull();
    expect(screen.queryByRole('link', { name: '정규 리그 만들기' })).toBeNull();
  });
});
