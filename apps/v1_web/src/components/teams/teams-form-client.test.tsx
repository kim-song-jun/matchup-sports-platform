import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { TEAM_LOGO_PRESETS } from '@/lib/team-logo-presets';
import type { TeamFormViewModel } from './teams.types';
import { TeamCreatePageClient, TeamEditPageClient } from './teams-form-client';

const {
  confirmMock,
  createTeamMutateAsync,
  routerPush,
  updateTeamMutateAsync,
  useV1MasterSportsMock,
  useV1ProfileMock,
  useV1TeamDetailMock,
  useV1TeamNameAvailabilityMock,
} = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  createTeamMutateAsync: vi.fn(),
  routerPush: vi.fn(),
  updateTeamMutateAsync: vi.fn(),
  useV1MasterSportsMock: vi.fn(),
  useV1ProfileMock: vi.fn(),
  useV1TeamDetailMock: vi.fn(),
  useV1TeamNameAvailabilityMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({
    confirm: confirmMock,
    ConfirmModal: null,
  }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CreateTeam: () => ({ mutateAsync: createTeamMutateAsync, isPending: false }),
  useV1MasterRegions: () => ({
    data: [
      { id: 'region-seoul', name: '서울', parentId: null, level: 1 },
      { id: 'region-mapo', name: '마포구', parentId: 'region-seoul', level: 2 },
    ],
  }),
  useV1MasterSports: useV1MasterSportsMock,
  useV1Profile: useV1ProfileMock,
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1TeamDetail: useV1TeamDetailMock,
  useV1TeamNameAvailability: useV1TeamNameAvailabilityMock,
  useV1UpdateTeam: () => ({ mutateAsync: updateTeamMutateAsync, isPending: false }),
}));

vi.mock('./teams-page', () => ({
  TeamFormPageView: ({ model, cancelHref }: { model: TeamFormViewModel; cancelHref?: string }) => {
    const form = model.form;

    if (!form) return <div role="status">종목 목록 불러오는 중</div>;
    if (form.sports.length === 0) return <div role="alert">종목을 불러오지 못했어요</div>;

    return (
      <div>
        <label htmlFor="team-name">팀 이름</label>
        <input
          id="team-name"
          value={model.team.name}
          onChange={(event) => form?.onFieldChange('name', event.target.value)}
        />
        <output data-testid="team-logo-url">{model.team.logoUrl}</output>
        <output data-testid="min-capacity">{form.minCapacity}</output>
        <output data-testid="capacity">{model.team.capacity}</output>
        <output data-testid="region-id">{form.regionId}</output>
        <output data-testid="region-prefilled">{String(Boolean(form.regionPrefilled))}</output>
        <button type="button" onClick={() => form.onRegionChange('region-seoul')}>서울 전체 고르기</button>
        {form.nameError ? <p data-testid="name-error">{form.nameError}</p> : null}
        {form.error ? <p role="alert">{form.error}</p> : null}
        {form.sports.map((sport) => (
          <button
            key={sport.id}
            type="button"
            aria-pressed={model.team.sports.includes(sport.name)}
            onClick={() => form.onSportChange(sport.id)}
          >
            {sport.name}
          </button>
        ))}
        <button type="button" onClick={form.onSubmit}>
          {model.mode === 'create' ? '팀 만들기' : '저장'}
        </button>
        {cancelHref ? <a href={cancelHref}>취소</a> : null}
      </div>
    );
  },
}));

