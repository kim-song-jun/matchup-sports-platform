CREATE TYPE "V1TournamentAnnouncementCategory" AS ENUM ('general', 'venue', 'sponsor', 'media', 'results', 'review');

ALTER TABLE "v1_tournament_announcements"
  ADD COLUMN "category" "V1TournamentAnnouncementCategory" NOT NULL DEFAULT 'general';

CREATE INDEX "v1_tournament_announcements_tournament_id_category_published_idx"
  ON "v1_tournament_announcements"("tournament_id", "category", "published_at");
