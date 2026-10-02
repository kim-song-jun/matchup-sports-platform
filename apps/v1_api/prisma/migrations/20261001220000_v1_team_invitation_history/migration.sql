-- Task 180 W4-V8: 초대 한 번 = 한 행. 재초대가 끝난 행을 pending 으로 되살려 수락·거절 기록이 사라지던 것을 막는다.
-- (팀, 사람) 전체 unique 를 대기 중 행만의 부분 unique 로 좁힌다. 이미 덮어써진 기록은 되살리지 않는다(데이터 변경 없음).
--
-- 기존 전체 unique 아래에서는 (팀, 사람)당 행이 하나뿐이라 부분 unique 를 만들 때 겹치는 대기 행이 있을 수 없다.
-- 부분 unique 를 먼저 만들고 옛 unique 를 지워, 어느 시점에도 대기 중 중복을 막는 인덱스가 하나는 있다.
CREATE UNIQUE INDEX IF NOT EXISTS "v1_team_invitations_pending_key"
    ON "v1_team_invitations"("team_id", "invited_user_id")
    WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "v1_team_invitations_team_id_invited_user_id_idx"
    ON "v1_team_invitations"("team_id", "invited_user_id");
DROP INDEX IF EXISTS "v1_team_invitations_team_id_invited_user_id_key";
