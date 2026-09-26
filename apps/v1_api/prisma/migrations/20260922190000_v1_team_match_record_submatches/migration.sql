ALTER TABLE "v1_team_match_records"
ADD COLUMN "sub_matches" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "v1_team_match_record_changes"
ADD COLUMN "sub_match_id" TEXT;