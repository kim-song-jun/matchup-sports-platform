/**
 * 리그는 팀매치와 별개 엔티티가 아니라 **팀매치를 묶는 컨테이너**다(`V1TeamMatch.leagueId`).
 * 서버는 목록 응답에 이미 `league` 를 실어 보내는데 프론트 타입에 선언이 없어 화면이 통째로
 * 버리고 있었다 — 운영자는 단발 경기와 리그전을 목록에서 구분할 수 없었다.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { V1AdminTeamMatchRow } from '@/types/api';
import AdminTeamMatchesPage from './page';

const { hooks } = vi.hoisted(() => ({ hooks: { rows: [] as V1AdminTeamMatchRow[] } }));

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: routerPush }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTeamMatches: () => ({
    data: {
      items: hooks.rows,
      pageInfo: { page: 1, limit: 20, total: hooks.rows.length, totalPages: 1 },
      summary: { total: hooks.rows.length, byStatus: {} },
    },
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1ChangeTeamMatchStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

const BASE: V1AdminTeamMatchRow = {
  teamMatchId: 'tm-1',
  title: '주말 정기전',
  hostTeamId: 'team-1',
  hostTeamName: '성수 FC',
  league: null,
  sportName: '풋살',
  startAt: '2026-09-01T11:00:00.000Z',
  status: 'recruiting',
  createdAt: '2026-08-01T00:00:00.000Z',
};

function renderWith(rows: V1AdminTeamMatchRow[]) {
  hooks.rows = rows;
  return render(<AdminTeamMatchesPage />);
}

describe('AdminTeamMatchesPage 리그 표시', () => {
  it('리그전은 리그 배지와 리그명이 함께 보이고 리그 상세로 이어진다', () => {
    renderWith([{ ...BASE, league: { leagueId: 'lg-7', title: '가을 리그' } }]);

    const links = screen.getAllByRole('link', { name: '정규 리그 가을 리그 상세 보기' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin/league-matches/lg-7');
    // 색만으로 구분하지 않는다 — '정규 리그' 글자와 리그명이 함께 나온다.
    expect(screen.getAllByText('정규 리그').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/가을 리그/).length).toBeGreaterThan(0);
  });

  it('단발 팀매치에는 리그 배지를 붙이지 않는다', () => {
    renderWith([BASE]);

    expect(screen.queryByRole('link', { name: /상세 보기/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('성수 FC').length).toBeGreaterThan(0);
  });

  it('행을 누르면 팀매치 상세로 간다', async () => {
    const user = userEvent.setup();
    renderWith([BASE]);

    // 상세 라우트가 생기기 전에는 행을 눌러도 아무 일이 없었다(⌘K 로만 도달).
    await user.click(screen.getAllByRole('button', { name: '주말 정기전 상세 보기' })[0]);
    expect(routerPush).toHaveBeenCalledWith('/admin/team-matches/tm-1');
  });
});
