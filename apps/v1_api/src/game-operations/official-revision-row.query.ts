import { Prisma } from '@prisma/client';

/**
 * Shared SELECT (no WHERE — callers append their own) for building an
 * `OfficialRevisionRow`/`LockedOfficialRevisionRow` shape from
 * `v1_game_result_revisions` joined through its game, tournament fixture,
 * sides, and visibility policy.
 *
 * Extracted (outbox-handler + team-record-facts backfill task) so the exact
 * same column list is shared by two call sites that both need it:
 *   - `GameResultOfficialProjectionService.lockOfficialRevision` (the live
 *     worker path, keyed to one revisionId, `FOR UPDATE`)
 *   - `team-record-facts-backfill.ts` (the historical backfill, scanning
 *     every current-official revision missing a fact row, no lock)
 * Before this extraction the same 15-column SELECT existed twice; a future
 * column rename/addition only has to happen here now.
 */
export function officialRevisionRowSelect(): Prisma.Sql {
  return Prisma.sql`
    SELECT
      revision.id AS "revisionId",
      revision.game_id AS "gameId",
      revision.revision,
      revision.state::text AS state,
      revision.score,
      revision.events_hash AS "sourceHash",
      COALESCE(team_match.start_at, fixture.scheduled_at, revision.official_at) AS "playedAt",
      revision.official_at AS "officialAt",
      revision.reason,
      game.source_type::text AS "sourceType",
      game.current_official_revision_id AS "currentOfficialRevisionId",
      fixture.tournament_id AS "tournamentId",
      fixture.id AS "tournamentFixtureId",
      home_side.team_id AS "homeTeamId",
      away_side.team_id AS "awayTeamId",
      COALESCE(policy.mode, 'HIDDEN'::"V1VisibilityMode") AS visibility
    FROM v1_game_result_revisions revision
    INNER JOIN v1_games game ON game.id = revision.game_id
    LEFT JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
    LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
    LEFT JOIN v1_game_sides home_side ON home_side.game_id = game.id AND home_side.side_key = 'HOME'
    LEFT JOIN v1_game_sides away_side ON away_side.game_id = game.id AND away_side.side_key = 'AWAY'
    LEFT JOIN v1_game_visibility_policies policy ON policy.game_id = game.id
  `;
}
