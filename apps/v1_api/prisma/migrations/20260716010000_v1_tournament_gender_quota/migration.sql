DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v1_tournament_players'
      AND column_name = 'gender'
  ) THEN
    UPDATE "v1_tournament_players"
    SET "gender_snapshot" = COALESCE("gender_snapshot", "gender")
    WHERE "gender_snapshot" IS NULL
      AND "gender" IS NOT NULL;

    ALTER TABLE "v1_tournament_players" DROP COLUMN "gender";
  END IF;
END $$;

ALTER TABLE "v1_tournaments"
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_min_male_nonnegative",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_max_male_nonnegative",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_min_female_nonnegative",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_max_female_nonnegative",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_male_range",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_female_range",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_quota_within_roster",
  DROP CONSTRAINT IF EXISTS "v1_tournaments_gender_quota_mixed_only",
  ADD CONSTRAINT "v1_tournaments_gender_min_male_nonnegative"
    CHECK ("gender_min_male" IS NULL OR "gender_min_male" >= 0),
  ADD CONSTRAINT "v1_tournaments_gender_max_male_nonnegative"
    CHECK ("gender_max_male" IS NULL OR "gender_max_male" >= 0),
  ADD CONSTRAINT "v1_tournaments_gender_min_female_nonnegative"
    CHECK ("gender_min_female" IS NULL OR "gender_min_female" >= 0),
  ADD CONSTRAINT "v1_tournaments_gender_max_female_nonnegative"
    CHECK ("gender_max_female" IS NULL OR "gender_max_female" >= 0),
  ADD CONSTRAINT "v1_tournaments_gender_male_range"
    CHECK (
      "gender_min_male" IS NULL
      OR "gender_max_male" IS NULL
      OR "gender_min_male" <= "gender_max_male"
    ),
  ADD CONSTRAINT "v1_tournaments_gender_female_range"
    CHECK (
      "gender_min_female" IS NULL
      OR "gender_max_female" IS NULL
      OR "gender_min_female" <= "gender_max_female"
    ),
  ADD CONSTRAINT "v1_tournaments_gender_quota_within_roster"
    CHECK (
      COALESCE("gender_min_male", 0) + COALESCE("gender_min_female", 0) <= "max_players"
      AND ("gender_max_male" IS NULL OR "gender_max_male" <= "max_players")
      AND ("gender_max_female" IS NULL OR "gender_max_female" <= "max_players")
    ),
  ADD CONSTRAINT "v1_tournaments_gender_quota_mixed_only"
    CHECK (
      COALESCE("gender_category" = 'mixed', FALSE)
      OR (
        "gender_min_male" IS NULL
        AND "gender_max_male" IS NULL
        AND "gender_min_female" IS NULL
        AND "gender_max_female" IS NULL
      )
    );
