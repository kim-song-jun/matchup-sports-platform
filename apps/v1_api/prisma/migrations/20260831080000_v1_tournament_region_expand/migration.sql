-- R4-a expand: 리그를 통합 축(V1Tournament)에서 그리려면 지역이 필요하다.
--
-- **nullable 이다.** V1League.region_id 는 NOT NULL 이지만 기존 대회 행에는 지역이 없고,
-- expand 단계는 기존 행을 건드리지 않는 것이 규칙이라 NOT NULL 로 만들 수 없다.
-- 리그에서 넘어온 88행은 R4-a 백필이 채운다.
--
-- onDelete Restrict 는 v1_leagues_region_fk 와 같다 — 지역을 지우려면 그 지역을 쓰는
-- 대회부터 정리해야 한다. 지역은 마스터 데이터라 조용히 NULL 이 되면 안 된다.
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "region_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournaments_region_fk'
  ) THEN
    ALTER TABLE "v1_tournaments"
      ADD CONSTRAINT "v1_tournaments_region_fk"
      FOREIGN KEY ("region_id") REFERENCES "v1_regions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- v1_leagues 의 [region_id, state] 인덱스 의도를 승계한다: 지역 필터 + 상태로 좁히는
-- 공개 목록 질의가 그 인덱스를 타려고 만든 것이었다.
CREATE INDEX IF NOT EXISTS "v1_tournaments_region_id_status_idx"
  ON "v1_tournaments"("region_id", "status");
