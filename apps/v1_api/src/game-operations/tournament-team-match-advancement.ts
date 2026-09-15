import { Prisma } from '@prisma/client';
import { createTeamMatchScheduleInTx, MATCH_SCHEDULE_DEFAULT_DURATION_MS } from '../team-schedules/team-match-schedule';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';

type Tx = Prisma.TransactionClient;
type Side = 'HOME' | 'AWAY';
type Outcome = 'WINNER' | 'LOSER';

type MatchRow = {
  teamMatchId: string;
  tournamentId: string;
  status: string;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  hostTeamId: string | null;
  approvedApplicantTeamId: string | null;
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  gameId: string | null;
  gameState: string | null;
  homeSideId: string | null;
  awaySideId: string | null;
  homeSideTeamId: string | null;
  awaySideTeamId: string | null;
  homeSideDisplayName: string | null;
  awaySideDisplayName: string | null;
};

type Edge = {
  tournamentId: string;
  sourceTeamMatchId: string;
  sourceOutcome: Outcome;
  targetTeamMatchId: string;
  targetSide: Side;
};

type Registration = { id: string; tournamentId: string; status: string; teamId: string; teamName: string };

/**
 * Projects a canonical tournament TeamMatch result into its next Details rows.
 * Legacy fixture advancement remains owned by GameResultBracketProjectionService;
 * this helper only runs when the normalized row carries tournamentTeamMatchId.
 */
export async function projectCanonicalAdvancement(
  tx: Tx,
  revision: OfficialRevisionRow,
  score: OfficialScore,
): Promise<void> {
  if (revision.tournamentTeamMatchId === null || revision.tournamentId === null) return;
  const source = await lockMatch(tx, revision.tournamentId, revision.tournamentTeamMatchId);
  const edges = await lockEdges(tx, revision.tournamentId, source.teamMatchId);
  if (edges.length === 0) return;
  assertSource(source, revision.gameId, false);
  const registrations = await lockRegistrations(tx, revision.tournamentId, [source.homeRegistrationId!, source.awayRegistrationId!]);
  assertConfirmed(registrations, revision.tournamentId);
  assertSourceTeams(source, registrations);
  const winner = resolveWinnerSide(score);
  const winnerRegistration = winner === 'HOME' ? source.homeRegistrationId! : source.awayRegistrationId!;
  const loserRegistration = winner === 'HOME' ? source.awayRegistrationId! : source.homeRegistrationId!;
  const targetIds = [...new Set(edges.map((edge) => edge.targetTeamMatchId))].sort();
  const targets = await lockMatches(tx, revision.tournamentId, targetIds);
  const byId = new Map(targets.map((target) => [target.teamMatchId, target]));
  const registrationRows = await lockRegistrations(tx, revision.tournamentId, [winnerRegistration, loserRegistration, ...targetRegistrationIds(targets)]);
  assertConfirmed(registrationRows, revision.tournamentId);

  for (const edge of edges) {
    const target = byId.get(edge.targetTeamMatchId);
    if (target === undefined) throw new Error('BRACKET_TARGET_NOT_FOUND');
    if (edge.sourceTeamMatchId !== source.teamMatchId || edge.tournamentId !== source.tournamentId || target.tournamentId !== source.tournamentId || target.teamMatchId === source.teamMatchId) {
      throw new Error('BRACKET_TARGET_STATE_INVALID');
    }
    const desiredRegistrationId = edge.sourceOutcome === 'WINNER' ? winnerRegistration : loserRegistration;
    if (target.gameState !== 'SCHEDULED') {
      if (hasExactTargetAssignment(target, edge.targetSide, desiredRegistrationId, registrationRows)) continue;
      throw new Error('BRACKET_TARGET_STATE_INVALID');
    }
    assertTarget(edge, source, target);
    await assignTarget(tx, target, edge.targetSide, desiredRegistrationId, registrationRows);
  }
}

/**
 * Reprojects one correction in a single lock pass. The previous assignment is
 * compared while the source/edge/target rows are held, so correction callers do
 * not need to run reverse() followed by project() (which would create two draft
 * lineup revisions and two invalidation markers on the same side).
 */
