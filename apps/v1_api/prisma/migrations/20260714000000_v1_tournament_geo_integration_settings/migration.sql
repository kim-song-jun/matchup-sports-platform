-- 대회 장소 지오코딩 좌표 + 어드민 편집형 연동 설정(카카오맵 REST/JS 키) 저장소.
-- idempotent: 수동으로 이미 적용된 dev DB에 재실행해도 안전.

ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "v1_integration_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "kakao_rest_api_key" TEXT,
    "kakao_maps_js_key" TEXT,
    "updated_by_admin_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_integration_settings_pkey" PRIMARY KEY ("id")
);
