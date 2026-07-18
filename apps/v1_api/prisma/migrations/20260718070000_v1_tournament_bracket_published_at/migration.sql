-- Task 109 Track 6: 대진표 접수마감 후 일괄 공개
-- bracketPublishedAt이 null이면 대진표(조/픽스처)가 비공개 상태. 관리자가 명시적으로
-- 공개 처리하면 이 컬럼에 타임스탬프가 기록되고, 공개 조회 API는 이 시점부터 groups/
-- fixtures를 노출한다. 멱등: 이미 컬럼이 존재해도(재실행) 오류 없이 통과.
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "bracket_published_at" TIMESTAMP(3);