export async function reprojectCanonicalAdvancement(
  tx: Tx,
  currentRevision: OfficialRevisionRow,
  currentScore: OfficialScore,
  previousRevision: OfficialRevisionRow,
  previousScore: OfficialScore,
): Promise<void> {
  if (
    currentRevision.tournamentTeamMatchId === null ||
    currentRevision.tournamentId === null ||
    previousRevision.tournamentTeamMatchId === null ||
    previousRevision.tournamentId === null
  ) return;
  if (
    currentRevision.tournamentTeamMatchId !== previousRevision.tournamentTeamMatchId ||
    currentRevision.tournamentId !== previousRevision.tournamentId ||
    currentRevision.gameId !== previousRevision.gameId
  ) {
    throw new Error('BRACKET_SOURCE_REPROJECTION_SCOPE_INVALID');
  }

  const source = await lockMatch(tx, currentRevision.tournamentId, currentRevision.tournamentTeamMatchId);
  const edges = await lockEdges(tx, currentRevision.tournamentId, source.teamMatchId);
  if (edges.length === 0) return;
  assertSource(source, currentRevision.gameId, false);
  const registrations = await lockRegistrations(tx, currentRevision.tournamentId, [source.homeRegistrationId!, source.awayRegistrationId!]);
  assertConfirmed(registrations, currentRevision.tournamentId);
  assertSourceTeams(source, registrations);

  const currentWinner = resolveWinnerSide(currentScore);
  const previousWinner = resolveWinnerSide(previousScore);
  const targetIds = [...new Set(edges.map((edge) => edge.targetTeamMatchId))].sort();
  const targets = await lockMatches(tx, currentRevision.tournamentId, targetIds);
  for (const registration of await lockRegistrations(tx, currentRevision.tournamentId, targetRegistrationIds(targets))) {
    if (!registrations.some((existing) => existing.id === registration.id)) registrations.push(registration);
  }
  const byId = new Map(targets.map((target) => [target.teamMatchId, target]));
  for (const edge of edges) {
    const target = byId.get(edge.targetTeamMatchId);
    if (target === undefined) throw new Error('BRACKET_TARGET_NOT_FOUND');
    const previousRegistrationId = edge.sourceOutcome === 'WINNER'
      ? (previousWinner === 'HOME' ? source.homeRegistrationId! : source.awayRegistrationId!)
      : (previousWinner === 'HOME' ? source.awayRegistrationId! : source.homeRegistrationId!);
    const desiredRegistrationId = edge.sourceOutcome === 'WINNER'
      ? (currentWinner === 'HOME' ? source.homeRegistrationId! : source.awayRegistrationId!)
      : (currentWinner === 'HOME' ? source.awayRegistrationId! : source.homeRegistrationId!);
    if (previousRegistrationId === desiredRegistrationId) {
      if (!hasExactTargetAssignment(target, edge.targetSide, desiredRegistrationId, registrations)) {
        throw new Error('BRACKET_TARGET_STATE_INVALID');
      }
      continue;
    }
    assertTarget(edge, source, target);
    const currentRegistrationId = edge.targetSide === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
    if (currentRegistrationId !== null && currentRegistrationId !== previousRegistrationId && currentRegistrationId !== desiredRegistrationId) {
      throw new Error('BRACKET_TARGET_SIDE_CONFLICT');
    }
    if (currentRegistrationId === desiredRegistrationId) {
      if (!hasExactTargetAssignment(target, edge.targetSide, desiredRegistrationId, registrations)) {
        throw new Error('BRACKET_TARGET_STATE_INVALID');
      }
      continue;
    }
    const registration = registrations.find((row) => row.id === desiredRegistrationId);
    if (registration === undefined) throw new Error('BRACKET_REGISTRATION_INVALID');
    await replaceTargetAssignment(tx, target, edge.targetSide, currentRegistrationId, registration, registrations);
  }
}

