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
import { mockLesson, mockLessonTicketPlan, mockLessonTicket } from '@/test/fixtures/lessons';
import { mockVenueScheduleSlot } from '@/test/fixtures/venues';

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
      data: { items: [mockLesson], nextCursor: null },
    });

    const { result } = renderHook(() => useLessons(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/lessons', { params: undefined });
    expect(result.current.data?.items[0].title).toBe(mockLesson.title);
  });
});

describe('useVenueSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns schedule slots for a venue', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: [mockVenueScheduleSlot],
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
    const mockTicketWithPlan = {
      ...mockLessonTicket,
      plan: { ...mockLessonTicketPlan, name: '10회권', type: 'multi' as const, totalSessions: 10, price: 80000 },
      lesson: mockLesson,
    };
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: [mockTicketWithPlan],
    });

    const { result } = renderHook(() => useMyLessonTickets(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/lessons/tickets/me');
    expect(result.current.data?.[0].plan?.name).toBe('10회권');
  });
});
