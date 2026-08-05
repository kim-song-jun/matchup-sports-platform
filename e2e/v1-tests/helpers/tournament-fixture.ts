import { createHash, randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { apiGet, apiPost, commandId, unwrap } from './v1-http';
import { acquireGameTakeover } from './ws-takeover';

/**
 * Provisions a real live-operations `V1Game` (source_type=TOURNAMENT_FIXTURE)
 * end-to-end over pure REST, and drives it through `start` -> `end` (which
 * derives + submits the game's first `V1GameResultRevision` -- tournament
 * fixtures can ONLY get a result revision through this command, never
 * through `POST /games/:gameId/result-revisions` directly, which 409s
 * `TOURNAMENT_RESULT_DERIVED_ONLY` for this sourceType, see
 * `GamesService.createResultRevision`/`submitResultRevision`).
 *
 * ## The admin bracket-publish chain (verified live, 2026-08-05)
 *
 * Three admin calls are enough to get a backing `V1Game`:
 *   1. `POST /admin/tournaments` `{ sportId, title, teamCount }`
 *   2. `POST /admin/tournaments/:id/fixtures` `{ round, fixtureNumber }` --
 *      this call ALONE creates the `V1Game` synchronously
 *      (`TournamentBracketService.createFixture` ->
 *      `GamesService.createFromSourceInTransaction`), not `publish-bracket`.
 *      `competitionConfigVersionId` is filled by a DB-generated default
 *      (`v1_default_competition_config_version()`), so no competition-config
 *      setup call is needed. Team registrations/`group-teams`/a group at all
 *      are NOT required either -- a team-less fixture is enough (sides get
 *      `teamId: null`, display names "홈 팀 미정"/"어웨이 팀 미정").
 *   3. `POST /admin/tournaments/:id/publish-bracket` `{}` -- flips visibility
 *      only; kept in the recipe for parity with the documented sequence, not
 *      because it is load-bearing for the `V1Game` row.
 *
 * `gameId` itself is resolved via
 * `GET tournament-ops/tournaments/:id/fixtures/:fixtureId/lineup`
 * (`TournamentFixtureLineupService.listLineups`) -- the one REST route whose
 * response carries the fixture -> game adapter's resolved id
 * (`{ gameId, lineups }`).
 *
 * ## The WS takeover blocker (resolved, 2026-08-05)
 *
 * `GamesController`'s `commands/:command` route (`start`/`pause`/`resume`/
 * `end`) unconditionally calls `GamesService.requireTakeover()` for a
 * TOURNAMENT_FIXTURE game, and a takeover grant is reachable ONLY through
 * the `/game-operations` Socket.IO namespace's `game.takeover.request`
 * handler (no REST equivalent exists) -- see `helpers/ws-takeover.ts` for the
 * exact handshake shape that unblocks this.
 */
const DEFAULT_ADMIN_EMAIL = 'admin@teameet.v1';

export type TournamentFixtureGame = {
  readonly tournamentId: string;
  readonly fixtureId: string;
  readonly gameId: string;
};

/**
 * Clears the `TERMS_RECONSENT_REQUIRED` gate (`V1AuthGuard`) for a persona by
 * accepting every currently-pending required signup document through the
 * real `POST /terms/consents` endpoint. Both `/terms/current` and
 * `/terms/consents` are explicitly exempted from the gate itself
 * (`terms-reconsent-access.ts`'s `isTermsReconsentRequestAllowed`), so this
 * never deadlocks against its own guard. Idempotent: a persona with nothing
 * pending is a no-op. Every persona used against a mutating v1 route in
 * these specs (not just the admin actor) needs this called once first --
 * `owner@teameet.v1` acting as a granted `tournament_director`, for example,
 * still 403s `TERMS_RECONSENT_REQUIRED` on every route otherwise.
 */
export async function ensureSignupTermsAccepted(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const current = await apiGet<{ items: { documentId: string; requiresAction: boolean }[] }>(
    request,
    '/api/v1/terms/current',
    { email, params: { context: 'signup' } },
  );
  const pending = unwrap<{ items: { documentId: string; requiresAction: boolean }[] }>(current)
    .items.filter((item) => item.requiresAction)
    .map((item) => item.documentId);
  if (pending.length === 0) return;

  const accepted = await apiPost(request, '/api/v1/terms/consents', {
    email,
    data: { documentIds: pending },
  });
  if (accepted.status >= 400) {
    throw new Error(`Failed to clear signup terms for ${email}: ${JSON.stringify(accepted.body)}`);
  }
}

export async function createTournamentFixtureGame(
  request: APIRequestContext,
  opts: { readonly adminEmail?: string; readonly titlePrefix?: string } = {},
): Promise<TournamentFixtureGame> {
  const adminEmail = opts.adminEmail ?? DEFAULT_ADMIN_EMAIL;
  await ensureSignupTermsAccepted(request, adminEmail);

  const sports = await apiGet<{ sports: { id: string }[] }>(request, '/api/v1/master/sports', {
    email: adminEmail,
  });
  const sportId = unwrap<{ sports: { id: string }[] }>(sports).sports[0]?.id;
  if (sportId === undefined) {
    throw new Error('master/sports returned no sports; cannot create a tournament fixture for this test');
  }

  const tournament = await apiPost<{ id: string }>(request, '/api/v1/admin/tournaments', {
    email: adminEmail,
    data: {
      sportId,
      title: `${opts.titlePrefix ?? 'E2E fixture'} ${randomUUID().slice(0, 8)}`,
      teamCount: 2,
    },
  });
  const tournamentId = unwrap<{ id: string }>(tournament).id;

  const fixture = await apiPost<{ id: string }>(
    request,
    `/api/v1/admin/tournaments/${tournamentId}/fixtures`,
    { email: adminEmail, data: { round: 'final', fixtureNumber: 1 } },
  );
  const fixtureId = unwrap<{ id: string }>(fixture).id;

  await apiPost(request, `/api/v1/admin/tournaments/${tournamentId}/publish-bracket`, {
    email: adminEmail,
    data: {},
  });

  const lineup = await apiGet<{ gameId: string }>(
    request,
    `/api/v1/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/lineup`,
    { email: adminEmail },
  );
  const gameId = unwrap<{ gameId: string }>(lineup).gameId;

  return { tournamentId, fixtureId, gameId };
}

/** Grants a tournament staff role over REST (`POST tournament-ops/tournaments/:id/staff`). */
export async function grantTournamentStaff(
  request: APIRequestContext,
  opts: {
    readonly tournamentId: string;
    readonly userId: string;
    readonly role: 'TOURNAMENT_DIRECTOR' | 'FIELD_OPERATOR' | 'SUPPORT_READONLY';
    readonly adminEmail?: string;
  },
): Promise<{ id: string; version: number }> {
  const granted = await apiPost<{ id: string; version: number }>(
    request,
    `/api/v1/tournament-ops/tournaments/${opts.tournamentId}/staff`,
    {
      email: opts.adminEmail ?? DEFAULT_ADMIN_EMAIL,
      idempotencyKey: commandId(),
      data: { userId: opts.userId, role: opts.role },
    },
  );
  return unwrap<{ id: string; version: number }>(granted);
}

/** Runs one `POST /games/:gameId/commands/:command` call with a fresh `clientCommandId`. */
export async function runGameCommand(
  request: APIRequestContext,
  opts: {
    readonly gameId: string;
    readonly command: 'start' | 'pause' | 'resume' | 'end';
    readonly email: string;
    readonly expectedVersion: number;
    readonly takeoverToken: string;
  },
) {
  const id = commandId();
  return apiPost(request, `/api/v1/games/${opts.gameId}/commands/${opts.command}`, {
    email: opts.email,
    idempotencyKey: id,
    data: {
      expectedVersion: opts.expectedVersion,
      clientCommandId: id,
      takeoverToken: opts.takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    },
  });
}

/**
 * Acquires a takeover, runs `start` then `end`, and returns the derived
 * SUBMITTED revision's id/eventsHash plus the game's resulting version.
 * `end` auto-derives the revision from the (empty, in these specs) event
 * log with `score: {home:0,away:0}` -- `supersede-and-submit` callers must
 * reuse that same all-zero score, since `validateGameResultInvariants`
 * 422s `SCORE_EVENT_MISMATCH` against any score that doesn't match the
 * actual appended goal events.
 */
export async function endGameToSubmittedRevision(
  request: APIRequestContext,
  opts: { readonly gameId: string; readonly email: string },
): Promise<{ readonly revisionId: string; readonly gameVersion: number; readonly eventsHash: string }> {
  const takeover = await acquireGameTakeover(opts.email, opts.gameId);
  try {
    const start = await runGameCommand(request, {
      gameId: opts.gameId,
      command: 'start',
      email: opts.email,
      expectedVersion: 0,
      takeoverToken: takeover.grant.takeoverToken,
    });
    const started = unwrap<{ version: number }>(start);

    const end = await runGameCommand(request, {
      gameId: opts.gameId,
      command: 'end',
      email: opts.email,
      expectedVersion: started.version,
      takeoverToken: takeover.grant.takeoverToken,
    });
    const ended = unwrap<{ version: number; revisionId: string }>(end);

    const revisions = await apiGet<{ id: string; eventsHash: string }[]>(
      request,
      `/api/v1/games/${opts.gameId}/result-revisions`,
      { email: opts.email },
    );
    const revision = unwrap<{ id: string; eventsHash: string }[]>(revisions).find(
      (row) => row.id === ended.revisionId,
    );
    if (revision === undefined) {
      throw new Error('Derived result revision was not found after the end command');
    }

    return { revisionId: ended.revisionId, gameVersion: ended.version, eventsHash: revision.eventsHash };
  } finally {
    takeover.close();
  }
}

/**
 * Server-identical canonical JSON + SHA-256 hash
 * (`GamesService.canonicalGameCommandPayloadHash` /
 * `TournamentResultReviewService.projectionPreviewHash`) -- reconstructable
 * by any caller from a revision's own `score`/`eventsHash`/`mvpParticipantId`,
 * exactly as `officialize`'s `projectionPreviewHash` confirmation demands.
 */
export function projectionPreviewHash(revision: {
  readonly score: unknown;
  readonly eventsHash: string;
  readonly mvpParticipantId: string | null;
}): string {
  return canonicalGameCommandPayloadHash({
    score: revision.score,
    eventsHash: revision.eventsHash,
    mvpParticipantId: revision.mvpParticipantId,
  });
}

function canonicalGameCommandPayloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}
