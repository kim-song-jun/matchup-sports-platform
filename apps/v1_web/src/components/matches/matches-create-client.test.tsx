import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { MatchCreateViewModel } from './matches.types';
import { MatchCreatePageClient } from './matches-create-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { createMatchMutate, routerPush } = vi.hoisted(() => ({
  createMatchMutate: vi.fn(),
  routerPush: vi.fn(),
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
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
        <button type="button" onClick={form.onSubmit}>
          매치 만들기
        </button>
      </div>
    );
  },
}));

describe('MatchCreatePageClient — GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    createMatchMutate.mockImplementation((_payload, { onSuccess }) => {
      onSuccess({ matchId: 'match-new', detailRoute: '/matches/match-new' });
    });
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
    expect(trackEvent).toHaveBeenCalledWith('match_create_complete', { sportType: '풋살' });
  });
});
