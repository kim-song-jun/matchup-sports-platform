-- 리그 재명명 — **수축(contract) 단계**. 확장 단계(20260818120000_v1_league_expand)의 짝이다.
--
-- 확장에서 만든 v1_leagues / v1_league_teams / v1_team_matches.league_id 로 코드가 완전히
-- 옮겨간 뒤, 여기서 구 이름을 제거한다.
--
-- 이 단계를 확장과 나눈 이유(그리고 왜 지금은 안전한가):
--   deploy-alpha.sh 는 `prisma migrate deploy`(246행)를 컨테이너 교체(289행)보다 **먼저**
--   돌린다. 그래서 삭제를 확장과 같은 릴리스에 넣었다면, 그 사이 살아 있는 구버전 컨테이너가
--   사라진 컬럼을 읽어 그 구간의 요청이 전부 깨졌을 것이다. 확장이 이미 배포돼 모든 컨테이너가
--   신 이름만 읽는 지금은 그 위험이 없다.
--
-- 착수 전 확인한 것(dev 최신 기준 전수 grep):
--   - raw SQL 에 v1_team_match_series / team_match.series_id: 0건
--   - Prisma 로 구 모델을 **읽는** 코드: 0건
--   - 테스트가 구 모델을 쓰는 곳: 0건
--   남아 있던 3곳은 이중 쓰기였고 이 릴리스에서 코드와 함께 제거한다.
--
-- **되돌릴 수 없다.** rollback-alpha 는 이미지만 되돌리고 마이그레이션은 되돌리지 않으므로
-- (스크립트에 되돌리기 경로 없음 — 스키마는 전진만), 이 시점 이전 이미지로의 롤백은 더 이상
-- 안전하지 않다. 데이터는 확장 단계에서 v1_leagues 로 **복사**됐고 그 뒤 모든 쓰기가 양쪽에
-- 반영됐으므로, 여기서 지우는 것은 사본이지 원본이 아니다.

-- FK 를 먼저 떼야 컬럼/테이블을 지울 수 있다.
ALTER TABLE "v1_team_matches" DROP CONSTRAINT IF EXISTS "v1_team_matches_series_fk";

DROP INDEX IF EXISTS "v1_team_matches_series_start_at_idx";

ALTER TABLE "v1_team_matches" DROP COLUMN IF EXISTS "series_id";

-- 자식 테이블 먼저(부모를 참조하는 FK 를 들고 있다).
DROP TABLE IF EXISTS "v1_team_match_series_teams";
DROP TABLE IF EXISTS "v1_team_match_series";

DROP TYPE IF EXISTS "V1TeamMatchSeriesState";
