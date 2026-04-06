-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('owner', 'manager', 'member');

-- CreateEnum
CREATE TYPE "TeamMembershipStatus" AS ENUM ('active', 'pending', 'left', 'removed');

-- CreateEnum
CREATE TYPE "MercenaryPostStatus" AS ENUM ('open', 'closed', 'filled', 'cancelled');

-- CreateEnum
CREATE TYPE "MercenaryApplicationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'member',
    "status" "TeamMembershipStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "invited_by" TEXT,
    "role_changed_at" TIMESTAMP(3),

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercenary_posts" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "sport_type" "SportType" NOT NULL,
    "match_date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "level" INTEGER NOT NULL DEFAULT 3,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "MercenaryPostStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercenary_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercenary_applications" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT,
    "status" "MercenaryApplicationStatus" NOT NULL DEFAULT 'pending',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,

    CONSTRAINT "mercenary_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_team_id_user_id_key" ON "team_memberships"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "team_memberships_user_id_status_idx" ON "team_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "team_memberships_team_id_role_idx" ON "team_memberships"("team_id", "role");

-- CreateIndex
CREATE INDEX "mercenary_posts_sport_type_status_idx" ON "mercenary_posts"("sport_type", "status");

-- CreateIndex
CREATE INDEX "mercenary_posts_team_id_idx" ON "mercenary_posts"("team_id");

-- CreateIndex
CREATE INDEX "mercenary_posts_match_date_idx" ON "mercenary_posts"("match_date");

-- CreateIndex
CREATE UNIQUE INDEX "mercenary_applications_post_id_user_id_key" ON "mercenary_applications"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "mercenary_applications_user_id_status_idx" ON "mercenary_applications"("user_id", "status");

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "sport_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercenary_posts" ADD CONSTRAINT "mercenary_posts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "sport_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercenary_posts" ADD CONSTRAINT "mercenary_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercenary_applications" ADD CONSTRAINT "mercenary_applications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "mercenary_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercenary_applications" ADD CONSTRAINT "mercenary_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: create owner membership for existing teams
INSERT INTO team_memberships (id, team_id, user_id, role, status, joined_at)
SELECT
  gen_random_uuid(),
  id,
  owner_id,
  'owner',
  'active',
  created_at
FROM sport_teams
ON CONFLICT (team_id, user_id) DO NOTHING;
