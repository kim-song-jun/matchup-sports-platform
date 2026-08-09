-- 레인(schedule): 팀매치 ↔ 팀일정 연동 belt-and-suspenders 제약.
-- Postgres 유니크 인덱스는 NULL을 서로 다른 값으로 취급하므로, team_match_id가 NULL인
-- 일반 TRAINING/EVENT 스케줄은 계속 여러 건 허용되고 (team_id, 특정 team_match_id) 조합만
-- 최대 1건으로 강제된다. 시스템(같은 팀·같은 매치)이 스케줄을 두 번 만드는 경로를 DB 레벨에서
-- 막는다 — 대부분은 idempotency/트랜잭션 불변식으로 이미 막혀 있지만 이 제약이 마지막 방어선이다.
CREATE UNIQUE INDEX "v1_team_schedules_team_match_unique" ON "v1_team_schedules"("team_id", "team_match_id");
