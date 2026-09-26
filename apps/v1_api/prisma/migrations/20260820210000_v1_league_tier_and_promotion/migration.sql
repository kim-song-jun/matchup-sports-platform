-- 리그 티어(1부/2부/3부) + 시즌 + 승강 — **확장(expand) 단계만** 있다. 수축 짝이 없다.
--
-- Task 153. 기존 v1_leagues 는 (종목 x 지역 x 기간) 단발 컨테이너였다. 여기에 리그 체계
-- (v1_league_series)를 얹어 하나의 시리즈 아래 "N시즌 x T티어" 인스턴스가 생기게 한다.
--
-- 왜 순수 additive 인가:
--   - 새 타입 2개 · 새 테이블 2개 · v1_leagues 에 nullable 컬럼 3개 추가가 전부다.
--   - 기존 행은 series_id / tier / season_no 가 모두 NULL 로 남는다. 구 인스턴스는 이 컬럼들의
--     존재를 모르므로 절대 값을 쓰지 않고, 신 인스턴스는 NULL 을 "시리즈에 속하지 않은 단발
--     리그"로 읽는다. 롤링 배포 양방향 안전.
--   - tier / season_no 를 NOT NULL DEFAULT 1 로 두지 않은 것은 의도다. 단발 리그는 티어가
--     "1부"인 게 아니라 티어 개념 자체가 없다 — 기본값 1 을 주면 화면에 "1부" 뱃지가 잘못
--     붙고, 나중에 시리즈로 편입할 때 진짜 1부와 구분할 수 없게 된다.
--
-- v1_leagues_series_season_tier_key 가 기존 테이블의 UNIQUE 인덱스인데도 안전한 이유:
--   Postgres 의 UNIQUE 인덱스는 NULL 끼리를 충돌로 보지 않는다. 기존 행은 세 컬럼이 전부
--   NULL 이므로 서로 충돌하지 않고, 이 인덱스는 기존 행을 단 하나도 거부하지 않는다.
--   (같은 이유로 단발 리그끼리는 앞으로도 이 제약에 걸리지 않는다.)
--
-- 멱등성 — 어디까지 되고 어디서 안 되는지:
--   되는 것: 테이블·인덱스·컬럼은 전부 IF NOT EXISTS 가드를 쓴다. 새 테이블 2개의 FK 는
--            CREATE TABLE 안에 인라인해 테이블 가드에 함께 묶었다.
--   안 되는 것: `CREATE TYPE` 2개와 마지막 `ALTER TABLE "v1_leagues" ADD CONSTRAINT
--            "v1_leagues_series_fk"`. Postgres 는 둘 다 IF NOT EXISTS 를 지원하지 않는다.
--
-- 셋을 DO 블록으로 감싸지 않은 것은 의도다. 이 저장소의 expand-contract 게이트
-- (`scripts/qa/check-expand-contract-migrations.mjs`)는 DO 블록 안을 들여다보지 못해 통째로
-- non-additive 로 거부하고, 그러면 REVIEWED_NON_ADDITIVE 예외 등록이 필요해져 게이트가 그만큼
-- 약해진다. 세 구문 모두 평문일 때 게이트가 스스로 additive 임을 증명할 수 있다 —
-- 그 편이 낫다.
--
-- 그래서 재실행 시에는 이 세 구문이 42710(duplicate_object)으로 실패한다. Prisma 는 각
-- 마이그레이션을 한 번만 적용하므로 정상 경로에서는 문제가 없고, 부분 실패 후 수동 재시도가
-- 필요해진 경우에만 해당 줄을 건너뛰고 `migrate resolve --applied` 로 박제하면 된다.

CREATE TYPE "V1LeagueSeriesState" AS ENUM ('draft', 'active', 'archived');

CREATE TYPE "V1LeaguePromotionKind" AS ENUM ('promoted', 'relegated', 'stayed', 'withdrawn');

CREATE TABLE IF NOT EXISTS "v1_league_series" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sport_id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "created_by_admin_user_id" TEXT NOT NULL,
  "tier_count" INTEGER NOT NULL DEFAULT 1,
  "promotion_rule_json" JSONB NOT NULL,
  "state" "V1LeagueSeriesState" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_league_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_league_series_sport_fk" FOREIGN KEY ("sport_id")
    REFERENCES "v1_sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_league_series_region_fk" FOREIGN KEY ("region_id")
    REFERENCES "v1_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_league_series_admin_fk" FOREIGN KEY ("created_by_admin_user_id")
    REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "v1_league_series_sport_id_region_id_state_idx"
  ON "v1_league_series"("sport_id", "region_id", "state");

CREATE TABLE IF NOT EXISTS "v1_league_promotions" (
  "id" TEXT NOT NULL,
  "from_league_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "from_tier" INTEGER NOT NULL,
  "to_tier" INTEGER NOT NULL,
  "kind" "V1LeaguePromotionKind" NOT NULL,
  "computed_kind" "V1LeaguePromotionKind" NOT NULL,
  "overridden_by_admin" BOOLEAN NOT NULL DEFAULT false,
  "override_note" TEXT,
  "decided_by_admin_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_league_promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_league_promotions_league_fk" FOREIGN KEY ("from_league_id")
    REFERENCES "v1_leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_league_promotions_team_fk" FOREIGN KEY ("team_id")
    REFERENCES "v1_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_league_promotions_admin_fk" FOREIGN KEY ("decided_by_admin_user_id")
    REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 한 시즌의 한 팀에 대한 승강 결정은 하나뿐이다 — 중복 확정을 DB 레벨에서 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS "v1_league_promotions_league_team_key"
  ON "v1_league_promotions"("from_league_id", "team_id");

CREATE INDEX IF NOT EXISTS "v1_league_promotions_team_id_idx"
  ON "v1_league_promotions"("team_id");

ALTER TABLE "v1_leagues" ADD COLUMN IF NOT EXISTS "series_id" TEXT;
ALTER TABLE "v1_leagues" ADD COLUMN IF NOT EXISTS "tier" INTEGER;
ALTER TABLE "v1_leagues" ADD COLUMN IF NOT EXISTS "season_no" INTEGER;

ALTER TABLE "v1_leagues"
  ADD CONSTRAINT "v1_leagues_series_fk"
  FOREIGN KEY ("series_id") REFERENCES "v1_league_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "v1_leagues_series_season_tier_key"
  ON "v1_leagues"("series_id", "season_no", "tier");

CREATE INDEX IF NOT EXISTS "v1_leagues_series_id_season_no_idx"
  ON "v1_leagues"("series_id", "season_no");
