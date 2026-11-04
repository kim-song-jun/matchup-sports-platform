import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AdminLeagueMatch,
  useV1AdminLeagueMatchList,
  useV1AdminLeagueTeams,
  useV1CancelRegistrationAdmin,
  useV1ConfirmRegistration,
} from './use-v1-api';

const api = 'http://localhost/api/v1';
let confirmed = false;
const reads = { league: 0, teams: 0, list: 0 };
const clients: QueryClient[] = [];

const server = setupServer(
  http.get(`${api}/admin/league-matches/league-1`, () => {
    reads.league += 1;
    return HttpResponse.json({
      status: 'success',
      data: { leagueId: 'league-1', teamIds: confirmed ? ['team-1'] : [] },
    });
  }),
  http.get(`${api}/admin/league-matches/league-1/teams`, () => {
    reads.teams += 1;
    return HttpResponse.json({
      status: 'success',
      data: {
        leagueId: 'league-1',
        teams: confirmed
          ? [{ teamId: 'team-1', name: '알파', status: 'active', memberCount: 6, logoUrl: null, registrationId: 'registration-1' }]
          : [],
      },
    });
  }),
  http.get(`${api}/admin/league-matches`, () => {
    reads.list += 1;
    return HttpResponse.json({
      status: 'success',
      data: {
        items: [{ leagueId: 'league-1', teamCount: confirmed ? 1 : 0 }],
      },
    });
  }),
  http.patch(`${api}/admin/registrations/registration-1/confirm`, () => {
    confirmed = true;
    return HttpResponse.json({ status: 'success', data: { tournamentId: 'league-1', alreadyProcessed: false } });
  }),
  http.patch(`${api}/admin/registrations/registration-1/cancel`, () => {
    confirmed = false;
    return HttpResponse.json({ status: 'success', data: { tournamentId: 'league-1', alreadyProcessed: false } });
  }),
  http.patch(`${api}/admin/registrations/tournament-registration-1/confirm`, () =>
    HttpResponse.json({ status: 'success', data: { tournamentId: 'tournament-1', alreadyProcessed: false } }),
  ),
);

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  confirmed = false;
  reads.league = 0;
  reads.teams = 0;
  reads.list = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

describe('MD-QA #200 — league team queries refresh after registration changes', () => {
  it('refreshes the league header and participant teams after confirmation', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => ({
      league: useV1AdminLeagueMatch('league-1'),
      teams: useV1AdminLeagueTeams('league-1'),
      list: useV1AdminLeagueMatchList(),
      confirm: useV1ConfirmRegistration(),
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.league.data?.teamIds).toEqual([]);
      expect(result.current.teams.data?.teams).toEqual([]);
      expect(result.current.list.data?.items[0]?.teamCount).toBe(0);
    });

    result.current.confirm.mutate({ registrationId: 'registration-1', decision: 'confirm' });

    await waitFor(() => {
      expect(result.current.league.data?.teamIds).toEqual(['team-1']);
      expect(result.current.teams.data?.teams.map((team) => team.teamId)).toEqual(['team-1']);
      expect(result.current.list.data?.items[0]?.teamCount).toBe(1);
    });
    expect(reads).toEqual({ league: 2, teams: 2, list: 2 });
  });

  it('removes the participant team from the header and roster after admin cancellation', async () => {
    confirmed = true;
    const wrapper = createWrapper();
    const { result } = renderHook(() => ({
      league: useV1AdminLeagueMatch('league-1'),
      teams: useV1AdminLeagueTeams('league-1'),
      list: useV1AdminLeagueMatchList(),
      cancel: useV1CancelRegistrationAdmin(),
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.league.data?.teamIds).toEqual(['team-1']);
      expect(result.current.teams.data?.teams.map((team) => team.teamId)).toEqual(['team-1']);
      expect(result.current.list.data?.items[0]?.teamCount).toBe(1);
    });

    result.current.cancel.mutate({ registrationId: 'registration-1', reason: '테스트 취소' });
    await waitFor(() => expect(result.current.cancel.isSuccess).toBe(true));
    expect(confirmed).toBe(false);

    await waitFor(() => {
      expect(result.current.league.data?.teamIds).toEqual([]);
      expect(result.current.teams.data?.teams).toEqual([]);
      expect(result.current.list.data?.items[0]?.teamCount).toBe(0);
    });
    expect(reads).toEqual({ league: 2, teams: 2, list: 2 });
  });

  it('does not change a league team count when a regular tournament registration is confirmed', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => ({
      league: useV1AdminLeagueMatch('league-1'),
      list: useV1AdminLeagueMatchList(),
      confirm: useV1ConfirmRegistration(),
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.league.data?.teamIds).toEqual([]);
      expect(result.current.list.data?.items[0]?.teamCount).toBe(0);
    });
    result.current.confirm.mutate({ registrationId: 'tournament-registration-1', decision: 'confirm' });
    await waitFor(() => expect(result.current.confirm.isSuccess).toBe(true));
    await waitFor(() => {
      expect(result.current.league.data?.teamIds).toEqual([]);
      expect(result.current.list.data?.items[0]?.teamCount).toBe(0);
    });
    expect(reads).toEqual({ league: 1, teams: 0, list: 2 });
  });
});
