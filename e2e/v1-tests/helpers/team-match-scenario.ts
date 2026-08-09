import type { APIRequestContext } from '@playwright/test';
import { apiGet, apiPost, apiPut, commandId, unwrap } from './v1-http';

/**
 * Shared setup for E2E-TEAM-01 (opponent lineup change authorization) and
 * E2E-TEAM-02 (opponent result approval) — both scenarios need a real
 * `V1TeamMatch` -> `V1Game` pair with an approved opponent team, which only
 * exists after walking the full create -> apply -> approve command chain
 * (`apps/v1_api/src/team-matches/team-matches.service.ts`). There is no
 * fixture/seed shortcut: the default seed (`apps/v1_api/prisma/seed.ts`)
 * creates zero `V1Game` rows, and `POST /team-matches` always creates one
 * itself (`teamMatchGameSourceInput`) inside the same transaction as the
 * `V1TeamMatch` row, so a team match can never exist without its Game.
 *
 * Team choice is load-bearing, not arbitrary:
 * - `POST /team-matches` only accepts `sportId`s whose code resolves to
 *   `football`/`soccer`/`futsal` (`loadTeamMatchCreationSource`) — every
 *   other sport 409s `COMPETITION_CONFIG_REQUIRED` because only
 *   `football-v1`/`futsal-v1` `V1CompetitionConfigVersion` rows exist.
 *   Copilot review finding (PR #306): this used to say they're created by
 *   migration `20260729000200_v1_competition_config` DML and therefore exist
 *   regardless of which seed script ran — that stopped being true once Task 9's
 *   expand/contract split moved seeding out of migration.sql (DML is never
 *   additive under the alpha rollback gate) into
 *   `competition-config-backfill.cli.ts`'s `seedCompetitionConfigVersions()`.
 *   These rows exist here only because whatever stood up the target API
 *   server already ran that CLI (CI's migration replay gate does; alpha's
 *   `seed-alpha-tournament-qa.ts` does too) — not automatically from any
 *   seed script. `futsal-v1`'s `lineup` config is `{minPlayers:3,
 *   maxPlayers:6, substitutions:'rolling'}` (6 matches the '6:6' match-format
 *   preset — see competition-config.presets.ts), the smallest `minPlayers`
 *   requirement of the two, which is why futsal is selected below.
 * - The host team must have >=3 ACTIVE members to satisfy futsal's
 *   `minPlayers`. Per `apps/v1_api/prisma/seed.ts`, the team owned by
 *   `owner@teameet.v1` ("ownerTeam") has 4 active members (owner, manager,
 *   member, host personas) while the team owned by `host@teameet.v1`
 *   ("applicantTeam") has only 2 (host, applicant) — so `owner@teameet.v1`
 *   must be the HOST of the team match here, not `host@teameet.v1`, or the
 *   lineup save 409s `LINEUP_SIZE_INVALID`.
 * - `member@teameet.v1` is a plain `member` of "ownerTeam" and belongs to no
 *   other team match team here — i.e. active team membership WITHOUT
 *   owner/manager role — which both specs use as the "unauthorized actor"
 *   case (`TeamMatchLineupService.loadContext` / `GamesService.resolveActor`
 *   both gate on `role IN (owner, manager)`, not mere membership).
 */

export const HOST_EMAIL = 'owner@teameet.v1'; // owns "ownerTeam" (4 active members) -> HOME side
export const OPPONENT_EMAIL = 'host@teameet.v1'; // owns "applicantTeam" (2 active members) -> AWAY side
export const UNAUTHORIZED_EMAIL = 'member@teameet.v1'; // member (not owner/manager) of "ownerTeam" only

export type TeamMatchScenario = {
  readonly teamMatchId: string;
  readonly gameId: string;
  readonly hostTeamId: string;
  readonly opponentTeamId: string;
  readonly homeSideId: string;
  readonly homeStarterIds: readonly string[];
  readonly awaySideId: string;
  readonly awayParticipantIds: readonly string[];
};

