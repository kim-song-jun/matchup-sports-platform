import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Api, v1Get, v1Patch, v1Post } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { v1Keys } from '@/lib/query-keys';
import type { V1Profile } from '@/types/api';
import {
  useV1AdminTournamentReviews,
  useV1ChatRooms,
  useV1HideReview,
  useV1MyRegistration,
  useV1ResolveChatRoom,
  useV1RosterDeadlineOverrideGrant,
  useV1RosterDeadlineOverrideRevoke,
  useV1SubmitReview,
  useV1UnhideReview,
  useV1UpdateProfile,
} from './use-v1-api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    v1Get: vi.fn(),
    v1Patch: vi.fn(),
    v1Post: vi.fn(),
    v1Api: vi.fn(),
  };
});

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

const v1GetMock = vi.mocked(v1Get);
const v1PatchMock = vi.mocked(v1Patch);
const v1PostMock = vi.mocked(v1Post);
const v1ApiMock = vi.mocked(v1Api);
const trackEventMock = vi.mocked(trackEvent);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** Same as createWrapper(), but also exposes the QueryClient so tests can spy on invalidateQueries. */
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  const wrapper = function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

  return { wrapper, queryClient };
}

describe('useV1MyRegistration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the protected my-registration endpoint when disabled', () => {
    const { result } = renderHook(
      () => useV1MyRegistration('tournament-1', { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(v1GetMock).not.toHaveBeenCalled();
  });

  it('keeps the default my-registration query enabled for authenticated flows', async () => {
    v1GetMock.mockResolvedValue({ id: 'registration-1', status: 'confirmed' });

    const { result } = renderHook(
      () => useV1MyRegistration('tournament-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1GetMock).toHaveBeenCalledWith('/tournaments/tournament-1/registrations/my-registration');
  });
});

describe('useV1ChatRooms', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the protected chat endpoint when the viewer is signed out', () => {
    // Given: the public home response identified the viewer as signed out.
    const { result } = renderHook(() => useV1ChatRooms({ enabled: false }), {
      wrapper: createWrapper(),
    });

    // When: React Query settles the disabled chat query.

    // Then: no protected request is made and the query remains idle.
    expect(result.current.fetchStatus).toBe('idle');
    expect(v1GetMock).not.toHaveBeenCalled();
  });
});

describe('useV1AdminTournamentReviews', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests the tournament review moderation list with the exact page/pageSize/search params', async () => {
    v1GetMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const { result } = renderHook(
      () => useV1AdminTournamentReviews('tournament-1', { page: 2, pageSize: 20, search: '욕설' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1GetMock).toHaveBeenCalledWith(
      '/admin/tournaments/tournament-1/reviews',
      { page: 2, pageSize: 20, search: '욕설' },
    );
  });
});

describe('useV1HideReview', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends the reason in the request body and invalidates the tournament review list on success', async () => {
    v1PatchMock.mockResolvedValue({ alreadyHidden: false });
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useV1HideReview('tournament-1'), { wrapper });

    result.current.mutate({ reviewId: 'review-1', reason: '욕설 신고' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1PatchMock).toHaveBeenCalledWith(
      '/admin/tournaments/tournament-1/reviews/review-1/hide',
      { reason: '욕설 신고' },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin-tournament-reviews', 'tournament-1'],
    });
  });
});

describe('useV1UnhideReview', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends no request body and invalidates the tournament review list on success', async () => {
    v1PatchMock.mockResolvedValue({ alreadyVisible: false });
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useV1UnhideReview('tournament-1'), { wrapper });

    result.current.mutate({ reviewId: 'review-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1PatchMock).toHaveBeenCalledWith(
      '/admin/tournaments/tournament-1/reviews/review-1/unhide',
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin-tournament-reviews', 'tournament-1'],
    });
  });
});

describe('useV1RosterDeadlineOverrideGrant', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs with no body and invalidates the admin tournament lists + tournament detail on success', async () => {
    v1PostMock.mockResolvedValue({ id: 'reg-1', tournamentId: 'tournament-1' });
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useV1RosterDeadlineOverrideGrant(), { wrapper });

    result.current.mutate('reg-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1PostMock).toHaveBeenCalledWith('/admin/registrations/reg-1/roster-deadline-override');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'admin', 'tournaments'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'tournaments', 'tournament-1'],
    });
  });
});

