import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import { writeExpiringDraft } from '@/lib/expiring-draft';
import type { MatchCreateViewModel } from './matches.types';
import { draftFromMatchEdit, MatchCreatePageClient } from './matches-create-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { createMatchMutate, routerPush, uploadImagesMutateAsync } = vi.hoisted(() => ({
  createMatchMutate: vi.fn(),
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
});
