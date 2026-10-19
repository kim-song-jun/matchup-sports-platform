import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Get, v1Patch, v1Post } from '@/lib/api-client';
import { resolveTournamentRegistrationBlock } from '@/lib/tournament-registration-availability';
import type { V1AdminLeagueDetail, V1CreateLeaguePayload, V1CreateLeagueResult, V1PublicLeagueDetail } from '@/types/league-match';
import type { LeagueSettings, UpdateLeagueSettings } from '@/types/league-settings';
import { v1MswHandlers } from './handlers';

type CapacityCounts = { maxTeams: number | null; confirmedCount: number; pendingPaymentCount: number };
type CapacitySettings = LeagueSettings & Pick<CapacityCounts, 'maxTeams'>;
type CapacityCreate = V1CreateLeaguePayload & { maxTeams?: number | null };
type CapacityUpdate = UpdateLeagueSettings & { maxTeams?: number | null };

const collectionPath = '/admin/league-matches';
const reservedPath = `${collectionPath}/14500000-0000-4000-8000-000000000001`;
const commonSettings = {
  title: '참가팀 정원 검증 리그', rulesText: '', regionId: 'region-seoul-jongno',
  startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-12-31T00:00:00.000Z',
  registrationDeadlineAt: '2097-12-31T00:00:00.000Z', plannedFixtureCount: null,
};
const createPayload: CapacityCreate = {
  title: commonSettings.title, sportId: '14500000-0000-4000-8000-000000000010', regionId: commonSettings.regionId,
  startsOn: commonSettings.startsOn, endsOn: commonSettings.endsOn,
  teamIds: ['14500000-0000-4000-8000-000000000011', '14500000-0000-4000-8000-000000000012'], minPlayers: 2, maxPlayers: 4,
};
const server = setupServer(
  ...v1MswHandlers,
  // Only telemetry is intercepted here; league requests exercise the registered contract.
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

async function createLeague(changes: Partial<CapacityCreate> = {}) {
  const result = await v1Post<V1CreateLeagueResult>(collectionPath, { ...createPayload, ...changes });
  return `${collectionPath}/${result.leagueId}`;
}

describe('league capacity registered MSW HTTP contract', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.close();
    vi.unstubAllEnvs();
  });

  it('exposes nullable capacity and all-source counts on the existing admin GET', async () => {
    // Given: the existing visibility fixture has two seeded teams and no configured team cap.
    // When: the API consumer reads it through the registered handler array.
    const detail = await v1Get<V1AdminLeagueDetail & CapacityCounts>(`${collectionPath}/league-visibility-fixture`);
    // Then: absence is explicit and cannot inherit a legacy eight-team default.
    expect(detail).toMatchObject({ maxTeams: null, confirmedCount: 2, pendingPaymentCount: 0 });
  });

  it('counts seeded and promoted confirmations plus every reserved payment status', async () => {
    // Given: the fixture has seeded/promoted confirmed rows and three applied payment reservations.
    // When: the actual registered admin GET serializes the stored registration rows.
    const detail = await v1Get<V1AdminLeagueDetail & CapacityCounts>(reservedPath);
    // Then: applied-only operational counts cannot stand in for all-source occupancy.
    expect(detail).toMatchObject({ maxTeams: 5, confirmedCount: 2, pendingPaymentCount: 3, activeRegistrationCount: 3 });
    expect(resolveTournamentRegistrationBlock({ ...detail, kind: 'regular_league', status: 'open', teamCount: 8 }, new Date('2097-01-01T00:00:00.000Z'))).toBe('capacity_full');
  });

  it('keeps the public league counts aligned with admin occupancy', async () => {
    // Given: the same reserved fixture is public.
    // When: a public consumer reads its capacity.
    const detail = await v1Get<V1PublicLeagueDetail & CapacityCounts>('/league-matches/14500000-0000-4000-8000-000000000001');
    // Then: seeded/promoted teams and pending payments remain visible without admin-only fields.
    expect(detail).toMatchObject({ maxTeams: 5, confirmedCount: 2, pendingPaymentCount: 3 });
    expect(detail).not.toHaveProperty('activeRegistrationCount');
  });

  it('does not reserve capacity for submitted, waitlisted, draft or cancelled rows', async () => {
    // Given: another fixture has active submissions and a waitlist, with no reserved statuses.
    // When: the registered GET aggregates occupancy.
    const detail = await v1Get<V1AdminLeagueDetail & CapacityCounts>(`${collectionPath}/14500000-0000-4000-8000-000000000002`);
    // Then: an active application count does not fill the one-team cap.
    expect(detail).toMatchObject({ maxTeams: 1, confirmedCount: 0, pendingPaymentCount: 0, activeRegistrationCount: 2 });
    expect(resolveTournamentRegistrationBlock({ ...detail, kind: 'regular_league', status: 'open', teamCount: 8 }, new Date('2097-01-01T00:00:00.000Z'))).toBeNull();
  });

  it.each([undefined, null, 6])('persists created maxTeams independently of the player cap: %s', async (maxTeams) => {
    // Given: create accepts an omitted cap, explicit unlimited, or a finite positive cap.
    // When: the league is created through the same POST used by the mutation hook.
    const path = await createLeague(maxTeams === undefined ? {} : { maxTeams });
    // Then: a fresh GET exposes the stored team cap and unchanged per-team player limit.
    const detail = await v1Get<V1AdminLeagueDetail & CapacityCounts>(path);
    expect(detail).toMatchObject({ maxTeams: maxTeams ?? null, maxPlayers: 4, confirmedCount: 2, pendingPaymentCount: 0 });
  });

  it('rejects a create cap below the initially seeded team count', async () => {
    // Given: initial teamIds become confirmed seeded registrations.
    // When: a one-team cap is requested for two initial teams.
    const mutation = createLeague({ maxTeams: 1 });
    // Then: capacity failure remains a structured API error.
    await expect(mutation).rejects.toMatchObject({ statusCode: 409, code: 'TOURNAMENT_CAPACITY_FULL' } satisfies Partial<V1ApiError>);
  });

  it('keeps repeated settings GETs read-only', async () => {
    // Given: the fixture already has a stored cap and update timestamp.
    const before = await v1Get<CapacitySettings>(`${reservedPath}/settings`);
    // When: settings are read again.
    const after = await v1Get<CapacitySettings>(`${reservedPath}/settings`);
    // Then: reading cannot backfill a cap or mutate the OCC token.
    expect(before.maxTeams).toBe(5);
    expect(after).toEqual(before);
  });

  it.each([{}, { maxTeams: null }, { maxTeams: 7 }])('persists PATCH omission/null/finite semantics: %j', async (changes) => {
    // Given: an independently created league has six team places and a current OCC token.
    const path = await createLeague({ maxTeams: 6 });
    const before = await v1Get<CapacitySettings>(`${path}/settings`);
    // When: the settings consumer sends one complete editable snapshot.
    const result = await v1Patch<CapacitySettings>(`${path}/settings`, {
      ...commonSettings, expectedUpdatedAt: before.updatedAt, ...changes,
    } satisfies CapacityUpdate);
    // Then: omission preserves six, null removes the cap, and a number replaces it.
    const expected = 'maxTeams' in changes ? changes.maxTeams : 6;
    expect(result.maxTeams).toBe(expected);
    expect(result.updatedAt).not.toBe(before.updatedAt);
    expect(await v1Get<CapacitySettings>(`${path}/settings`)).toEqual(result);
    expect(await v1Get<V1AdminLeagueDetail & CapacityCounts>(path)).toMatchObject({ maxTeams: expected, maxPlayers: 4 });
  });

  it('rejects shrinking below all-source reservations without changing stored settings', async () => {
    // Given: five reserved places include seeded/promoted teams and all pending-payment statuses.
    const before = await v1Get<CapacitySettings>(`${reservedPath}/settings`);
    // When: the operator requests only four places with a fresh OCC token.
    const mutation = v1Patch<CapacitySettings>(`${reservedPath}/settings`, {
      ...commonSettings, expectedUpdatedAt: before.updatedAt, maxTeams: 4,
    } satisfies CapacityUpdate);
    // Then: the failure neither changes capacity nor advances updatedAt.
    await expect(mutation).rejects.toMatchObject({ statusCode: 409, code: 'LEAGUE_CAPACITY_BELOW_OCCUPANCY' } satisfies Partial<V1ApiError>);
    expect(await v1Get<CapacitySettings>(`${reservedPath}/settings`)).toEqual(before);
  });

  it('rejects a stale settings PATCH before changing capacity', async () => {
    // Given: a freshly created league has its own settings OCC token.
    const path = await createLeague({ maxTeams: 6 });
    const before = await v1Get<CapacitySettings>(`${path}/settings`);
    // When: a stale editor sends an otherwise valid unlimited setting.
    const mutation = v1Patch<CapacitySettings>(`${path}/settings`, {
      ...commonSettings, expectedUpdatedAt: '2026-01-01T00:00:00.000Z', maxTeams: null,
    } satisfies CapacityUpdate);
    // Then: OCC failure preserves both capacity and the last update timestamp.
    await expect(mutation).rejects.toMatchObject({ statusCode: 409, code: 'LEAGUE_SETTINGS_STALE' } satisfies Partial<V1ApiError>);
    expect(await v1Get<CapacitySettings>(`${path}/settings`)).toEqual(before);
  });
});
