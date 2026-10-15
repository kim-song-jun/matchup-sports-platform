CREATE TABLE "v1_game_roster_roles" (
 "game_id" TEXT NOT NULL, "side_id" TEXT NOT NULL, "team_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
 "goalkeeper" BOOLEAN NOT NULL DEFAULT false, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "v1_game_roster_roles_pkey" PRIMARY KEY ("game_id", "side_id", "team_id", "user_id"),
 CONSTRAINT "v1_game_roster_roles_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "v1_game_roster_roles_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "v1_game_sides"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "v1_game_roster_roles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "v1_game_roster_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Preserve existing linked goalkeeper designations from the same submitted/locked-first selector used by results.
INSERT INTO "v1_game_roster_roles" ("game_id", "side_id", "team_id", "user_id", "goalkeeper", "updated_at")
SELECT DISTINCT g.id, s.id, s.team_id, p.user_id, true, CURRENT_TIMESTAMP
FROM v1_games g
JOIN v1_game_sides s ON s.game_id = g.id AND s.team_id IS NOT NULL
JOIN v1_team_matches tm ON tm.id = g.team_match_id AND (tm.tournament_id IS NOT NULL OR tm.league_id IS NOT NULL)
JOIN v1_competition_config_versions c ON c.id = g.competition_config_version_id
JOIN LATERAL (
 SELECT l.id FROM v1_game_lineups l
 WHERE l.game_id = g.id AND l.side_id = s.id AND l.invalidated_at IS NULL
 ORDER BY CASE WHEN l.state IN ('SUBMITTED','LOCKED') THEN 0 ELSE 1 END, l.revision DESC LIMIT 1
) chosen ON true
JOIN v1_game_participants p ON p.lineup_id = chosen.id AND p.user_id IS NOT NULL
WHERE p.position = COALESCE((SELECT pos->>'code' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.lineup->'positions') = 'array' THEN c.lineup->'positions' ELSE '[]'::jsonb END) pos WHERE pos->>'goalkeeper' = 'true' LIMIT 1), 'GK')
ON CONFLICT (game_id, side_id, team_id, user_id) DO NOTHING;
