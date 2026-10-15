import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Patch, v1Post } from '@/lib/api-client';
import { createV1QueryClient } from '@/lib/query-client';
import { v1MswHandlers, v1TeamMatchRulesMsw } from '@/test/msw/handlers';
import type { V1Game, V1TeamMatchEdit, V1TeamMatchMutationPayload, V1TeamMatchMutationResult } from '@/types/api';
import { useV1TeamMatchRuleOptions } from './use-v1-api';

const api = 'http://localhost/api/v1';
const server = setupServer(...v1MswHandlers,
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
const clients: QueryClient[] = [];
const payload: V1TeamMatchMutationPayload = {
  hostTeamId: 'team-1', sportId: 'sport-futsal', regionId: 'region-seoul',
  title: '저장 계약 검증', startsAt: '2027-01-20T11:00:00.000Z', manualPlaceName: '기존 풋살장',
};
function wrapper() {
  const client = createV1QueryClient();
  clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { v1TeamMatchRulesMsw.reset(); vi.stubEnv('NEXT_PUBLIC_API_URL', api); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); server.resetHandlers(); vi.unstubAllEnvs(); });
afterAll(() => server.close());

describe('team-match rules persisted mutation boundaries', () => {
  it('keeps the actual default on omitted create and keeps a custom pin on omitted edit', async () => {
    // Given: the legacy create body omits the optional periods property.
    const created = await v1Post<V1TeamMatchMutationResult>('/team-matches', payload);
    const route = `/team-matches/${created.teamMatchId}`;
    const original = await v1Get<V1TeamMatchEdit>(`${route}/edit`);
    expect(original).toMatchObject({ competitionConfigVersionId: 'config-futsal-v1', form: { periods: [{ durationMinutes: 20 }, { durationMinutes: 20 }] } });
    // When: rules are saved once and a subsequent general edit omits them.
    await v1Patch(route, { ...payload, version: original.version, periods: [{ durationMinutes: 37 }] });
    const custom = await v1Get<V1TeamMatchEdit>(`${route}/edit`);
    await v1Patch(route, { ...payload, version: custom.version, title: '제목만 변경', matchFormat: '5:5', matchStyle: ['친선'], uniformColor: '파랑' });
    // Then: actual pin and period remain intact while the other form fields persist.
    expect(await v1Get(`${route}/edit`)).toMatchObject({
      competitionConfigVersionId: custom.competitionConfigVersionId,
      form: { title: '제목만 변경', periods: [{ durationMinutes: 37 }], matchFormat: '5:5', matchStyle: ['친선'], uniformColor: '파랑' },
    });
    expect(await v1Get(`/games/${created.gameId}`)).toMatchObject({ competitionConfigVersionId: custom.competitionConfigVersionId, periodDurations: [{ durationMinutes: 37, extraTime: false }] });
  });

  it('repins a single period back to two halves on the same Game and rejects stale or different-host writes', async () => {
    // Given: a saved single-period match and its current version.
    const created = await v1Post<V1TeamMatchMutationResult>('/team-matches', { ...payload, periods: [{ durationMinutes: 37 }] });
    const route = `/team-matches/${created.teamMatchId}`;
    const original = await v1Get<V1TeamMatchEdit>(`${route}/edit`);
    // When: the same entity changes to distinct half durations.
    const updated = await v1Patch<V1TeamMatchMutationResult>(route, { ...payload, version: original.version, periods: [{ durationMinutes: 17 }, { durationMinutes: 23 }] });
    // Then: actual Game identity is retained, no stale or cross-host write changes the saved pin.
    expect(updated.gameId).toBe(created.gameId);
    const game = await v1Get<V1Game>(`/games/${created.gameId}`);
    expect(game.periodDurations).toEqual([{ durationMinutes: 17, extraTime: false }, { durationMinutes: 23, extraTime: false }]);
    expect(game.periods).toHaveLength(2);
    await expect(v1Patch(route, { ...payload, version: original.version, periods: [{ durationMinutes: 99 }] })).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' });
    await expect(v1Patch(route, { ...payload, version: updated.version, hostTeamId: 'team-mdqa141-football', periods: [{ durationMinutes: 99 }] })).rejects.toMatchObject({ statusCode: 409, code: 'STATE_CONFLICT' });
    expect(await v1Get(`/games/${created.gameId}`)).toEqual(game);
  });

  it.each([null, [], [37], [[{ durationMinutes: 37 }]], [{ durationMinutes: '37' }], [{ durationMinutes: true }], [{ durationMinutes: 37, code: 'EXTRA_TIME' }]].map(periods => ({ periods })))('rejects malformed nested periods %j without changing saved detail, edit or Game', async ({ periods }) => {
    // Given: an existing immutable pin and independent HTTP snapshots.
    const created = await v1Post<V1TeamMatchMutationResult>('/team-matches', { ...payload, periods: [{ durationMinutes: 37 }] });
    const route = `/team-matches/${created.teamMatchId}`;
    const edit = await v1Get<V1TeamMatchEdit>(`${route}/edit`);
    const detail = await v1Get(route);
    const game = await v1Get(`/games/${created.gameId}`);
    // When: a malformed JSON write reaches the DTO-shaped MSW boundary.
    await expect(v1Patch(route, { ...payload, version: edit.version, periods })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    // Then: neither a partial save nor a repin is reported by subsequent reads.
    expect(await v1Get(route)).toEqual(detail);
    expect(await v1Get(`${route}/edit`)).toEqual(edit);
    expect(await v1Get(`/games/${created.gameId}`)).toEqual(game);
  });

  it('exposes unsupported defaults and historical rules as unavailable instead of synthesizing durations', async () => {
    // Given: an unsupported host and a historical match with no config pin.
    await expect(v1Get('/teams/team-mdqa141-running/team-match-rule-options')).rejects.toMatchObject({ statusCode: 409, code: 'COMPETITION_CONFIG_REQUIRED' });
    const historic = await v1Get<V1TeamMatchEdit>('/team-matches/team-match-1/edit');
    // Then: the historical edit explicitly blocks a fabricated rule selection.
    expect(historic).toMatchObject({ rulesEditable: false, rulesLockedReason: 'COMPETITION_CONFIG_REQUIRED', competitionConfigVersionId: null, form: { periods: null } });
  });

  it.each(['startsAt', 'endsAt', 'deadlineAt'])('rejects malformed %s on create and edit without reporting a partial save', async field => {
    // Given: an existing persisted pin and the complete list before an invalid create.
    const created = await v1Post<V1TeamMatchMutationResult>('/team-matches', { ...payload, periods: [{ durationMinutes: 37 }] });
    const route = `/team-matches/${created.teamMatchId}`;
    const edit = await v1Get<V1TeamMatchEdit>(`${route}/edit`);
    const list = await v1Get('/team-matches');
    const game = await v1Get(`/games/${created.gameId}`);
    // When: a malformed date reaches the same real HTTP serializers.
    const invalid = { ...payload, [field]: 'not-a-date', periods: [{ durationMinutes: 99 }] };
    await expect(v1Post('/team-matches', invalid)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    await expect(v1Patch(route, { ...invalid, version: edit.version })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    // Then: no new row, general form save or Game repin can be observed.
    expect(await v1Get('/team-matches')).toEqual(list);
    expect(await v1Get(`${route}/edit`)).toEqual(edit);
    expect(await v1Get(`/games/${created.gameId}`)).toEqual(game);
  });

  it('isolates rule options by the selected host and exposes a denied host as an error', async () => {
    // Given: one mounted hook shared across successive selected host teams.
    const { result, rerender } = renderHook(({ host }) => useV1TeamMatchRuleOptions(host), { initialProps: { host: 'team-1' }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ hostTeamId: 'team-1', sportId: 'sport-futsal' });
    // When: the selected host changes, then changes to an unauthorized one.
    rerender({ host: 'team-mdqa141-football' });
    await waitFor(() => expect(result.current.data?.hostTeamId).toBe('team-mdqa141-football'));
    expect(result.current.data?.periods[0]?.durationMinutes).toBe(45);
    rerender({ host: 'other-host-mdqa141' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // Then: the previous host's successful data is not substituted for the denied response.
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' });
  });
});