type MyTeamItem = { teamId: string; role: string };
type MyTeamsResponse = { items: MyTeamItem[] };
type MasterSport = { id: string; code: string };
type MasterSportsResponse = { items: MasterSport[] };
type MasterRegion = { id: string; children?: readonly { id: string }[] };
type MasterRegionsResponse = { items: MasterRegion[] };
type TeamMembersResponse = { items: { userId: string; role: string }[] };

async function myManagedTeamId(request: APIRequestContext, email: string): Promise<string> {
  const result = await apiGet<MyTeamsResponse>(request, '/api/v1/me/teams', {
    email,
    params: { permission: 'manage_team' },
  });
  const { items } = unwrap<MyTeamsResponse>(result);
  const team = items[0];
  if (team === undefined) {
    throw new Error(`Persona ${email} has no owner/manager team membership; seed data assumption changed`);
  }
  return team.teamId;
}

async function futsalSportId(request: APIRequestContext): Promise<string> {
  const result = await apiGet<MasterSportsResponse>(request, '/api/v1/master/sports');
  const { items } = unwrap<MasterSportsResponse>(result);
  const futsal = items.find((sport) => sport.code.toLowerCase() === 'futsal');
  if (futsal === undefined) {
    throw new Error('master/sports has no futsal entry; cannot satisfy team-match creation config gate');
  }
  return futsal.id;
}

/** `validateMasterRefs` requires `level: 2` (a leaf/child region), not a top-level parent. */
async function leafRegionId(request: APIRequestContext): Promise<string> {
  const result = await apiGet<MasterRegionsResponse>(request, '/api/v1/master/regions');
  const { items } = unwrap<MasterRegionsResponse>(result);
  for (const region of items) {
    const child = region.children?.[0];
    if (child !== undefined) {
      return child.id;
    }
  }
  throw new Error('master/regions returned no level-2 child region; cannot satisfy team-match creation');
}

async function activeMemberIds(request: APIRequestContext, teamId: string, email: string): Promise<string[]> {
  const result = await apiGet<TeamMembersResponse>(request, `/api/v1/teams/${teamId}/members`, { email });
  const { items } = unwrap<TeamMembersResponse>(result);
  return items.map((item) => item.userId);
}

/**
 * Builds a fresh, isolated team match + Game with an approved opponent, and
 * saves+submits the HOME (host) side's lineup — the shared precondition both
 * E2E-TEAM-01 and E2E-TEAM-02 need. Returns every id downstream assertions
 * require. Cleanup is the caller's responsibility (see `cancelTeamMatch`
 * below) because the two specs diverge on whether a result gets submitted
 * (which flips the match to `completed`, a terminal state `cancel()`
 * rejects — see that helper's doc).
 */
