import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { createV1QueryClient } from '@/lib/query-client';
import { v1MswHandlers, v1TeamMatchRulesMsw } from '@/test/msw/handlers';
import { createV1TeamMatchRulesMswHandlers } from '@/test/msw/team-match-rules-handlers';
import type { V1TeamMatchMutationPayload } from '@/types/api';
import { useV1CreateTeamMatch, useV1TeamMatch, useV1TeamMatchRuleOptions } from './use-v1-api';

const api = 'http://localhost/api/v1';
const server = setupServer(
  ...v1MswHandlers,
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
const clients: QueryClient[] = [];
const basePayload: V1TeamMatchMutationPayload = {
  hostTeamId: 'team-1', sportId: 'sport-futsal', regionId: 'region-seoul',
  title: '경기 규칙 저장 확인', startsAt: '2027-01-20T11:00:00.000Z',
  manualPlaceName: '기존 풋살장',
};

function createWrapper() {
  const client = createV1QueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  clients.push(client);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  v1TeamMatchRulesMsw.reset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-01-19T10:00:00.000Z') });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(() => server.close());

describe('team-match rules shared HTTP contract', () => {
  it('keeps the actual route entity when reading an existing historical match', async () => {
    // Given: an existing match fixture with no immutable config pin.
    const { result } = renderHook(() => useV1TeamMatch('team-match-1'), { wrapper: createWrapper() });
    // When: the existing detail hook completes its actual HTTP read.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Then: entity identity is retained.
    expect(result.current.data).toMatchObject({ id: 'team-match-1', title: '마포 FC 상대팀 모집' });
  });

  it('reports null periods for historical matches instead of inventing a default pin', async () => {
    // Given: the pre-config historical fixture.
    const { result } = renderHook(() => useV1TeamMatch('team-match-1'), { wrapper: createWrapper() });
    // When: its detail is loaded.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Then: missing historical rules are explicit.
    expect(result.current.data).toMatchObject({ periods: null });
  });

  it('returns 404 for an unknown match instead of hydrating a different fixture', async () => {
    // Given: a route entity that does not exist.
    const { result } = renderHook(() => useV1TeamMatch('missing-mdqa141'), { wrapper: createWrapper() });
    // When: its actual detail request settles.
    await waitFor(() => expect(result.current.isPending).toBe(false));
    // Then: callers receive the real missing-entity error.
    expect(result.current.error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND_OR_ARCHIVED' });
  });

  it('returns the selected host team and its authoritative sport preset', async () => {
    // Given: the authorized existing futsal team.
    // When: rule options are read through the real API client.
    const options = await v1Get('/teams/team-1/team-match-rule-options');
    // Then: sport and durations come from that fixture, not the unrelated football match.
    expect(options).toMatchObject({
      hostTeamId: 'team-1', sportId: 'sport-futsal',
      competitionConfigVersionId: 'config-futsal-v1',
      periods: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
      ],
      twoPeriodDefaults: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
      ],
    });
  });

  it.each([
    {
      name: 'a published two-half history',
      twoPeriodDefaults: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
      ],
    },
    { name: 'no published two-half history', twoPeriodDefaults: null },
  ])('preserves the actual single-period default alongside $name', async ({ twoPeriodDefaults }) => {
    // Given: the real MSW transport receives a valid single-period config and explicit history authority.
    const singleHost = {
      hostTeamId: 'team-mdqa141-single', name: '단판 규칙 검증팀',
      sportId: 'sport-futsal', sportName: '풋살', managerUserId: 'user-1', active: true,
      competitionConfigVersionId: 'config-futsal-single-v2',
      periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }],
      twoPeriodDefaults,
    };
    server.use(...createV1TeamMatchRulesMswHandlers([], [singleHost]).handlers);
    // When: the actual rule-options hook completes its HTTP read.
    const { result } = renderHook(() => useV1TeamMatchRuleOptions(singleHost.hostTeamId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Then: current duration stays single and the independent two-half authority is preserved, including null.
    expect(result.current.data).toMatchObject({
      hostTeamId: 'team-mdqa141-single', competitionConfigVersionId: 'config-futsal-single-v2',
      periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }],
      twoPeriodDefaults,
    });
  });

  it('rejects rule options for a host the current user cannot manage', async () => {
    // Given: a different host without an authorized membership.
    // When: its rules are requested.
    const request = v1Get('/teams/other-host-mdqa141/team-match-rule-options');
    // Then: no preset is silently substituted.
    await expect(request).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' });
  });

  it.each([
    { name: 'a single period', periods: [{ durationMinutes: 37 }], expected: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }] },
    { name: 'the PostgreSQL integer maximum', periods: [{ durationMinutes: 2147483647 }], expected: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 2147483647, extraTime: false }] },
    { name: 'two different halves', periods: [{ durationMinutes: 17 }, { durationMinutes: 23 }], expected: [{ code: 'FIRST_HALF', label: '전반', durationMinutes: 17, extraTime: false }, { code: 'SECOND_HALF', label: '후반', durationMinutes: 23, extraTime: false }] },
  ])('persists $name and reads the same pinned rules back', async ({ periods, expected }) => {
    // Given: the existing create hook and a supported host.
    const { result } = renderHook(() => useV1CreateTeamMatch(), { wrapper: createWrapper() });
    const payload = { ...basePayload, periods };
    // When: one real HTTP create operation is completed.
    let teamMatchId = '';
    await act(async () => { teamMatchId = (await result.current.mutateAsync(payload)).teamMatchId; });
    // Then: separate detail/edit/Game reads share the persisted rule pin.
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toMatchObject({ teamMatchId, gameId: expect.any(String) });
    });
    expect(await v1Get(`/team-matches/${teamMatchId}`)).toMatchObject({ teamMatchId, periods: expected });
    const edit = await v1Get<{ competitionConfigVersionId: string; form: { periods: unknown } }>(`/team-matches/${teamMatchId}/edit`);
    expect(edit.form.periods).toEqual(periods);
    const gameId = result.current.data?.gameId;
    expect(gameId).toEqual(expect.any(String));
    expect(await v1Get(`/games/${gameId}`)).toMatchObject({
      competitionConfigVersionId: edit.competitionConfigVersionId,
      periodDurations: periods.map(period => ({ ...period, extraTime: false })),
    });
  });

  it.each([
    { name: 'zero duration', periods: [{ durationMinutes: 0 }] },
    { name: 'fractional duration', periods: [{ durationMinutes: 1.5 }] },
    { name: 'three periods', periods: [{ durationMinutes: 10 }, { durationMinutes: 10 }, { durationMinutes: 10 }] },
  ])('rejects $name without reporting a saved match', async ({ periods }) => {
    // Given: an invalid rules request through the real mutation hook.
    const { result } = renderHook(() => useV1CreateTeamMatch(), { wrapper: createWrapper() });
    const payload = { ...basePayload, periods };
    const before = await v1Get<{ items: readonly { id: string }[] }>('/team-matches');
    // When: the write is attempted.
    await act(async () => {
      // Then: DTO validation remains a transport error, not mock success.
      await expect(result.current.mutateAsync(payload)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });
    expect(result.current.data).toBeUndefined();
    expect(await v1Get('/team-matches')).toMatchObject({ items: before.items });
  });
});
