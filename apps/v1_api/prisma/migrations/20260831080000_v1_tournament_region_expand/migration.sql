-- R4-a expand: 리그를 통합 축(V1Tournament)에서 그리려면 지역이 필요하다.
--
-- **nullable 이다.** V1League.region_id 는 NOT NULL 이지만 기존 대회 행에는 지역이 없고,
-- expand 단계는 기존 행을 건드리지 않는 것이 규칙이라 NOT NULL 로 만들 수 없다.
-- 리그에서 넘어온 88행은 R4-a 백필이 채운다.
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "region_id" TEXT;

-- **`DO $$ ... $$` 로 감싸지 않는다.** expand-contract 게이트에는 DO 분기가 없어서
-- 블록 안이 무엇이든 non-additive 로 거부한다(2026-08-31 실제로 거부당했다). 맨
-- `ADD CONSTRAINT ... FOREIGN KEY` 는 전용 규칙이 있어 통과한다 — **바로 위에서 nullable 로
-- 추가한 컬럼**을 참조하기 때문이다: Postgres 의 MATCH SIMPLE 규칙상 참조 컬럼이 NULL 이면
-- FK 가 만족되므로, 이 제약은 기존 행을 하나도 거부할 수 없다.
--
-- 멱등성은 Prisma 가 `_prisma_migrations` 로 보장한다(파일당 한 번). IF NOT EXISTS 가
-- 필요한 것은 수동 적용분을 나중에 박제하는 경우이고 이 마이그레이션은 그 경우가 아니다.
--
-- ON DELETE RESTRICT 는 v1_leagues_region_fk 와 같다 — 지역은 마스터 데이터라 그것을
-- 지우려면 쓰는 대회부터 정리해야 하고, 조용히 NULL 이 되면 안 된다.
ALTER TABLE "v1_tournaments"
  ADD CONSTRAINT "v1_tournaments_region_fk"
  FOREIGN KEY ("region_id") REFERENCES "v1_regions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- v1_leagues 의 [region_id, state] 인덱스 의도를 승계한다: 지역 필터 + 상태로 좁히는
-- 공개 목록 질의가 그 인덱스를 타려고 만든 것이었다.
CREATE INDEX IF NOT EXISTS "v1_tournaments_region_id_status_idx"
  ON "v1_tournaments"("region_id", "status");
