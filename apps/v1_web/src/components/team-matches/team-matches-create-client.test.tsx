import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { TeamMatchCreateViewModel } from './team-matches.types';
import { draftFromTeamMatchEdit, TeamMatchCreatePageClient } from './team-matches-create-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { createTeamMatchMutate, routerPush, uploadImagesMutateAsync } = vi.hoisted(() => ({
  createTeamMatchMutate: vi.fn(),
  routerPush: vi.fn(),
  uploadImagesMutateAsync: vi.fn(),
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
  useV1UploadImages: () => ({ mutateAsync: uploadImagesMutateAsync, isPending: false }),
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
        <label htmlFor="image">대표 이미지</label>
        <input
          id="image"
          type="file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file && form.uploadImage) form.onFieldChange('imageUrl', await form.uploadImage(file));
          }}
        />
        <button type="button" onClick={form.onSubmit}>
          팀매치 만들기
        </button>
      </div>
    );
  },
}));

describe('TeamMatchCreatePageClient — GA events', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    createTeamMatchMutate.mockImplementation((_payload, { onSuccess }) => {
      onSuccess({ teamMatchId: 'team-match-new', detailRoute: '/team-matches/team-match-new' });
    });
    uploadImagesMutateAsync.mockResolvedValue({ urls: ['/uploads/team-match-cover.webp'] });
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
    expect(createTeamMatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        hostTeamId: 'team-1',
        sportId: 'sport-futsal',
        regionId: 'region-gangnam',
        title: '주말 팀매치',
        manualPlaceName: '한강 풋살장',
        imageUrl: null,
      }),
      expect.any(Object),
    );
    expect(trackEvent).toHaveBeenCalledWith('team_match_create_complete', {});
  });

  it('submits the uploaded image URL for the selected host team', async () => {
    render(<TeamMatchCreatePageClient step="confirm" />);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '이미지 팀매치' } });
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: '풋살장' } });
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: futureDate.toISOString().slice(0, 10) } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText('대표 이미지'), {
      target: { files: [new File(['image'], 'team-cover.webp', { type: 'image/webp' })] },
    });

    await waitFor(() => expect(uploadImagesMutateAsync).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '팀매치 만들기' }));

    await waitFor(() => {
      expect(createTeamMatchMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          hostTeamId: 'team-1',
          imageUrl: '/uploads/team-match-cover.webp',
        }),
        expect.any(Object),
      );
    });
  });
});

describe('team match edit hydration', () => {
  it('keeps the route entity image empty when the API stores null', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const draft = draftFromTeamMatchEdit({
      teamMatchId: 'team-match-real',
      editable: true,
      lockedReason: null,
      form: {
        hostTeamId: 'team-real',
        sportId: 'sport-futsal',
        regionId: 'region-gangnam',
        title: '실제 팀매치',
        imageUrl: null,
        startsAt,
        manualPlaceName: '실제 장소',
      },
      status: 'recruiting',
      version: new Date().toISOString(),
    });

    expect(draft.imageUrl).toBe('');
  });
});
