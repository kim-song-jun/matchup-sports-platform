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

const { hooks } = vi.hoisted(() => ({ hooks: { rows: [] as V1AdminTeamMatchRow[], filters: {} as Record<string, unknown> } }));

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: routerPush }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTeamMatches: (filters: Record<string, unknown>) => {
    hooks.filters = filters;
    return ({
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
  });
  },
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1ChangeTeamMatchStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useV1MasterRegions: () => ({
    data: [
      { id: 'region-seoul', name: '서울', parentId: null },
      { id: 'region-seongdong', name: '성동구', parentId: 'region-seoul' },
      { id: 'region-busan', name: '부산', parentId: null },
    ],
  }),
}));

const BASE: V1AdminTeamMatchRow = {
  teamMatchId: 'tm-1',
  title: '주말 정기전',
  hostTeamId: 'team-1',
  hostTeamName: '성수 FC',
  approvedApplicantTeamId: null,
  approvedApplicantTeamName: null,
  league: null,
  sportName: '풋살',
  region: { regionId: 'region-seongdong', name: '성동구' },
  platformManaged: false,
  pendingApplicationCount: 0,
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

  it('플랫폼 모집에 신청 한 건만 있어도 신청 관리 버튼을 바로 보여준다', () => {
    renderWith([{ ...BASE, platformManaged: true, hostTeamId: null, hostTeamName: null, pendingApplicationCount: 1 }]);

    const links = screen.getAllByRole('link', { name: '주말 정기전 대기 신청 1건 관리' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin/team-matches/tm-1');
    expect(screen.getAllByText('신청 1건 관리').length).toBeGreaterThan(0);
  });

  it('플랫폼 모집에서 한 팀만 승인된 단계에도 승인 팀명을 보여준다', () => {
    renderWith([
      {
        ...BASE,
        platformManaged: true,
        hostTeamId: null,
        hostTeamName: null,
        approvedApplicantTeamId: 'team-approved',
        approvedApplicantTeamName: '첫 승인 팀',
      },
    ]);

    expect(screen.getAllByText('첫 승인 팀').length).toBeGreaterThan(0);
  });
});


describe('competition moderation boundary', () => {
  it('대회 소속과 관리 경로를 보여주고 일반 상태 변경은 숨긴다', () => {
    hooks.rows = [{ ...BASE, league: null, tournament: { tournamentId: 'cup-1', title: '가을 컵' } }];
    render(<AdminTeamMatchesPage />);
    expect(screen.getAllByRole('link', { name: '대회 가을 컵 상세 보기' })[0]).toHaveAttribute('href', '/admin/tournaments/cup-1');
    expect(screen.getAllByRole('link', { name: '대회 관리' })[0]).toHaveAttribute('href', '/admin/tournaments/cup-1');
    expect(screen.getAllByText(/가을 컵 ·/)[0]).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /상태 변경/ })).toHaveLength(0);
  });
  it('리그에 대회 관계도 있을 때 리그로 분류한다', () => {
    hooks.rows = [{ ...BASE, league: { leagueId: 'league-1', title: '가을 리그' }, tournament: { tournamentId: 'league-1', title: '가을 리그' } }];
    render(<AdminTeamMatchesPage />);
    expect(screen.getAllByRole('link', { name: '리그 관리' })[0]).toHaveAttribute('href', '/admin/league-matches/league-1');
    expect(screen.queryByRole('link', { name: '대회 관리' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /상태 변경/ })).toHaveLength(0);
  });
  it('친선 경기에서는 일반 상태 변경을 유지한다', () => {
    hooks.rows = [{ ...BASE, league: null, tournament: null }];
    render(<AdminTeamMatchesPage />);
    expect(screen.getAllByRole('button', { name: /상태 변경/ }).length).toBeGreaterThan(0);
  });
});

it('경기 유형을 바꾸면 API 필터와 첫 페이지에 반영하고, 상세 왕복 뒤 복원되도록 URL에도 남긴다', async () => {
  hooks.rows = [];
  window.history.replaceState(null, '', '/admin/team-matches?q=QA0930');
  const user = userEvent.setup();
  render(<AdminTeamMatchesPage />);
  await user.selectOptions(screen.getByRole('combobox', { name: '경기 유형' }), 'tournament');
  expect(hooks.filters).toMatchObject({ kind: 'tournament', page: 1 });
  expect(window.location.search).toBe('?q=QA0930&kind=tournament');
  await user.selectOptions(screen.getByRole('combobox', { name: '경기 유형' }), 'league');
  expect(hooks.filters).toMatchObject({ kind: 'league', page: 1 });
  await user.selectOptions(screen.getByRole('combobox', { name: '경기 유형' }), '');
  expect(hooks.filters).not.toHaveProperty('kind');
  expect(window.location.search).toBe('?q=QA0930');
  window.history.replaceState(null, '', '/');
});

it('지역·정렬을 고르면 API 필터와 URL에 반영하고, 기본 정렬과 전체 지역은 파라미터를 지운다', async () => {
  hooks.rows = [];
  window.history.replaceState(null, '', '/admin/team-matches?q=QA');
  const user = userEvent.setup();
  render(<AdminTeamMatchesPage />);
  expect(hooks.filters).not.toHaveProperty('sort');
  expect(hooks.filters).not.toHaveProperty('regionId');

  await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'start_asc');
  expect(hooks.filters).toMatchObject({ sort: 'start_asc', page: 1 });
  await user.selectOptions(screen.getByRole('combobox', { name: '지역' }), 'region-seongdong');
  expect(hooks.filters).toMatchObject({ sort: 'start_asc', regionId: 'region-seongdong', page: 1 });
  expect(window.location.search).toBe('?q=QA&sort=start_asc&regionId=region-seongdong');
  expect(screen.getByText('지역 · 서울 성동구')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '지역 필터 해제' }));
  await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'created_desc');
  expect(hooks.filters).not.toHaveProperty('regionId');
  expect(hooks.filters).not.toHaveProperty('sort');
  expect(window.location.search).toBe('?q=QA');
  window.history.replaceState(null, '', '/');
});

it('URL 의 정렬·지역으로 시작하고 행에 지역을 보여준다', () => {
  hooks.rows = [BASE];
  window.history.replaceState(null, '', '/admin/team-matches?sort=start_desc&regionId=region-busan');
  render(<AdminTeamMatchesPage />);
  expect(hooks.filters).toMatchObject({ sort: 'start_desc', regionId: 'region-busan' });
  expect(screen.getAllByText(/성동구 ·/).length).toBeGreaterThan(0);
  window.history.replaceState(null, '', '/');
});

it('완료 경기의 일반 상태 모달도 실제로 선택 가능한 상태로 시작한다', async () => {
  hooks.rows = [{ ...BASE, league: null, tournament: null, status: 'completed' }];
  const user = userEvent.setup();
  render(<AdminTeamMatchesPage />);
  await user.click(screen.getAllByRole('button', { name: /상태 변경/ })[0]);
  const select = await screen.findByRole('combobox', { name: '변경할 상태' });
  expect(select).toHaveValue('recruiting');
  expect(screen.queryByRole('option', { name: '완료' })).not.toBeInTheDocument();
});
