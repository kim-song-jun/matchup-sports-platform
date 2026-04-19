-- Migration: marketplace_payment_lifecycle
-- Adds escrow columns to marketplace_orders, extends enums, and creates
-- Payout, Dispute, DisputeMessage models.
--
-- NOTE: ALTER TYPE ADD VALUE must be executed outside a transaction block in
-- PostgreSQL. Prisma runs migrations in transactions by default, so each
-- ADD VALUE statement uses a separate DO $$ BEGIN ... END $$ guard pattern
-- to be idempotent and safe.

-- ─── Step 1: PaymentStatus enum — no new values needed for marketplace lifecycle ─────────────────
-- 'held' and 'released' are NOT added: marketplace uses OrderStatus.escrow_held/auto_released instead.

-- ─── Step 2: Extend SettlementStatus enum ──────────────────────────────────

ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'held';

-- ─── Step 3: Extend NotificationType enum ──────────────────────────────────

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_order_shipped';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_order_delivered';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_order_completed';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_order_disputed';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_order_refunded';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_dispute_message';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_dispute_resolved';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketplace_payout_paid';

-- ─── Step 4: Extend OrderStatus enum ──────────────────────────────────────
-- auto_released was added in the previous migration but kept here for
-- completeness and idempotency guard.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'auto_released';

-- ─── Step 5: Create new enums ──────────────────────────────────────────────

CREATE TYPE "DisputeStatus" AS ENUM (
  'filed',
  'seller_responded',
  'admin_reviewing',
  'resolved_refund',
  'resolved_release',
  'withdrawn',
  'dismissed'
);

CREATE TYPE "DisputeActorRole" AS ENUM (
  'buyer',
  'seller',
  'admin'
);

CREATE TYPE "DisputeTargetType" AS ENUM (
  'marketplace_order',
  'team_match'
);

CREATE TYPE "PayoutStatus" AS ENUM (
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled'
);

-- ─── Step 6: Extend marketplace_orders table ───────────────────────────────

ALTER TABLE "marketplace_orders"
  ADD COLUMN IF NOT EXISTS "auto_release_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "released_at"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmed_receipt_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "marketplace_orders_status_auto_release_at_idx"
  ON "marketplace_orders"("status", "auto_release_at");

-- ─── Step 7: Extend settlement_records table ───────────────────────────────

ALTER TABLE "settlement_records"
  ADD COLUMN IF NOT EXISTS "order_id"    TEXT,
  ADD COLUMN IF NOT EXISTS "released_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payout_id"   TEXT;

CREATE INDEX IF NOT EXISTS "settlement_records_payout_id_idx"
  ON "settlement_records"("payout_id");

CREATE UNIQUE INDEX IF NOT EXISTS "settlement_records_order_id_type_key"
  ON "settlement_records"("order_id", "type");

-- ─── Step 8: Create payouts table ─────────────────────────────────────────

