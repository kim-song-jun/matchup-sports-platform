import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyMatchesPageClient } from './my-matches-client';
const mock = vi.hoisted(() => ({
  personalQuery: vi.fn(),
  teamQuery: vi.fn(),
  personalFetchNextPage: vi.fn(),
  teamFetchNextPage: vi.fn(),
  search: '',
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyMatchesInfinite: mock.personalQuery,
  useV1MyTeamMatchesInfinite: mock.teamQuery,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/matches/joined',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mock.search),
}));

function emptyQuery() {
  return {
    data: { pages: [{ items: [] }] },
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    isLoading: false,
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  };
}

describe('내 개인·팀 매치 이력', () => {
  beforeEach(() => {
    mock.search = '';
    mock.personalFetchNextPage.mockReset();
    mock.teamFetchNextPage.mockReset();
    mock.personalQuery.mockReturnValue(emptyQuery());
    mock.teamQuery.mockReturnValue(emptyQuery());
  });

  it('더 보기로 다음 페이지를 요청하고 추가 기록을 상세 링크로 보여준다', () => {
    const item = { id: 'm1', title: '첫 매치', startsAt: '2026-09-18T01:00:00Z', status: 'completed', viewerState: 'participant' };
    mock.personalQuery.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items: [item] }] }, hasNextPage: true, fetchNextPage: mock.personalFetchNextPage });
    const { rerender } = render(<MyMatchesPageClient mode="joined" />);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(mock.personalFetchNextPage).toHaveBeenCalledOnce();
    mock.personalQuery.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items: [item] }, { items: [{ ...item, id: 'm51', title: '51번째 매치' }] }] }, hasNextPage: false });
    rerender(<MyMatchesPageClient mode="joined" />);
    expect(screen.getByText('51번째 매치')).toBeInTheDocument();
    // 뒤로가기가 이 목록으로 돌아오도록 `?from=`을 함께 실어 보낸다(MD-QA #15 후속).
    expect(screen.getAllByRole('link', { name: '상세' }).at(-1)).toHaveAttribute('href', '/matches/m51?from=%2Fmy%2Fmatches%2Fjoined');
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  // 상세 href 가 `?from=` 을 달게 되면서 `${href}/applications` 가 쿼리 뒤에 경로를 붙여 깨졌다.
  it('만든 매치의 참가 관리 링크는 쿼리 없는 관리 경로로 간다', () => {
    const item = { id: 'm1', title: '만든 매치', startsAt: '2026-09-18T01:00:00Z', status: 'recruiting', viewerState: 'host' };
    mock.personalQuery.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items: [item] }] } });
    render(<MyMatchesPageClient mode="created" />);
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute('href', '/matches/m1?from=%2Fmy%2Fmatches%2Fcreated');
    expect(screen.getByRole('link', { name: '참가 관리' })).toHaveAttribute('href', '/matches/m1/applications?from=%2Fmy%2Fmatches%2Fcreated');
  });

  it('시작 후 개인매치는 모집 중이 아니라 진행중·종료 확인 상태로 보인다', () => {
    const items = [
      { id: 'm1', title: '모집 매치', startsAt: '2026-10-02T11:00:00Z', status: 'recruiting', displayState: 'recruiting', viewerState: 'host' },
      { id: 'm2', title: '진행 매치', startsAt: '2026-09-29T07:15:00Z', status: 'recruiting', displayState: 'in_progress', viewerState: 'host' },
      // 목록 응답 모양 그대로 — canComplete 는 상세에만 있다.
      { id: 'm3', title: '끝난 매치', startsAt: '2026-09-02T11:00:00Z', status: 'expired', displayState: 'completion_pending', viewerState: 'host' },
    ];
    mock.personalQuery.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items }] } });
    render(<MyMatchesPageClient mode="created" />);
    const badge = (title: string) => screen.getByText(title).closest('.tm-my-card-head')?.querySelector('.tm-my-card-status')?.textContent;
    expect(badge('모집 매치')).toBe('모집 중');
    expect(badge('진행 매치')).toBe('진행중');
    expect(badge('끝난 매치')).toBe('종료 확인 필요');
    expect(screen.getByRole('link', { name: '참여 확인' })).toHaveAttribute('href', '/matches/m3/applications?tab=approved&from=%2Fmy%2Fmatches%2Fcreated');
  });

  it('참가자에게 종료 확인 대기 매치는 호스트 확인 중으로 보인다', () => {
    const item = { id: 'm4', title: '참가한 매치', startsAt: '2026-09-02T11:00:00Z', status: 'expired', displayState: 'completion_pending', viewerState: 'participant' };
    mock.personalQuery.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items: [item] }] } });
    render(<MyMatchesPageClient mode="joined" />);
    expect(screen.getByText('종료 확인 중')).toBeInTheDocument();
    expect(screen.getByText('호스트가 참여 여부를 확인하고 있어요.')).toBeInTheDocument();
  });

  it('승인되지 않은 신청자에게는 시작 후에도 승인 대기로 보인다', () => {
    const item = { id: 'm5', title: '신청만 한 매치', startsAt: '2026-09-29T07:15:00Z', status: 'expired', displayState: 'in_progress', viewerState: 'requested' };
    mock.personalQuery.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items: [item] }] } });
    render(<MyMatchesPageClient mode="joined" />);
    expect(screen.getByText('신청만 한 매치').closest('.tm-my-card-head')?.querySelector('.tm-my-card-status')?.textContent).toBe('승인 대기');
    expect(screen.queryByText('경기가 진행 중이에요.')).toBeNull();
  });

  it('전체 필터에서 개인매치와 우리 팀이 신청한 팀매치를 함께 보여준다', () => {
    mock.personalQuery.mockReturnValue({
      ...emptyQuery(),
      data: { pages: [{ items: [{ id: 'same-id', title: '개인 풋살', startsAt: '2026-10-02T10:00:00Z', status: 'approved', viewerState: 'approved' }] }] },
    });
    mock.teamQuery.mockReturnValue({
      ...emptyQuery(),
      data: { pages: [{ items: [{
        teamMatchId: 'same-id',
        title: '팀 대항전',
        sportName: '풋살',
        startsAt: '2026-10-01T10:00:00Z',
        status: 'matched',
        displayState: 'matched',
        relation: 'approved',
        teamId: 'team-a',
        teamName: '성수 FC',
        detailRoute: '/team-matches/same-id',
        manageRoute: null,
      }] }] },
    });

    render(<MyMatchesPageClient mode="joined" />);

    expect(screen.getByText('개인 풋살')).toBeInTheDocument();
    expect(screen.getByText('팀 대항전')).toBeInTheDocument();
    expect(screen.getByText('성수 FC · 우리 팀 확정')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 매치' })).toHaveAttribute('href', '/my/matches/joined?type=team');
    expect(screen.getAllByRole('link', { name: '상세' }).map((link) => link.getAttribute('href'))).toContain(
      '/team-matches/same-id?from=%2Fmy%2Fmatches%2Fjoined',
    );
  });

  it('팀 매치 필터는 개인 API를 비활성화하고 생성한 팀매치 관리 경로를 사용한다', () => {
    mock.search = 'type=team';
    mock.teamQuery.mockReturnValue({
      ...emptyQuery(),
      data: { pages: [{ items: [{
        teamMatchId: 'tm-1',
        title: '내가 만든 팀매치',
        sportName: '축구',
        startsAt: '2026-10-03T10:00:00Z',
        status: 'recruiting',
        relation: 'created_by_me',
        teamId: 'team-a',
        teamName: '성수 FC',
        detailRoute: '/team-matches/tm-1',
        manageRoute: '/team-matches/tm-1',
      }] }] },
    });

    render(<MyMatchesPageClient mode="created" />);

    expect(mock.personalQuery).toHaveBeenCalledWith('created', { enabled: false });
    expect(mock.teamQuery).toHaveBeenCalledWith('created', { enabled: true });
    expect(screen.getByRole('link', { name: '팀매치 관리' })).toHaveAttribute('href', '/team-matches/tm-1?from=%2Fmy%2Fmatches%2Fcreated%3Ftype%3Dteam');
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/team-matches/tm-1?from=%2Fmy%2Fmatches%2Fcreated%3Ftype%3Dteam',
    );
  });

  it('팀매치 조회만 실패하면 개인 목록을 유지하고 부분 실패를 알린다', () => {
    mock.personalQuery.mockReturnValue({
      ...emptyQuery(),
      data: { pages: [{ items: [{ id: 'm1', title: '개인 매치', startsAt: '2026-10-02T10:00:00Z', status: 'recruiting', viewerState: 'none' }] }] },
    });
    mock.teamQuery.mockReturnValue({ ...emptyQuery(), data: undefined, isError: true });

    render(<MyMatchesPageClient mode="joined" />);

    expect(screen.getByText('개인 매치', { selector: '.tm-text-body-lg' })).toBeInTheDocument();
    expect(screen.getByText(/팀 매치 목록을 불러오지 못했어요/)).toBeInTheDocument();
  });
});
