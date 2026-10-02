-- 공개 리그 목록(league-match-public.service.ts list())이 실제로 쓰는 접근 경로 두 개를 인덱스로 덮는다.
--
-- 그 API 는 regionId 로 필터하고 createdAt desc + id desc 로 정렬하며 그 정렬을 커서
-- 페이지네이션의 기준으로도 쓰는데, v1_leagues 에는 [sport_id, state] 와
-- [series_id, season_no] 만 있어 region 필터도 정렬도 인덱스를 타지 못했다(2026-08-21 재감사).
-- sport_id 쪽과 같은 모양으로 맞춘다.
--
-- 둘 다 순수 CREATE INDEX 라 expand-contract 게이트가 provably additive 로 통과한다
-- (구 인스턴스는 인덱스의 존재를 알 필요가 없고, 롤백해도 읽기 경로가 그대로다).
-- IF NOT EXISTS 는 이 저장소의 기존 인덱스 마이그레이션과 같은 관례다(재적용 안전).

CREATE INDEX IF NOT EXISTS "v1_leagues_region_id_state_idx"
ON "v1_leagues" ("region_id", "state");

CREATE INDEX IF NOT EXISTS "v1_leagues_created_at_id_idx"
ON "v1_leagues" ("created_at" DESC, "id" DESC);
