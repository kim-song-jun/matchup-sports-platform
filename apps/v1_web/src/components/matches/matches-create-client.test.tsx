import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import { writeExpiringDraft } from '@/lib/expiring-draft';
import type { MatchCreateViewModel } from './matches.types';
import { draftFromMatchEdit, MatchCreatePageClient, MatchEditPageClient } from './matches-create-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { createMatchMutate, routerPush, uploadImagesMutateAsync, confirmMock, updateMatchMutate, cancelMatchMutate, matchEditData } = vi.hoisted(() => ({
  createMatchMutate: vi.fn(),
  routerPush: vi.fn(),
  uploadImagesMutateAsync: vi.fn(),
  confirmMock: vi.fn(),
  updateMatchMutate: vi.fn(),
  cancelMatchMutate: vi.fn(),
  // useEffect(..., [editQuery.data])가 참조로 비교하므로, 매 렌더마다 새 객체를 돌려주면
  // 훅이 재실행 → setDraft → 리렌더 → 훅 재실행의 무한 루프에 빠진다. 안정적인 참조 하나를
  // 모듈 스코프에 고정해 실제 React Query의 캐시된 참조 안정성을 흉내낸다.
  matchEditData: {
    matchId: 'match-edit-1',
    editable: true,
    lockedReason: null,
    form: {
      sportId: 'sport-futsal',
      regionId: 'region-gangnam',
      title: '수정 중인 매치',
      imageUrl: null,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      capacity: 10,
      manualPlaceName: '한강 풋살장',
    },
    status: 'recruiting',
    participantCount: 1,
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
  useV1CreateMatch: () => ({ mutate: createMatchMutate, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: uploadImagesMutateAsync, isPending: false }),
  useV1MyRecentVenues: () => ({ data: undefined }),
  useV1MatchEdit: () => ({
    data: matchEditData,
    isError: false,
    isLoading: false,
  }),
  useV1UpdateMatch: () => ({ mutate: updateMatchMutate, isPending: false }),
  useV1CancelMatch: () => ({ mutate: cancelMatchMutate, isPending: false }),
}));

vi.mock('./matches-page', () => ({
  MatchCreatePageView: ({ model }: { model: MatchCreateViewModel }) => {
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
            if (file && form.uploadImage) form.onFieldChange('image', await form.uploadImage(file));
          }}
        />
        <button type="button" onClick={form.onSubmit}>
          매치 만들기
        </button>
        {form.onCancel ? (
          <button type="button" onClick={form.onCancel}>
            매치 취소
          </button>
        ) : null}
      </div>
    );
  },
}));

describe('MatchCreatePageClient — GA events', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    createMatchMutate.mockImplementation((_payload, { onSuccess }) => {
      onSuccess({ matchId: 'match-new', detailRoute: '/matches/match-new' });
    });
    uploadImagesMutateAsync.mockResolvedValue({ urls: ['/uploads/match-cover.webp'] });
  });

  it('fires match_create_complete with the selected sportType after a successful create', async () => {
    render(<MatchCreatePageClient step="confirm" />);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateInput = futureDate.toISOString().slice(0, 10);

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '주말 풋살 매치' } });
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: '한강 풋살장' } });
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: dateInput } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '18:00' } });

    fireEvent.click(screen.getByRole('button', { name: '매치 만들기' }));

    await waitFor(() => {
      expect(createMatchMutate).toHaveBeenCalled();
    });
    expect(createMatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        sportId: 'sport-futsal',
        regionId: 'region-gangnam',
        title: '주말 풋살 매치',
        manualPlaceName: '한강 풋살장',
        imageUrl: null,
      }),
      expect.any(Object),
    );
    expect(trackEvent).toHaveBeenCalledWith('match_create_complete', { sportType: '풋살' });
  });

  it('submits the uploaded image URL instead of a fixed mock image', async () => {
    render(<MatchCreatePageClient step="confirm" />);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '이미지 매치' } });
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: '체육관' } });
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: futureDate.toISOString().slice(0, 10) } });
    fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText('대표 이미지'), {
      target: { files: [new File(['image'], 'cover.webp', { type: 'image/webp' })] },
    });

    await waitFor(() => expect(uploadImagesMutateAsync).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '매치 만들기' }));

    await waitFor(() => {
      expect(createMatchMutate).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: '/uploads/match-cover.webp' }),
        expect.any(Object),
      );
    });
  });

  it('keeps legitimate date and time values that happen to match old sample defaults', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const date = futureDate.toISOString().slice(0, 10);
    // 드래프트는 저장 시각이 담긴 봉투 형태로 보관된다(만료 판정용) — 평면 JSON을 직접
    // 넣으면 "언제 저장됐는지 모르는 예전 형식"으로 간주돼 폐기된다(lib/expiring-draft.ts).
    // 이 테스트가 검증하려는 건 저장 형식이 아니라 "옛 샘플 기본값과 우연히 같은 정상 입력이
    // 지워지지 않는다"이므로, 지금 막 저장된 드래프트로 픽스처를 만든다.
    writeExpiringDraft('teameet:v1:match-draft', {
      title: '사용자가 직접 작성한 매치',
      venue: '사용자가 선택한 체육관',
      date,
      startTime: '18:00',
      endTime: '20:00',
    });

    render(<MatchCreatePageClient step="confirm" />);

    await waitFor(() => expect(screen.getByLabelText('날짜')).toHaveValue(date));
    expect(screen.getByLabelText('시작 시간')).toHaveValue('18:00');
    fireEvent.click(screen.getByRole('button', { name: '매치 만들기' }));

    await waitFor(() => {
      expect(createMatchMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '사용자가 직접 작성한 매치',
          manualPlaceName: '사용자가 선택한 체육관',
        }),
        expect.any(Object),
      );
    });
  });
});

