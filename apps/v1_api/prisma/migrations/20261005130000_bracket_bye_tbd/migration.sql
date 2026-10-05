-- A bye is a persistent bracket slot and can exist before a team is known.
ALTER TABLE "v1_tournament_group_teams" ALTER COLUMN "registration_id" DROP NOT NULL;
ALTER TABLE "v1_tournament_group_teams" ADD CONSTRAINT "v1_group_team_unassigned_bye_check"
  CHECK ("registration_id" IS NOT NULL OR "is_bye" = true);
