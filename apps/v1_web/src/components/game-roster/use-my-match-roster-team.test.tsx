import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { V1_USER_ID_KEY } from '@/lib/session-storage';

const ME = 'user-me';
const api = vi.hoisted(() => ({
  myTeams: [] as Array<{ teamId: string; role: 'owner' | 'manager' | 'member' }>,
  /** 팀 id → 기준 명단 userId 목록. 없으면 404(이 경기 팀 아님), 'error' 면 500. */
  rosters: {} as Record<string, string[] | 'error'>,
  calls: [] as string[],
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  const failure = (statusCode: number) =>
    new actual.V1ApiError({ status: 'error', statusCode, code: 'X', message: 'x', timestamp: '' });
  return {
    ...actual,
    v1Get: vi.fn(async (path: string) => {
      api.calls.push(path);
      if (path === '/auth/me') return { user: { id: ME } };
      if (path === '/me/teams') return { items: api.myTeams.map((team) => ({ ...team, name: team.teamId })) };
      const teamId = /^\/teams\/([^/]+)\/games\/[^/]+\/roster$/.exec(path)?.[1];
      const roster = teamId === undefined ? undefined : api.rosters[teamId];
      if (roster === undefined) throw failure(404);
      if (roster === 'error') throw failure(500);
      return { base: roster.map((userId) => ({ userId })), participants: [] };
    }),
  };
});

import { useMyMatchRosterTeam } from './use-my-match-roster-team';

function render(teamIds: (string | null)[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useMyMatchRosterTeam({ teamIds, gameId: 'g1' }), { wrapper });
}

beforeEach(() => {
  window.localStorage.setItem(V1_USER_ID_KEY, ME);
  api.calls = [];
});
afterEach(() => window.localStorage.clear());

describe('useMyMatchRosterTeam', () => {
  it('참가팀이 비공개(두 팀 id 가 null)여도 내 팀 명단을 조회해 이 경기 팀을 찾는다', async () => {
    api.myTeams = [
      { teamId: 'team-x', role: 'owner' },
      { teamId: 'team-a', role: 'owner' },
    ];
    api.rosters = { 'team-a': [ME] };
    const { result } = render([null, null]);
    await waitFor(() => expect(result.current).toEqual({ status: 'resolved', teamId: 'team-a', gameId: 'g1', viewerUserId: ME }));
  });

  it('두 팀에 다 속하면 /me/teams 순서가 아니라 기준 명단에 내가 있는 팀을 고른다', async () => {
    api.myTeams = [
      { teamId: 'team-b', role: 'member' },
      { teamId: 'team-a', role: 'member' },
    ];
    api.rosters = { 'team-b': ['someone-else'], 'team-a': [ME] };
    const { result } = render(['team-b', 'team-a']);
    await waitFor(() => expect(result.current).toEqual({ status: 'resolved', teamId: 'team-a', gameId: 'g1', viewerUserId: ME }));
  });

  it('기준 명단에 없는 팀장도 자기 팀을 받는다 — 공개된 두 팀 밖의 내 팀은 조회하지 않는다', async () => {
    api.myTeams = [
      { teamId: 'team-other', role: 'owner' },
      { teamId: 'team-a', role: 'owner' },
    ];
    api.rosters = { 'team-a': ['p1', 'p2'] };
    const { result } = render(['team-h', 'team-a']);
    await waitFor(() => expect(result.current).toEqual({ status: 'resolved', teamId: 'team-a', gameId: 'g1', viewerUserId: ME }));
    expect(api.calls).not.toContain('/teams/team-other/games/g1/roster');
  });

  it('후보가 전부 404 면 우리 팀 카드가 없다', async () => {
    api.myTeams = [{ teamId: 'team-x', role: 'owner' }];
    api.rosters = {};
    const { result } = render([null, null]);
    await waitFor(() => expect(result.current).toEqual({ status: 'none' }));
  });

  it('404 가 아닌 실패가 있고 명단에 내가 있는 팀을 못 찾았으면 오류로 알린다', async () => {
    api.myTeams = [
      { teamId: 'team-a', role: 'member' },
      { teamId: 'team-b', role: 'member' },
    ];
    api.rosters = { 'team-a': 'error', 'team-b': ['someone-else'] };
    const { result } = render(['team-a', 'team-b']);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.status === 'error' && result.current.error).toBeInstanceOf(V1ApiError);
  });
});
