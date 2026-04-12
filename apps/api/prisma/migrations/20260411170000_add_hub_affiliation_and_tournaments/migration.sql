CREATE TYPE "TournamentStatus" AS ENUM (
    'draft',
    'recruiting',
    'full',
    'ongoing',
    'completed',
    'cancelled'
);

ALTER TABLE "venues"
ADD COLUMN "owner_id" TEXT;

ALTER TABLE "marketplace_listings"
ADD COLUMN "team_id" TEXT,
ADD COLUMN "venue_id" TEXT;

ALTER TABLE "lessons"
ADD COLUMN "team_id" TEXT;

CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "team_id" TEXT,
    "venue_id" TEXT,
    "sport_type" "SportType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "entry_fee" INTEGER NOT NULL DEFAULT 0,
    "max_participants" INTEGER,
    "current_participants" INTEGER NOT NULL DEFAULT 0,
    "status" "TournamentStatus" NOT NULL DEFAULT 'recruiting',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "venues_owner_id_idx" ON "venues"("owner_id");
CREATE INDEX "marketplace_listings_team_id_status_created_at_idx" ON "marketplace_listings"("team_id", "status", "created_at");
CREATE INDEX "marketplace_listings_venue_id_status_created_at_idx" ON "marketplace_listings"("venue_id", "status", "created_at");
CREATE INDEX "lessons_team_id_status_lesson_date_idx" ON "lessons"("team_id", "status", "lesson_date");
CREATE INDEX "lessons_venue_id_status_lesson_date_idx" ON "lessons"("venue_id", "status", "lesson_date");
CREATE INDEX "tournaments_sport_type_status_idx" ON "tournaments"("sport_type", "status");
CREATE INDEX "tournaments_start_date_status_idx" ON "tournaments"("start_date", "status");
CREATE INDEX "tournaments_team_id_status_start_date_idx" ON "tournaments"("team_id", "status", "start_date");
CREATE INDEX "tournaments_venue_id_status_start_date_idx" ON "tournaments"("venue_id", "status", "start_date");

ALTER TABLE "venues"
ADD CONSTRAINT "venues_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketplace_listings"
ADD CONSTRAINT "marketplace_listings_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "sport_teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketplace_listings"
ADD CONSTRAINT "marketplace_listings_venue_id_fkey"
FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lessons"
ADD CONSTRAINT "lessons_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "sport_teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tournaments"
ADD CONSTRAINT "tournaments_organizer_id_fkey"
FOREIGN KEY ("organizer_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournaments"
ADD CONSTRAINT "tournaments_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "sport_teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tournaments"
ADD CONSTRAINT "tournaments_venue_id_fkey"
FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
