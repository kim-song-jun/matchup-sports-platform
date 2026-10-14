-- Unify competition places with fields, preserving actual addresses/pins and existing field IDs.
ALTER TABLE "v1_tournament_fields" ADD COLUMN "place_snapshot" JSONB;

-- One entry per competition and trimmed/case-insensitive name. Never invent a shared map pin
-- when equal names refer to different snapshots. Existing fields/assignments remain authoritative.
WITH places AS (
  SELECT tm.tournament_id, btrim(tm.place_name) AS name,
         lower(btrim(tm.place_name)) AS name_key,
         jsonb_build_object('name', btrim(tm.place_name), 'address', nullif(btrim(tm.place_address), ''),
           'latitude', tm.place_latitude, 'longitude', tm.place_longitude,
           'provider', nullif(btrim(tm.place_provider), ''), 'providerPlaceId', nullif(btrim(tm.place_provider_id), '')) AS snapshot,
         ((nullif(btrim(tm.place_provider), '') IS NULL AND nullif(btrim(tm.place_provider_id), '') IS NULL
           AND tm.place_latitude IS NULL AND tm.place_longitude IS NULL) OR
          (btrim(tm.place_provider) = 'kakao' AND nullif(btrim(tm.place_provider_id), '') IS NOT NULL
           AND tm.place_latitude BETWEEN -90 AND 90 AND tm.place_longitude BETWEEN -180 AND 180)) AS valid_place
  FROM v1_team_matches tm
  JOIN v1_tournaments t ON t.id = tm.tournament_id
  WHERE tm.deleted_at IS NULL AND t.deleted_at IS NULL
    AND (t.kind IN ('regular_tournament', 'regular_league') OR t.kind IS NULL)
    AND tm.place_name IS NOT NULL AND btrim(tm.place_name) <> ''
    AND lower(btrim(tm.place_name)) NOT IN ('장소 미정', '미정', 'tbd')
), grouped AS (
  SELECT tournament_id, name_key, min(name) AS name,
         CASE WHEN count(DISTINCT (snapshot - 'name')) = 1 AND bool_and(valid_place)
           THEN (array_agg(snapshot ORDER BY name))[1] ELSE NULL END AS snapshot
  FROM places GROUP BY tournament_id, name_key
)
INSERT INTO v1_tournament_fields
  (id, tournament_id, scope_key, name, place_snapshot, sort_order, active, version, created_at, updated_at)
SELECT gen_random_uuid()::text, g.tournament_id, 'place-' || md5(g.name_key), g.name,
       g.snapshot, 0, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM grouped g
WHERE NOT EXISTS (
  SELECT 1 FROM v1_tournament_fields f
  WHERE f.tournament_id = g.tournament_id AND lower(btrim(f.name)) = g.name_key
)
ON CONFLICT (tournament_id, scope_key) DO NOTHING;

-- Existing field aliases (for example A-field) may already point to a named venue.
-- Preserve that venue too, without renaming fields or changing their assignments.
WITH places AS (
  SELECT f.id AS field_id,
         jsonb_build_object('name', btrim(tm.place_name), 'address', nullif(btrim(tm.place_address), ''), 'latitude', tm.place_latitude,
           'longitude', tm.place_longitude, 'provider', nullif(btrim(tm.place_provider), ''),
           'providerPlaceId', nullif(btrim(tm.place_provider_id), '')) AS snapshot,
         ((nullif(btrim(tm.place_provider), '') IS NULL AND nullif(btrim(tm.place_provider_id), '') IS NULL
           AND tm.place_latitude IS NULL AND tm.place_longitude IS NULL) OR
          (btrim(tm.place_provider) = 'kakao' AND nullif(btrim(tm.place_provider_id), '') IS NOT NULL
           AND tm.place_latitude BETWEEN -90 AND 90 AND tm.place_longitude BETWEEN -180 AND 180)) AS valid_place
  FROM v1_tournament_fields f
  JOIN v1_team_matches tm ON tm.tournament_id = f.tournament_id
    AND (tm.field_id = f.id OR lower(btrim(tm.place_name)) = lower(btrim(f.name)))
  JOIN v1_tournaments t ON t.id = tm.tournament_id
  WHERE tm.deleted_at IS NULL AND t.deleted_at IS NULL
    AND (t.kind IN ('regular_tournament', 'regular_league') OR t.kind IS NULL)
    AND tm.place_name IS NOT NULL AND btrim(tm.place_name) <> ''
    AND lower(btrim(tm.place_name)) NOT IN ('장소 미정', '미정', 'tbd')
), grouped AS (
  SELECT field_id, (array_agg(snapshot))[1] AS snapshot
  FROM places GROUP BY field_id HAVING count(DISTINCT snapshot) = 1 AND bool_and(valid_place)
)
UPDATE v1_tournament_fields f
SET place_snapshot = g.snapshot, version = f.version + 1, updated_at = CURRENT_TIMESTAMP
FROM grouped g
WHERE f.id = g.field_id
  AND f.place_snapshot IS NULL;

-- Link every named, unassigned fixture. Existing assignments remain authoritative.
-- Deterministic tie-breaker handles pre-existing duplicate names without deleting fields/staff.
WITH candidates AS (
  SELECT tm.id, (SELECT f.id FROM v1_tournament_fields f
    WHERE f.tournament_id = tm.tournament_id AND lower(btrim(f.name)) = lower(btrim(tm.place_name))
    ORDER BY f.active DESC, f.sort_order, f.id LIMIT 1) AS field_id
  FROM v1_team_matches tm JOIN v1_tournaments t ON t.id = tm.tournament_id
  WHERE tm.deleted_at IS NULL AND t.deleted_at IS NULL AND tm.field_id IS NULL
    AND (t.kind IN ('regular_tournament', 'regular_league') OR t.kind IS NULL)
    AND lower(btrim(tm.place_name)) NOT IN ('', '장소 미정', '미정', 'tbd')
)
UPDATE v1_team_matches tm SET field_id = c.field_id
FROM candidates c WHERE tm.id = c.id AND c.field_id IS NOT NULL;

-- Existing match names, addresses and coordinates remain historical snapshots.