describe('Team form client contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.searchParams = new URLSearchParams();
    useV1ProfileMock.mockReturnValue({ data: { regions: [] }, isPending: false });
    useV1TeamNameAvailabilityMock.mockReturnValue({ data: undefined });
    useV1MasterSportsMock.mockReturnValue({
      data: [
        { id: 'sport-soccer', code: 'soccer', name: '축구', levels: [] },
        { id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] },
      ],
      isPending: false,
    });
    useV1TeamDetailMock.mockReturnValue({
      data: {
        name: '기존 풋살 팀',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        region: { regionId: 'region-seoul', name: '서울', parentName: null },
        profile: {
          logoUrl: null,
          coverImageUrl: null,
          introduction: null,
          levelLabel: null,
          skillLevelText: null,
          genderRule: '성별 무관',
          activityDays: [],
          activityFrequency: null,
          activityTimeSlots: [],
          activityTypes: [],
          activityMemo: null,
          activityAreaText: null,
          memberGoalCount: 20,
          joinPolicy: 'approval_required',
        },
        memberCount: 12,
        membersVisibilityEnabled: false,
        version: 'version-1',
        viewer: { role: 'owner' },
      },
      isError: false,
      isLoading: false,
    });
    createTeamMutateAsync.mockResolvedValue({
      teamId: 'team-futsal',
      detailRoute: '/teams/team-futsal',
    });
    updateTeamMutateAsync.mockResolvedValue({
      teamId: 'team-futsal',
      detailRoute: '/teams/team-futsal',
    });
  });

  it('keeps the pressed sport and submitted sportId in sync', async () => {
    render(<TeamCreatePageClient />);

    expect(screen.getByRole('button', { name: '축구' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '풋살' }));
    fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '풋살 테스트 팀' } });

    expect(screen.getByRole('button', { name: '풋살' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));

    await waitFor(() => {
      expect(createTeamMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sportId: 'sport-futsal' }),
      );
    });
  });

  it('submits one bundled logo preset through the existing logoUrl contract', async () => {
    render(<TeamCreatePageClient />);

    await waitFor(() => {
      expect(TEAM_LOGO_PRESETS).toContain(screen.getByTestId('team-logo-url').textContent);
    });
    const selectedLogoUrl = screen.getByTestId('team-logo-url').textContent;

    fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '프리셋 저장 팀' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));

    await waitFor(() => {
      expect(createTeamMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ logoUrl: selectedLogoUrl }),
      );
    });
  });

  it('팀매치에서 "팀 만들고 신청하기"로 왔으면 그 종목을 고르고, 만든 뒤 새 팀 상세가 아니라 그 팀매치로 돌아가 새 팀을 신청 팀으로 둔다', async () => {
    navigation.searchParams = new URLSearchParams({ sportId: 'sport-futsal', from: '/team-matches/tm-1?from=%2Fteam-matches' });
    window.localStorage.clear();
    render(<TeamCreatePageClient />);

    expect(screen.getByRole('button', { name: '풋살' })).toHaveAttribute('aria-pressed', 'true');
    // 이전도 원래 팀매치로 간다.
    expect(screen.getByRole('link', { name: '취소' })).toHaveAttribute('href', '/team-matches/tm-1?from=%2Fteam-matches');
    fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '새 풋살 팀' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/team-matches/tm-1?from=%2Fteam-matches'));
    expect(createTeamMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ sportId: 'sport-futsal' }));
    expect(window.localStorage.getItem('teameet.v1.lastTeamMatchApplyTeamId')).toBe('team-futsal');
  });

  it('팀매치가 아닌 출처나 목록에 없는 종목은 무시하고 예전처럼 새 팀 상세로 간다', async () => {
    navigation.searchParams = new URLSearchParams({ sportId: 'sport-unknown', from: '/teams' });
    render(<TeamCreatePageClient />);

    expect(screen.getByRole('button', { name: '축구' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '새 축구 팀' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/teams/team-futsal?created=1'));
  });

  it('tracks team_create_complete with the sport code on successful creation', async () => {
    render(<TeamCreatePageClient />);

    fireEvent.click(screen.getByRole('button', { name: '풋살' }));
    fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '풋살 테스트 팀' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('team_create_complete', { sportType: 'futsal' });
    });
  });

  it('shows the loading contract until master sports resolve', () => {
    useV1MasterSportsMock.mockReturnValue({ data: undefined, isPending: true });
    const view = render(<TeamCreatePageClient />);

    expect(screen.getByRole('status')).toHaveTextContent('종목 목록 불러오는 중');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    useV1MasterSportsMock.mockReturnValue({
      data: [
        { id: 'sport-soccer', name: '축구', levels: [] },
        { id: 'sport-futsal', name: '풋살', levels: [] },
      ],
      isPending: false,
    });
    view.rerender(<TeamCreatePageClient />);

    expect(screen.getByRole('button', { name: '축구' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps create submission locked through the compatibility retry', async () => {
    createTeamMutateAsync
      .mockRejectedValueOnce(new V1ApiError({
        status: 'error',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: '지원하지 않는 필드',
        details: { activityDays: 'property activityDays should not exist' },
        timestamp: '2026-07-18T00:00:00.000Z',
      }))
      .mockReturnValueOnce(new Promise(() => undefined));
    render(<TeamCreatePageClient />);
    fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '중복 방지 팀' } });

    const submit = screen.getByRole('button', { name: '팀 만들기' });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(createTeamMutateAsync).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(submit);

    expect(createTeamMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('locks edit submission synchronously while the mutation is pending', async () => {
    updateTeamMutateAsync.mockReturnValue(new Promise(() => undefined));
    render(<TeamEditPageClient teamId="team-futsal" />);

    await waitFor(() => {
      expect(screen.getByLabelText('팀 이름')).toHaveValue('기존 풋살 팀');
    });

    const submit = screen.getByRole('button', { name: '저장' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(updateTeamMutateAsync).toHaveBeenCalledTimes(1);
  });

  // G12(F23): 온보딩에서 고른 내 지역으로 채운다 — "서울/전체"로 시작하지 않는다.
  describe('만들기 활동 지역 기본값', () => {
    it('프로필의 대표 지역으로 채우고, 그 사실을 알린다', async () => {
      useV1ProfileMock.mockReturnValue({
        data: { regions: [{ regionId: 'region-seoul', primary: false }, { regionId: 'region-mapo', primary: true }] },
        isPending: false,
      });
      render(<TeamCreatePageClient />);

      await waitFor(() => expect(screen.getByTestId('region-id')).toHaveTextContent('region-mapo'));
      expect(screen.getByTestId('region-prefilled')).toHaveTextContent('true');
    });

    it('프로필이 늦게 와도 첫 지역을 먼저 박지 않고 내 지역으로 채운다', async () => {
      useV1ProfileMock.mockReturnValue({ data: undefined, isPending: true });
      const view = render(<TeamCreatePageClient />);
      expect(screen.getByTestId('region-id')).toHaveTextContent('');

      useV1ProfileMock.mockReturnValue({ data: { regions: [{ regionId: 'region-mapo', primary: true }] }, isPending: false });
      view.rerender(<TeamCreatePageClient />);

      await waitFor(() => expect(screen.getByTestId('region-id')).toHaveTextContent('region-mapo'));
    });

    it('프로필 지역이 없으면 첫 지역으로 시작하고 채웠다고 말하지 않는다', async () => {
      render(<TeamCreatePageClient />);

      await waitFor(() => expect(screen.getByTestId('region-id')).toHaveTextContent('region-seoul'));
      expect(screen.getByTestId('region-prefilled')).toHaveTextContent('false');
    });

    it('직접 지역을 바꾸면 채웠다는 안내를 내린다', async () => {
      useV1ProfileMock.mockReturnValue({ data: { regions: [{ regionId: 'region-mapo', primary: true }] }, isPending: false });
      render(<TeamCreatePageClient />);
      await waitFor(() => expect(screen.getByTestId('region-prefilled')).toHaveTextContent('true'));

      fireEvent.click(screen.getByRole('button', { name: '서울 전체 고르기' }));

      expect(screen.getByTestId('region-id')).toHaveTextContent('region-seoul');
      expect(screen.getByTestId('region-prefilled')).toHaveTextContent('false');
    });
  });

  // W2-V2: 취소는 들어온 곳으로 — 팀 목록으로 보내면 방금 보던 팀을 잃는다.
  describe('수정 취소 목적지', () => {
    it('출처가 없으면 그 팀 상세로 돌아간다', () => {
      render(<TeamEditPageClient teamId="team-futsal" />);

      expect(screen.getByRole('link', { name: '취소' })).toHaveAttribute('href', '/teams/team-futsal');
    });

    it('안전한 출처가 있으면 그곳으로, 바깥 주소는 버리고 팀 상세로 돌아간다', () => {
      navigation.searchParams = new URLSearchParams({ from: '/teams/team-futsal?from=%2Fmy%2Fteams' });
      const view = render(<TeamEditPageClient teamId="team-futsal" />);
      expect(screen.getByRole('link', { name: '취소' })).toHaveAttribute('href', '/teams/team-futsal?from=%2Fmy%2Fteams');

      view.unmount();
      navigation.searchParams = new URLSearchParams({ from: 'https://evil.example/teams' });
      render(<TeamEditPageClient teamId="team-futsal" />);
      expect(screen.getByRole('link', { name: '취소' })).toHaveAttribute('href', '/teams/team-futsal');
    });
  });

  describe('수정 권한', () => {
    function viewAs(role: string) {
      const current = useV1TeamDetailMock();
      useV1TeamDetailMock.mockReturnValue({ ...current, data: { ...current.data, teamId: 'team-futsal', viewer: { role } } });
    }

    it.each(['member', 'none'])('%s 는 수정 폼 대신 권한 안내와 돌아갈 길을 본다', (role) => {
      viewAs(role);
      render(<TeamEditPageClient teamId="team-futsal" />);

      expect(screen.getByRole('alert')).toHaveTextContent('팀장·매니저만 고칠 수 있어요');
      expect(screen.getByRole('alert')).toHaveTextContent('팀장에게');
      expect(screen.getByRole('link', { name: '팀 상세로 돌아가기' })).toHaveAttribute('href', '/teams/team-futsal');
      expect(screen.queryByLabelText('팀 이름')).not.toBeInTheDocument();
    });

    it.each(['owner', 'manager'])('%s 는 수정 폼을 본다', (role) => {
      viewAs(role);
      render(<TeamEditPageClient teamId="team-futsal" />);

      expect(screen.getByLabelText('팀 이름')).toBeInTheDocument();
      expect(screen.queryByText('팀장·매니저만 고칠 수 있어요')).not.toBeInTheDocument();
    });
  });

  describe('수정 저장 거절', () => {
    const serverError = (statusCode: number, code: string, message: string, details?: unknown) =>
      new V1ApiError({ status: 'error', statusCode, code, message, details, timestamp: '2026-09-30T00:00:00.000Z' });

    async function submitEdit() {
      render(<TeamEditPageClient teamId="team-futsal" />);
      await waitFor(() => expect(screen.getByLabelText('팀 이름')).toHaveValue('기존 풋살 팀'));
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    }

    it('권한 거절의 영어 서버 문구를 해요체 안내로 바꿔 보여준다', async () => {
      updateTeamMutateAsync.mockRejectedValueOnce(
        serverError(403, 'PERMISSION_DENIED', 'Only team owners or managers can manage this team'),
      );
      await submitEdit();

      expect(await screen.findByRole('alert')).toHaveTextContent('팀장·매니저만 할 수 있어요');
      expect(screen.queryByText(/Only team owners/)).not.toBeInTheDocument();
    });

    it('정원 거절은 지금 팀원 수를 알려 준다', async () => {
      updateTeamMutateAsync.mockRejectedValueOnce(
        serverError(400, 'VALIDATION_FAILED', 'memberGoalCount cannot be lower than the current member count', { field: 'memberGoalCount' }),
      );
      await submitEdit();

      expect(await screen.findByRole('alert')).toHaveTextContent('정원은 지금 팀원 수(12명)보다 적게 정할 수 없어요.');
    });

    it.each([null, 1])('팀원 1명인 팀의 목표 정원 %s는 표시된 최소 정원 2명으로 저장한다', async (memberGoalCount) => {
      const current = useV1TeamDetailMock();
      useV1TeamDetailMock.mockReturnValue({
        ...current,
        data: { ...current.data, memberCount: 1, profile: { ...current.data.profile, memberGoalCount } },
      });
      await submitEdit();

      expect(screen.getByTestId('capacity')).toHaveTextContent('2');

      await waitFor(() => expect(updateTeamMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: 2 })));
      await waitFor(() => expect(routerPush).toHaveBeenCalled());
    });

    it('정원 하한을 지금 팀원 수로 넘기고, 목표 인원이 팀원 수보다 작게 저장된 팀도 하한부터 시작한다', async () => {
      const current = useV1TeamDetailMock();
      useV1TeamDetailMock.mockReturnValue({
        ...current,
        data: { ...current.data, profile: { ...current.data.profile, memberGoalCount: 5 } },
      });
      await submitEdit();

      expect(screen.getByTestId('min-capacity')).toHaveTextContent('12');
      await waitFor(() => expect(updateTeamMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: 12 })));
    });
  });

  describe('profile-completion leave', () => {
    const LEAVE_TITLE = '작성 중인 내용이 사라져요. 나갈까요?';
    const profileRequired = () => new V1ApiError({
      status: 'error',
      statusCode: 400,
      code: 'PROFILE_COMPLETION_REQUIRED',
      message: '프로필 필요',
      details: { missingFields: ['nickname'] },
      timestamp: '2026-09-25T00:00:00.000Z',
    });

    async function submitDirtyWithoutProfile(answers: boolean[]) {
      answers.forEach((answer) => confirmMock.mockResolvedValueOnce(answer));
      createTeamMutateAsync.mockRejectedValueOnce(profileRequired());
      render(<TeamCreatePageClient />);
      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '작성 중인 팀' } });
      fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));
      await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(answers.length));
    }

    it('프로필 수정 on a dirty form still asks the unsaved-changes guard, and 계속 작성 stays', async () => {
      await submitDirtyWithoutProfile([true, false]);
      expect(confirmMock.mock.calls[1][0]).toMatchObject({ title: LEAVE_TITLE });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(routerPush).not.toHaveBeenCalled();
    });

    it('a successful submit on a dirty form navigates to the detail page without asking', async () => {
      render(<TeamCreatePageClient />);
      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '작성 중인 팀' } });
      fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/teams/team-futsal?created=1'));
      expect(confirmMock).not.toHaveBeenCalled();
    });

    it('나가기 then goes to the profile edit page', async () => {
      await submitDirtyWithoutProfile([true, true]);
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/my/profile/edit?returnTo=%2Fteams%2Fnew'));
    });

    it('팀매치에서 왔으면 프로필을 채우고 돌아올 주소에 팀매치 출처·종목을 그대로 싣는다', async () => {
      navigation.searchParams = new URLSearchParams({ sportId: 'sport-futsal', from: '/team-matches/tm-1' });
      await submitDirtyWithoutProfile([true, true]);
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith(
        `/my/profile/edit?returnTo=${encodeURIComponent('/teams/new?sportId=sport-futsal&from=%2Fteam-matches%2Ftm-1')}`,
      ));
    });
  });

  describe('팀 이름 중복 (H2)', () => {
    // 가짜 서버: 풋살·서울에 '마포 FC' 가 이미 있다(앞뒤 공백·대소문자 무시).
    beforeEach(() => {
      useV1TeamNameAvailabilityMock.mockImplementation((params: { name: string; sportId: string; regionId: string } | null) => ({
        data: params ? { available: !(params.sportId === 'sport-futsal' && params.regionId === 'region-seoul' && params.name.trim().toLowerCase() === '마포 fc') } : undefined,
      }));
    });

    it('만들기: 입력을 멈추면 같은 종목·지역의 같은 이름을 알려 주고, 다른 이름이면 안내가 없다', async () => {
      render(<TeamCreatePageClient />);
      fireEvent.click(screen.getByRole('button', { name: '풋살' }));
      fireEvent.click(screen.getByRole('button', { name: '서울 전체 고르기' }));
      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: ' 마포 fc ' } });

      expect(await screen.findByTestId('name-error')).toHaveTextContent('같은 종목·지역에 같은 이름의 팀이 있어요.');

      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '마포 FC 2' } });
      await waitFor(() => expect(useV1TeamNameAvailabilityMock).toHaveBeenLastCalledWith(expect.objectContaining({ name: '마포 FC 2' })));
      expect(screen.queryByTestId('name-error')).toBeNull();
    });

    it('만들기: 종목이 다르면 같은 이름이어도 막지 않는다', async () => {
      render(<TeamCreatePageClient />);
      fireEvent.click(screen.getByRole('button', { name: '서울 전체 고르기' }));
      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '마포 FC' } });

      await waitFor(() => expect(useV1TeamNameAvailabilityMock).toHaveBeenLastCalledWith(expect.objectContaining({ name: '마포 FC', sportId: 'sport-soccer' })));
      expect(screen.queryByTestId('name-error')).toBeNull();
    });

    it('수정: 자기 팀을 알려 묻고 서버 답대로만 안내한다 — 처음 그대로인지는 서버가 저장과 같은 규칙으로 판정한다', async () => {
      // 가짜 서버: '기존 풋살 팀' 은 규칙 전부터 다른 팀과 겹친다 — 그 팀 자신이 물을 때만 통과다.
      useV1TeamNameAvailabilityMock.mockImplementation((params: { name: string; excludeTeamId?: string } | null) => ({
        data: params ? { available: params.name !== '마포 FC' && !(params.name === '기존 풋살 팀' && params.excludeTeamId !== 'team-futsal') } : undefined,
      }));
      render(<TeamEditPageClient teamId="team-futsal" />);
      await waitFor(() => expect(useV1TeamNameAvailabilityMock).toHaveBeenLastCalledWith(expect.objectContaining({ name: '기존 풋살 팀', excludeTeamId: 'team-futsal' })));
      expect(screen.queryByTestId('name-error')).toBeNull();

      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '마포 FC' } });
      expect(await screen.findByTestId('name-error')).toBeInTheDocument();
      expect(useV1TeamNameAvailabilityMock).toHaveBeenLastCalledWith(expect.objectContaining({ name: '마포 FC', excludeTeamId: 'team-futsal' }));
    });

    it('만들기 저장이 409 TEAM_NAME_TAKEN 이면 입력 중 확인과 같은 안내를 보인다', async () => {
      createTeamMutateAsync.mockRejectedValueOnce(
        new V1ApiError({ status: 'error', statusCode: 409, code: 'TEAM_NAME_TAKEN', message: '같은 종목·지역에 같은 이름의 팀이 있어요. 다른 이름을 써 주세요.', timestamp: '2026-10-01T00:00:00.000Z' }),
      );
      render(<TeamCreatePageClient />);
      fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '동시에 만든 팀' } });
      fireEvent.click(screen.getByRole('button', { name: '팀 만들기' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('같은 종목·지역에 같은 이름의 팀이 있어요.');
    });
  });
});
