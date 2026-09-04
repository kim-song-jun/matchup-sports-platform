-- Task 167 — 대회 참가 명단에 등번호
--
-- 정본 §3 은 명단을 "등번호 + 이름" 으로 정의하는데 등번호가 살 자리가 없었다. 등번호는
-- 이미 두 층에 있다(`v1_team_memberships.jersey_number` = 팀 고정,
-- `v1_game_participants.jersey_number` = 경기 라인업). **없는 건 참가 명단 층뿐**이다.
--
-- ## additive · 백필 없음
-- nullable 로 넣는다 — 등번호는 선택 입력이고, 기존 명단 행은 전부 `NULL` 로 남는다.
-- 그래서 아래 unique 인덱스도 안전하다: Postgres 는 NULL 을 서로 다른 값으로 보므로
-- 번호 없는 선수가 한 팀에 여럿 있어도 충돌하지 않는다.
--
-- ## 유일성은 등록(팀) 단위다
-- 같은 대회의 **다른 팀**이 같은 번호를 쓰는 것은 정상이다. 그래서 스코프가
-- `registration_id` 다 — 대회 단위로 걸면 7번을 한 팀만 달 수 있게 된다.
--
-- 서비스 검사만 두면 동시 저장에서 중복이 통과하므로 DB 제약을 함께 건다.
-- 살아 있는 행만 대상이다(`removed_at IS NULL`) — 뺀 선수가 번호를 계속 점유하면
-- 그 번호를 다시 못 쓴다.
ALTER TABLE "v1_tournament_players"
  ADD COLUMN IF NOT EXISTS "jersey_number" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_players_registration_jersey_key"
  ON "v1_tournament_players" ("registration_id", "jersey_number")
  WHERE "removed_at" IS NULL AND "jersey_number" IS NOT NULL;