/** Reverses only assignments made by the superseded official revision. */
export async function reverseCanonicalAdvancement(
  tx: Tx,
  revision: OfficialRevisionRow,
  supersededScore: OfficialScore,
): Promise<void> {
  if (revision.tournamentTeamMatchId === null || revision.tournamentId === null) return;
  const source = await lockMatch(tx, revision.tournamentId, revision.tournamentTeamMatchId);
  const edges = await lockEdges(tx, revision.tournamentId, source.teamMatchId);
  if (edges.length === 0) return;
  assertSource(source, revision.gameId, true);
  const winner = resolveWinnerSide(supersededScore);
  const winnerRegistration = winner === 'HOME' ? source.homeRegistrationId! : source.awayRegistrationId!;
  const loserRegistration = winner === 'HOME' ? source.awayRegistrationId! : source.homeRegistrationId!;
  const targets = await lockMatches(tx, revision.tournamentId, [...new Set(edges.map((edge) => edge.targetTeamMatchId))].sort());
  const registrations = await lockRegistrations(tx, revision.tournamentId, [winnerRegistration, loserRegistration, ...targetRegistrationIds(targets)]);
  assertConfirmed(registrations, revision.tournamentId);
  assertSourceTeams(source, registrations);
  for (const edge of edges) {
    const target = targets.find((candidate) => candidate.teamMatchId === edge.targetTeamMatchId);
    if (target === undefined) throw new Error('BRACKET_TARGET_NOT_FOUND');
    const registrationId = edge.sourceOutcome === 'WINNER' ? winnerRegistration : loserRegistration;
    const current = edge.targetSide === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
    if (current === null) {
      if (hasExactClearedAssignment(target, edge.targetSide, registrations)) continue;
      throw new Error('BRACKET_TARGET_STATE_INVALID');
    }
    if (current !== registrationId) throw new Error('BRACKET_TARGET_SIDE_CONFLICT');
    assertTarget(edge, source, target);
    await clearTarget(tx, target, edge.targetSide, registrations);
  }
}

async function lockEdges(tx: Tx, tournamentId: string, sourceTeamMatchId: string): Promise<Edge[]> {
  return tx.$queryRaw<Edge[]>`
    SELECT tournament_id AS "tournamentId", source_team_match_id AS "sourceTeamMatchId",
           source_outcome::text AS "sourceOutcome", target_team_match_id AS "targetTeamMatchId",
           target_side::text AS "targetSide"
    FROM v1_tournament_match_advancement_edges
    WHERE tournament_id = ${tournamentId} AND source_team_match_id = ${sourceTeamMatchId}
    ORDER BY target_team_match_id ASC, target_side ASC, source_outcome ASC
    FOR UPDATE
  `;
}

async function lockMatch(tx: Tx, tournamentId: string, teamMatchId: string): Promise<MatchRow> {
  const rows = await lockMatches(tx, tournamentId, [teamMatchId]);
  const match = rows[0];
  if (match === undefined) throw new Error('BRACKET_SOURCE_NOT_FOUND');
  return match;
}

