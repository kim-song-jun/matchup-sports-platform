-- Drift fix (PR #30 통합): 20260626000000 마이그레이션의 공지 카테고리 인덱스명이
-- 64자로 Postgres 63자 제한에 잘려 "..._published_id"로 저장되는데, schema.prisma의
-- @@index([tournamentId, category, publishedAt])가 기대하는 Prisma 자동 인덱스명은
-- "..._publishe_idx"라서 migrate diff에 영구 드리프트가 남는다.
-- DB 인덱스명을 schema.prisma 기준(Prisma 네이밍)으로 정렬한다. 멱등 처리.
DROP INDEX IF EXISTS "v1_tournament_announcements_tournament_id_category_published_id";
CREATE INDEX IF NOT EXISTS "v1_tournament_announcements_tournament_id_category_publishe_idx"
  ON "v1_tournament_announcements" ("tournament_id", "category", "published_at");
