import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1CreateLeagueMatch,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Teams,
} from '@/hooks/use-v1-api';
import AdminLeagueMatchNewPage from './page';

const { pushMock, savePeriodsMock, v1GetMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  savePeriodsMock: vi.fn(),
  v1GetMock: vi.fn(),
}));

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Get: v1GetMock,
}));

vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useSaveTournamentPeriodSettings: () => ({ mutateAsync: savePeriodsMock, isPending: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/league-matches/new',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1CreateLeagueMatch: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1Teams: vi.fn(),
  // Sport default periods (futsal 20/20) are what the form prefills.
  useV1LineupSizeOptions: vi.fn(() => ({
    data: {
      sportId: 'sport-futsal',
      supported: true,
      options: [],
      defaultMaxPlayers: null,
      substitutionModes: [],
      defaultSubstitutionMode: null,
      defaultMaxSubstitutions: null,
      defaultPeriods: [
        { label: '전반', durationMinutes: 20 },
        { label: '후반', durationMinutes: 20 },
      ],
    },
  })),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1CreateLeagueMatchMock = vi.mocked(useV1CreateLeagueMatch, { partial: true });
const useV1MasterRegionsMock = vi.mocked(useV1MasterRegions, { partial: true });
const useV1MasterSportsMock = vi.mocked(useV1MasterSports, { partial: true });
const useV1TeamsMock = vi.mocked(useV1Teams, { partial: true });

function renderPage() {
  return render(
    <Providers>
      <AdminLeagueMatchNewPage />
    </Providers>,
  );
}

describe('AdminLeagueMatchNewPage', () => {
  it('제목·종목·지역·기간·팀 2개를 입력하고 제출하면 리그 생성 mutation을 호출한다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft' });
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({
      data: [{
        id: 'region-seoul', name: '서울특별시', parentId: null, level: 1,
        children: [{ id: 'region-1', name: '중구', parentId: 'region-seoul', level: 2 }],
      }],
    } as never);
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
      // 리그는 팀 전원이 명단에 오르는 게 기본이라 팀 명단 인원은 '제한 없음'으로 시작한다.
      minPlayers: 1,
      maxPlayers: null,
    }));
  });

  it('팀 명단 인원을 직접 정하고 총 경기 수를 넣으면 함께 보낸다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', title: 't', state: 'draft' });
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    await fillLeagueForm();

    expect(screen.getByText('2팀이 한 번씩 만나면 1경기, 두 번씩이면 2경기예요. 대진을 만들 때 이 수만큼 만들고, 나중에 경기를 더 추가할 수 있어요. 이 수만큼 결과가 확정되면 리그가 자동으로 끝나요.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('제한 없음'));
    fireEvent.change(screen.getByLabelText('최소 (명)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('최대 (명)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('총 경기 수 (선택)'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ minPlayers: 5, maxPlayers: 15, plannedFixtureCount: 6 })));
  });

  it('최소 인원이 최대보다 많으면 만들 수 없고 이유를 알려준다', async () => {
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    await fillLeagueForm();

    fireEvent.click(screen.getByLabelText('제한 없음'));
    fireEvent.change(screen.getByLabelText('최소 (명)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('최대 (명)'), { target: { value: '8' } });

    expect(screen.getByRole('button', { name: '리그 만들기' })).toBeDisabled();
    expect(screen.getByText('최소 인원이 최대 인원보다 많아요.')).toBeInTheDocument();
  });

  it('종목을 먼저 고르지 않아도 팀을 검색·선택할 수 있고, 첫 팀을 고르면 그 팀의 종목으로 종목 select가 자동 채워지고 잠긴다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({
      data: [{
        id: 'region-seoul', name: '서울특별시', parentId: null, level: 1,
        children: [{ id: 'region-1', name: '중구', parentId: 'region-seoul', level: 2 }],
      }],
    } as never);
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
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', name: '풋살', levels: [] }, { id: 'sport-soccer', name: '축구', levels: [] }],
    } as never);
    useV1MasterRegionsMock.mockReturnValue({
      data: [{
        id: 'region-seoul', name: '서울특별시', parentId: null, level: 1,
        children: [{ id: 'region-1', name: '중구', parentId: 'region-seoul', level: 2 }],
      }],
    } as never);
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

  // 이 안내는 원래 4개짜리 문자열을 손으로 적어 둔 것이라 서버가 5번째 기준을 추가한
  // 뒤에도 그대로였다. 지금은 공용 라벨 모듈에서 만들어 쓴다(정본 §5).
  it('순위 규칙 안내가 서버의 다섯 기준을 모두 담고 고정값이라는 단서를 유지한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [] } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [] } as never);
    useV1TeamsMock.mockReturnValue({ data: { items: [], nextCursor: null }, isFetching: false } as never);

    renderPage();

    const notice = await screen.findByText(/^순위 규칙:/);
    expect(notice.textContent).toBe('순위 규칙: 승점 → 골득실 → 다득점 → 승자승 → 최소 실점 (고정값 — 리그별 변경 미지원)');
  });

  it('시작일·종료일 입력은 연도를 4자리로 제한한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [] } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [] } as never);
    useV1TeamsMock.mockReturnValue({ data: { items: [], nextCursor: null }, isFetching: false } as never);

    renderPage();

    expect(await screen.findByLabelText('시작일')).toHaveAttribute('max', '9999-12-31');
    expect(screen.getByLabelText('종료일')).toHaveAttribute('max', '9999-12-31');
  });

  async function fillLeagueForm() {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({
      data: [{
        id: 'region-seoul', name: '서울특별시', parentId: null, level: 1,
        children: [{ id: 'region-1', name: '중구', parentId: 'region-seoul', level: 2 }],
      }],
    } as never);
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
    for (const name of ['팀A', '팀B']) {
      const picker = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
      fireEvent.focus(picker);
      fireEvent.change(picker, { target: { value: name } });
      fireEvent.click(await screen.findByText(name));
    }
  }

  it('종료일이 시작일보다 빠르면 종료일 아래에 안내를 보이고 만들기 버튼을 잠근다', async () => {
    const mutateAsync = vi.fn();
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    await fillLeagueForm();

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-12' } });

    const endsOn = screen.getByLabelText('종료일');
    expect(endsOn).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('종료일은 시작일보다 빠를 수 없어요.');
    expect(endsOn).toHaveAccessibleDescription(/종료일은 시작일보다 빠를 수 없어요/);
    const submit = screen.getByRole('button', { name: '리그 만들기' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('종료일을 바로잡아 주세요.');
    fireEvent.click(submit);
    expect(mutateAsync).not.toHaveBeenCalled();

    // 종료일을 바로잡으면 안내가 사라지고 다시 만들 수 있다.
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-25' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '리그 만들기' })).toBeEnabled();
  });

  it('시작일과 종료일이 같은 날이면 오류 없이 만들 수 있다', async () => {
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    await fillLeagueForm();

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-20' } });

    expect(screen.getByLabelText('종료일')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '리그 만들기' })).toBeEnabled();
  });

  it('경기 시간을 종목 기본값(20·20)으로 미리 채우고, 고치지 않으면 피리어드를 따로 저장하지 않는다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset();
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ leagueId: 'league-1', title: 't', state: 'draft' }), isPending: false } as never);
    await fillLeagueForm();

    expect(screen.getByLabelText('전반 (분)')).toHaveValue(20);
    expect(screen.getByLabelText('후반 (분)')).toHaveValue(20);
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1'));
    expect(savePeriodsMock).not.toHaveBeenCalled();
  });

  it('경기 시간을 25분으로 고치면 리그를 만든 직후 그 값으로 피리어드 설정을 저장한다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset().mockResolvedValue({});
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: 'v-created', periods: [], legacyPeriodCount: null });
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ leagueId: 'league-1', title: 't', state: 'draft' }), isPending: false } as never);
    await fillLeagueForm();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('후반 (분)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(savePeriodsMock).toHaveBeenCalledWith({
      tournamentId: 'league-1',
      expectedVersion: 'v-created',
      periods: [{ durationMinutes: 25 }, { durationMinutes: 25 }],
    }));
    expect(v1GetMock).toHaveBeenCalledWith('/admin/tournaments/league-1/periods');
    expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1');
  });

  it('피리어드 저장이 실패하면 화면에 남아 실패와 상세 링크를 보여 주고 다시 만들지 못하게 잠근다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset().mockRejectedValue(new Error('boom'));
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: 'v-created', periods: [], legacyPeriodCount: null });
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ leagueId: 'league-1', title: 't', state: 'draft' }), isPending: false } as never);
    await fillLeagueForm();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/경기 시간을 저장하지 못했어요|boom/);
    expect(within(alert).getByRole('link', { name: '리그 상세로 이동' })).toHaveAttribute('href', '/admin/league-matches/league-1');
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '리그 만들기' })).toBeDisabled();
  });
  it('피리어드 저장이 진행 중인 동안 버튼이 잠겨 두 번째 클릭이 리그를 다시 만들지 않는다', async () => {
    pushMock.mockClear();
    let releaseSave: () => void = () => {};
    savePeriodsMock.mockReset().mockReturnValue(new Promise<void>((resolve) => { releaseSave = resolve; }));
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: 'v-created', periods: [], legacyPeriodCount: null });
    const createMock = vi.fn().mockResolvedValue({ leagueId: 'league-1', title: 't', state: 'draft' });
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: createMock, isPending: false } as never);
    await fillLeagueForm();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    const button = screen.getByRole('button', { name: '리그 만들기' });
    fireEvent.click(button);

    await waitFor(() => expect(savePeriodsMock).toHaveBeenCalled());
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(createMock).toHaveBeenCalledTimes(1);

    releaseSave();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1'));
  });

  it('피리어드 설정 버전을 못 읽으면 영어 내부 메시지 대신 해요체 안내를 보여준다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset();
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: null, periods: [], legacyPeriodCount: null });
    useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ leagueId: 'league-1', title: 't', state: 'draft' }), isPending: false } as never);
    await fillLeagueForm();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    expect(await screen.findByText(/리그는 만들었지만 경기 시간을 저장하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/missing period settings version/)).not.toBeInTheDocument();
    expect(savePeriodsMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
