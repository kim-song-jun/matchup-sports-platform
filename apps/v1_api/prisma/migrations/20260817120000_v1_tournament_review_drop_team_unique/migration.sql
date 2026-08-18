-- 대회 후기의 "팀당 1건" 제약을 드롭한다.
--
-- 왜: 같은 팀의 팀장이 먼저 쓰면 운영진이 ALREADY_REVIEWED 로 막혔다. 경기 후기는 이미
-- 중복 방지 단위가 사람이라(20260812... 팀→사람 전환), 같은 성격의 "팀을 대표한 평가"가
-- 대회에서만 팀당 1건으로 남아 두 도메인이 어긋나 있었다. 대회당 사람 1건
-- (v1_tournament_reviews_tournament_id_author_user_id_key)은 그대로 유지한다.
--
-- 롤링 배포 안전: DROP 은 제약을 푸는 방향이라 구/신 앱 어느 쪽도 깨지지 않는다. 구 앱은
-- 여전히 서비스 계층에서 팀 중복을 막으므로 이 인덱스가 없어도 같은 행을 만들지 않는다.
DROP INDEX IF EXISTS "v1_tournament_reviews_tournament_id_team_id_key";
