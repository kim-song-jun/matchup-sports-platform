-- CreateTable
CREATE TABLE "v1_team_internal_matches" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "result_recorded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_team_internal_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_team_internal_match_sides" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "side_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER,

    CONSTRAINT "v1_team_internal_match_sides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_team_internal_match_players" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "side_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "v1_team_internal_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_team_internal_match_goals" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "side_id" TEXT NOT NULL,
    "scorer_user_id" TEXT NOT NULL,
    "assist_user_id" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "v1_team_internal_match_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_team_internal_matches_team_played_idx" ON "v1_team_internal_matches"("team_id", "played_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "v1_team_internal_match_sides_match_number_key" ON "v1_team_internal_match_sides"("match_id", "side_number");

-- CreateIndex
CREATE INDEX "v1_team_internal_match_players_side_idx" ON "v1_team_internal_match_players"("side_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_team_internal_match_players_match_user_key" ON "v1_team_internal_match_players"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "v1_team_internal_match_goals_match_order_idx" ON "v1_team_internal_match_goals"("match_id", "sort_order");

-- CreateIndex
CREATE INDEX "v1_team_internal_match_goals_side_idx" ON "v1_team_internal_match_goals"("side_id");

-- AddForeignKey
ALTER TABLE "v1_team_internal_matches" ADD CONSTRAINT "v1_team_internal_matches_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_internal_match_sides" ADD CONSTRAINT "v1_team_internal_match_sides_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "v1_team_internal_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_internal_match_players" ADD CONSTRAINT "v1_team_internal_match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "v1_team_internal_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_internal_match_players" ADD CONSTRAINT "v1_team_internal_match_players_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "v1_team_internal_match_sides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_internal_match_goals" ADD CONSTRAINT "v1_team_internal_match_goals_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "v1_team_internal_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_internal_match_goals" ADD CONSTRAINT "v1_team_internal_match_goals_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "v1_team_internal_match_sides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

