import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { TeamMatchCreateViewModel } from './team-matches.types';
import { TeamMatchCreatePageClient } from './team-matches-create-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { createTeamMatchMutate, routerPush } = vi.hoisted(() => ({
  createTeamMatchMutate: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: vi.fn(), ConfirmModal: null }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTeams: () => ({
    data: [
      {
        teamId: 'team-1',
        membershipId: 'member-1',
        name: '다이나믹 FS',
        role: 'owner',
        status: 'active',
        logoUrl: null,
        sport: { sportId: 'sport-futsal', name: '풋살' },
        region: null,
        memberCount: 14,
        canManage: true,
        canCreateTeamMatch: true,
        detailRoute: '/teams/team-1',
        manageRoute: '/teams/team-1',
      },
    ],
  }),
  useV1MasterSports: () => ({
    data: [{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }],
  }),
  useV1MasterRegions: () => ({
    data: [
      {
        id: 'region-seoul',
        code: 'seoul',
        name: '서울',
        parentId: null,
        level: 1,
        children: [
          { id: 'region-gangnam', code: 'gangnam', name: '강남구', parentId: 'region-seoul', level: 2 },
        ],
      },
    ],
  }),
  useV1CreateTeamMatch: () => ({ mutate: createTeamMatchMutate, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('./team-matches-page', () => ({
  TeamMatchCreatePageView: ({ model }: { model: TeamMatchCreateViewModel }) => {
    const form = model.form;
    if (!form) return null;
    return (
      <div>
        <label htmlFor="title">제목</label>
        <input id="title" value={model.draft.title} onChange={(event) => form.onFieldChange('title', event.target.value)} />
        <label htmlFor="venue">장소</label>
        <input id="venue" value={model.draft.venue} onChange={(event) => form.onFieldChange('venue', event.target.value)} />
        <label htmlFor="date">날짜</label>
        <input id="date" value={model.draft.date} onChange={(event) => form.onFieldChange('date', event.target.value)} />
        <label htmlFor="startTime">시작 시간</label>
        <input
          id="startTime"
          value={model.draft.startTime}
          onChange={(event) => form.onFieldChange('startTime', event.target.value)}
        />
        <button type="button" onClick={form.onSubmit}>
          팀매치 만들기
        </button>
      </div>
    );
  },
}));

describe('TeamMatchCreatePageClient — GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    createTeamMatchMutate.mockImplementation((_payload, { onSuccess }) => {
      onSuccess({ teamMatchId: 'team-match-new', detailRoute: '/team-matches/team-match-new' });
    });
  });

  it('fires team_match_create_complete after a successful create', async () => {
    render(<TeamMatchCreatePageClient step="confirm" />);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateInput = futureDate.toISOString().slice(0, 10);

    await waitFor(() => {
      expect(screen.getByLabelText('제목')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '주말 팀매치' } });
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: '한강 풋살장' } });
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: dateInput } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '18:00' } });

    fireEvent.click(screen.getByRole('button', { name: '팀매치 만들기' }));

    await waitFor(() => {
      expect(createTeamMatchMutate).toHaveBeenCalled();
    });
    expect(trackEvent).toHaveBeenCalledWith('team_match_create_complete', {});
  });
});
