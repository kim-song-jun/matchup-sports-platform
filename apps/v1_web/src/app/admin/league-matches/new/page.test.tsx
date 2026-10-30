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

const FUTSAL = { id: 'sport-futsal', name: '풋살', levels: [] };
const SOCCER = { id: 'sport-soccer', name: '축구', levels: [] };
const team = (id: string, name: string, sportId = 'sport-futsal', sportName = '풋살') => ({
  id, name, sportName, sport: { sportId, name: sportName }, regionName: '서울', memberCount: 8, trustState: 'none', joinPolicy: 'approval_required',
});

function mockData({ sports = [FUTSAL], teams = [team('team-a', '팀A'), team('team-b', '팀B')] } = {}) {
  useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
  useV1MasterSportsMock.mockReturnValue({ data: sports } as never);
  useV1MasterRegionsMock.mockReturnValue({
    data: [{
      id: 'region-seoul', name: '서울특별시', parentId: null, level: 1,
      children: [{ id: 'region-1', name: '중구', parentId: 'region-seoul', level: 2 }],
    }],
  } as never);
  useV1TeamsMock.mockReturnValue({ data: { items: teams, nextCursor: null }, isFetching: false } as never);
}

function mockCreate(result: Promise<unknown> | unknown = { leagueId: 'league-1', title: 't', state: 'draft' }) {
  const mutateAsync = vi.fn().mockResolvedValue(result);
  useV1CreateLeagueMatchMock.mockReturnValue({ mutateAsync, isPending: false } as never);
  return mutateAsync;
}

const next = () => fireEvent.click(screen.getByRole('button', { name: '다음' }));

function fillBasics() {
  fireEvent.change(screen.getByLabelText('리그 이름'), { target: { value: '가을 풋살 리그' } });
  fireEvent.change(screen.getByLabelText('종목'), { target: { value: 'sport-futsal' } });
  fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-1' } });
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-20' } });
}

async function pickTeams(names: string[]) {
  for (const name of names) {
    const picker = screen.getByLabelText('참가 팀 직접 추가 (선택)');
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: name } });
    fireEvent.click(await screen.findByText(name));
  }
}

/** 1단계를 채우고 2단계(참가팀·신청)에서 팀 두 개를 넣은 뒤 3단계(경기 설정)로 간다. */
async function toGameSettings() {
  renderPage();
  fillBasics();
  next();
  await pickTeams(['팀A', '팀B']);
  next();
}