export async function createApprovedTeamMatchWithHomeLineup(
  request: APIRequestContext,
): Promise<TeamMatchScenario> {
  const [sportId, regionId, hostTeamId, opponentTeamId] = await Promise.all([
    futsalSportId(request),
    leafRegionId(request),
    myManagedTeamId(request, HOST_EMAIL),
    myManagedTeamId(request, OPPONENT_EMAIL),
  ]);

  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const created = await apiPost(request, '/api/v1/team-matches', {
    email: HOST_EMAIL,
    data: {
      hostTeamId,
      sportId,
      regionId,
      title: `E2E 팀매치 ${commandId().slice(0, 8)}`,
      startsAt,
      manualPlaceName: 'E2E 테스트 구장',
    },
  });
  if (created.status !== 200 && created.status !== 201) {
    throw new Error(`POST /team-matches failed: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const teamMatch = unwrap<{ id: string }>(created);
  const teamMatchId = teamMatch.id;

  const application = await apiPost(request, `/api/v1/team-matches/${teamMatchId}/applications`, {
    email: OPPONENT_EMAIL,
    data: { applicantTeamId: opponentTeamId },
  });
  if (application.status !== 200 && application.status !== 201) {
    throw new Error(`POST .../applications failed: ${application.status} ${JSON.stringify(application.body)}`);
  }
  const applicationId = unwrap<{ id: string }>(application).id;

  const approved = await apiPost(request, `/api/v1/team-match-applications/${applicationId}/approve`, {
    email: HOST_EMAIL,
  });
  if (approved.status !== 200 && approved.status !== 201) {
    throw new Error(`.../approve failed: ${approved.status} ${JSON.stringify(approved.body)}`);
  }

  const homeMemberIds = await activeMemberIds(request, hostTeamId, HOST_EMAIL);
  if (homeMemberIds.length < 3) {
    throw new Error(`HOST team has ${homeMemberIds.length} active members; futsal-v1 needs >= 3`);
  }
  const [gk, p2, p3] = homeMemberIds;
  const saved = await apiPut(request, `/api/v1/team-matches/${teamMatchId}/lineup`, {
    email: HOST_EMAIL,
    idempotencyKey: commandId(),
    data: {
      expectedVersion: 0,
      starters: [
        { userId: gk, goalkeeper: true },
        { userId: p2, goalkeeper: false },
        { userId: p3, goalkeeper: false },
      ],
      bench: [],
    },
  });
  if (saved.status !== 200 && saved.status !== 201) {
    throw new Error(`PUT .../lineup (HOME save) failed: ${saved.status} ${JSON.stringify(saved.body)}`);
  }
  const savedLineup = unwrap<{ gameId: string; sideId: string; revision: number }>(saved);

  const submitted = await apiPost(request, `/api/v1/team-matches/${teamMatchId}/lineup/submit`, {
    email: HOST_EMAIL,
    idempotencyKey: commandId(),
    data: { expectedVersion: savedLineup.revision },
  });
  if (submitted.status !== 200 && submitted.status !== 201) {
    throw new Error(`POST .../lineup/submit (HOME) failed: ${submitted.status} ${JSON.stringify(submitted.body)}`);
  }
  const submittedLineup = unwrap<{ gameId: string; sideId: string }>(submitted);

  const homeLineupRead = unwrap<{ starters: { id: string }[] }>(
    await apiGet(request, `/api/v1/team-matches/${teamMatchId}/lineup`, { email: HOST_EMAIL }),
  );

  const awayLineupRead = unwrap<{ sideId: string; starters: { id: string }[] }>(
    await apiGet(request, `/api/v1/team-matches/${teamMatchId}/lineup`, { email: OPPONENT_EMAIL }),
  );

  return {
    teamMatchId,
    gameId: submittedLineup.gameId,
    hostTeamId,
    opponentTeamId,
    homeSideId: submittedLineup.sideId,
    homeStarterIds: homeLineupRead.starters.map((starter) => starter.id),
    awaySideId: awayLineupRead.sideId,
    awayParticipantIds: awayLineupRead.starters.map((starter) => starter.id),
  };
}

/**
 * Best-effort cleanup: `POST /team-matches/:id/cancel` covers every status
 * this suite can leave a match in EXCEPT `completed` — and E2E-TEAM-02
 * (unlike -01) deliberately drives the match to `completed` as its real
 * assertion target (`submitResultRevision` "atomically flips the TeamMatch
 * to `completed` on the first submission" — see
 * `apps/v1_api/src/games/games.service.ts`'s `assertTeamMatchMatched` doc).
 * There is no delete endpoint for a `V1TeamMatch`, so `completed` is treated
 * as an acceptable terminal state, not a cleanup failure: nothing about it
 * stays "active" (recruiting/open to further applications) for other tests
 * or personas to trip over.
 */
export async function cancelTeamMatch(request: APIRequestContext, teamMatchId: string): Promise<void> {
  const result = await apiPost(request, `/api/v1/team-matches/${teamMatchId}/cancel`, {
    email: HOST_EMAIL,
    data: { reason: 'e2e cleanup' },
  });
  const body = result.body as { code?: string };
  const acceptable =
    result.status === 200 ||
    result.status === 201 ||
    (result.status === 409 && (body.code === 'ALREADY_PROCESSED' || body.code === 'STATE_CONFLICT'));
  if (!acceptable) {
    throw new Error(`cleanup: POST .../cancel failed: ${result.status} ${JSON.stringify(result.body)}`);
  }
}
