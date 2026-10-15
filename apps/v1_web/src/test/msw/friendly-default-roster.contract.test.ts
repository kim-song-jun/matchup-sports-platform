import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Post, v1Put } from '@/lib/api-client';
import type {
  V1Game,
  V1TeamMatchLineup,
  V1TeamMatchLineupSavePayload,
  V1TeamMatchLineupSaveResult,
  V1TeamMatchLineupSubmitResult,
} from '@/types/api';
import type { GameLineup } from '@/types/game-operations';

const ownPath = '/team-matches/team-match-1/lineup';
const gamePath = '/games/game-1';
let server: ReturnType<typeof setupServer>;

beforeEach(async () => {
  // Each scenario starts with the registered producer's untouched automatic draft.
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  const { v1MswHandlers } = await import('./handlers');
  server = setupServer(...v1MswHandlers);
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe('MD-QA #146 registered friendly-default MSW submit contract', () => {
  it('appends the actual current default when a human submits an untouched preview', async () => {
    // Given: the own GET displays a current default, with no saved human draft.
    const preview = await v1Get<V1TeamMatchLineup>(ownPath);
    const gameBefore = await v1Get<V1Game>(gamePath);
    expect(preview).toMatchObject({ state: 'DRAFT', effectiveRosterSource: 'DEFAULT_PREVIEW', hasSavedDraft: false });
    expect(preview.starters.length).toBeGreaterThan(1);

    // When: the real client submits exactly the displayed revision through the registered handler.
    const submitted = await v1Post<V1TeamMatchLineupSubmitResult>(`${ownPath}/submit`, {
      expectedVersion: preview.revision,
    }, { headers: { 'Idempotency-Key': '14600000-0000-4000-8000-000000000001' } });

    // Then: an append-only human submission advances CAS, preserving the displayed participant IDs.
    expect(submitted).toMatchObject({ state: 'SUBMITTED', revision: preview.revision + 1, version: preview.revision + 1 });
    expect(submitted.lineupId).not.toBe(preview.lineupId);
    const after = await v1Get<V1TeamMatchLineup>(ownPath);
    expect(after).toMatchObject({
      lineupId: submitted.lineupId, revision: submitted.revision, version: submitted.revision,
      state: 'SUBMITTED', effectiveRosterSource: 'MANUAL', hasSavedDraft: false,
      starters: preview.starters, bench: preview.bench, opponent: preview.opponent,
    });
    const lineups = await v1Get<GameLineup[]>(`${gamePath}/lineups`);
    expect(lineups.every((lineup) => lineup.sideId === preview.sideId)).toBe(true);
    const own = lineups.find((lineup) => lineup.id === submitted.lineupId);
    expect(own).toMatchObject({ revision: submitted.revision, state: 'SUBMITTED', supersedesId: preview.lineupId });
    expect(own?.participants.map(({ id, userId }) => ({ id, userId })))
      .toEqual(preview.starters.map(({ id, userId }) => ({ id, userId })));
    const gameAfter = await v1Get<V1Game>(gamePath);
    expect(gameAfter.lineups.filter((lineup) => lineup.sideId !== preview.sideId))
      .toEqual(gameBefore.lineups.filter((lineup) => lineup.sideId !== preview.sideId));
    expect(gameAfter.lineups.every((lineup) => !('participants' in lineup))).toBe(true);
  });

  it('submits a saved human subset in place instead of replacing it with the current default', async () => {
    // Given: a human saves one selected member from the untouched default.
    const preview = await v1Get<V1TeamMatchLineup>(ownPath);
    const participants = preview.starters.flatMap((participant) => participant.userId === null ? [] : [{
      userId: participant.userId,
      ...(participant.jerseyNumber === null ? {} : { jerseyNumber: participant.jerseyNumber }),
      goalkeeper: participant.goalkeeper,
    }]).slice(0, 1);
    expect(participants).toHaveLength(1);
    const saved = await v1Put<V1TeamMatchLineupSaveResult>(ownPath, {
      expectedVersion: preview.revision, participants,
    } satisfies V1TeamMatchLineupSavePayload, {
      headers: { 'Idempotency-Key': '14600000-0000-4000-8000-000000000002' },
    });
    const draft = await v1Get<V1TeamMatchLineup>(ownPath);
    expect(draft).toMatchObject({
      lineupId: saved.lineupId, revision: saved.revision, version: saved.revision,
      state: 'DRAFT', effectiveRosterSource: 'DEFAULT_PREVIEW', hasSavedDraft: true,
    });
    expect(draft.starters.map((participant) => participant.userId)).toEqual(participants.map((participant) => participant.userId));

    // When: the human submits that stored subset using its revision.
    const submitted = await v1Post<V1TeamMatchLineupSubmitResult>(`${ownPath}/submit`, {
      expectedVersion: draft.revision,
    }, { headers: { 'Idempotency-Key': '14600000-0000-4000-8000-000000000003' } });

    // Then: submit changes the existing draft state, keeping its CAS token and participant rows.
    expect(submitted).toMatchObject({
      lineupId: draft.lineupId, revision: draft.revision, version: draft.revision, state: 'SUBMITTED',
    });
    const after = await v1Get<V1TeamMatchLineup>(ownPath);
    expect(after).toMatchObject({
      lineupId: draft.lineupId, revision: draft.revision, version: draft.revision,
      state: 'SUBMITTED', effectiveRosterSource: 'MANUAL', hasSavedDraft: false,
      starters: draft.starters, bench: draft.bench, opponent: draft.opponent,
    });
    const lineups = await v1Get<GameLineup[]>(`${gamePath}/lineups`);
    expect(lineups.find((lineup) => lineup.id === draft.lineupId)?.participants.map(({ id, userId }) => ({ id, userId })))
      .toEqual(draft.starters.map(({ id, userId }) => ({ id, userId })));
  });

  it('keeps an already submitted manual revision unchanged on another authorized submit', async () => {
    // Given: an actual human submission has already produced a manual roster.
    const preview = await v1Get<V1TeamMatchLineup>(ownPath);
    await v1Post<V1TeamMatchLineupSubmitResult>(`${ownPath}/submit`, {
      expectedVersion: preview.revision,
    }, { headers: { 'Idempotency-Key': '14600000-0000-4000-8000-000000000004' } });
    const before = await v1Get<V1TeamMatchLineup>(ownPath);

    // When: a fresh command submits the current manual revision again.
    const replay = await v1Post<V1TeamMatchLineupSubmitResult>(`${ownPath}/submit`, {
      expectedVersion: before.revision,
    }, { headers: { 'Idempotency-Key': '14600000-0000-4000-8000-000000000005' } });

    // Then: no further revision, roster replacement, or public-time change occurs.
    expect(replay).toMatchObject({
      lineupId: before.lineupId, revision: before.revision, version: before.revision,
      state: before.state, publicLineupAt: before.publicLineupAt, replayed: false,
    });
    expect(await v1Get<V1TeamMatchLineup>(ownPath)).toEqual(before);
  });
});
