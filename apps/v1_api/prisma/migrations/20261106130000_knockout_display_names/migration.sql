-- Depends on #2181 phase-based slot matching before enabling regeneration.
-- Only generated first-round names are repaired. IDs, phases, results, byes and edges stay unchanged.
BEGIN;
CREATE TEMP TABLE knockout_display_repairs ON COMMIT DROP AS
WITH seed_counts AS (
  SELECT group_id, count(*)::integer AS size FROM v1_tournament_slots
  WHERE group_id IS NOT NULL AND kind IN ('ENTRY', 'GROUP_RANK', 'BYE')
  GROUP BY group_id
), candidates AS (
  SELECT g.id, g.tournament_id, g.name, g.bracket_track, c.size,
    power(2, ceil(ln(c.size::numeric) / ln(2::numeric)))::integer AS width,
    EXISTS (SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(t.multi_finals->'finals') = 'array' THEN t.multi_finals->'finals' ELSE '[]'::jsonb END
    ) f WHERE f->>'name' = g.bracket_track AND CASE
      WHEN jsonb_typeof(f->'capacity') = 'number' THEN (f->>'capacity')::numeric = c.size
      WHEN jsonb_typeof(f->'registrationIds') = 'array' THEN jsonb_array_length(f->'registrationIds') = c.size
      ELSE jsonb_array_length(CASE WHEN jsonb_typeof(f->'rules') = 'array' THEN f->'rules' ELSE '[]'::jsonb END) = c.size
    END) AS named
  FROM v1_tournament_groups g JOIN seed_counts c ON c.group_id = g.id
  JOIN v1_tournaments t ON t.id = g.tournament_id
  WHERE g.phase <> 'group' AND c.size >= 6 AND c.size % 2 = 0 AND (c.size & (c.size - 1)) <> 0
)
SELECT c.id, c.tournament_id, c.width::text || '강' AS old_round, c.size::text || '강' AS new_round,
  CASE WHEN c.named AND c.name = c.bracket_track || ' · ' || c.width::text || '강'
    THEN c.bracket_track || ' · ' || c.size::text || '강'
    ELSE c.name END AS new_name
FROM candidates c
WHERE c.named;

UPDATE v1_tournament_groups g SET name = r.new_name, updated_at = CURRENT_TIMESTAMP
FROM knockout_display_repairs r
WHERE g.id = r.id AND g.name <> r.new_name
  AND NOT EXISTS (SELECT 1 FROM v1_tournament_groups other WHERE other.tournament_id = g.tournament_id AND other.name = r.new_name AND other.id <> g.id);
UPDATE v1_tournament_match_details d SET round = r.new_round, updated_at = CURRENT_TIMESTAMP
FROM knockout_display_repairs r
WHERE d.group_id = r.id AND d.round = r.old_round;
COMMIT;