describe('match edit hydration', () => {
  it('keeps a persisted null image empty instead of injecting sample imagery', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const draft = draftFromMatchEdit({
      matchId: 'match-real',
      editable: true,
      lockedReason: null,
      form: {
        sportId: 'sport-futsal',
        regionId: 'region-gangnam',
        title: '실제 매치',
        imageUrl: null,
        startsAt,
        capacity: 10,
        manualPlaceName: '실제 장소',
      },
      status: 'recruiting',
      participantCount: 1,
      version: new Date().toISOString(),
    });

    expect(draft.image).toBe('');
  });

  // 2026-08-27 감사 M-A-personal-match-state: toDateInput()이 toISOString()(UTC)을,
  // toTimeInput()이 toTimeString()(로컬)을 섞어 써서, UTC 자정을 넘어가는 시각(예: KST
  // 00:00~08:59 시작 매치)을 수정 화면에서 열면 날짜만 하루 앞으로 밀렸다. 날짜·시간이
  // 항상 같은(로컬) 기준시에서 나오는지를, 특정 타임존을 가정하지 않고 검증한다 — 기대값도
  // 테스트 실행 호스트의 로컬 getter로 계산해 date와 startTime이 "같은 시계"를 가리키는지 본다.
  it('날짜와 시간이 같은 기준시(로컬)에서 나온다 — UTC 날짜 + 로컬 시각 혼용으로 하루가 밀리지 않는다', () => {
    // UTC 22:00은 UTC보다 앞선(양의 오프셋) 타임존에서는 다음날로 넘어간다 — 이 저장소의
    // 테스트 실행 환경(Asia/Seoul, UTC+9)에서는 2026-09-05T07:00 KST가 된다.
    const start = new Date(Date.UTC(2026, 8, 4, 22, 0, 0));
    const expectedDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const expectedTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

    const draft = draftFromMatchEdit({
      matchId: 'match-early-morning',
      editable: true,
      lockedReason: null,
      form: {
        sportId: 'sport-futsal',
        regionId: 'region-gangnam',
        title: '새벽 축구 매치',
        imageUrl: null,
        startsAt: start.toISOString(),
        capacity: 10,
        manualPlaceName: '조기축구장',
      },
      status: 'recruiting',
      participantCount: 1,
      version: new Date().toISOString(),
    });

    expect(draft.date).toBe(expectedDate);
    expect(draft.startTime).toBe(expectedTime);
  });
});

// Regression: 매치 취소는 되돌리는 API가 없는 파괴적 동작이다 — 신청자 전원이 강제 취소되고
// 알림이 발송된다. '변경사항 저장' 바로 아래 붙은 전폭 버튼이라 오탭 가능성이 높은데도
// 확인 절차 없이 한 번의 탭으로 즉시 실행되던 결함(finding #33)의 회귀 테스트.
describe('MatchEditPageClient — cancel confirmation', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('매치 취소 버튼을 눌러도 확인 전에는 취소 API를 호출하지 않는다', async () => {
    confirmMock.mockResolvedValue(false); // 사용자가 확인 모달에서 '취소'를 누른 경우
    render(<MatchEditPageClient matchId="match-edit-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '매치 취소' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(cancelMatchMutate).not.toHaveBeenCalled();
  });

  it('확인 모달에서 승인하면 그제서야 취소 API를 호출한다', async () => {
    confirmMock.mockResolvedValue(true);
    render(<MatchEditPageClient matchId="match-edit-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '매치 취소' }));

    await waitFor(() => {
      expect(cancelMatchMutate).toHaveBeenCalledWith(
        { reason: 'host_cancelled_from_v1_web' },
        expect.any(Object),
      );
    });
  });
});
