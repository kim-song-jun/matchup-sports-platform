-- 광고 캠페인(배너·팝업) 1차: 새 테이블 2개와 소재 이미지 소유자 컬럼.
-- 전부 additive 다 — 새 테이블, 새 테이블의 인덱스·FK, 기존 테이블의 nullable 컬럼(ad_campaign_id)과 그 FK·인덱스.
-- v1_content_assets 의 기존 단일 소유자 CHECK(notice_id·popup_id)는 건드리지 않는다. 기존 테이블에 CHECK 를
-- 더하거나 바꾸는 문장은 expand-contract 게이트가 non-additive 로 보기 때문이다. 광고와 notice·popup 의 배타는
-- 첨부 시점의 앱 검사(AdsService.syncCampaignAssets)가 지킨다.

-- CreateEnum
CREATE TYPE "V1AdCampaignStatus" AS ENUM ('draft', 'published', 'stopped');
-- CreateEnum
CREATE TYPE "V1AdChannel" AS ENUM ('banner', 'popup');
-- AlterTable
ALTER TABLE "v1_content_assets" ADD COLUMN     "ad_campaign_id" TEXT;
-- CreateTable
CREATE TABLE "v1_ad_campaigns" (
    "id" TEXT NOT NULL,
    "advertiser_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "V1AdCampaignStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "banner_image_url" TEXT,
    "banner_alt_text" TEXT,
    "banner_link_url" TEXT,
    "banner_start_at" TIMESTAMP(3),
    "banner_end_at" TIMESTAMP(3),
    "popup_image_url" TEXT,
    "popup_alt_text" TEXT,
    "popup_link_url" TEXT,
    "popup_start_at" TIMESTAMP(3),
    "popup_end_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "created_by_admin_user_id" TEXT NOT NULL,
    "updated_by_admin_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "v1_ad_campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "v1_ad_campaigns_banner_window_check" CHECK ("banner_end_at" IS NULL OR "banner_start_at" IS NULL OR "banner_end_at" > "banner_start_at"),
    CONSTRAINT "v1_ad_campaigns_popup_window_check" CHECK ("popup_end_at" IS NULL OR "popup_start_at" IS NULL OR "popup_end_at" > "popup_start_at"),
    CONSTRAINT "v1_ad_campaigns_version_check" CHECK ("version" >= 1)
);
-- CreateTable
CREATE TABLE "v1_ad_campaign_daily_stats" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "channel" "V1AdChannel" NOT NULL,
    "stat_date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "v1_ad_campaign_daily_stats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "v1_ad_campaign_daily_stats_counts_check" CHECK ("impressions" >= 0 AND "clicks" >= 0)
);
-- CreateIndex
CREATE INDEX "v1_ad_campaigns_banner_window_idx" ON "v1_ad_campaigns"("status", "banner_start_at", "banner_end_at");
-- CreateIndex
CREATE INDEX "v1_ad_campaigns_popup_window_idx" ON "v1_ad_campaigns"("status", "popup_start_at", "popup_end_at");
-- CreateIndex
CREATE INDEX "v1_ad_campaigns_created_at_id_idx" ON "v1_ad_campaigns"("created_at", "id");
-- CreateIndex
CREATE UNIQUE INDEX "v1_ad_campaign_daily_stats_campaign_id_channel_stat_date_key" ON "v1_ad_campaign_daily_stats"("campaign_id", "channel", "stat_date");
-- CreateIndex
CREATE INDEX "v1_content_assets_ad_campaign_id_idx" ON "v1_content_assets"("ad_campaign_id");
-- AddForeignKey
ALTER TABLE "v1_content_assets" ADD CONSTRAINT "v1_content_assets_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "v1_ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "v1_ad_campaigns" ADD CONSTRAINT "v1_ad_campaigns_created_by_admin_user_id_fkey" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "v1_ad_campaigns" ADD CONSTRAINT "v1_ad_campaigns_updated_by_admin_user_id_fkey" FOREIGN KEY ("updated_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "v1_ad_campaign_daily_stats" ADD CONSTRAINT "v1_ad_campaign_daily_stats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "v1_ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