async function lockMatches(tx: Tx, tournamentId: string, ids: string[]): Promise<MatchRow[]> {
  if (ids.length === 0) return [];
  // Result review locks the source Game before invoking this helper. Never use
  // a multi-table FOR UPDATE join here: PostgreSQL may acquire those relation
  // locks in a plan-dependent order and deadlock with the review transaction.
  // Every caller therefore observes the same explicit Game -> Details ->
  // TeamMatch order, with IDs sorted inside each phase.
  const sortedIds = [...new Set(ids)].sort();
  const games = await tx.$queryRaw<Array<{ id: string; teamMatchId: string; gameState: string }>>`
    SELECT id, team_match_id AS "teamMatchId", state::text AS "gameState"
    FROM v1_games
    WHERE team_match_id IN (${Prisma.join(sortedIds)})
    ORDER BY id ASC
    FOR UPDATE
  `;
  const details = await tx.$queryRaw<Array<{
    teamMatchId: string;
    tournamentId: string;
    homeRegistrationId: string | null;
    awayRegistrationId: string | null;
  }>>`
    SELECT team_match_id AS "teamMatchId", tournament_id AS "tournamentId",
           home_registration_id AS "homeRegistrationId", away_registration_id AS "awayRegistrationId"
    FROM v1_tournament_match_details
    WHERE tournament_id = ${tournamentId}
      AND team_match_id IN (${Prisma.join(sortedIds)})
    ORDER BY team_match_id ASC
    FOR UPDATE
  `;
  const matches = await tx.$queryRaw<Array<{
    teamMatchId: string;
    tournamentId: string;
    status: string;
    hostTeamId: string | null;
    approvedApplicantTeamId: string | null;
    title: string;
    startAt: Date | null;
    endAt: Date | null;
  }>>`
    SELECT id AS "teamMatchId", tournament_id AS "tournamentId", status::text AS status,
           host_team_id AS "hostTeamId", approved_applicant_team_id AS "approvedApplicantTeamId",
           title, start_at AS "startAt", end_at AS "endAt"
    FROM v1_team_matches
    WHERE tournament_id = ${tournamentId}
      AND id IN (${Prisma.join(sortedIds)})
    ORDER BY id ASC
    FOR UPDATE
  `;

  const gameByMatchId = new Map(games.map((game) => [game.teamMatchId, game]));
  const detailsByMatchId = new Map(details.map((detail) => [detail.teamMatchId, detail]));
  const matchById = new Map(matches.map((match) => [match.teamMatchId, match]));
  const completeIds = sortedIds.filter((id) => gameByMatchId.has(id) && detailsByMatchId.has(id) && matchById.has(id));
  if (completeIds.length === 0) return [];

  const sides = await tx.$queryRaw<Array<{ id: string; gameId: string; sideKey: Side; teamId: string | null; displayName: string | null }>>`
    SELECT id, game_id AS "gameId", side_key::text AS "sideKey", team_id AS "teamId", display_name_snapshot AS "displayName"
    FROM v1_game_sides
    WHERE game_id IN (${Prisma.join(completeIds.map((id) => gameByMatchId.get(id)!.id))})
  `;
  const sideByGameAndKey = new Map(sides.map((side) => [`${side.gameId}:${side.sideKey}`, side]));

  return completeIds.map((id) => {
    const game = gameByMatchId.get(id)!;
    const detail = detailsByMatchId.get(id)!;
    const match = matchById.get(id)!;
    return {
      teamMatchId: detail.teamMatchId,
      tournamentId: detail.tournamentId,
      status: match.status,
      homeRegistrationId: detail.homeRegistrationId,
      awayRegistrationId: detail.awayRegistrationId,
      hostTeamId: match.hostTeamId,
      approvedApplicantTeamId: match.approvedApplicantTeamId,
      title: match.title,
      startAt: match.startAt,
      endAt: match.endAt,
      gameId: game.id,
      gameState: game.gameState,
      homeSideId: sideByGameAndKey.get(`${game.id}:HOME`)?.id ?? null,
      awaySideId: sideByGameAndKey.get(`${game.id}:AWAY`)?.id ?? null,
      homeSideTeamId: sideByGameAndKey.get(`${game.id}:HOME`)?.teamId ?? null,
      awaySideTeamId: sideByGameAndKey.get(`${game.id}:AWAY`)?.teamId ?? null,
      homeSideDisplayName: sideByGameAndKey.get(`${game.id}:HOME`)?.displayName ?? null,
      awaySideDisplayName: sideByGameAndKey.get(`${game.id}:AWAY`)?.displayName ?? null,
    };
  });
}

/**
 * Result officialization calls this before projection. Keep the lock order
 * identical to projection (Game -> Details -> TeamMatch) so a result writer
 * cannot race a bracket update or observe a half-created target.
 */
export async function assertCanonicalDownstreamScheduled(tx: Tx, sourceTeamMatchId: string): Promise<void> {
  const details = await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: sourceTeamMatchId }, select: { tournamentId: true } });
  if (details === null) return;
  const source = await lockMatch(tx, details.tournamentId, sourceTeamMatchId);
  const edges = await lockEdges(tx, details.tournamentId, sourceTeamMatchId);
  if (edges.length === 0) return;
  const targets = await lockMatches(tx, details.tournamentId, [...new Set(edges.map((edge) => edge.targetTeamMatchId))].sort());
  const byId = new Map(targets.map((target) => [target.teamMatchId, target]));
  for (const edge of edges) {
    const target = byId.get(edge.targetTeamMatchId);
    if (target === undefined) throw new Error('BRACKET_TARGET_NOT_FOUND');
    assertTarget(edge, source, target);
  }
}

async function lockRegistrations(tx: Tx, tournamentId: string, ids: string[]): Promise<Registration[]> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return [];
  return tx.$queryRaw<Registration[]>`
    SELECT registration.id, registration.tournament_id AS "tournamentId", registration.status::text AS status,
           registration.team_id AS "teamId", team.name AS "teamName"
    FROM v1_tournament_registrations registration
    INNER JOIN v1_teams team ON team.id = registration.team_id
    WHERE registration.tournament_id = ${tournamentId} AND registration.id IN (${Prisma.join(unique)})
    ORDER BY registration.id ASC
    FOR SHARE
  `;
}

