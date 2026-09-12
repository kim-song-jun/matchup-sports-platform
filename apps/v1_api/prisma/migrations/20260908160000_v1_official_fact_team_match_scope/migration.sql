BEGIN;

-- Task 168: make the immutable official-fact guard understand the expanded
-- TeamMatch source. The semantic tournament axis is deliberately narrower
-- than the raw ownership columns: legacy fixtures and TournamentMatchDetails
-- establish tournament attribution; a league-only or friendly TeamMatch does
-- not. The checks below fail closed before the byte-exact snapshot checks can
-- accept a mixed source row.
CREATE OR REPLACE FUNCTION v1_guard_game_official_fact_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
  game_source_type "V1GameSourceType";
  fixture_tournament_id_value TEXT;
  game_tournament_fixture_id_value TEXT;
  team_match_id_value TEXT;
  team_match_tournament_id_value TEXT;
  league_id_value TEXT;
  details_team_match_id_value TEXT;
  details_tournament_id_value TEXT;
  semantic_tournament_id TEXT;
  home_team_id_value TEXT;
  away_team_id_value TEXT;
  revision_home JSONB;
  revision_away JSONB;
BEGIN
  SELECT state, revision, score, events_hash, official_at
  INTO revision_row
  FROM v1_game_result_revisions
  WHERE game_id = NEW.game_id AND id = NEW.revision_id
  FOR KEY SHARE;

  IF NOT FOUND OR revision_row.state IS DISTINCT FROM 'OFFICIAL' OR revision_row.official_at IS NULL THEN
    RAISE EXCEPTION 'official fact requires an official game revision' USING ERRCODE = '23514';
  END IF;

  SELECT
    game.source_type,
    fixture.tournament_id,
    game.tournament_fixture_id,
    team_match.id,
    team_match.tournament_id,
    team_match.league_id,
    details.team_match_id,
    details.tournament_id,
    home_side.team_id,
    away_side.team_id
  INTO
    game_source_type,
    fixture_tournament_id_value,
    game_tournament_fixture_id_value,
    team_match_id_value,
    team_match_tournament_id_value,
    league_id_value,
    details_team_match_id_value,
    details_tournament_id_value,
    home_team_id_value,
    away_team_id_value
  FROM v1_games AS game
  LEFT JOIN v1_tournament_fixtures AS fixture ON fixture.id = game.tournament_fixture_id
  LEFT JOIN v1_team_matches AS team_match ON team_match.id = game.team_match_id
  LEFT JOIN v1_tournament_match_details AS details ON details.team_match_id = team_match.id
  LEFT JOIN v1_game_sides AS home_side ON home_side.game_id = game.id AND home_side.side_key = 'HOME'
  LEFT JOIN v1_game_sides AS away_side ON away_side.game_id = game.id AND away_side.side_key = 'AWAY'
  WHERE game.id = NEW.game_id
  FOR KEY SHARE OF game;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'official fact requires an existing game source' USING ERRCODE = '23514';
  END IF;

  IF game_source_type = 'TOURNAMENT_FIXTURE' THEN
    IF fixture_tournament_id_value IS NULL OR game_tournament_fixture_id_value IS NULL THEN
      RAISE EXCEPTION 'legacy fixture source requires fixture ownership' USING ERRCODE = '23514';
    END IF;
    -- Expand may attach the same UUID TeamMatch shadow to a legacy fixture.
    IF team_match_id_value IS NOT NULL AND team_match_id_value IS DISTINCT FROM game_tournament_fixture_id_value THEN
      RAISE EXCEPTION 'legacy fixture and TeamMatch sources must share the same id' USING ERRCODE = '23514';
    END IF;
    IF details_team_match_id_value IS NOT NULL AND details_team_match_id_value IS DISTINCT FROM game_tournament_fixture_id_value THEN
      RAISE EXCEPTION 'legacy fixture has mismatched tournament details' USING ERRCODE = '23514';
    END IF;
    IF team_match_tournament_id_value IS NOT NULL AND team_match_tournament_id_value IS DISTINCT FROM fixture_tournament_id_value THEN
      RAISE EXCEPTION 'legacy fixture has conflicting TeamMatch ownership' USING ERRCODE = '23514';
    END IF;
    IF details_tournament_id_value IS NOT NULL AND details_tournament_id_value IS DISTINCT FROM fixture_tournament_id_value THEN
      RAISE EXCEPTION 'legacy fixture has conflicting tournament details ownership' USING ERRCODE = '23514';
    END IF;
    semantic_tournament_id := fixture_tournament_id_value;
  ELSIF game_source_type = 'TEAM_MATCH' THEN
    IF team_match_id_value IS NULL THEN
      RAISE EXCEPTION 'TeamMatch source requires TeamMatch ownership' USING ERRCODE = '23514';
    END IF;
    IF game_tournament_fixture_id_value IS NOT NULL AND game_tournament_fixture_id_value IS DISTINCT FROM team_match_id_value THEN
      RAISE EXCEPTION 'TeamMatch source has a mismatched legacy fixture' USING ERRCODE = '23514';
    END IF;
    IF details_team_match_id_value IS NOT NULL AND details_team_match_id_value IS DISTINCT FROM team_match_id_value THEN
      RAISE EXCEPTION 'TeamMatch source has mismatched tournament details' USING ERRCODE = '23514';
    END IF;
    IF details_tournament_id_value IS NOT NULL AND details_team_match_id_value IS NULL THEN
      RAISE EXCEPTION 'TeamMatch source has orphan tournament details' USING ERRCODE = '23514';
    END IF;
    IF details_tournament_id_value IS NOT NULL AND team_match_tournament_id_value IS NULL THEN
      RAISE EXCEPTION 'TeamMatch tournament details have no raw tournament owner' USING ERRCODE = '23514';
    END IF;
    IF team_match_tournament_id_value IS NOT NULL
       AND details_tournament_id_value IS NOT NULL
       AND team_match_tournament_id_value IS DISTINCT FROM details_tournament_id_value THEN
      RAISE EXCEPTION 'TeamMatch source has conflicting tournament ownership' USING ERRCODE = '23514';
    END IF;
    IF team_match_tournament_id_value IS NOT NULL
       AND league_id_value IS NOT NULL
       AND team_match_tournament_id_value IS DISTINCT FROM league_id_value THEN
      RAISE EXCEPTION 'TeamMatch source has mixed league and tournament ownership' USING ERRCODE = '23514';
    END IF;
    -- A regular league stores the shared owner in both columns but has no
    -- TournamentMatchDetails row. That is valid league attribution and must
    -- remain semantically null here. A tournament owner without Details is
    -- otherwise an incomplete/mixed source.
    IF team_match_tournament_id_value IS NOT NULL
       AND league_id_value IS NULL
       AND details_tournament_id_value IS NULL THEN
      RAISE EXCEPTION 'TeamMatch tournament ownership requires matching details' USING ERRCODE = '23514';
    END IF;
    IF game_tournament_fixture_id_value IS NOT NULL
       AND (fixture_tournament_id_value IS NULL OR details_tournament_id_value IS NULL
            OR fixture_tournament_id_value IS DISTINCT FROM details_tournament_id_value
            OR team_match_tournament_id_value IS DISTINCT FROM fixture_tournament_id_value)
    THEN
      RAISE EXCEPTION 'TeamMatch dual source requires matching fixture and details ownership' USING ERRCODE = '23514';
    END IF;
    IF details_tournament_id_value IS NOT NULL AND league_id_value IS NOT NULL THEN
      RAISE EXCEPTION 'TeamMatch source mixes league and tournament details ownership' USING ERRCODE = '23514';
    END IF;
    semantic_tournament_id := details_tournament_id_value;
  ELSE
    RAISE EXCEPTION 'unsupported official fact source type' USING ERRCODE = '23514';
  END IF;

  -- Prefer the flat live score; imported historical rows use the nested
  -- regulation shape. Both are still required to match the immutable row.
  revision_home := COALESCE(revision_row.score -> 'home', revision_row.score -> 'regulation' -> 'home');
  revision_away := COALESCE(revision_row.score -> 'away', revision_row.score -> 'regulation' -> 'away');

  IF NEW.revision IS DISTINCT FROM revision_row.revision
    OR NEW.source_type IS DISTINCT FROM game_source_type
    OR NEW.tournament_id IS DISTINCT FROM semantic_tournament_id
    OR NEW.home_team_id IS DISTINCT FROM home_team_id_value
    OR NEW.away_team_id IS DISTINCT FROM away_team_id_value
    OR NEW.score IS DISTINCT FROM revision_row.score
    OR NEW.events_hash IS DISTINCT FROM revision_row.events_hash
    OR NEW.official_at IS DISTINCT FROM revision_row.official_at
    OR jsonb_typeof(revision_home) IS DISTINCT FROM 'number'
    OR jsonb_typeof(revision_away) IS DISTINCT FROM 'number'
    OR NEW.home_score IS DISTINCT FROM (revision_home #>> '{}')::INTEGER
    OR NEW.away_score IS DISTINCT FROM (revision_away #>> '{}')::INTEGER
  THEN
    RAISE EXCEPTION 'official fact must exactly snapshot its official game revision' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

-- The public cache has the same semantic tournament scope contract. Its old
-- trigger only joined legacy fixtures, rejecting canonical tournament cache
-- rows even when their Details ownership was valid.
CREATE OR REPLACE FUNCTION v1_guard_game_official_result_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
  game_source_type "V1GameSourceType";
  game_tournament_fixture_id_value TEXT;
  fixture_tournament_id_value TEXT;
  team_match_id_value TEXT;
  team_match_tournament_id_value TEXT;
  league_id_value TEXT;
  details_team_match_id_value TEXT;
  details_tournament_id_value TEXT;
  semantic_tournament_id TEXT;
BEGIN
  SELECT revision.game_id, revision.revision, revision.state, revision.events_hash,
         revision.official_at, game.current_official_revision_id
  INTO revision_row
  FROM v1_game_result_revisions revision
  INNER JOIN v1_games game ON game.id = revision.game_id
  LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
  LEFT JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
  LEFT JOIN v1_tournament_match_details details ON details.team_match_id = team_match.id
  WHERE revision.id = NEW.revision_id
  FOR KEY SHARE OF revision, game;

  IF NOT FOUND
    OR revision_row.state IS DISTINCT FROM 'OFFICIAL'
    OR revision_row.official_at IS NULL
  THEN
    RAISE EXCEPTION 'public result cache requires an exact official revision snapshot'
      USING ERRCODE = '23514';
  END IF;

  -- Read ownership columns with explicit scalar targets so a fixture column
  -- can never be mistaken for TeamMatch ownership.
  SELECT
    game.source_type,
    game.tournament_fixture_id,
    fixture.tournament_id,
    team_match.id,
    team_match.tournament_id,
    team_match.league_id,
    details.team_match_id,
    details.tournament_id
  INTO
    game_source_type,
    game_tournament_fixture_id_value,
    fixture_tournament_id_value,
    team_match_id_value,
    team_match_tournament_id_value,
    league_id_value,
    details_team_match_id_value,
    details_tournament_id_value
  FROM v1_games game
  LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
  LEFT JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
  LEFT JOIN v1_tournament_match_details details ON details.team_match_id = team_match.id
  WHERE game.id = revision_row.game_id;

  IF game_source_type = 'TOURNAMENT_FIXTURE' THEN
    IF game_tournament_fixture_id_value IS NULL OR fixture_tournament_id_value IS NULL
       OR (team_match_id_value IS NOT NULL AND team_match_id_value IS DISTINCT FROM game_tournament_fixture_id_value)
       OR (details_team_match_id_value IS NOT NULL AND details_team_match_id_value IS DISTINCT FROM game_tournament_fixture_id_value)
       OR (team_match_tournament_id_value IS NOT NULL AND team_match_tournament_id_value IS DISTINCT FROM fixture_tournament_id_value)
       OR (details_tournament_id_value IS NOT NULL AND details_tournament_id_value IS DISTINCT FROM fixture_tournament_id_value)
    THEN
      RAISE EXCEPTION 'legacy fixture has mixed official cache ownership' USING ERRCODE = '23514';
    END IF;
    semantic_tournament_id := fixture_tournament_id_value;
  ELSIF game_source_type = 'TEAM_MATCH' THEN
    IF team_match_id_value IS NULL
       OR (game_tournament_fixture_id_value IS NOT NULL AND game_tournament_fixture_id_value IS DISTINCT FROM team_match_id_value)
       OR (details_team_match_id_value IS NOT NULL AND details_team_match_id_value IS DISTINCT FROM team_match_id_value)
       OR (details_tournament_id_value IS NOT NULL AND details_team_match_id_value IS NULL)
       OR (details_tournament_id_value IS NOT NULL AND team_match_tournament_id_value IS NULL)
       OR (team_match_tournament_id_value IS NOT NULL AND details_tournament_id_value IS NOT NULL AND team_match_tournament_id_value IS DISTINCT FROM details_tournament_id_value)
       OR (team_match_tournament_id_value IS NOT NULL AND league_id_value IS NOT NULL AND team_match_tournament_id_value IS DISTINCT FROM league_id_value)
       OR (team_match_tournament_id_value IS NOT NULL AND league_id_value IS NULL AND details_tournament_id_value IS NULL)
       OR (details_tournament_id_value IS NOT NULL AND league_id_value IS NOT NULL)
       OR (game_tournament_fixture_id_value IS NOT NULL AND
           (fixture_tournament_id_value IS NULL OR details_tournament_id_value IS NULL
            OR fixture_tournament_id_value IS DISTINCT FROM details_tournament_id_value
            OR team_match_tournament_id_value IS DISTINCT FROM fixture_tournament_id_value))
    THEN
      RAISE EXCEPTION 'TeamMatch has mixed official cache ownership' USING ERRCODE = '23514';
    END IF;
    semantic_tournament_id := details_tournament_id_value;
  ELSE
    RAISE EXCEPTION 'unsupported official cache source type' USING ERRCODE = '23514';
  END IF;

  IF NEW.game_id IS DISTINCT FROM revision_row.game_id
    OR NEW.revision IS DISTINCT FROM revision_row.revision
    OR NEW.tournament_id IS DISTINCT FROM semantic_tournament_id
    OR NEW.source_hash IS DISTINCT FROM revision_row.events_hash
    OR (NEW.is_current AND revision_row.current_official_revision_id IS DISTINCT FROM NEW.revision_id)
  THEN
    RAISE EXCEPTION 'public result cache requires an exact official revision snapshot'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

COMMIT;
