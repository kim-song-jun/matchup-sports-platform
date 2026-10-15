import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import type { V1TeamMatchUpdatePayload } from '@/types/api';
import { useV1Game, useV1TeamMatch, useV1TeamMatchEdit, useV1UpdateTeamMatch } from './use-v1-api';

const api = 'http://localhost/api/v1';
const matchId = 'rule-cache-match';
const gameId = 'rule-cache-game';
let savedDuration = 20;
let gameReads = 0;
let unrelatedGameReads = 0;
const clients: QueryClient[] = [];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
const server = setupServer(
  http.get(`${api}/team-matches/${matchId}`, () => ok({
    teamMatchId: matchId, gameId, title: '실제 규칙 캐시', status: 'recruiting',
    periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: savedDuration, extraTime: false }],
  })),
  http.get(`${api}/team-matches/${matchId}/edit`, () => ok({
    teamMatchId: matchId, editable: true, rulesEditable: true, lockedReason: null,
    rulesLockedReason: null, competitionConfigVersionId: `pin-${savedDuration}`,
    form: { periods: [{ durationMinutes: savedDuration }] }, status: 'recruiting', version: 'version-1',
  })),
  http.get(`${api}/games/${gameId}`, () => {
    gameReads += 1;
    return ok({ id: gameId, competitionConfigVersionId: `pin-${savedDuration}`, periodDurations: [{ durationMinutes: savedDuration, extraTime: false }] });
  }),
  http.get(`${api}/games/unrelated-rule-cache-game`, () => {
    unrelatedGameReads += 1;
    return ok({ id: 'unrelated-rule-cache-game', competitionConfigVersionId: 'unrelated-pin', periodDurations: [{ durationMinutes: 44, extraTime: false }] });
  }),
  http.patch(`${api}/team-matches/${matchId}`, async ({ request }) => {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('periods' in body) || !Array.isArray(body.periods)) {
      return HttpResponse.json({ status: 'error', statusCode: 400, code: 'INTERNAL_ERROR', message: '기간 입력이 필요해요.' }, { status: 400 });
    }
    const first: unknown = body.periods[0];
    if (typeof first !== 'object' || first === null || !('durationMinutes' in first) || typeof first.durationMinutes !== 'number') {
      return HttpResponse.json({ status: 'error', statusCode: 400, code: 'INTERNAL_ERROR', message: '시간 입력이 필요해요.' }, { status: 400 });
    }
    savedDuration = first.durationMinutes;
    return ok({ teamMatchId: matchId, gameId, status: 'recruiting', detailRoute: `/team-matches/${matchId}`, version: 'version-2' });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  savedDuration = 20;
  gameReads = 0;
  unrelatedGameReads = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

describe('team-match rules cache boundary', () => {
  it('refreshes pinned detail, edit and actual Game while preserving an unrelated fresh Game', async () => {
    // Given: mounted consumers using the production 60-second fresh cache.
    const client = createV1QueryClient();
    clients.push(client);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({
      detail: useV1TeamMatch(matchId), edit: useV1TeamMatchEdit(matchId),
      game: useV1Game(gameId), unrelated: useV1Game('unrelated-rule-cache-game'),
      update: useV1UpdateTeamMatch(matchId),
    }), { wrapper });
    await waitFor(() => {
      expect(result.current.detail.isSuccess).toBe(true);
      expect(result.current.edit.isSuccess).toBe(true);
      expect(result.current.game.isSuccess).toBe(true);
      expect(result.current.unrelated.isSuccess).toBe(true);
    });
    const payload: V1TeamMatchUpdatePayload & { periods: readonly { durationMinutes: number }[] } = {
      version: 'version-1', hostTeamId: 'team-1', sportId: 'sport-futsal', regionId: 'region-seoul',
      title: '실제 규칙 캐시', startsAt: '2027-01-20T11:00:00.000Z', manualPlaceName: '기존 구장',
      periods: [{ durationMinutes: 37 }],
    };
    // When: the actual update hook persists a different duration.
    await act(async () => { await result.current.update.mutateAsync(payload); });
    // Then: all consumers of the repinned match display the persisted value.
    await waitFor(() => {
      expect(result.current.detail.data).toMatchObject({ periods: [{ durationMinutes: 37 }] });
      expect(result.current.edit.data).toMatchObject({ form: { periods: [{ durationMinutes: 37 }] } });
      expect(result.current.game.data).toMatchObject({ competitionConfigVersionId: 'pin-37', periodDurations: [{ durationMinutes: 37 }] });
    });
    expect(gameReads).toBe(2);
    expect(unrelatedGameReads).toBe(1);
  });
});
