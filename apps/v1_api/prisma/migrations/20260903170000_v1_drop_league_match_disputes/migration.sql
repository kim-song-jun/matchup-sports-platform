-- Task 166 contract — 리그 경기 결과 이의 테이블·enum 제거
--
-- ## 왜 지우나
-- 정본 §4 가 "결과는 보내기 → 어드민 확인 **한 단계**, 이의 없음" 으로 확정하면서 이의 경로
-- 자체가 사라졌다. expand 단계(PR #999)가 API·서비스·화면·알림을 모두 걷어냈고, 그 뒤
-- **이 테이블을 읽거나 쓰는 코드는 0** 이다(`git grep -i LeagueMatchDispute -- apps` 가
-- 남긴 것은 스키마 정의, 이 테이블을 만든 옛 마이그레이션, 그리고 주석뿐).
-- 팀이 문제를 발견하면 운영자에게 연락하고, 운영자가 콘솔에서 정정·무효한다.
--
-- ## 되돌릴 수 없다
-- 이 테이블의 행은 DROP 뒤 복원할 수 없다. 그래서 **DROP 전에 행 수를 NOTICE 로 남긴다** —
-- 승인 요청과 사후 대조가 이 숫자에 걸려 있다.
--
-- ## 배포 순서 전제
-- 이 마이그레이션은 `prisma migrate deploy` 로 컨테이너 재생성 **전에** 돈다. 지금은 이
-- 테이블을 쓰는 코드가 없으므로 옛 컨테이너가 살아 있어도 깨지지 않는다 — expand 단계가
-- 이미 배포돼 있다는 것이 그 전제이고, 위 grep 0 이 그 근거다.
DO $$
DECLARE
  -- `count(*)` 는 bigint 다. integer 로 받으면 20억 행에서 넘치는데, 그보다 중요한 건
  -- 타입이 실제 반환형과 다르면 읽는 사람이 무엇이 오는지 잘못 안다는 것이다.
  dispute_count bigint;
BEGIN
  IF to_regclass('public.v1_league_match_disputes') IS NULL THEN
    RAISE NOTICE 'task166-dispute-drop: 테이블이 이미 없다 — 건너뛴다';
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*) FROM v1_league_match_disputes' INTO dispute_count;
  RAISE NOTICE 'task166-dispute-drop: v1_league_match_disputes 행 수 = %', dispute_count;
END $$;

-- `IF EXISTS` 로 재실행 가능하게 둔다(두 번째 실행은 위 NOTICE 가 "이미 없다" 로 지나가고
-- 아래 세 문장이 전부 no-op 이다).
DROP TABLE IF EXISTS "v1_league_match_disputes";
DROP TYPE IF EXISTS "V1LeagueMatchDisputeStatus";
DROP TYPE IF EXISTS "V1LeagueMatchDisputeResolution";
