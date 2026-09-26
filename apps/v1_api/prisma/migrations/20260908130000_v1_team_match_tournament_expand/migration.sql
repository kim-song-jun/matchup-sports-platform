BEGIN;

-- Task 168 Phase 3 W0 — additive tournament-owned TeamMatch shape.
-- Existing fixture/game columns remain for the later backfill/read-swap waves.

-- Expand permits only same-UUID dual links. The contract migration removes the
-- fixture column and restores a single canonical TeamMatch source constraint.
ALTER TABLE "v1_games" DROP CONSTRAINT "v1_games_source_exactly_one_ck";
ALTER TABLE "v1_games" ADD CONSTRAINT "v1_games_source_expand_ck" CHECK (
  ("source_type" = 'TEAM_MATCH' AND "team_match_id" IS NOT NULL
    AND ("tournament_fixture_id" IS NULL OR "tournament_fixture_id" = "team_match_id"))
  OR
  ("source_type" = 'TOURNAMENT_FIXTURE' AND "tournament_fixture_id" IS NOT NULL
    AND ("team_match_id" IS NULL OR "team_match_id" = "tournament_fixture_id"))
);

ALTER TABLE "v1_team_matches"
  ADD COLUMN "tournament_id" TEXT,
  ADD COLUMN "field_id" TEXT;

-- Tournament fixture rows may be unresolved/TBD. Friendly and ordinary league rows
-- keep their existing required-field contract through the check below.
ALTER TABLE "v1_team_matches"
  ALTER COLUMN "host_team_id" DROP NOT NULL,
  ALTER COLUMN "created_by_user_id" DROP NOT NULL,
  ALTER COLUMN "region_id" DROP NOT NULL,
  ALTER COLUMN "place_name" DROP NOT NULL,
  ALTER COLUMN "start_at" DROP NOT NULL;

-- The current league mirror uses the same tournament id. Keep league_id during
-- expand, but seed the new canonical tournament ownership before adding the FK.
UPDATE "v1_team_matches"
   SET "tournament_id" = "league_id"
 WHERE "tournament_id" IS NULL
   AND "league_id" IS NOT NULL;

ALTER TABLE "v1_team_matches"
  ADD CONSTRAINT "v1_team_matches_tournament_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "v1_team_matches_field_fk"
    FOREIGN KEY ("tournament_id", "field_id")
    REFERENCES "v1_tournament_fields"("tournament_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "v1_team_matches_friendly_required_ck"
    CHECK (
      COALESCE("tournament_id", "league_id") IS NOT NULL
      OR (
        "host_team_id" IS NOT NULL
        AND "created_by_user_id" IS NOT NULL
        AND "region_id" IS NOT NULL
        AND "place_name" IS NOT NULL
        AND "start_at" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "v1_team_matches_tournament_league_consistency_ck"
    CHECK (
      "tournament_id" IS NULL
      OR "league_id" IS NULL
      OR "tournament_id" = "league_id"
    ),
  ADD CONSTRAINT "v1_team_matches_field_requires_tournament_ck"
    CHECK (
      "field_id" IS NULL
      OR "tournament_id" IS NOT NULL
    );

CREATE INDEX "v1_team_matches_tournament_start_at_idx"
  ON "v1_team_matches"("tournament_id", "start_at");
CREATE INDEX "v1_team_matches_field_id_idx"
  ON "v1_team_matches"("field_id");
ALTER TABLE "v1_team_matches"
  ADD CONSTRAINT "v1_team_matches_tournament_id_id_key"
  UNIQUE ("tournament_id", "id");

ALTER TABLE "v1_tournament_groups"
  ADD CONSTRAINT "v1_tournament_groups_tournament_id_id_key"
  UNIQUE ("tournament_id", "id");

ALTER TABLE "v1_tournament_registrations"
  ADD CONSTRAINT "v1_tournament_registrations_tournament_id_id_key"
  UNIQUE ("tournament_id", "id");

CREATE TABLE "v1_tournament_match_details" (
  "team_match_id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "group_id" TEXT,
  "round" TEXT NOT NULL,
  "fixture_number" INTEGER NOT NULL,
  "leg_number" INTEGER NOT NULL DEFAULT 1,
  "parent_team_match_id" TEXT,
  "home_registration_id" TEXT,
  "away_registration_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "v1_tournament_match_details_pkey" PRIMARY KEY ("team_match_id"),
  CONSTRAINT "v1_tournament_match_details_tournament_round_number_leg_key"
    UNIQUE ("tournament_id", "round", "fixture_number", "leg_number"),
  CONSTRAINT "v1_tournament_match_details_tournament_id_team_match_id_key"
    UNIQUE ("tournament_id", "team_match_id"),
  CONSTRAINT "v1_tournament_match_details_team_match_fk"
    FOREIGN KEY ("tournament_id", "team_match_id") REFERENCES "v1_team_matches"("tournament_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_match_details_tournament_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_match_details_group_fk"
    FOREIGN KEY ("tournament_id", "group_id") REFERENCES "v1_tournament_groups"("tournament_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_match_details_parent_fk"
    FOREIGN KEY ("tournament_id", "parent_team_match_id") REFERENCES "v1_tournament_match_details"("tournament_id", "team_match_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_match_details_home_registration_fk"
    FOREIGN KEY ("tournament_id", "home_registration_id") REFERENCES "v1_tournament_registrations"("tournament_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_match_details_away_registration_fk"
    FOREIGN KEY ("tournament_id", "away_registration_id") REFERENCES "v1_tournament_registrations"("tournament_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "v1_tournament_match_details_tournament_round_fixture_idx"
  ON "v1_tournament_match_details"("tournament_id", "round", "fixture_number");
CREATE INDEX "v1_tournament_match_details_group_id_idx"
  ON "v1_tournament_match_details"("group_id");
CREATE INDEX "v1_tournament_match_details_parent_team_match_id_idx"
  ON "v1_tournament_match_details"("parent_team_match_id");

CREATE TABLE "v1_tournament_match_advancement_edges" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "source_team_match_id" TEXT NOT NULL,
  "source_outcome" "V1FixtureAdvancementOutcome" NOT NULL,
  "target_team_match_id" TEXT NOT NULL,
  "target_side" "V1FixtureTargetSide" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_tournament_match_advancement_edges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_match_advancement_source_outcome_key"
    UNIQUE ("source_team_match_id", "source_outcome"),
  CONSTRAINT "v1_match_advancement_target_side_key"
    UNIQUE ("target_team_match_id", "target_side"),
  CONSTRAINT "v1_match_advancement_tournament_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_match_advancement_source_fk"
    FOREIGN KEY ("tournament_id", "source_team_match_id") REFERENCES "v1_tournament_match_details"("tournament_id", "team_match_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_match_advancement_target_fk"
    FOREIGN KEY ("tournament_id", "target_team_match_id") REFERENCES "v1_tournament_match_details"("tournament_id", "team_match_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_match_advancement_distinct_match_ck"
    CHECK ("source_team_match_id" <> "target_team_match_id")
);

CREATE INDEX "v1_match_advancement_source_lock_idx"
  ON "v1_tournament_match_advancement_edges"("tournament_id", "source_team_match_id");
CREATE INDEX "v1_match_advancement_target_lock_idx"
  ON "v1_tournament_match_advancement_edges"("tournament_id", "target_team_match_id");

COMMIT;
