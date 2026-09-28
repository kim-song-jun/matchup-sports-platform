-- Task 176: 대회·리그 경기 명단 조정 기록과 팀원 결장 기간. 새 테이블 두 개뿐인 additive 변경이다.
-- CREATE TYPE 은 IF NOT EXISTS 를 지원하지 않고 DO 가드는 expand-contract 게이트가 거부한다.
CREATE TYPE "V1GameRosterAdjustmentAction" AS ENUM ('EXCLUDE');

CREATE TABLE IF NOT EXISTS "v1_game_roster_adjustments" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "side_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "V1GameRosterAdjustmentAction" NOT NULL,
    "reason" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    CONSTRAINT "v1_game_roster_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "v1_game_roster_adjustments_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "v1_game_roster_adjustments_side_fk" FOREIGN KEY ("side_id") REFERENCES "v1_game_sides"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "v1_game_roster_adjustments_user_fk" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "v1_game_roster_adjustments_game_id_side_id_idx" ON "v1_game_roster_adjustments"("game_id", "side_id");
CREATE INDEX IF NOT EXISTS "v1_game_roster_adjustments_user_id_idx" ON "v1_game_roster_adjustments"("user_id");
-- 활성 조정은 (경기, 사이드, 사용자)당 하나. 되돌린 행은 기록으로 남아 여러 개일 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS "v1_game_roster_adjustments_active_key"
    ON "v1_game_roster_adjustments"("game_id", "side_id", "user_id")
    WHERE "revoked_at" IS NULL;

CREATE TABLE IF NOT EXISTS "v1_team_member_unavailabilities" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    CONSTRAINT "v1_team_member_unavailabilities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "v1_team_member_unavailabilities_range_ck" CHECK ("starts_at" < "ends_at"),
    CONSTRAINT "v1_team_member_unavailabilities_team_fk" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "v1_team_member_unavailabilities_user_fk" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "v1_team_member_unavailabilities_team_id_user_id_idx" ON "v1_team_member_unavailabilities"("team_id", "user_id");
CREATE INDEX IF NOT EXISTS "v1_team_member_unavailabilities_user_id_idx" ON "v1_team_member_unavailabilities"("user_id");
