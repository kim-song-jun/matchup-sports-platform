import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { useV1GameLineups, useV1SaveTeamMatchLineup, useV1SubmitTeamMatchLineup, useV1TeamMatchLineup } from './use-v1-api';

const api = 'http://localhost/api/v1';
const teamMatchId = 'lineup-cache-match';
const gameId = 'lineup-cache-game';
const unrelatedGameId = 'unrelated-lineup-cache-game';
let revision = 1;
let gameLineupReads = 0;
let unrelatedReads = 0;
const clients: QueryClient[] = [];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
const lineupsFor = () => [{
  id: `lineup-revision-${revision}`,
  gameId,
  sideId: 'side-home',
  revision,
  state: 'DRAFT',
  participants: [{ id: `participant-revision-${revision}`, displayNameSnapshot: `선수 ${revision}`, userId: `user-${revision}` }],
}];
const server = setupServer(
  http.get(`${api}/team-matches/${teamMatchId}/lineup`, () => ok({
    teamMatchId, gameId, sideId: 'side-home', role: 'team_owner', lineupId: 'lineup-1', revision,
    state: 'DRAFT', version: revision, formation: null, publicLineupAt: null, starters: [], bench: [],
  })),
  http.get(`${api}/games/${gameId}/lineups`, () => {
    gameLineupReads += 1;
    return ok(lineupsFor());
  }),
  http.get(`${api}/games/${unrelatedGameId}/lineups`, () => {
    unrelatedReads += 1;
    return ok([{ id: 'unrelated-lineup', gameId: unrelatedGameId, sideId: 'unrelated-side', participants: [] }]);
  }),
  http.put(`${api}/team-matches/${teamMatchId}/lineup`, () => {
    revision += 1;
    return ok({ teamMatchId, gameId, sideId: 'side-home', lineupId: `lineup-${revision}`, revision, replayed: false });
  }),
  http.post(`${api}/team-matches/${teamMatchId}/lineup/submit`, () => {
    revision += 1;
    return ok({ teamMatchId, gameId, sideId: 'side-home', lineupId: `lineup-${revision}`, revision });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  revision = 1;
  gameLineupReads = 0;
  unrelatedReads = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

describe('team-match lineup mutation cache boundary', () => {
  it('refreshes the corresponding Game lineup after save and submit while preserving unrelated fresh data', async () => {
    const client = createV1QueryClient();
    clients.push(client);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({
      teamLineup: useV1TeamMatchLineup(teamMatchId),
      gameLineups: useV1GameLineups(gameId),
      unrelated: useV1GameLineups(unrelatedGameId),
      save: useV1SaveTeamMatchLineup(teamMatchId),
      submit: useV1SubmitTeamMatchLineup(teamMatchId),
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.teamLineup.isSuccess).toBe(true);
      expect(result.current.gameLineups.isSuccess).toBe(true);
      expect(result.current.unrelated.isSuccess).toBe(true);
    });
    const savePayload = { expectedVersion: 1, participants: [{ userId: 'user-2' }] };
    await act(async () => {
      await result.current.save.mutateAsync({ idempotencyKey: 'save-lineup-1', payload: savePayload });
    });
    await waitFor(() => expect(result.current.gameLineups.data?.[0]?.id).toBe('lineup-revision-2'));
    expect(gameLineupReads).toBe(2);
    expect(unrelatedReads).toBe(1);

    await act(async () => {
      await result.current.submit.mutateAsync({ idempotencyKey: 'submit-lineup-2', expectedVersion: 2 });
    });
    await waitFor(() => expect(result.current.gameLineups.data?.[0]?.id).toBe('lineup-revision-3'));
    expect(gameLineupReads).toBe(3);
    expect(unrelatedReads).toBe(1);
  });
});
