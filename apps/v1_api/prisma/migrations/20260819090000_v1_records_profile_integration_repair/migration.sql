-- Repair official team outcomes for regulation draws decided by penalties.
-- Regulation goals remain the goals-for/goals-against source; penalties only
-- decide WON/LOST.
WITH penalty_outcomes AS (
  SELECT
    trf.id,
    CASE
      WHEN trf.team_id = gof.home_team_id
        THEN CASE
          WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int
             > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int
            THEN 'WON'
          ELSE 'LOST'
        END
      ELSE CASE
        WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int
           > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int
          THEN 'WON'
        ELSE 'LOST'
      END
    END AS repaired_result
  FROM v1_team_record_facts trf
  JOIN v1_game_official_facts gof ON gof.revision_id = trf.revision_id
  JOIN v1_games game
    ON game.id = trf.game_id
   AND game.current_official_revision_id = trf.revision_id
  WHERE gof.home_score = gof.away_score
    AND jsonb_typeof(COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) = 'object'
    AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'home') = 'number'
    AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'away') = 'number'
    AND ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int
      <> ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int
)
UPDATE v1_team_record_facts trf
SET result = penalty_outcomes.repaired_result
FROM penalty_outcomes
WHERE trf.id = penalty_outcomes.id
  AND trf.result IS DISTINCT FROM penalty_outcomes.repaired_result;

-- Older tournament lineups predate automatic ROSTER_ASSERTED identity links.
-- Only participants that already carry a trusted user_id and have never had
-- an identity event are repaired. A revoked or disputed historical link is
-- deliberately never recreated.
CREATE TEMP TABLE v1_record_repair_identity_links ON COMMIT DROP AS
SELECT
  participant.id AS participant_id,
  participant.user_id,
  gen_random_uuid()::text AS link_id
FROM v1_game_participants participant
WHERE participant.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM v1_participant_identity_link_current current_link
    WHERE current_link.participant_id = participant.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM v1_participant_identity_link_events identity_event
    WHERE identity_event.participant_id = participant.id
  );

INSERT INTO v1_participant_identity_link_events (
  id,
  participant_id,
  link_id,
  event_version,
  request_id,
  action,
  user_id,
  effective_at,
  actor_type,
  actor_user_id,
  system_actor,
  reason,
  created_at
)
SELECT
  gen_random_uuid()::text,
  participant_id,
  link_id,
  1,
  link_id,
  'ROSTER_ASSERTED'::"V1IdentityLinkAction",
  user_id,
  CURRENT_TIMESTAMP,
  'SYSTEM'::"V1IdentityActorType",
  NULL,
  'V1_RECORD_PROFILE_REPAIR',
  'Backfill trusted roster participant identity for public record projection',
  CURRENT_TIMESTAMP
FROM v1_record_repair_identity_links;

INSERT INTO v1_participant_identity_link_current (
  participant_id,
  link_id,
  user_id,
  version,
  effective_from,
  updated_at
)
SELECT participant_id, link_id, user_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM v1_record_repair_identity_links
ON CONFLICT (participant_id) DO NOTHING;

-- Backfill missing appearance rows for current official tournament revisions.
-- This mirrors deriveAppearedParticipantIds plus the stat-event safety net.
ALTER TABLE v1_game_result_participants
  DISABLE TRIGGER v1_guard_result_participant_mutation;

DELETE FROM v1_game_result_participants result_participant
USING
  v1_game_result_revisions revision,
  v1_games game,
  v1_game_participants participant,
  v1_game_lineups lineup
WHERE result_participant.result_revision_id = revision.id
  AND revision.id = game.current_official_revision_id
  AND game.source_type = 'TOURNAMENT_FIXTURE'
  AND result_participant.participant_id = participant.id
  AND participant.lineup_id = lineup.id
  AND EXISTS (
    SELECT 1
    FROM v1_game_lineups newer_lineup
    WHERE newer_lineup.game_id = lineup.game_id
      AND newer_lineup.side_id = lineup.side_id
      AND newer_lineup.revision > lineup.revision
  );

WITH reversed_events AS (
  SELECT DISTINCT reverses_event_id AS event_id
  FROM v1_game_events
  WHERE reverses_event_id IS NOT NULL
),
active_events AS (
  SELECT event.*
  FROM v1_game_events event
  LEFT JOIN reversed_events reversed ON reversed.event_id = event.id
  WHERE reversed.event_id IS NULL
),
appearance_rows AS (
  SELECT
    revision.id AS result_revision_id,
    participant.id AS participant_id,
    participant.side_id,
    participant.started,
    participant.position,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'GOAL'
        AND event.participant_id = participant.id
    ) AS goals,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'GOAL'
        AND event.assist_participant_id = participant.id
    ) AS assists,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'FOUL'
        AND event.participant_id = participant.id
    ) AS fouls,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'CARD'
        AND event.participant_id = participant.id
        AND event.payload ->> 'card' IS DISTINCT FROM 'RED'
    ) AS yellow_cards,
    (
      SELECT COUNT(*)::int
      FROM active_events event
      WHERE event.game_id = game.id
        AND event.type = 'CARD'
        AND event.participant_id = participant.id
        AND event.payload ->> 'card' = 'RED'
    ) AS red_cards
  FROM v1_games game
  JOIN v1_game_result_revisions revision
    ON revision.id = game.current_official_revision_id
   AND revision.state = 'OFFICIAL'
  JOIN v1_game_participants participant ON participant.game_id = game.id
  JOIN v1_game_lineups lineup ON lineup.id = participant.lineup_id
  WHERE game.source_type = 'TOURNAMENT_FIXTURE'
    AND NOT EXISTS (
      SELECT 1
      FROM v1_game_lineups newer_lineup
      WHERE newer_lineup.game_id = lineup.game_id
        AND newer_lineup.side_id = lineup.side_id
        AND newer_lineup.revision > lineup.revision
    )
),
appeared AS (
  SELECT row.*
  FROM appearance_rows row
  WHERE row.started
     OR row.goals > 0
     OR row.assists > 0
     OR row.fouls > 0
     OR row.yellow_cards > 0
     OR row.red_cards > 0
     OR EXISTS (
       SELECT 1
       FROM active_events event
       JOIN v1_game_result_revisions revision
         ON revision.id = row.result_revision_id
       WHERE event.game_id = revision.game_id
         AND event.type = 'SUBSTITUTION'
         AND event.participant_id = row.participant_id
     )
)
INSERT INTO v1_game_result_participants (
  id,
  result_revision_id,
  participant_id,
  side_id,
  started,
  minutes_played,
  goals,
  assists,
  fouls,
  cards,
  goalkeeper,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::text,
  appeared.result_revision_id,
  appeared.participant_id,
  appeared.side_id,
  appeared.started,
  NULL,
  appeared.goals,
  appeared.assists,
  appeared.fouls,
  jsonb_build_object('yellow', appeared.yellow_cards, 'red', appeared.red_cards),
  COALESCE(appeared.position IN ('GK', 'GOALKEEPER', 'GOLEIRO'), false),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM appeared
ON CONFLICT (result_revision_id, participant_id) DO NOTHING;

ALTER TABLE v1_game_result_participants
  ENABLE TRIGGER v1_guard_result_participant_mutation;
