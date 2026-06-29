ALTER TABLE "v1_team_profiles"
ADD COLUMN "activity_days" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "activity_frequency" TEXT,
ADD COLUMN "activity_time_slots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "activity_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
