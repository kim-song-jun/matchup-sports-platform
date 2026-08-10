import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1CreateTeamMatchSeries,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Teams,
} from '@/hooks/use-v1-api';
import AdminTeamMatchSeriesNewPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/team-match-series/new',
}));

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1CreateTeamMatchSeries: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1Teams: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1CreateTeamMatchSeriesMock = vi.mocked(useV1CreateTeamMatchSeries, { partial: true });
const useV1MasterRegionsMock = vi.mocked(useV1MasterRegions, { partial: true });
const useV1MasterSportsMock = vi.mocked(useV1MasterSports, { partial: true });
const useV1TeamsMock = vi.mocked(useV1Teams, { partial: true });

function renderPage() {
  return render(
    <Providers>
      <AdminTeamMatchSeriesNewPage />
    </Providers>,
  );
}

describe('AdminTeamMatchSeriesNewPage', () => {
  it('제목·종목·지역·기간·팀 2개를 입력하고 제출하면 시리즈 생성 mutation을 호출한다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ seriesId: 'series-1', title: '가을 풋살 리그', state: 'draft' });
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateTeamMatchSeriesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [{ id: 'region-1', name: '서울', parentId: null }] } as never);
    useV1TeamsMock.mockReturnValue({
      data: { items: [
        { id: 'team-a', name: '팀A', sportName: '풋살', sport: { sportId: 'sport-futsal', name: '풋살' }, regionName: '서울', memberCount: 8, trustState: 'none', joinPolicy: 'approval_required' },
        { id: 'team-b', name: '팀B', sportName: '풋살', sport: { sportId: 'sport-futsal', name: '풋살' }, regionName: '서울', memberCount: 9, trustState: 'none', joinPolicy: 'approval_required' },
      ], nextCursor: null },
      isFetching: false,
    } as never);

    renderPage();

    fireEvent.change(screen.getByLabelText('리그 이름'), { target: { value: '가을 풋살 리그' } });
    fireEvent.change(screen.getByLabelText('종목'), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-1' } });
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-20' } });

    const teamPicker = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
    fireEvent.focus(teamPicker);
    fireEvent.change(teamPicker, { target: { value: '팀A' } });
    fireEvent.click(await screen.findByText('팀A'));
    const teamPickerAgain = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
    fireEvent.focus(teamPickerAgain);
    fireEvent.change(teamPickerAgain, { target: { value: '팀B' } });
    fireEvent.click(await screen.findByText('팀B'));

    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      title: '가을 풋살 리그',
      sportId: 'sport-futsal',
      regionId: 'region-1',
      startsOn: new Date('2026-09-01T00:00:00').toISOString(),
      endsOn: new Date('2026-10-20T23:59:59.999').toISOString(),
      teamIds: ['team-a', 'team-b'],
    }));
  });

  it('종목을 먼저 고르지 않아도 팀을 검색·선택할 수 있고, 첫 팀을 고르면 그 팀의 종목으로 종목 select가 자동 채워지고 잠긴다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateTeamMatchSeriesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [{ id: 'region-1', name: '서울', parentId: null }] } as never);
    useV1TeamsMock.mockReturnValue({
      data: { items: [
        { id: 'team-a', name: '팀A', sportName: '풋살', sport: { sportId: 'sport-futsal', name: '풋살' }, regionName: '서울', memberCount: 8, trustState: 'none', joinPolicy: 'approval_required' },
      ], nextCursor: null },
      isFetching: false,
    } as never);

    renderPage();

    // 종목 select를 건드리지 않은 채로 팀 검색창은 처음부터 활성화돼 있어야 한다.
    const sportSelect = screen.getByLabelText('종목') as HTMLSelectElement;
    expect(sportSelect).not.toBeDisabled();
    const teamPicker = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
    expect(teamPicker).not.toBeDisabled();

    fireEvent.focus(teamPicker);
    fireEvent.change(teamPicker, { target: { value: '팀A' } });
    fireEvent.click(await screen.findByText('팀A'));

    await waitFor(() => expect(sportSelect.value).toBe('sport-futsal'));
    expect(sportSelect).toBeDisabled();
    expect(screen.getByText('자동 설정됨 · 변경하려면 선택한 팀을 모두 지우세요')).toBeInTheDocument();
  });

  it('종목이 잠긴 뒤 다른 종목 팀이 검색되면 숨기지 않고 회색으로 표시하며 이유를 보여주고, 클릭해도 선택되지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateTeamMatchSeriesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', name: '풋살', levels: [] }, { id: 'sport-soccer', name: '축구', levels: [] }],
    } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [{ id: 'region-1', name: '서울', parentId: null }] } as never);
    useV1TeamsMock.mockReturnValue({
      data: { items: [
        { id: 'team-a', name: '팀A', sportName: '풋살', sport: { sportId: 'sport-futsal', name: '풋살' }, regionName: '서울', memberCount: 8, trustState: 'none', joinPolicy: 'approval_required' },
        { id: 'team-soccer', name: '축구팀', sportName: '축구', sport: { sportId: 'sport-soccer', name: '축구' }, regionName: '서울', memberCount: 8, trustState: 'none', joinPolicy: 'approval_required' },
      ], nextCursor: null },
      isFetching: false,
    } as never);

    renderPage();

    const teamPicker = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
    fireEvent.focus(teamPicker);
    fireEvent.change(teamPicker, { target: { value: '팀A' } });
    fireEvent.click(await screen.findByText('팀A'));

    const teamPickerAgain = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
    fireEvent.focus(teamPickerAgain);
    fireEvent.change(teamPickerAgain, { target: { value: '축구' } });

    const crossSportOption = await screen.findByText('축구팀');
    expect(screen.getByText('이 리그는 풋살 종목이라 축구 팀은 선택할 수 없어요')).toBeInTheDocument();
    // disabled 항목이라도 description(종목·지역)은 계속 보여야 한다 — disabledReason은
    // "왜 안 되는지" 추가 정보이지 description을 대체하는 게 아니다.
    expect(screen.getByText('축구 · 서울')).toBeInTheDocument();
    fireEvent.click(crossSportOption);

    // 선택 칩 목록에 축구팀이 추가되지 않아야 한다(클릭이 무시됨).
    expect(screen.queryByLabelText('축구팀 제거')).not.toBeInTheDocument();
  });
});
