UPDATE "v1_tournaments" AS "tournament"
SET "bracket_published_at" = COALESCE(
  "tournament"."registration_deadline_at",
  "tournament"."scheduled_at",
  "tournament"."updated_at",
  CURRENT_TIMESTAMP
)
WHERE "tournament"."bracket_published_at" IS NULL
  AND "tournament"."deleted_at" IS NULL
  AND "tournament"."status" IN ('closed', 'in_progress', 'completed')
  AND (
    EXISTS (
      SELECT 1
      FROM "v1_tournament_groups" AS "group"
      WHERE "group"."tournament_id" = "tournament"."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "v1_tournament_fixtures" AS "fixture"
      WHERE "fixture"."tournament_id" = "tournament"."id"
    )
  );
