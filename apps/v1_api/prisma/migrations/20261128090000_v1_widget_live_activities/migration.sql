-- CreateTable
CREATE TABLE "v1_widget_live_activities" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_widget_live_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v1_widget_live_activities_token_game_key" ON "v1_widget_live_activities"("token_id", "game_id");

-- CreateIndex
CREATE INDEX "v1_widget_live_activities_game_idx" ON "v1_widget_live_activities"("game_id");

-- AddForeignKey
ALTER TABLE "v1_widget_live_activities" ADD CONSTRAINT "v1_widget_live_activities_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "v1_access_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