function targetRegistrationIds(targets: MatchRow[]): string[] {
  return targets.flatMap((target) => [target.homeRegistrationId, target.awayRegistrationId])
    .filter((registrationId): registrationId is string => registrationId !== null);
}

function assertConfirmed(rows: Registration[], tournamentId: string): void {
  if (
    rows.length === 0 ||
    rows.some((row) => row.tournamentId !== tournamentId || row.status !== 'confirmed') ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    new Set(rows.map((row) => row.teamId)).size !== rows.length
  ) {
    throw new Error('BRACKET_REGISTRATION_INVALID');
  }
}

function assertSourceTeams(source: MatchRow, registrations: Registration[]): void {
  const home = registrations.find((row) => row.id === source.homeRegistrationId);
  const away = registrations.find((row) => row.id === source.awayRegistrationId);
  if (
    home === undefined ||
    away === undefined ||
    source.hostTeamId !== home.teamId ||
    source.approvedApplicantTeamId !== away.teamId
  ) {
    throw new Error('BRACKET_SOURCE_TEAM_INVALID');
  }
}

function assertSource(source: MatchRow, revisionGameId: string, allowCancelled: boolean): void {
  if (
    (!allowCancelled && source.status !== 'completed') ||
    (allowCancelled && source.status !== 'completed' && source.status !== 'cancelled') ||
    source.gameId !== revisionGameId ||
    source.gameState !== 'ENDED' ||
    source.homeRegistrationId === null ||
    source.awayRegistrationId === null ||
    source.homeRegistrationId === source.awayRegistrationId
  ) {
    throw new Error('BRACKET_SOURCE_STATE_INVALID');
  }
}

function assertTarget(edge: Edge, source: MatchRow, target: MatchRow): void {
  if (
    edge.sourceTeamMatchId !== source.teamMatchId ||
    edge.tournamentId !== source.tournamentId ||
    target.tournamentId !== source.tournamentId ||
    target.teamMatchId === source.teamMatchId ||
    target.status !== 'matched' ||
    target.gameState !== 'SCHEDULED' ||
    target.homeSideId === null || target.awaySideId === null
  ) {
    throw new Error('BRACKET_TARGET_STATE_INVALID');
  }
}

function hasExactTargetAssignment(
  target: MatchRow,
  side: Side,
  registrationId: string,
  registrations: Registration[],
): boolean {
  const registration = registrations.find((row) => row.id === registrationId);
  if (registration === undefined) return false;
  const assignedRegistrationId = side === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
  const assignedTeamId = side === 'HOME' ? target.hostTeamId : target.approvedApplicantTeamId;
  const gameSideTeamId = side === 'HOME' ? target.homeSideTeamId : target.awaySideTeamId;
  const gameSideDisplayName = side === 'HOME' ? target.homeSideDisplayName : target.awaySideDisplayName;
  const oppositeRegistrationId = side === 'HOME' ? target.awayRegistrationId : target.homeRegistrationId;
  const oppositeTeamId = side === 'HOME' ? target.approvedApplicantTeamId : target.hostTeamId;
  const oppositeGameSideTeamId = side === 'HOME' ? target.awaySideTeamId : target.homeSideTeamId;
  const oppositeIsTbd = oppositeRegistrationId === null && oppositeTeamId === null && oppositeGameSideTeamId === null;
  const oppositeIsValid = registrations.some(
    (row) => row.id === oppositeRegistrationId && row.teamId === oppositeTeamId && oppositeGameSideTeamId === row.teamId,
  );
  return (
    assignedRegistrationId === registrationId &&
    assignedTeamId === registration.teamId &&
    gameSideTeamId === registration.teamId &&
    gameSideDisplayName === registration.teamName &&
    oppositeRegistrationId !== registrationId &&
    oppositeTeamId !== registration.teamId &&
    oppositeGameSideTeamId !== registration.teamId &&
    (oppositeIsTbd || oppositeIsValid)
  );
}

