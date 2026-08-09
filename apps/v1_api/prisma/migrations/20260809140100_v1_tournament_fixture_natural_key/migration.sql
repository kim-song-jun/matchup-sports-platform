-- 대회 픽스처의 자연키 (tournament_id, round, fixture_number, leg_number) 에 unique 를 건다.
-- 기존 @@unique([tournamentId, id]) 는 랜덤 id 기반이라 upsert 키로 못 쓴다 — 이 자연키가
-- 있어야 alpha QA 시드가 픽스처를 삭제-재생성 대신 upsert 할 수 있다(Part 2). append-only
-- operation_audit 가 픽스처를 못박아도 upsert 는 삭제하지 않으므로 데드락이 사라진다.
-- 안전성: alpha·prod 실측 결과 이 자연키 중복 0건이라 인덱스 생성이 실패하지 않는다.
CREATE UNIQUE INDEX "v1_tournament_fixtures_tournament_round_number_leg_key" ON "v1_tournament_fixtures"("tournament_id", "round", "fixture_number", "leg_number");
