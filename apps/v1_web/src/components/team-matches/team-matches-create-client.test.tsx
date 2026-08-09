import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { TeamMatchCreateViewModel } from './team-matches.types';
import { draftFromTeamMatchEdit, TeamMatchCreatePageClient } from './team-matches-create-client';
import { buildTeamMatchPayloadResult } from './team-matches.validation';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

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
  useV1TeamRecentVenues: () => ({ data: undefined }),
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

  it('keeps the stored image, place, address, and deadline in the edit payload', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    startsAt.setHours(19, 0, 0, 0);
    const deadlineAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
    const edit = {
      teamMatchId: 'team-match-image', editable: true, lockedReason: null,
      form: {
        hostTeamId: 'team-1', sportId: 'sport-futsal', regionId: 'region-gangnam',
        title: '이미지 팀매치', imageUrl: '/uploads/team-match-cover.webp',
        startsAt: startsAt.toISOString(), deadlineAt: deadlineAt.toISOString(),
        manualPlaceName: '잠실 풋살파크', addressText: '서울 송파구 올림픽로 25',
      },
      status: 'recruiting' as const, version: new Date().toISOString(),
    };
    const draft = draftFromTeamMatchEdit(edit);
    const payload = buildTeamMatchPayloadResult(draft, 'team-1', 'sport-futsal', 'region-gangnam').payload;

    expect(draft).toMatchObject({
      imageUrl: '/uploads/team-match-cover.webp',
      venue: '잠실 풋살파크',
      address: '서울 송파구 올림픽로 25',
    });
    expect(payload).toMatchObject({
      imageUrl: '/uploads/team-match-cover.webp',
      manualPlaceName: '잠실 풋살파크',
      addressText: '서울 송파구 올림픽로 25',
      deadlineAt: deadlineAt.toISOString(),
    });
  });

  // Regression: the legacy formatNote write used
  // [grade, format, style, uniform].filter(Boolean).join(' · ') — a blank field is
  // dropped, not left as an empty slot, so every later field shifts left by one. A
  // 3-segment rulesText can't be trusted to be [grade,format,style] just because it has
  // 3 parts; it's just as likely [grade,style,uniform] (format left blank at creation).
  // Reading it positionally anyway would put a style/uniform value under the wrong label
  // (e.g. show '친선' as the match format when it was actually the style).
  it('does not misassign an ambiguous legacy rulesText onto format/uniform — keeps it under style instead', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const draft = draftFromTeamMatchEdit({
      teamMatchId: 'team-match-legacy-mid-blank',
      editable: true,
      lockedReason: null,
      form: {
        hostTeamId: 'team-real',
        sportId: 'sport-futsal',
        regionId: 'region-gangnam',
        title: '레거시 팀매치',
        startsAt,
        manualPlaceName: '레거시 장소',
        // 원래 grade='B', format=''(비움), style='친선', uniform='파랑'으로 저장됐던 row —
        // 구조화 컬럼(matchFormat/matchStyle/uniformColor)은 모두 비어 있어 legacy 분기를 탄다.
        rulesText: 'B · 친선 · 파랑',
      },
      status: 'recruiting',
      version: new Date().toISOString(),
    });

    // format/uniform은 실제로 무엇이었는지 알 수 없으므로 값을 지어내지 않는다 —
    // '친선'이 경기방식으로, '파랑'이 스타일로 잘못 배정되면 안 된다.
    expect(draft.format).toBe('');
    expect(draft.uniform).toBe('');
    // 대신 원본 세그먼트를 전부 style에 그대로 보존한다.
    expect(draft.style).toEqual(['B', '친선', '파랑']);
  });

  it('maps a removed edit image to null instead of a fallback image', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const draft = { ...getTeamMatchCreateViewModel('edit').draft, title: '이미지 제거', imageUrl: '', venue: '잠실', date: startsAt.toISOString().slice(0, 10), startTime: '19:00' };

    expect(buildTeamMatchPayloadResult(draft, 'team-1', 'sport-futsal', 'region-gangnam').payload?.imageUrl).toBeNull();
  });
});

describe('team-match deadline payload', () => {
  it('sends the selected application deadline before the match start', () => {
    const draft = getTeamMatchCreateViewModel('place-time').draft;
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    start.setHours(18, 0, 0, 0);
    const deadline = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const payload = buildTeamMatchPayloadResult(
      {
        ...draft,
        title: '마감 시간이 있는 팀매치',
        venue: '한강 풋살장',
        date: start.toISOString().slice(0, 10),
        startTime: '18:00',
        endTime: '20:00',
        deadlineDate: deadline.toISOString().slice(0, 10),
        deadlineTime: '18:00',
      },
      'team-1',
      'sport-futsal',
      'region-gangnam',
    ).payload;

    expect(payload?.deadlineAt).toBe(deadline.toISOString());
  });
});