function hasExactClearedAssignment(target: MatchRow, side: Side, registrations: Registration[]): boolean {
  const registrationId = side === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
  const teamId = side === 'HOME' ? target.hostTeamId : target.approvedApplicantTeamId;
  const gameSideTeamId = side === 'HOME' ? target.homeSideTeamId : target.awaySideTeamId;
  if (registrationId !== null || teamId !== null || gameSideTeamId !== null) return false;
  const oppositeRegistrationId = side === 'HOME' ? target.awayRegistrationId : target.homeRegistrationId;
  const oppositeTeamId = side === 'HOME' ? target.approvedApplicantTeamId : target.hostTeamId;
  const oppositeGameSideTeamId = side === 'HOME' ? target.awaySideTeamId : target.homeSideTeamId;
  const oppositeDisplayName = side === 'HOME' ? target.awaySideDisplayName : target.homeSideDisplayName;
  if (oppositeRegistrationId === null && oppositeTeamId === null && oppositeGameSideTeamId === null) return true;
  const opposite = registrations.find((row) => row.id === oppositeRegistrationId);
  return opposite !== undefined && oppositeTeamId === opposite.teamId && oppositeGameSideTeamId === opposite.teamId && oppositeDisplayName === opposite.teamName;
}

async function assignTarget(
  tx: Tx,
  target: MatchRow,
  side: Side,
  registrationId: string,
  registrations: Registration[],
): Promise<void> {
  const current = side === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
  const other = side === 'HOME' ? target.awayRegistrationId : target.homeRegistrationId;
  if ((current !== null && current !== registrationId) || other === registrationId) {
    throw new Error('BRACKET_TARGET_SIDE_CONFLICT');
  }
  const registration = registrations.find((row) => row.id === registrationId);
  if (registration === undefined) throw new Error('BRACKET_REGISTRATION_INVALID');
  const changed = current !== registrationId;
  if (changed) {
    await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: target.teamMatchId }, data: side === 'HOME' ? { homeRegistrationId: registrationId } : { awayRegistrationId: registrationId } });
    await tx.v1TeamMatch.update({ where: { id: target.teamMatchId }, data: side === 'HOME' ? { hostTeamId: registration.teamId } : { approvedApplicantTeamId: registration.teamId } });
    if (target.gameId !== null) {
      await invalidateTargetLineupAndTactics(tx, target.gameId, side === 'HOME' ? target.homeSideId : target.awaySideId);
      const sideId = side === 'HOME' ? target.homeSideId : target.awaySideId;
      if (sideId !== null) {
        await tx.v1GameSide.update({ where: { id: sideId }, data: { teamId: registration.teamId, displayNameSnapshot: registration.teamName } });
      }
      await tx.v1Game.update({ where: { id: target.gameId }, data: { version: { increment: 1 } } });
    }
  }
  await ensureTargetSchedule(tx, target, registration.teamId);
}

async function replaceTargetAssignment(
  tx: Tx,
  target: MatchRow,
  side: Side,
  previousRegistrationId: string | null,
  registration: Registration,
  registrations: Registration[],
): Promise<void> {
  const other = side === 'HOME' ? target.awayRegistrationId : target.homeRegistrationId;
  if (other === registration.id) throw new Error('BRACKET_TARGET_SIDE_CONFLICT');
  if (previousRegistrationId !== null) {
    const previous = registrations.find((row) => row.id === previousRegistrationId);
    if (previous !== undefined) {
      await tx.v1TeamSchedule.updateMany({
        where: { teamMatchId: target.teamMatchId, teamId: previous.teamId, state: 'SCHEDULED' },
        data: { state: 'CANCELLED', cancelReason: 'BRACKET_SOURCE_REVERSED', version: { increment: 1 } },
      });
    }
  }
  await tx.v1TournamentMatchDetails.update({
    where: { teamMatchId: target.teamMatchId },
    data: side === 'HOME' ? { homeRegistrationId: registration.id } : { awayRegistrationId: registration.id },
  });
  await tx.v1TeamMatch.update({
    where: { id: target.teamMatchId },
    data: side === 'HOME' ? { hostTeamId: registration.teamId } : { approvedApplicantTeamId: registration.teamId },
  });
  if (target.gameId !== null) {
    await invalidateTargetLineupAndTactics(tx, target.gameId, side === 'HOME' ? target.homeSideId : target.awaySideId);
    const sideId = side === 'HOME' ? target.homeSideId : target.awaySideId;
    if (sideId !== null) {
      await tx.v1GameSide.update({ where: { id: sideId }, data: { teamId: registration.teamId, displayNameSnapshot: registration.teamName } });
    }
    await tx.v1Game.update({ where: { id: target.gameId }, data: { version: { increment: 1 } } });
  }
  await ensureTargetSchedule(tx, target, registration.teamId);
}

