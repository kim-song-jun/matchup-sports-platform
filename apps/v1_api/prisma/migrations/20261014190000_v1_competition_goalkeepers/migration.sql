-- Nullable for rolling compatibility: old per-game designations remain until the first competition-wide save.
ALTER TABLE "v1_tournament_players" ADD COLUMN "goalkeeper" BOOLEAN;