describe('AdminLeagueMatchNewPage — 대회처럼 단계로 만든다', () => {
  it('기본 정보 → 팀 두 개 → 경기 설정 → 확인 순서로 진행하면 리그 생성 mutation을 호출한다', async () => {
    mockData();
    const mutateAsync = mockCreate({ leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft' });
    pushMock.mockClear();
    await toGameSettings();
    next();

    // 확인 단계는 입력한 내용을 그대로 되짚는다.
    expect(screen.getByRole('heading', { name: '확인' })).toBeInTheDocument();
    expect(screen.getByText('2팀 · 팀A, 팀B')).toBeInTheDocument();
    expect(screen.getByText('마감 없음 — 접수 마감하기로 닫아요')).toBeInTheDocument();
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
      maxTeams: null,
    }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1'));
  });

  // 2026-10-27: 팀을 넣지 않고 참가 신청으로만 모아도 된다.
  it('팀 없이 신청 마감·참가비·계좌만 정해서 만들 수 있다', async () => {
    mockData();
    const mutateAsync = mockCreate();
    renderPage();
    fillBasics();
    next();
    fireEvent.change(screen.getByLabelText('신청 마감 (선택, 한국 시간)'), { target: { value: '2099-11-05T23:00' } });
    fireEvent.change(screen.getByLabelText('팀당 참가비 (선택)'), { target: { value: '30,000' } });
    // 유료면 계좌 세 칸을 다 채워야 다음으로 간다.
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByText('유료 리그는 은행명, 계좌번호, 예금주를 모두 입력해 주세요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('은행명'), { target: { value: '국민은행' } });
    fireEvent.change(screen.getByLabelText('계좌번호'), { target: { value: '000-00-0000' } });
    fireEvent.change(screen.getByLabelText('예금주'), { target: { value: '팀밋' } });
    next();
    next();
    expect(screen.getByText('없음 — 참가 신청으로 모아요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      teamIds: [],
      registrationDeadlineAt: '2099-11-05T14:00:00.000Z',
      entryFee: 30000,
      bankName: '국민은행',
      bankAccount: '000-00-0000',
      bankHolder: '팀밋',
    })));
  });

  it('0원은 무료로 확정해 보내고 계좌를 묻지 않는다', async () => {
    mockData();
    const mutateAsync = mockCreate();
    renderPage();
    fillBasics();
    next();
    fireEvent.change(screen.getByLabelText('팀당 참가비 (선택)'), { target: { value: '0' } });
    expect(screen.queryByLabelText('은행명')).not.toBeInTheDocument();
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload).toMatchObject({ entryFee: 0 });
    expect(payload).not.toHaveProperty('bankName');
    expect(payload).not.toHaveProperty('registrationDeadlineAt');
  });

  it('지난 신청 마감으로는 다음 단계로 가지 않는다', async () => {
    mockData();
    mockCreate();
    renderPage();
    fillBasics();
    next();
    fireEvent.change(screen.getByLabelText('신청 마감 (선택, 한국 시간)'), { target: { value: '2000-01-01T00:00' } });
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByText('신청 마감은 지금 이후여야 해요.')).toBeInTheDocument();
  });

  it('기본 정보를 다 채우기 전에는 다음 단계로 가지 않고 뒤 단계도 잠근다', async () => {
    mockData();
    mockCreate();
    renderPage();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toHaveAccessibleDescription('리그 이름을 입력해 주세요.');
    expect(screen.getByRole('button', { name: /^2단계 참가팀·신청/ })).toBeDisabled();
    fillBasics();
    expect(screen.getByRole('button', { name: /^2단계 참가팀·신청/ })).toBeEnabled();
  });

  it('팀 명단 인원을 직접 정하고 총 경기 수를 넣으면 함께 보낸다', async () => {
    mockData();
    const mutateAsync = mockCreate();
    await toGameSettings();

    expect(screen.getByText('2팀이 한 번씩 만나면 1경기, 두 번씩이면 2경기예요. 대진을 만들 때 이 수만큼 만들고, 나중에 경기를 더 추가할 수 있어요. 이 수만큼 결과가 확정되면 리그가 자동으로 끝나요.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('제한 없음'));
    fireEvent.change(screen.getByLabelText('최소 (명)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('최대 (명)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('총 경기 수 (선택)'), { target: { value: '6' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ minPlayers: 5, maxPlayers: 15, plannedFixtureCount: 6 })));
  });

  it('최소 인원이 최대보다 많으면 다음으로 가지 못하고 이유를 알려준다', async () => {
    mockData();
    mockCreate();
    await toGameSettings();

    fireEvent.click(screen.getByLabelText('제한 없음'));
    fireEvent.change(screen.getByLabelText('최소 (명)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('최대 (명)'), { target: { value: '8' } });

    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getAllByText('최소 인원이 최대 인원보다 많아요.').length).toBeGreaterThan(0);
  });

  it('팀을 넣으면 1단계의 종목이 잠기고 이유를 알려 준다', async () => {
    mockData();
    mockCreate();
    renderPage();
    fillBasics();
    next();
    await pickTeams(['팀A']);
    fireEvent.click(screen.getByRole('button', { name: /^1단계 기본 정보/ }));
    const sportSelect = screen.getByLabelText('종목') as HTMLSelectElement;
    expect(sportSelect).toBeDisabled();
    expect(screen.getByText('팀을 넣어서 잠겼어요 · 바꾸려면 다음 단계에서 넣은 팀을 모두 지우세요')).toBeInTheDocument();
  });

  it('다른 종목 팀이 검색되면 숨기지 않고 회색으로 표시하며 이유를 보여주고, 클릭해도 선택되지 않는다', async () => {
    mockData({ sports: [FUTSAL, SOCCER], teams: [team('team-a', '팀A'), team('team-soccer', '축구팀', 'sport-soccer', '축구')] });
    mockCreate();
    renderPage();
    fillBasics();
    next();

    const picker = screen.getByLabelText('참가 팀 직접 추가 (선택)');
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: '축구' } });

    const crossSportOption = await screen.findByText('축구팀');
    expect(screen.getByText('이 리그는 풋살 종목이라 축구 팀은 선택할 수 없어요')).toBeInTheDocument();
    // disabled 항목이라도 description(종목·지역)은 계속 보여야 한다.
    expect(screen.getByText('축구 · 서울')).toBeInTheDocument();
    fireEvent.click(crossSportOption);
    expect(screen.queryByLabelText('축구팀 제거')).not.toBeInTheDocument();
  });

  // 이 안내는 원래 4개짜리 문자열을 손으로 적어 둔 것이라 서버가 5번째 기준을 추가한
  // 뒤에도 그대로였다. 지금은 공용 라벨 모듈에서 만들어 쓴다(정본 §5).
  it('경기 설정 단계의 순위 규칙 안내가 서버의 다섯 기준을 모두 담고 고정값이라는 단서를 유지한다', async () => {
    mockData();
    mockCreate();
    await toGameSettings();

    const notice = await screen.findByText(/^순위 규칙:/);
    expect(notice.textContent).toBe('순위 규칙: 승점 → 골득실 → 다득점 → 승자승 → 최소 실점 (고정값 — 리그별 변경 미지원)');
  });

  it('시작일·종료일 입력은 연도를 4자리로 제한한다', async () => {
    mockData();
    mockCreate();
    renderPage();

    expect(await screen.findByLabelText('시작일')).toHaveAttribute('max', '9999-12-31');
    expect(screen.getByLabelText('종료일')).toHaveAttribute('max', '9999-12-31');
  });

  it('종료일이 시작일보다 빠르면 종료일 아래에 안내를 보이고 다음 단계를 잠근다', async () => {
    mockData();
    mockCreate();
    renderPage();
    fillBasics();

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-12' } });

    const endsOn = screen.getByLabelText('종료일');
    expect(endsOn).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('종료일은 시작일보다 빠를 수 없어요.');
    expect(endsOn).toHaveAccessibleDescription(/종료일은 시작일보다 빠를 수 없어요/);
    const nextButton = screen.getByRole('button', { name: '다음' });
    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveAccessibleDescription('종료일을 바로잡아 주세요.');

    // 종료일을 바로잡으면 안내가 사라지고 다시 나아갈 수 있다.
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-25' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('시작일과 종료일이 같은 날이면 오류 없이 나아갈 수 있다', async () => {
    mockData();
    mockCreate();
    renderPage();
    fillBasics();

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-20' } });

    expect(screen.getByLabelText('종료일')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('경기 시간을 종목 기본값(20·20)으로 미리 채우고, 고치지 않으면 피리어드를 따로 저장하지 않는다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset();
    mockData();
    mockCreate();
    await toGameSettings();

    expect(screen.getByLabelText('전반 (분)')).toHaveValue(20);
    expect(screen.getByLabelText('후반 (분)')).toHaveValue(20);
    next();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1'));
    expect(savePeriodsMock).not.toHaveBeenCalled();
  });

  it('경기 시간을 25분으로 고치면 리그를 만든 직후 그 값으로 피리어드 설정을 저장한다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset().mockResolvedValue({});
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: 'v-created', periods: [], legacyPeriodCount: null });
    mockData();
    mockCreate();
    await toGameSettings();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('후반 (분)'), { target: { value: '25' } });
    next();
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
    mockData();
    mockCreate();
    await toGameSettings();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/경기 시간을 저장하지 못했어요|boom/);
    expect(within(alert).getByRole('link', { name: '경기 규칙으로 이동' })).toHaveAttribute('href', '/admin/league-matches/league-1/rules');
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '리그 만들기' })).toBeDisabled();
  });

  it('피리어드 저장이 진행 중인 동안 버튼이 잠겨 두 번째 클릭이 리그를 다시 만들지 않는다', async () => {
    pushMock.mockClear();
    let releaseSave: () => void = () => {};
    savePeriodsMock.mockReset().mockReturnValue(new Promise<void>((resolve) => { releaseSave = resolve; }));
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: 'v-created', periods: [], legacyPeriodCount: null });
    mockData();
    const createMock = mockCreate();
    await toGameSettings();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    next();
    const button = screen.getByRole('button', { name: '리그 만들기' });
    fireEvent.click(button);

    await waitFor(() => expect(savePeriodsMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '만드는 중…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '만드는 중…' }));
    expect(createMock).toHaveBeenCalledTimes(1);

    releaseSave();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1'));
  });

  it('피리어드 설정 버전을 못 읽으면 영어 내부 메시지 대신 해요체 안내를 보여준다', async () => {
    pushMock.mockClear();
    savePeriodsMock.mockReset();
    v1GetMock.mockReset().mockResolvedValue({ expectedVersion: null, periods: [], legacyPeriodCount: null });
    mockData();
    mockCreate();
    await toGameSettings();

    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '25' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    expect(await screen.findByText(/리그는 만들었지만 경기 시간을 저장하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/missing period settings version/)).not.toBeInTheDocument();
    expect(savePeriodsMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
