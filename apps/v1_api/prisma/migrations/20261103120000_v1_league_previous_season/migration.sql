-- 독립 정규 리그의 다음 시즌 연결(2026-11-03). 새 리그가 지난 시즌 리그를 가리키고, 한 리그의 다음 시즌은 하나다.
-- 추가만 하는 변경이다(nullable 컬럼 + 유니크 인덱스 + 자기 참조 FK). 기존 행은 모두 null 로 남는다.
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "previous_league_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournaments_previous_league_id_key" ON "v1_tournaments"("previous_league_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournaments_previous_league_fk') THEN
    ALTER TABLE "v1_tournaments"
      ADD CONSTRAINT "v1_tournaments_previous_league_fk"
      FOREIGN KEY ("previous_league_id") REFERENCES "v1_tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
