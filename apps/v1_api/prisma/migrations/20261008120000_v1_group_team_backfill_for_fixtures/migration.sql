-- Data-only, rerunnable backfill. Group standings are computed from group teams
-- (v1_tournament_group_teams), but admin "add fixture" used to create a group fixture
-- without enrolling its teams, leaving a group with fixtures and no standings rows.
-- Enrol the confirmed teams of live group-phase fixtures that are missing from their group.
-- Existing group-team rows (and their sort_order) are never touched; no standings rows are
-- written. A group with no standings rows shows zero-value rows derived from its group teams,
-- but a group that already has standings rows (e.g. confirmed results) needs one admin
-- standings recalculation before the newly enrolled teams appear.
BEGIN;

INSERT INTO v1_tournament_group_teams (id, group_id, registration_id, sort_order, is_bye, created_at)
SELECT gen_random_uuid()::text, missing.group_id, missing.registration_id,
  COALESCE(
    (SELECT MAX(gt.sort_order) FROM v1_tournament_group_teams gt WHERE gt.group_id = missing.group_id),
    -1
  ) + ROW_NUMBER() OVER (PARTITION BY missing.group_id ORDER BY missing.first_fixture_number, missing.registration_id),
  FALSE, CURRENT_TIMESTAMP
FROM (
  SELECT d.group_id, side.registration_id, MIN(d.fixture_number) AS first_fixture_number
  FROM v1_tournament_match_details d
  JOIN v1_team_matches m ON m.id = d.team_match_id AND m.deleted_at IS NULL
  JOIN v1_tournament_groups g ON g.id = d.group_id AND g.phase = 'group'
  JOIN v1_tournaments t ON t.id = d.tournament_id AND t.deleted_at IS NULL
    AND COALESCE(t.kind::text, 'regular_tournament') = 'regular_tournament'
  CROSS JOIN LATERAL (VALUES (d.home_registration_id), (d.away_registration_id)) AS side(registration_id)
  JOIN v1_tournament_registrations r ON r.id = side.registration_id
    AND r.tournament_id = d.tournament_id AND r.status = 'confirmed'
  WHERE NOT EXISTS (
    SELECT 1 FROM v1_tournament_group_teams gt
    WHERE gt.group_id = d.group_id AND gt.registration_id = side.registration_id
  )
  GROUP BY d.group_id, side.registration_id
) missing
ON CONFLICT DO NOTHING;

COMMIT;
