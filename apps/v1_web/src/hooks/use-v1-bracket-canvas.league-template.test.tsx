import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { V1ApplyLeagueTemplatePayload } from '@/types/league-match';
import { useV1ApplyLeagueTemplate } from './use-v1-bracket-canvas';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Post: vi.fn() };
});

const v1PostMock = vi.mocked(v1Post);

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const PAYLOAD: V1ApplyLeagueTemplatePayload = {
  teamCount: 4,
  legs: 2,
  schedule: { dates: ['2030-01-07', '2030-01-14'], time: '19:00' },
};

describe('useV1ApplyLeagueTemplate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('본문을 그대로 리그 템플릿 경로에 보내고 어드민·공개 리그 화면을 새로고침한다', async () => {
    v1PostMock.mockResolvedValue({ slots: 4, fixtures: 12 });
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('league-1'), { wrapper });

    result.current.mutate({ ...PAYLOAD, replaceExisting: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1PostMock).toHaveBeenCalledWith('/admin/league-matches/league-1/fixtures/template', {
      ...PAYLOAD,
      replaceExisting: true,
    });
    expect(result.current.data).toEqual({ slots: 4, fixtures: 12 });
    for (const queryKey of [
      v1Keys.adminLeagueMatch('league-1'),
      v1Keys.adminLeagueMatchList(),
      v1Keys.leagueMatches(),
      v1Keys.leagueMatch('league-1'),
      v1Keys.tournament('league-1'),
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('replaceExisting 을 안 주면 본문에 그 키가 없다 — 서버 DTO 는 모르는 키를 400 으로 거부한다', async () => {
    v1PostMock.mockResolvedValue({ slots: 4, fixtures: 12 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('league-1'), { wrapper });

    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(Object.keys(v1PostMock.mock.calls[0][1] as object)).toEqual(['teamCount', 'legs', 'schedule']);
  });

  it('서버가 거부하면 아무 화면도 새로고침하지 않는다 — 만들어지지 않은 대진을 다시 읽을 이유가 없다', async () => {
    v1PostMock.mockRejectedValue(new Error('LEAGUE_FIXTURES_EXIST'));
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('league-1'), { wrapper });

    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
