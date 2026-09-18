import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { TeamMatchCreateViewModel } from './team-matches.types';
import { draftFromTeamMatchEdit, TeamMatchCreatePageClient, TeamMatchEditPageClient } from './team-matches-create-client';
import { buildTeamMatchPayloadResult } from './team-matches.validation';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const {
  createTeamMatchMutate,
  routerPush,
  uploadImagesMutateAsync,
  confirmMock,
  updateTeamMatchMutate,
  cancelTeamMatchMutate,
  teamMatchEditData,
} = vi.hoisted(() => ({
  createTeamMatchMutate: vi.fn(),
  routerPush: vi.fn(),
  uploadImagesMutateAsync: vi.fn(),
  confirmMock: vi.fn(),
  updateTeamMatchMutate: vi.fn(),
  cancelTeamMatchMutate: vi.fn(),
  // useEffect(..., [editQuery.data])가 참조로 비교하므로, 매 렌더마다 새 객체를 돌려주면
  // 훅이 재실행 → setDraft → 리렌더 → 훅 재실행의 무한 루프에 빠진다. 안정적인 참조 하나를
  // 모듈 스코프에 고정해 실제 React Query의 캐시된 참조 안정성을 흉내낸다.
  teamMatchEditData: {
    teamMatchId: 'team-match-edit-1',
    editable: true,
    lockedReason: null,
    form: {
      hostTeamId: 'team-1',
      sportId: 'sport-futsal',
      regionId: 'region-gangnam',
      title: '수정 중인 팀매치',
      imageUrl: null,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      manualPlaceName: '한강 풋살장',
    },
    status: 'recruiting',
    version: 'v1',
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: confirmMock, ConfirmModal: null }),
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
  useV1TeamMatchEdit: () => ({ data: teamMatchEditData, isError: false, isLoading: false }),
  useV1UpdateTeamMatch: () => ({ mutate: updateTeamMatchMutate, isPending: false }),
  useV1CancelTeamMatch: () => ({ mutate: cancelTeamMatchMutate, isPending: false }),
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
        {form.onCancel ? (
          <button type="button" onClick={form.onCancel}>
            팀매치 취소
          </button>
        ) : null}
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

describe('team-match draft date normalization — step round-trip', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  // Regression: usePersistedDraft가 마운트마다(위저드 스텝은 각각 별도 라우트라
  // '이전' 버튼만 눌러도 재마운트된다) normalizeDraftDate를 재평가한다. 이 함수가 빈
  // startTime을 18:00으로 가정해 "지난 초안"을 판정하면, 사용자가 오늘 날짜를 고르고
  // 아직 시작 시간을 안 넣은 채 18시 이후에 스텝을 왕복하기만 해도 날짜가 조용히
  // 일주일 뒤로 리셋된다 — 사용자가 만료된 초안을 복원한 게 아니라 같은 세션 안에서다.
  it('오늘 날짜 + 빈 시작시간으로 저장된 초안은 18시 이후 재마운트돼도 날짜를 유지한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T20:00:00'));

    const todayDate = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      'teameet:v1:team-match-draft:v3',
      JSON.stringify({
        savedAt: Date.now(),
        value: {
          title: '오늘 밤 급구 팀매치',
          venue: '한강 풋살장',
          date: todayDate,
          startTime: '',
          endTime: '',
        },
      }),
    );

    render(<TeamMatchCreatePageClient step="confirm" />);
    // usePersistedDraft의 useEffect(마운트 시 1회)가 커밋 이후 마이크로태스크로 플러시된다.
    // 이 파일의 다른 테스트들은 waitFor로 이를 기다리지만, waitFor의 내부 폴링은 실제
    // setTimeout에 의존해 fake timer 아래서는 영원히 끝나지 않는다 — act(async)로 직접 플러시한다.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText('제목')).toHaveValue('오늘 밤 급구 팀매치');
    expect(screen.getByLabelText('날짜')).toHaveValue(todayDate);
  });
});

// Regression: 팀매치 취소는 되돌리는 API가 없는 파괴적 동작이다 — 신청자 전원이 강제 취소되고
// 알림이 발송된다. '변경사항 저장' 바로 아래 붙은 전폭 버튼이라 오탭 가능성이 높은데도
// 확인 절차 없이 한 번의 탭으로 즉시 실행되던 결함(finding #33)의 회귀 테스트.
describe('TeamMatchEditPageClient — cancel confirmation', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('팀매치 취소 버튼을 눌러도 확인 전에는 취소 API를 호출하지 않는다', async () => {
    confirmMock.mockResolvedValue(false); // 사용자가 확인 모달에서 '취소'를 누른 경우
    render(<TeamMatchEditPageClient teamMatchId="team-match-edit-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '팀매치 취소' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(cancelTeamMatchMutate).not.toHaveBeenCalled();
  });

  it('확인 모달에서 승인하면 그제서야 취소 API를 호출한다', async () => {
    confirmMock.mockResolvedValue(true);
    render(<TeamMatchEditPageClient teamMatchId="team-match-edit-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '팀매치 취소' }));

    await waitFor(() => {
      expect(cancelTeamMatchMutate).toHaveBeenCalledWith(
        { reason: 'host_cancelled_from_v1_web' },
        expect.any(Object),
      );
    });
  });
});
