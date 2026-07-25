-- 대진표 예약 공개: 관리자가 지정한 공개 예정 시각.
-- 스케줄러를 두지 않고 조회 시점에 (now >= bracket_publish_scheduled_at) 로 공개 여부를 판정한다.
-- 대회 조회는 이미 id/status 로 좁혀지므로 이 컬럼에는 별도 인덱스를 두지 않는다
-- (부분 인덱스는 schema.prisma 로 표현할 수 없어 드리프트 게이트에 걸린다).
-- 이미 배포된 환경에서도 안전하도록 IF NOT EXISTS 가드를 둔다.
ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "bracket_publish_scheduled_at" TIMESTAMP(3);
