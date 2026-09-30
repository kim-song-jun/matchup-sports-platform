import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useV1AdminLeagueMatchList, useV1AdminTournaments } from '@/hooks/use-v1-api';
import { TournamentOpsPickerClient } from './tournament-ops-picker-client';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournaments: vi.fn(),
  useV1AdminLeagueMatchList: vi.fn(),
}));

const TOURNAMENT = {
  id: 't-1', title: '가을 풋살 대회', status: 'in_progress', venue: '잠실',
  scheduledAt: '2026-08-10T11:00:00.000Z', scheduledEndAt: null,
  registrationDeadlineAt: null, registrationCount: 8, entryFee: 0,
} as const;

function league(leagueId: string, title: string, state: 'draft' | 'active' | 'completed', startsOn: string) {
  return {
    leagueId, title, state, teamCount: 2, fixtureCount: 2, startsOn, endsOn: '2026-12-01T00:00:00.000Z',
    seriesId: null, seriesTitle: null, tierLabel: null, seasonNo: null,
  };
}

const LEAGUES = [
  league('l-active', '마포 주말 리그', 'active', '2026-09-30T00:00:00.000Z'),
  league('l-draft', '준비 중 리그', 'draft', '2026-11-01T00:00:00.000Z'),
  league('l-done', '지난 시즌 리그', 'completed', '2026-03-01T00:00:00.000Z'),
];

describe('TournamentOpsPickerClient (T6-3)', () => {
  beforeEach(() => {
    vi.mocked(useV1AdminTournaments).mockReturnValue({
      data: { items: [TOURNAMENT], pageInfo: undefined, summary: { total: 1, byStatus: {} } },
      isPending: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
    vi.mocked(useV1AdminLeagueMatchList).mockReturnValue({
      data: { items: LEAGUES }, isPending: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
  });

  // AdminDataTable은 데스크톱 테이블 + 모바일 카드 리스트를 동시에 DOM에 렌더한다
  // (CSS hidden/lg:hidden으로만 전환 — jsdom은 레이아웃을 계산하지 않는다). 그래서
  // 각 행 액션이 항상 2벌 존재한다 — 다른 T6 태스크 테스트와 동일한 convention.
  function linkTargets(name: RegExp): string[] {
    return screen.queryAllByRole('link', { name }).map((link) => link.getAttribute('href') ?? '');
  }

  it('행 액션이 admin CRUD 상세를 건너뛰고 곧장 ops 운영 보드로 연결된다', () => {
    render(<TournamentOpsPickerClient />);
    const targets = linkTargets(/가을 풋살 대회 운영 콘솔 열기/);
    expect(targets.length).toBeGreaterThan(0);
    for (const href of targets) expect(href).toBe('/admin/live/t-1/operations');
  });

  it('기본 상태 필터는 진행 중(in_progress)이다', () => {
    render(<TournamentOpsPickerClient />);
    expect(vi.mocked(useV1AdminTournaments)).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('진행 중 리그가 대회와 같은 목록에 나오고, 운영 콘솔 링크는 리그 id 를 쓴다', () => {
    render(<TournamentOpsPickerClient />);

    const targets = linkTargets(/마포 주말 리그 운영 콘솔 열기/);
    expect(targets.length).toBeGreaterThan(0);
    for (const href of targets) expect(href).toBe('/admin/live/l-active/operations');
  });

  it('진행 중 필터에서는 초안·완료 리그를 걸러낸다 (대조군: 같은 응답에 셋이 다 있다)', () => {
    render(<TournamentOpsPickerClient />);

    expect(linkTargets(/준비 중 리그 운영 콘솔 열기/)).toEqual([]);
    expect(linkTargets(/지난 시즌 리그 운영 콘솔 열기/)).toEqual([]);
  });

  it('행마다 종류 칩(대회/리그)이 붙는다', () => {
    render(<TournamentOpsPickerClient />);

    const table = screen.getAllByRole('table')[0];
    const leagueRow = within(table).getByText('마포 주말 리그').closest('tr') as HTMLElement;
    const tournamentRow = within(table).getByText('가을 풋살 대회').closest('tr') as HTMLElement;
    expect(within(leagueRow).getByText('리그')).toBeInTheDocument();
    expect(within(tournamentRow).getByText('대회')).toBeInTheDocument();
    expect(within(leagueRow).queryByText('대회')).toBeNull();
  });

  it('전체 필터에서는 모든 상태의 리그가 나온다', () => {
    render(<TournamentOpsPickerClient />);
    fireEvent.click(screen.getByRole('button', { name: '전체' }));

    expect(linkTargets(/준비 중 리그 운영 콘솔 열기/).length).toBeGreaterThan(0);
    expect(linkTargets(/지난 시즌 리그 운영 콘솔 열기/).length).toBeGreaterThan(0);
  });

  it('접수 중 필터에서는 리그가 나오지 않는다 (리그에는 신청 단계가 없다)', () => {
    render(<TournamentOpsPickerClient />);
    fireEvent.click(screen.getByRole('button', { name: '접수 중' }));

    expect(linkTargets(/리그 운영 콘솔 열기/)).toEqual([]);
  });

  it('일정이 가까운 순서(최근 시작이 위)로 섞어 보여준다', () => {
    render(<TournamentOpsPickerClient />);
    const table = screen.getAllByRole('table')[0];
    const titles = within(table).getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(titles[0]).toContain('마포 주말 리그');
    expect(titles[1]).toContain('가을 풋살 대회');
  });

  it('리그 목록만 실패해도 조용히 빼지 않고 오류를 보여준다', () => {
    vi.mocked(useV1AdminLeagueMatchList).mockReturnValue({
      data: undefined, isPending: false, isError: true, error: new Error('boom'), refetch: vi.fn(),
    } as never);
    render(<TournamentOpsPickerClient />);

    // 리그만 빠진 반쪽 목록을 정상처럼 보여주지 않고 오류 상태 + 재시도를 내놓는다.
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
    expect(linkTargets(/운영 콘솔 열기/)).toEqual([]);
  });
});
