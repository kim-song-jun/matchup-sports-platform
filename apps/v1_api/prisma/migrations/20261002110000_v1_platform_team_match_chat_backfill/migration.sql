-- Data-only, rerunnable backfill. Platform provenance is persisted on the match.
-- Preserve existing rooms, messages, preferences, read cursors and voluntary team exits.
BEGIN;

INSERT INTO v1_chat_rooms (id, team_match_id, status, created_at, updated_at)
SELECT gen_random_uuid()::text, m.id, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM v1_team_matches m
WHERE m.platform_managed = TRUE AND m.deleted_at IS NULL
  AND m.status IN ('recruiting', 'closed', 'matched', 'completed')
ON CONFLICT (team_match_id) DO NOTHING;

WITH eligible AS (
  SELECT r.id AS room_id, a.user_id, r.created_at
  FROM v1_team_matches m
  JOIN v1_chat_rooms r ON r.team_match_id = m.id AND r.status = 'active'
  JOIN v1_admin_users a ON a.user_id = m.created_by_user_id
    AND a.status = 'active' AND a.revoked_at IS NULL AND a.admin_role IN ('owner', 'ops')
  JOIN v1_users u ON u.id = a.user_id AND u.account_status = 'active'
  WHERE m.platform_managed = TRUE AND m.deleted_at IS NULL
    AND m.status IN ('recruiting', 'closed', 'matched', 'completed')
  UNION
  SELECT r.id, tm.user_id, r.created_at
  FROM v1_team_matches m
  JOIN v1_chat_rooms r ON r.team_match_id = m.id AND r.status = 'active'
  JOIN v1_team_memberships tm ON tm.team_id IN (m.host_team_id, m.approved_applicant_team_id)
    AND tm.status = 'active' AND tm.role IN ('owner', 'manager')
  JOIN v1_users u ON u.id = tm.user_id AND u.account_status = 'active'
  WHERE m.platform_managed = TRUE AND m.deleted_at IS NULL
    AND m.status IN ('recruiting', 'closed', 'matched', 'completed')
)
INSERT INTO v1_chat_room_participants
  (id, chat_room_id, user_id, status, visible_from_at, created_at, updated_at)
SELECT gen_random_uuid()::text, room_id, user_id, 'active', created_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM eligible
ON CONFLICT (chat_room_id, user_id) DO NOTHING;

-- The platform creator cannot leave their operational room while still authorized.
UPDATE v1_chat_room_participants p
SET status = 'active', left_at = NULL, updated_at = CURRENT_TIMESTAMP
FROM v1_chat_rooms r, v1_team_matches m, v1_admin_users a, v1_users u
WHERE p.chat_room_id = r.id AND r.team_match_id = m.id AND r.status = 'active'
  AND m.platform_managed = TRUE AND m.deleted_at IS NULL
  AND m.status IN ('recruiting', 'closed', 'matched', 'completed')
  AND p.user_id = m.created_by_user_id AND a.user_id = p.user_id
  AND a.status = 'active' AND a.revoked_at IS NULL AND a.admin_role IN ('owner', 'ops')
  AND u.id = a.user_id AND u.account_status = 'active' AND p.status = 'left';

COMMIT;