CREATE TABLE "payouts" (
  "id"                       TEXT NOT NULL,
  "batch_id"                 TEXT NOT NULL,
  "recipient_id"             TEXT NOT NULL,
  "gross_amount"             INTEGER NOT NULL,
  "platform_fee"             INTEGER NOT NULL,
  "net_amount"               INTEGER NOT NULL,
  "status"                   "PayoutStatus" NOT NULL DEFAULT 'pending',
  "note"                     TEXT,
  "failure_reason"           TEXT,
  "paid_at"                  TIMESTAMP(3),
  "processed_at"             TIMESTAMP(3),
  "marked_paid_by_admin_id"  TEXT,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payouts_batch_id_idx" ON "payouts"("batch_id");
CREATE INDEX "payouts_recipient_id_status_idx" ON "payouts"("recipient_id", "status");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- ─── Step 9: Create disputes table ────────────────────────────────────────

CREATE TABLE "disputes" (
  "id"                    TEXT NOT NULL,
  "target_type"           "DisputeTargetType" NOT NULL,
  "order_id"              TEXT,
  "team_match_id"         TEXT,
  "type"                  TEXT NOT NULL,
  "status"                "DisputeStatus" NOT NULL DEFAULT 'filed',
  "buyer_id"              TEXT NOT NULL,
  "seller_id"             TEXT NOT NULL,
  "description"           TEXT NOT NULL,
  "evidence"              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "prior_order_status"    "OrderStatus" NOT NULL,
  "resolved_by_admin_id"  TEXT,
  "resolved_at"           TIMESTAMP(3),
  "resolution"            TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "disputes_order_id_key" ON "disputes"("order_id");
CREATE INDEX "disputes_status_idx" ON "disputes"("status");
CREATE INDEX "disputes_buyer_id_idx" ON "disputes"("buyer_id");
CREATE INDEX "disputes_seller_id_idx" ON "disputes"("seller_id");

-- ─── Step 10: Create dispute_messages table ────────────────────────────────

CREATE TABLE "dispute_messages" (
  "id"         TEXT NOT NULL,
  "dispute_id" TEXT NOT NULL,
  "author_id"  TEXT NOT NULL,
  "role"       "DisputeActorRole" NOT NULL,
  "body"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_messages_dispute_id_created_at_idx"
  ON "dispute_messages"("dispute_id", "created_at");

-- ─── Step 11: Add foreign key constraints ─────────────────────────────────

-- settlement_records.order_id -> marketplace_orders.id
ALTER TABLE "settlement_records"
  ADD CONSTRAINT "settlement_records_order_id_fkey"
    FOREIGN KEY ("order_id")
    REFERENCES "marketplace_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- settlement_records.payout_id -> payouts.id
ALTER TABLE "settlement_records"
  ADD CONSTRAINT "settlement_records_payout_id_fkey"
    FOREIGN KEY ("payout_id")
    REFERENCES "payouts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- payouts.recipient_id -> users.id
ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_recipient_id_fkey"
    FOREIGN KEY ("recipient_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- disputes.order_id -> marketplace_orders.id (SET NULL on delete)
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_order_id_fkey"
    FOREIGN KEY ("order_id")
    REFERENCES "marketplace_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- disputes.buyer_id -> users.id
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_buyer_id_fkey"
    FOREIGN KEY ("buyer_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- disputes.seller_id -> users.id
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_seller_id_fkey"
    FOREIGN KEY ("seller_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- dispute_messages.dispute_id -> disputes.id (CASCADE delete)
ALTER TABLE "dispute_messages"
  ADD CONSTRAINT "dispute_messages_dispute_id_fkey"
    FOREIGN KEY ("dispute_id")
    REFERENCES "disputes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- dispute_messages.author_id -> users.id
ALTER TABLE "dispute_messages"
  ADD CONSTRAINT "dispute_messages_author_id_fkey"
    FOREIGN KEY ("author_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- disputes.team_match_id -> team_matches.id (SET NULL on delete)
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_team_match_id_fkey"
    FOREIGN KEY ("team_match_id")
    REFERENCES "team_matches"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Step 12: Add force-release audit columns to marketplace_orders ────────

ALTER TABLE "marketplace_orders"
  ADD COLUMN IF NOT EXISTS "force_released_by_admin_id" TEXT,
  ADD COLUMN IF NOT EXISTS "force_released_at"          TIMESTAMP(3);

-- ─── Step 13: Create dispute_events table ─────────────────────────────────

CREATE TABLE "dispute_events" (
  "id"            TEXT NOT NULL,
  "dispute_id"    TEXT NOT NULL,
  "actor_role"    "DisputeActorRole",
  "actor_user_id" TEXT,
  "event_type"    TEXT NOT NULL,
  "payload"       JSONB,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_events_dispute_id_created_at_idx"
  ON "dispute_events"("dispute_id", "created_at");

-- dispute_events.dispute_id -> disputes.id (CASCADE delete)
ALTER TABLE "dispute_events"
  ADD CONSTRAINT "dispute_events_dispute_id_fkey"
    FOREIGN KEY ("dispute_id")
    REFERENCES "disputes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
