CREATE TYPE "V1TournamentCampaignStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "v1_tournament_campaigns" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "V1TournamentCampaignStatus" NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "v1_tournament_campaigns_tournament_id_key"
ON "v1_tournament_campaigns"("tournament_id");

CREATE UNIQUE INDEX "v1_tournament_campaigns_slug_key"
ON "v1_tournament_campaigns"("slug");

CREATE INDEX "v1_tournament_campaigns_status_idx"
ON "v1_tournament_campaigns"("status");

ALTER TABLE "v1_tournament_campaigns"
ADD CONSTRAINT "v1_tournament_campaigns_tournament_id_fkey"
FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
