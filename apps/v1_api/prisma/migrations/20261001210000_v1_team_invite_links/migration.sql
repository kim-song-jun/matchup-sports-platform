-- Task 180 G12: 팀 초대 링크. 새 테이블 하나뿐인 additive 변경이다.
-- 토큰 원문은 저장하지 않는다(token_salt + 서버 시크릿으로 다시 만들고 token_hash 로 조회).
CREATE TABLE IF NOT EXISTS "v1_team_invite_links" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "token_salt" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "v1_team_invite_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "v1_team_invite_links_team_fk" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "v1_team_invite_links_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_team_invite_links_token_hash_key" ON "v1_team_invite_links"("token_hash");
CREATE INDEX IF NOT EXISTS "v1_team_invite_links_team_id_created_at_idx" ON "v1_team_invite_links"("team_id", "created_at");
-- 팀당 살아 있는 링크는 하나. 재발급·만료 뒤 새로 만든 링크 이전 행은 revoked_at 이 찍혀 기록으로 남는다.
CREATE UNIQUE INDEX IF NOT EXISTS "v1_team_invite_links_active_team_key"
    ON "v1_team_invite_links"("team_id")
    WHERE "revoked_at" IS NULL;
