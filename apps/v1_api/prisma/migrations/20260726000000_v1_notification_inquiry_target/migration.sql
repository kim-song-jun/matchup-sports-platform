-- 문의 답변 알림(inquiry_answered)이 사용할 알림 대상 타입을 추가한다.
-- 기존 'notice'/'system'을 재사용하면 알림 목록의 type 필터·아이콘 구분에서
-- 운영 공지와 1:1 문의 답변이 섞이므로 전용 값을 둔다.
-- 선례: 20260712000000_v1_drift_closure (동일 enum에 'tournament' 추가)
ALTER TYPE "V1NotificationTargetType" ADD VALUE IF NOT EXISTS 'inquiry';
