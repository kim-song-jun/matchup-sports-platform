-- 공개 페이지에 노출하는 사업자 정보 싱글턴 설정 테이블.
-- 행을 시드하지 않는다(expand-contract 게이트가 INSERT 를 거부한다) — 행이 없으면
-- SiteInfoSettingsService 가 빈 값 + 기본 보관 기간으로 동작하고, 첫 저장 때 upsert 로 생긴다.
CREATE TABLE IF NOT EXISTS "v1_site_info_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "company_name" TEXT,
    "representative_name" TEXT,
    "business_registration_number" TEXT,
    "address" TEXT,
    "mail_order_sales_number" TEXT,
    "contact_email" TEXT,
    "guest_inquiry_retention" TEXT,
    "updated_by_admin_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "v1_site_info_settings_pkey" PRIMARY KEY ("id")
);
