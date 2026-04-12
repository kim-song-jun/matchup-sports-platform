import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean }) => unknown) => {
    const state = { isAuthenticated: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
  };

  return { api: mockApi };
});

import { api } from '@/lib/api';
import { useLessons, useMyLessonTickets, useVenueSchedule } from '../use-api';

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useLessons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated lesson list', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: {
        items: [
          {
            id: 'lesson-1',
            hostId: 'host-1',
            sportType: 'futsal',
            type: 'group',
            title: '주말 풋살 클래스',
            description: null,
            venueName: '강남 풋살파크',
            lessonDate: '2026-04-20',
            startTime: '10:00',
            endTime: '12:00',
            maxParticipants: 12,
            currentParticipants: 5,
            fee: 30000,
            levelMin: 1,
            levelMax: 3,
            status: 'open',
            coachName: null,
            coachBio: null,
          },
        ],
        nextCursor: null,
      },
    });

    const { result } = renderHook(() => useLessons(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/lessons', { params: undefined });
    expect(result.current.data?.items[0].title).toBe('주말 풋살 클래스');
  });
});

describe('useVenueSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns schedule slots for a venue', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: [
        {
          id: 'match-1',
          title: '주말 풋살 매치',
          sportType: 'futsal',
          status: 'recruiting',
          matchDate: '2026-04-21',
          startTime: '18:00',
          endTime: '20:00',
        },
      ],
    });

    const { result } = renderHook(() => useVenueSchedule('venue-1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/venues/venue-1/schedule');
    expect(result.current.data).toHaveLength(1);
  });

  it('surfaces error state when schedule fetch fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('schedule unavailable'));

    const { result } = renderHook(() => useVenueSchedule('venue-1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useMyLessonTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authenticated user ticket list', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: [
        {
          id: 'ticket-1',
          planId: 'plan-1',
          userId: 'user-1',
          lessonId: 'lesson-1',
          status: 'active',
          totalSessions: 10,
          usedSessions: 2,
          startDate: '2026-04-11',
          expiresAt: '2026-05-11',
          paidAmount: 80000,
          purchasedAt: '2026-04-11T09:00:00.000Z',
          plan: {
            id: 'plan-1',
            lessonId: 'lesson-1',
            name: '10회권',
            type: 'multi',
            price: 80000,
            isActive: true,
            sortOrder: 0,
          },
          lesson: {
            id: 'lesson-1',
            hostId: 'host-1',
            sportType: 'futsal',
            type: 'group_lesson',
            title: '주말 풋살 클래스',
            description: null,
            venueName: '강남 풋살파크',
            lessonDate: '2026-04-20',
            startTime: '10:00',
            endTime: '12:00',
            maxParticipants: 12,
            currentParticipants: 5,
            fee: 30000,
            levelMin: 1,
            levelMax: 3,
            status: 'open',
            coachName: null,
            coachBio: null,
          },
        },
      ],
    });

    const { result } = renderHook(() => useMyLessonTickets(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/lessons/tickets/me');
    expect(result.current.data?.[0].plan?.name).toBe('10회권');
  });
});
