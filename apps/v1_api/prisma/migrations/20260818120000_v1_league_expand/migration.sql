-- 리그 재명명 — **확장(expand) 단계**. (2026-08-18 사용자 결정: 확장-수축 2단계, 무중단)
--
-- 왜 한 번에 RENAME 하지 않는가:
--   deploy-alpha.sh 는 `prisma migrate deploy`(246행)를 컨테이너 교체(288행)보다 **먼저** 돌린다.
--   그 사이에 시드/백필/순위 재계산까지 돌기 때문에, 테이블을 그 자리에서 rename 하면
--   구버전 컨테이너가 사라진 이름을 조회해 그 구간의 요청이 전부 깨진다.
--   expand-contract 게이트가 RENAME 을 거부하는 이유도 정확히 이것이다(실측 확인).
--
-- 그래서 이 마이그레이션은 **추가만** 한다:
--   - v1_leagues / v1_league_teams 신규 테이블
--   - v1_team_matches.league_id 신규 nullable 컬럼
--   - 기존 데이터를 새 테이블로 복사(아래 백필)
-- 구 테이블(v1_team_match_series*)과 구 컬럼(series_id)은 **그대로 살아 있다** --
-- 롤링 배포 창의 구버전 컨테이너가 계속 그것을 읽기 때문이다. 새 코드는 새 쪽을 읽고
-- 쓰기는 양쪽에 한다. 구 테이블 제거는 별도 릴리스(수축 단계)에서 한다.

CREATE TYPE "V1LeagueState" AS ENUM ('draft', 'active', 'completed');

CREATE TABLE IF NOT EXISTS "v1_leagues" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sport_id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "created_by_admin_user_id" TEXT NOT NULL,
  "starts_on" TIMESTAMP(3) NOT NULL,
  "ends_on" TIMESTAMP(3) NOT NULL,
  "tie_break_json" JSONB NOT NULL,
  "state" "V1LeagueState" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_leagues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_leagues_sport_id_state_idx" ON "v1_leagues" ("sport_id", "state");

ALTER TABLE "v1_leagues"
  ADD CONSTRAINT "v1_leagues_sport_fk" FOREIGN KEY ("sport_id")
  REFERENCES "v1_sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_leagues"
  ADD CONSTRAINT "v1_leagues_region_fk" FOREIGN KEY ("region_id")
  REFERENCES "v1_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_leagues"
  ADD CONSTRAINT "v1_leagues_admin_fk" FOREIGN KEY ("created_by_admin_user_id")
  REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "v1_league_teams" (
  "id" TEXT NOT NULL,
  "league_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_league_teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_league_teams_league_team_key"
  ON "v1_league_teams" ("league_id", "team_id");
CREATE INDEX IF NOT EXISTS "v1_league_teams_team_id_idx" ON "v1_league_teams" ("team_id");

ALTER TABLE "v1_league_teams"
  ADD CONSTRAINT "v1_league_teams_league_fk" FOREIGN KEY ("league_id")
  REFERENCES "v1_leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_league_teams"
  ADD CONSTRAINT "v1_league_teams_team_fk" FOREIGN KEY ("team_id")
  REFERENCES "v1_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "v1_team_matches" ADD COLUMN IF NOT EXISTS "league_id" TEXT;

CREATE INDEX IF NOT EXISTS "v1_team_matches_league_start_at_idx"
  ON "v1_team_matches" ("league_id", "start_at");

ALTER TABLE "v1_team_matches"
  ADD CONSTRAINT "v1_team_matches_league_fk" FOREIGN KEY ("league_id")
  REFERENCES "v1_leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 백필: 구 테이블의 기존 행을 새 테이블로 복사한다 ──────────────────────────
-- **id 를 그대로 물려준다.** 새로 발급하면 v1_team_matches.league_id 를 채울 때
-- 구 series_id 와의 대응표를 따로 들고 다녀야 하고, 롤링 배포 창에서 두 컬럼이
-- 서로 다른 값을 가리키게 된다. 같은 id 를 쓰면 두 컬럼이 항상 같은 리그를 가리킨다.
-- 세 INSERT 모두 ON CONFLICT DO NOTHING 이라 재실행이 no-op 이다.

INSERT INTO "v1_leagues" (
  "id", "title", "sport_id", "region_id", "created_by_admin_user_id",
  "starts_on", "ends_on", "tie_break_json", "state", "created_at", "updated_at"
)
SELECT
  s."id", s."title", s."sport_id", s."region_id", s."created_by_admin_user_id",
  s."starts_on", s."ends_on", s."tie_break_json",
  s."state"::text::"V1LeagueState",
  s."created_at", s."updated_at"
FROM "v1_team_match_series" s
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "v1_league_teams" ("id", "league_id", "team_id", "created_at")
SELECT t."id", t."series_id", t."team_id", t."created_at"
FROM "v1_team_match_series_teams" t
ON CONFLICT ("id") DO NOTHING;

UPDATE "v1_team_matches"
SET "league_id" = "series_id"
WHERE "series_id" IS NOT NULL AND "league_id" IS NULL;
