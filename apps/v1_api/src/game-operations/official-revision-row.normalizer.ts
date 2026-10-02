import type { OfficialRevisionRow, OfficialRevisionRowRaw } from './game-result-official-projection.types';

/** Normalize only canonical TeamMatch result rows. */
export function normalizeOfficialRevisionRow(row: OfficialRevisionRowRaw): OfficialRevisionRow {
  if (row.sourceType !== 'TEAM_MATCH') {
    throw new Error(`Unsupported official result source type: ${row.sourceType}`);
  }
  if (row.teamMatchId === null) {
    throw new Error(`TeamMatch result ${row.revisionId} is missing its TeamMatch source`);
  }
  if (row.tournamentTeamMatchId !== null && row.tournamentTeamMatchId !== row.teamMatchId) {
    throw new Error(`TeamMatch result ${row.revisionId} has mismatched tournament details`);
  }
  if (row.tournamentTeamMatchId !== null && (row.detailsTournamentId === null || row.teamMatchTournamentId === null)) {
    throw new Error(`TeamMatch result ${row.revisionId} has incomplete tournament details`);
  }
  if (row.detailsTournamentId !== null && row.tournamentTeamMatchId === null) {
    throw new Error(`TeamMatch result ${row.revisionId} has orphan tournament details ownership`);
  }
  if (row.tournamentTeamMatchId !== null && row.detailsTournamentId !== row.teamMatchTournamentId) {
    throw new Error(`TeamMatch result ${row.revisionId} has conflicting tournament details ownership`);
  }
  if (row.tournamentTeamMatchId !== null && row.leagueId !== null) {
    throw new Error(`TeamMatch result ${row.revisionId} mixes league and tournament details ownership`);
  }
  if (row.teamMatchTournamentId !== null && row.leagueId !== null && row.teamMatchTournamentId !== row.leagueId) {
    throw new Error(`TeamMatch result ${row.revisionId} has mixed league ownership`);
  }
  if (row.teamMatchTournamentId !== null && row.tournamentTeamMatchId === null && row.leagueId === null) {
    throw new Error(`TeamMatch result ${row.revisionId} has orphan tournament ownership`);
  }
  return { ...row, tournamentId: row.tournamentTeamMatchId === null ? null : row.detailsTournamentId };
}