async function clearTarget(tx: Tx, target: MatchRow, side: Side, registrations: Registration[]): Promise<void> {
  const current = side === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
  const registration = registrations.find((row) => row.id === current);
  await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: target.teamMatchId }, data: side === 'HOME' ? { homeRegistrationId: null } : { awayRegistrationId: null } });
  await tx.v1TeamMatch.update({ where: { id: target.teamMatchId }, data: side === 'HOME' ? { hostTeamId: null } : { approvedApplicantTeamId: null } });
  if (target.gameId !== null) {
    await invalidateTargetLineupAndTactics(tx, target.gameId, side === 'HOME' ? target.homeSideId : target.awaySideId);
    const sideId = side === 'HOME' ? target.homeSideId : target.awaySideId;
    if (sideId !== null) await tx.v1GameSide.update({ where: { id: sideId }, data: { teamId: null, displayNameSnapshot: 'TBD' } });
    await tx.v1Game.update({ where: { id: target.gameId }, data: { version: { increment: 1 } } });
  }
  if (registration !== undefined) {
    await tx.v1TeamSchedule.updateMany({ where: { teamMatchId: target.teamMatchId, teamId: registration.teamId, state: 'SCHEDULED' }, data: { state: 'CANCELLED', cancelReason: 'BRACKET_SOURCE_REVERSED', version: { increment: 1 } } });
  }
}

async function invalidateTargetLineupAndTactics(tx: Tx, gameId: string, sideId: string | null): Promise<void> {
  if (sideId === null) return;
  const lineups = await tx.v1GameLineup.findMany({ where: { gameId, sideId }, orderBy: { revision: 'desc' }, select: { id: true, revision: true, state: true } });
  const latest = lineups[0];
  if (lineups.length > 0) {
    // Preserve every historical lineup and participant row. Readers must be
    // able to distinguish an old submitted lineup from the newly created
    // draft, so invalidation is an explicit immutable marker rather than a
    // delete or a silent state reset.
    await tx.v1GameLineup.updateMany({
      where: { gameId, sideId, invalidatedAt: null },
      data: { invalidatedAt: new Date(), invalidationReason: 'SIDE_TEAM_CHANGED' },
    });
    await tx.v1GameLineup.create({ data: { gameId, sideId, revision: latest.revision + 1, state: 'DRAFT', supersedesId: latest.id } });
  }
  await tx.v1TeamTacticsBoard.deleteMany({ where: { gameId, sideId } });
}

async function ensureTargetSchedule(tx: Tx, target: MatchRow, teamId: string): Promise<void> {
  if (target.startAt === null) return;
  const existing = await tx.v1TeamSchedule.findUnique({ where: { teamId_teamMatchId: { teamId, teamMatchId: target.teamMatchId } }, select: { id: true, title: true, startAt: true, endAt: true, state: true, cancelReason: true } });
  if (existing === null) await createTeamMatchScheduleInTx(tx, teamId, target.teamMatchId, target.title, target.startAt, target.endAt);
  else {
    const endAt = target.endAt ?? new Date(target.startAt.getTime() + MATCH_SCHEDULE_DEFAULT_DURATION_MS);
    if (existing.title !== target.title || existing.startAt.getTime() !== target.startAt.getTime() || existing.endAt.getTime() !== endAt.getTime() || existing.state !== 'SCHEDULED' || existing.cancelReason !== null) {
      await tx.v1TeamSchedule.update({ where: { id: existing.id }, data: { title: target.title, startAt: target.startAt, endAt, state: 'SCHEDULED', cancelReason: null, version: { increment: 1 } } });
    }
  }
}

function resolveWinnerSide(score: OfficialScore): Side {
  if (score.home !== score.away) return score.home > score.away ? 'HOME' : 'AWAY';
  if (score.penalties !== undefined && score.penalties.home !== score.penalties.away) {
    return score.penalties.home > score.penalties.away ? 'HOME' : 'AWAY';
  }
  throw new Error('BRACKET_RESULT_DRAW_UNSUPPORTED');
}
