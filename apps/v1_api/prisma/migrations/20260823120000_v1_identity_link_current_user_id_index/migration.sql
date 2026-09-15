-- Task 154 P0-2: userId 역방향 조회 인덱스.
-- `PublicUserRecordsService.loadEligibleRows` 와 `countOwnerVisibleParticipations` 가 둘 다
-- `WHERE user_id = $1` 로 시작하는데 이 컬럼에 인덱스가 없어 전체 스캔이었다.
-- 순수 additive -- 기존 행이나 쿼리 결과를 바꾸지 않는다.
CREATE INDEX IF NOT EXISTS "v1_identity_link_current_user_id_idx"
  ON "v1_participant_identity_link_current" ("user_id");