describe('useV1RosterDeadlineOverrideRevoke', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('DELETEs with no body and invalidates the admin tournament lists + tournament detail on success', async () => {
    v1ApiMock.mockResolvedValue({ id: 'reg-1', tournamentId: 'tournament-1' });
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useV1RosterDeadlineOverrideRevoke(), { wrapper });

    result.current.mutate('reg-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1ApiMock).toHaveBeenCalledWith(
      '/admin/registrations/reg-1/roster-deadline-override',
      { method: 'DELETE' },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'admin', 'tournaments'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'tournaments', 'tournament-1'],
    });
  });
});

describe('useV1ResolveChatRoom', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tracks chat_room_start with the resolved room type when a new room is created', async () => {
    v1PostMock.mockResolvedValue({ roomId: 'room-1', roomType: 'team_match', created: true, route: '/chat/room-1' });
    const { wrapper } = createWrapperWithClient();

    const { result } = renderHook(() => useV1ResolveChatRoom(), { wrapper });

    result.current.mutate({ targetType: 'team_match', targetId: 'tm-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(trackEventMock).toHaveBeenCalledWith('chat_room_start', { type: 'team_match' });
  });

  it('does not track chat_room_start when an existing room is merely reopened', async () => {
    v1PostMock.mockResolvedValue({ roomId: 'room-1', roomType: 'match', created: false, route: '/chat/room-1' });
    const { wrapper } = createWrapperWithClient();

    const { result } = renderHook(() => useV1ResolveChatRoom(), { wrapper });

    result.current.mutate({ targetType: 'match', targetId: 'm-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(trackEventMock).not.toHaveBeenCalled();
  });
});

describe('useV1SubmitReview', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tracks review_submit with the target type on a fresh submission', async () => {
    v1PostMock.mockResolvedValue({
      review: { reviewId: 'review-1' },
      alreadySubmitted: false,
    });
    const { wrapper } = createWrapperWithClient();

    const { result } = renderHook(() => useV1SubmitReview(), { wrapper });

    result.current.mutate({
      sourceType: 'match',
      sourceId: 'match-1',
      targetType: 'user',
      targetUserId: 'user-1',
      targetTeamId: null,
      rating: 5,
      tagCodes: ['friendly'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(trackEventMock).toHaveBeenCalledWith('review_submit', { targetType: 'user' });
  });

  it('does not track review_submit for an idempotent re-submission', async () => {
    v1PostMock.mockResolvedValue({
      review: { reviewId: 'review-1' },
      alreadySubmitted: true,
    });
    const { wrapper } = createWrapperWithClient();

    const { result } = renderHook(() => useV1SubmitReview(), { wrapper });

    result.current.mutate({
      sourceType: 'match',
      sourceId: 'match-1',
      targetType: 'team',
      targetUserId: null,
      targetTeamId: 'team-1',
      rating: 5,
      tagCodes: ['friendly'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(trackEventMock).not.toHaveBeenCalled();
  });
});

describe('useV1UpdateProfile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reflects the saved nickname in the profile cache immediately, without waiting for a background refetch', async () => {
    const initialProfile: V1Profile = {
      userId: 'user-1',
      accountStatus: 'active',
      email: 'user@test.com',
      authProvider: 'email',
      regionName: '서울',
      profile: {
        displayName: '실명유저',
        realName: '실명유저',
        nickname: '이전닉네임',
        profileImageUrl: null,
        gender: 'male',
      },
      reputation: { trustState: 'sample', mannerScore: null, activityCount: 0, reviewCount: 0 },
    };

    const { wrapper, queryClient } = createWrapperWithClient();
    queryClient.setQueryData(v1Keys.profile(), initialProfile);

    v1PatchMock.mockResolvedValue({
      profile: { ...initialProfile.profile, nickname: '새닉네임' },
      updatedAt: '2026-07-23T00:00:00.000Z',
    });

    const { result } = renderHook(() => useV1UpdateProfile(), { wrapper });

    result.current.mutate({ nickname: '새닉네임', gender: 'male' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // invalidateQueries만으론 백그라운드 리페치가 끝나기 전에 호출부가 다음 화면으로
    // 이동해 버려 저장 직후 이전 닉네임이 잠깐(혹은 리페치 실패 시 계속) 보였다 —
    // 응답으로 캐시를 직접 갱신해 새 닉네임이 동기적으로 반영돼야 한다.
    expect(queryClient.getQueryData<V1Profile>(v1Keys.profile())?.profile.nickname).toBe('새닉네임');
  });
});
