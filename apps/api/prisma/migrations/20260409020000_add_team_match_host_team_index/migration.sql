-- Add composite index on team_matches for teamId-based filtering and sorting
CREATE INDEX IF NOT EXISTS "team_matches_host_team_id_status_match_date_idx"
  ON "team_matches" ("host_team_id", "status", "match_date");
