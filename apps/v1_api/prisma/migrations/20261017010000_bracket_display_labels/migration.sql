-- Presentation-only overrides. NULL always means the current automatic label.
ALTER TABLE "v1_tournament_match_details" ADD COLUMN "home_display_label" VARCHAR(120);
ALTER TABLE "v1_tournament_match_details" ADD COLUMN "away_display_label" VARCHAR(120);
ALTER TABLE "v1_tournament_slots" ADD COLUMN "display_label" VARCHAR(120);
