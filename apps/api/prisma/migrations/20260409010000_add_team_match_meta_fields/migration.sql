-- AlterTable: add 6 meta fields to team_matches (task 17)
-- All columns are nullable or have DEFAULT values → zero-downtime migration

ALTER TABLE "team_matches"
  ADD COLUMN "skill_grade"       TEXT,
  ADD COLUMN "game_format"       TEXT,
  ADD COLUMN "match_type"        TEXT,
  ADD COLUMN "pro_player_count"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "uniform_color"     TEXT,
  ADD COLUMN "is_free_invitation" BOOLEAN NOT NULL DEFAULT false;
