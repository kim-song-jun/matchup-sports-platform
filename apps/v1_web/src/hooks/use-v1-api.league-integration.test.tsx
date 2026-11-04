import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  useV1AddPreviousSeasonTeams,
  useV1AdminLeagueMatch,
  useV1AdminLeagueMatchList,
  useV1AdminLeagueTeams,
  useV1CreateManualLeagueFixtures,
} from './use-v1-api';

const api = 'http://localhost/api/v1';
const server = setupServer();
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  client.clear();
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

it('adds returning teams, then batch fixtures, and refreshes the same league views', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  let teamIds: string[] = [];
  let fixtures: Array<{ teamMatchId: string }> = [];
  const payload = [{ homeTeamId: 'team-a', awayTeamId: 'team-b', startsAt: '2030-01-12T01:00:00.000Z' }];
  server.use(
    http.get(`${api}/admin/league-matches/league-1`, () =>
      HttpResponse.json({ status: 'success', data: { leagueId: 'league-1', teamIds, fixtures } })),
    http.get(`${api}/admin/league-matches/league-1/teams`, () =>
      HttpResponse.json({ status: 'success', data: { leagueId: 'league-1', teams: teamIds.map((teamId) => ({ teamId })) } })),
    http.get(`${api}/admin/league-matches`, () =>
      HttpResponse.json({ status: 'success', data: { items: [{ leagueId: 'league-1', teamCount: teamIds.length }] } })),
    http.post(`${api}/admin/league-matches/league-1/previous-season-teams`, async ({ request }) => {
      expect(await request.json()).toEqual({ teamIds: ['team-a', 'team-b'] });
      teamIds = ['team-a', 'team-b'];
      return HttpResponse.json({ status: 'success', data: { leagueId: 'league-1', teamIds, carriedPlayerCount: 12, hasExistingFixtures: false } });
    }),
    http.post(`${api}/admin/league-matches/league-1/fixtures/manual/batch`, async ({ request }) => {
      expect(await request.json()).toEqual({ fixtures: payload });
      fixtures = [{ teamMatchId: 'fixture-1' }];
      return HttpResponse.json({ status: 'success', data: { leagueId: 'league-1', teamMatchIds: ['fixture-1'] } });
    }),
  );
  const { result } = renderHook(() => ({
    detail: useV1AdminLeagueMatch('league-1'),
    teams: useV1AdminLeagueTeams('league-1'),
    list: useV1AdminLeagueMatchList(),
    addTeams: useV1AddPreviousSeasonTeams('league-1'),
    addFixtures: useV1CreateManualLeagueFixtures('league-1'),
  }), { wrapper });

  await waitFor(() => {
    expect(result.current.detail.data?.teamIds).toEqual([]);
    expect(result.current.teams.data?.teams).toEqual([]);
    expect(result.current.list.data?.items[0]?.teamCount).toBe(0);
  });
  result.current.addTeams.mutate(['team-a', 'team-b']);
  await waitFor(() => {
    expect(result.current.addTeams.data?.carriedPlayerCount).toBe(12);
    expect(result.current.detail.data?.teamIds).toEqual(['team-a', 'team-b']);
    expect(result.current.teams.data?.teams.map((team) => team.teamId)).toEqual(['team-a', 'team-b']);
    expect(result.current.list.data?.items[0]?.teamCount).toBe(2);
  });
  result.current.addFixtures.mutate(payload);
  await waitFor(() => {
    expect(result.current.addFixtures.data?.teamMatchIds).toEqual(['fixture-1']);
    expect(result.current.detail.data?.fixtures.map((fixture) => fixture.teamMatchId)).toEqual(['fixture-1']);
    expect(result.current.detail.data?.teamIds).toEqual(['team-a', 'team-b']);
    expect(result.current.list.data?.items[0]?.teamCount).toBe(2);
  });
});
