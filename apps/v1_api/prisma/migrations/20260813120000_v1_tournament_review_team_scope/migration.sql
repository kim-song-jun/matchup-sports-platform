-- 대회 후기의 중복 방지 단위를 "작성자 개인"에서 "참가 팀"으로 넓힌다.
-- 작성 권한이 신청자 1명에서 참가 팀의 owner|manager 전원으로 확대되므로,
-- team_id 가 팀당 1건 제약의 기준이 된다.

ALTER TABLE "v1_tournament_reviews" ADD COLUMN "team_id" TEXT;

-- 기존 후기 백필: 작성자가 낸 confirmed 등록에서 팀을 역추적한다.
-- 두 경우는 의도적으로 null 로 남긴다(기존 후기는 하나도 삭제하지 않는다).
--   1) 한 작성자가 같은 대회에 여러 팀을 신청한 경우 — 어느 팀의 후기인지 단정할 수 없음
--   2) 같은 팀에서 이미 2건 이상 작성된 경우 — 가장 먼저 작성된 1건에만 team_id 를 부여
-- Postgres UNIQUE 는 NULL 을 서로 다른 값으로 취급하므로 남은 행들은 제약에 걸리지 않는다.
WITH single_registration AS (
  SELECT
    reg."tournament_id",
    reg."applied_by_user_id",
    MIN(reg."team_id") AS team_id
  FROM "v1_tournament_registrations" reg
  WHERE reg."status" = 'confirmed'
  GROUP BY reg."tournament_id", reg."applied_by_user_id"
  HAVING COUNT(*) = 1
),
candidate AS (
  SELECT
    r."id",
    s.team_id,
    ROW_NUMBER() OVER (
      PARTITION BY r."tournament_id", s.team_id
      ORDER BY r."created_at" ASC, r."id" ASC
    ) AS rn
  FROM "v1_tournament_reviews" r
  JOIN single_registration s
    ON s."tournament_id" = r."tournament_id"
   AND s."applied_by_user_id" = r."author_user_id"
)
UPDATE "v1_tournament_reviews" r
SET "team_id" = c.team_id
FROM candidate c
WHERE r."id" = c."id"
  AND c.rn = 1;

ALTER TABLE "v1_tournament_reviews"
  ADD CONSTRAINT "v1_tournament_reviews_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "v1_tournament_reviews_tournament_id_team_id_key"
  ON "v1_tournament_reviews"("tournament_id", "team_id");

-- 작성자 단위 제약을 팀 단위로 대체한다. 두 참가 팀의 owner/manager 를 겸한 사람은
-- 팀마다 1건씩 남길 수 있어야 하므로, 작성자 unique 는 오히려 정상 경로를 막는다.
DROP INDEX IF EXISTS "v1_tournament_reviews_tournament_id_author_user_id_key";
ALTER TABLE "v1_tournament_reviews"
  DROP CONSTRAINT IF EXISTS "v1_tournament_reviews_tournament_id_author_user_id_key";

CREATE INDEX IF NOT EXISTS "v1_tournament_reviews_author_user_id_idx"
  ON "v1_tournament_reviews"("author_user_id");
