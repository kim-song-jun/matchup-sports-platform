/**
 * 팀을 만든 뒤 팀매치 화면으로 돌아오면 새 팀이 곧바로 보여야 한다 — 팀 목록만이 아니라 내 팀 목록과
 * 팀매치 신청 가능 팀 목록도 다시 불러오는지 본다(무효화 호출 수가 아니라 v1Get 이 다시 불리는지).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get, v1Post };
});

import { useV1CreateTeam, useV1MyTeams, useV1TeamMatchEligibility } from './use-v1-api';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

const fetchCount = (path: string) => v1Get.mock.calls.filter(([p]) => p === path).length;

describe('팀 생성 뒤 캐시 갱신', () => {
  it('내 팀 목록과 팀매치 신청 가능 팀 목록을 다시 불러온다', async () => {
    v1Get.mockImplementation(async (path: string) => (path === '/me/teams' ? { items: [] } : { teams: [] }));
    v1Post.mockResolvedValue({ teamId: 'team-new', detailRoute: '/teams/team-new' });
    const { result } = renderHook(
      () => ({ myTeams: useV1MyTeams(), eligibility: useV1TeamMatchEligibility('tm-1'), create: useV1CreateTeam() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(fetchCount('/me/teams')).toBe(1));
    await waitFor(() => expect(fetchCount('/team-matches/tm-1/application-eligibility')).toBe(1));

    await result.current.create.mutateAsync({ name: '새 팀', sportId: 'sport-1', regionId: 'region-1' } as never);

    await waitFor(() => expect(fetchCount('/me/teams')).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(fetchCount('/team-matches/tm-1/application-eligibility')).toBeGreaterThanOrEqual(2));
  });
});
