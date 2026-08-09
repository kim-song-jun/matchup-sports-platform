-- 대회 그룹의 자연키 (tournament_id, name) 에 unique 를 건다.
-- 목적: alpha QA 시드가 대회를 삭제-재생성하는 대신 이 자연키로 upsert 할 수 있게 하는
-- 전제(Part 2). append-only operation_audit 가 대회를 못박아도 upsert 는 삭제하지 않으므로
-- 데드락이 구조적으로 사라진다. 동시에 같은 대회에 같은 이름 그룹이 두 번 생기는 것을 DB
-- 레벨에서 막는 방어 제약이기도 하다.
-- 안전성: alpha·prod 실측 결과 (tournament_id, name) 중복 0건이라 인덱스 생성이 실패하지 않는다.
CREATE UNIQUE INDEX "v1_tournament_groups_tournament_id_name_key" ON "v1_tournament_groups"("tournament_id", "name");
