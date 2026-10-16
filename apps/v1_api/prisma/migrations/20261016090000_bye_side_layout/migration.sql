BEGIN;
ALTER TABLE "v1_tournament_slots" ADD COLUMN "bye_sort_order" INTEGER;

-- Slot position is an identity (1..4); the display order follows the persisted
-- quarter-final side. Preserve opponents, fixture IDs and advancement edges.
CREATE TEMP TABLE bye_layout_mapping ON COMMIT DROP AS
SELECT s.id, s.group_id,
       (ARRAY[0,3,4,7])[s.position] AS old_order,
       (s.position - 1) * 2 + CASE WHEN m.away_slot_id = s.id THEN 1 ELSE 0 END AS new_order
FROM v1_tournament_slots s
JOIN v1_tournament_groups g ON g.id = s.group_id AND g.phase = 'round12'
JOIN v1_team_matches m ON (m.home_slot_id = s.id OR m.away_slot_id = s.id) AND m.deleted_at IS NULL
WHERE s.kind = 'BYE' AND s.position BETWEEN 1 AND 4;

UPDATE v1_tournament_slots s SET bye_sort_order = b.new_order
FROM bye_layout_mapping b WHERE s.id = b.id;

-- Vacate old positions before assigning new positions (unique group/order).
UPDATE v1_tournament_bye_slots r SET sort_order = -100 - b.new_order
FROM bye_layout_mapping b WHERE r.group_id = b.group_id AND r.sort_order = b.old_order;
UPDATE v1_tournament_group_teams r SET sort_order = -100 - b.new_order
FROM bye_layout_mapping b WHERE r.group_id = b.group_id AND r.is_bye AND r.sort_order = b.old_order;
UPDATE v1_tournament_bye_slots r SET sort_order = b.new_order
FROM bye_layout_mapping b WHERE r.group_id = b.group_id AND r.sort_order = -100 - b.new_order;
UPDATE v1_tournament_group_teams r SET sort_order = b.new_order
FROM bye_layout_mapping b WHERE r.group_id = b.group_id AND r.is_bye AND r.sort_order = -100 - b.new_order;
COMMIT;
