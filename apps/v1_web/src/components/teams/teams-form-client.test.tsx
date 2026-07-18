import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import type { TeamFormViewModel } from './teams.types';
import { TeamCreatePageClient, TeamEditPageClient } from './teams-form-client';

const {
  createTeamMutateAsync,
  routerPush,
  updateTeamMutateAsync,
  useV1MasterSportsMock,
  useV1TeamDetailMock,
} = vi.hoisted(() => ({
  createTeamMutateAsync: vi.fn(),
  routerPush: vi.fn(),
  updateTeamMutateAsync: vi.fn(),
  useV1MasterSportsMock: vi.fn(),
  useV1TeamDetailMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({
    confirm: vi.fn(),
    ConfirmModal: null,
  }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CreateTeam: () => ({ mutateAsync: createTeamMutateAsync, isPending: false }),
  useV1MasterRegions: () => ({
    data: [{ id: 'region-seoul', name: '서울', parentId: null, level: 1 }],
  }),
  useV1MasterSports: useV1MasterSportsMock,
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1TeamDetail: useV1TeamDetailMock,
  useV1UpdateTeam: () => ({ mutateAsync: updateTeamMutateAsync, isPending: false }),
}));

vi.mock('./teams-page', () => ({
  TeamFormPageView: ({ model }: { model: TeamFormViewModel }) => {
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
      </div>
    );
  },
}));

describe('Team form client contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
