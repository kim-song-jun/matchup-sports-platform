-- CreateEnum
CREATE TYPE "V1OpsReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "V1OpsReportReason" AS ENUM ('safety', 'fraud', 'spam', 'inappropriate', 'payment', 'other');

-- CreateEnum
CREATE TYPE "V1OpsDisputeStatus" AS ENUM ('open', 'assigned', 'waiting_party', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "V1OpsDisputeReason" AS ENUM ('match_cancelled', 'no_show', 'payment_refund', 'settlement', 'conduct', 'other');

-- CreateEnum
CREATE TYPE "V1OpsCaseEventType" AS ENUM ('report_created', 'report_status_changed', 'dispute_created', 'dispute_status_changed', 'payment_order_created', 'payment_confirmed', 'payment_failed', 'payment_webhook_received', 'refund_requested', 'refund_status_changed', 'settlement_status_changed', 'payout_requested', 'payout_status_changed', 'note');

-- CreateEnum
CREATE TYPE "V1PaymentProvider" AS ENUM ('toss');

-- CreateEnum
CREATE TYPE "V1PaymentOrderStatus" AS ENUM ('pending', 'confirmed', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'expired');

-- CreateEnum
CREATE TYPE "V1PaymentTransactionStatus" AS ENUM ('ready', 'done', 'failed', 'canceled', 'partial_canceled');

-- CreateEnum
CREATE TYPE "V1RefundStatus" AS ENUM ('requested', 'reviewing', 'approved', 'rejected', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "V1SettlementSellerStatus" AS ENUM ('pending', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "V1SettlementAccountStatus" AS ENUM ('pending', 'verified', 'rejected', 'disabled');

-- CreateEnum
CREATE TYPE "V1SettlementBatchStatus" AS ENUM ('draft', 'reviewing', 'approved', 'payout_requested', 'partially_paid', 'paid', 'failed', 'held');

-- CreateEnum
CREATE TYPE "V1SettlementItemStatus" AS ENUM ('pending', 'approved', 'held', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "V1PayoutAttemptStatus" AS ENUM ('requested', 'processing', 'succeeded', 'failed', 'partial', 'cancelled');

-- CreateTable
CREATE TABLE "v1_ops_reports" (
    "id" TEXT NOT NULL,
    "reporter_user_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" "V1OpsReportReason" NOT NULL,
    "description" TEXT,
    "status" "V1OpsReportStatus" NOT NULL DEFAULT 'open',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assigned_admin_user_id" TEXT,
    "resolved_admin_user_id" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "v1_ops_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_ops_disputes" (
    "id" TEXT NOT NULL,
    "reporter_user_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" "V1OpsDisputeReason" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "V1OpsDisputeStatus" NOT NULL DEFAULT 'open',
    "amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "assigned_admin_user_id" TEXT,
    "resolved_admin_user_id" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "v1_ops_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_payment_orders" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "order_name" TEXT NOT NULL,
    "status" "V1PaymentOrderStatus" NOT NULL DEFAULT 'pending',
    "provider" "V1PaymentProvider" NOT NULL DEFAULT 'toss',
    "provider_payment_key" TEXT,
    "provider_order_id" TEXT,
    "requested_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_payment_transactions" (
    "id" TEXT NOT NULL,
    "payment_order_id" TEXT NOT NULL,
    "provider" "V1PaymentProvider" NOT NULL DEFAULT 'toss',
    "provider_transaction_id" TEXT,
    "payment_key" TEXT,
    "order_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "V1PaymentTransactionStatus" NOT NULL,
    "raw_payload_json" JSONB,
    "requested_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_payment_refunds" (
    "id" TEXT NOT NULL,
    "payment_order_id" TEXT NOT NULL,
    "requester_user_id" TEXT,
    "reviewed_by_admin_user_id" TEXT,
    "provider_refund_id" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "V1RefundStatus" NOT NULL DEFAULT 'requested',
    "provider_status" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_settlement_sellers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "V1SettlementSellerStatus" NOT NULL DEFAULT 'pending',
    "provider_seller_id" TEXT,
    "display_name" TEXT NOT NULL,
    "business_type" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kyc_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_settlement_sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_settlement_accounts" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "status" "V1SettlementAccountStatus" NOT NULL DEFAULT 'pending',
    "bank_name" TEXT NOT NULL,
    "account_last4" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_settlement_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_settlement_batches" (
    "id" TEXT NOT NULL,
    "batch_key" TEXT NOT NULL,
    "status" "V1SettlementBatchStatus" NOT NULL DEFAULT 'draft',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "hold_reason" TEXT,
    "created_by_admin_user_id" TEXT,
    "reviewed_by_admin_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "payout_requested_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_settlement_items" (
    "id" TEXT NOT NULL,
    "settlement_batch_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "fee_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "status" "V1SettlementItemStatus" NOT NULL DEFAULT 'pending',
    "hold_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_payout_attempts" (
    "id" TEXT NOT NULL,
    "settlement_batch_id" TEXT NOT NULL,
    "requested_by_admin_user_id" TEXT NOT NULL,
    "provider_payout_id" TEXT,
    "status" "V1PayoutAttemptStatus" NOT NULL DEFAULT 'requested',
    "amount" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider_confirmed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "raw_payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_ops_case_events" (
    "id" TEXT NOT NULL,
    "event_type" "V1OpsCaseEventType" NOT NULL,
    "report_id" TEXT,
    "dispute_id" TEXT,
    "payment_order_id" TEXT,
    "refund_id" TEXT,
    "settlement_batch_id" TEXT,
    "payout_attempt_id" TEXT,
    "actor_admin_user_id" TEXT,
    "actor_user_id" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "reason" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_ops_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_ops_reports_status_priority_created_at_idx" ON "v1_ops_reports"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_reports_target_type_target_id_idx" ON "v1_ops_reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "v1_ops_reports_reporter_user_id_idx" ON "v1_ops_reports"("reporter_user_id");

-- CreateIndex
CREATE INDEX "v1_ops_reports_assigned_admin_user_id_idx" ON "v1_ops_reports"("assigned_admin_user_id");

-- CreateIndex
CREATE INDEX "v1_ops_disputes_status_created_at_idx" ON "v1_ops_disputes"("status", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_disputes_target_type_target_id_idx" ON "v1_ops_disputes"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "v1_ops_disputes_reporter_user_id_idx" ON "v1_ops_disputes"("reporter_user_id");

-- CreateIndex
CREATE INDEX "v1_ops_disputes_assigned_admin_user_id_idx" ON "v1_ops_disputes"("assigned_admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_payment_orders_order_id_key" ON "v1_payment_orders"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_payment_orders_provider_payment_key_key" ON "v1_payment_orders"("provider_payment_key");

-- CreateIndex
CREATE INDEX "v1_payment_orders_status_created_at_idx" ON "v1_payment_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "v1_payment_orders_buyer_user_id_created_at_idx" ON "v1_payment_orders"("buyer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_payment_orders_source_type_source_id_idx" ON "v1_payment_orders"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "v1_payment_transactions_payment_order_id_created_at_idx" ON "v1_payment_transactions"("payment_order_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_payment_transactions_payment_key_idx" ON "v1_payment_transactions"("payment_key");

-- CreateIndex
CREATE INDEX "v1_payment_refunds_payment_order_id_created_at_idx" ON "v1_payment_refunds"("payment_order_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_payment_refunds_status_created_at_idx" ON "v1_payment_refunds"("status", "created_at");

-- CreateIndex
CREATE INDEX "v1_payment_refunds_requester_user_id_idx" ON "v1_payment_refunds"("requester_user_id");

-- CreateIndex
CREATE INDEX "v1_payment_refunds_reviewed_by_admin_user_id_idx" ON "v1_payment_refunds"("reviewed_by_admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_settlement_sellers_user_id_key" ON "v1_settlement_sellers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_settlement_sellers_provider_seller_id_key" ON "v1_settlement_sellers"("provider_seller_id");

-- CreateIndex
CREATE INDEX "v1_settlement_sellers_status_created_at_idx" ON "v1_settlement_sellers"("status", "created_at");

-- CreateIndex
CREATE INDEX "v1_settlement_accounts_seller_id_status_idx" ON "v1_settlement_accounts"("seller_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "v1_settlement_batches_batch_key_key" ON "v1_settlement_batches"("batch_key");

-- CreateIndex
CREATE INDEX "v1_settlement_batches_status_created_at_idx" ON "v1_settlement_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "v1_settlement_batches_reviewed_by_admin_user_id_idx" ON "v1_settlement_batches"("reviewed_by_admin_user_id");

-- CreateIndex
CREATE INDEX "v1_settlement_items_settlement_batch_id_status_idx" ON "v1_settlement_items"("settlement_batch_id", "status");

-- CreateIndex
CREATE INDEX "v1_settlement_items_seller_id_created_at_idx" ON "v1_settlement_items"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_settlement_items_source_type_source_id_idx" ON "v1_settlement_items"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "v1_payout_attempts_settlement_batch_id_created_at_idx" ON "v1_payout_attempts"("settlement_batch_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_payout_attempts_requested_by_admin_user_id_idx" ON "v1_payout_attempts"("requested_by_admin_user_id");

-- CreateIndex
CREATE INDEX "v1_payout_attempts_status_created_at_idx" ON "v1_payout_attempts"("status", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_report_id_created_at_idx" ON "v1_ops_case_events"("report_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_dispute_id_created_at_idx" ON "v1_ops_case_events"("dispute_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_payment_order_id_created_at_idx" ON "v1_ops_case_events"("payment_order_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_refund_id_created_at_idx" ON "v1_ops_case_events"("refund_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_settlement_batch_id_created_at_idx" ON "v1_ops_case_events"("settlement_batch_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_payout_attempt_id_created_at_idx" ON "v1_ops_case_events"("payout_attempt_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_ops_case_events_actor_admin_user_id_created_at_idx" ON "v1_ops_case_events"("actor_admin_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "v1_ops_reports" ADD CONSTRAINT "v1_ops_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_reports" ADD CONSTRAINT "v1_ops_reports_assigned_admin_user_id_fkey" FOREIGN KEY ("assigned_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_reports" ADD CONSTRAINT "v1_ops_reports_resolved_admin_user_id_fkey" FOREIGN KEY ("resolved_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_disputes" ADD CONSTRAINT "v1_ops_disputes_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_disputes" ADD CONSTRAINT "v1_ops_disputes_assigned_admin_user_id_fkey" FOREIGN KEY ("assigned_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_disputes" ADD CONSTRAINT "v1_ops_disputes_resolved_admin_user_id_fkey" FOREIGN KEY ("resolved_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payment_orders" ADD CONSTRAINT "v1_payment_orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payment_transactions" ADD CONSTRAINT "v1_payment_transactions_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "v1_payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payment_refunds" ADD CONSTRAINT "v1_payment_refunds_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "v1_payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payment_refunds" ADD CONSTRAINT "v1_payment_refunds_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payment_refunds" ADD CONSTRAINT "v1_payment_refunds_reviewed_by_admin_user_id_fkey" FOREIGN KEY ("reviewed_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_settlement_sellers" ADD CONSTRAINT "v1_settlement_sellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_settlement_accounts" ADD CONSTRAINT "v1_settlement_accounts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "v1_settlement_sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_settlement_batches" ADD CONSTRAINT "v1_settlement_batches_created_by_admin_user_id_fkey" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_settlement_batches" ADD CONSTRAINT "v1_settlement_batches_reviewed_by_admin_user_id_fkey" FOREIGN KEY ("reviewed_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_settlement_items" ADD CONSTRAINT "v1_settlement_items_settlement_batch_id_fkey" FOREIGN KEY ("settlement_batch_id") REFERENCES "v1_settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_settlement_items" ADD CONSTRAINT "v1_settlement_items_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "v1_settlement_sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payout_attempts" ADD CONSTRAINT "v1_payout_attempts_settlement_batch_id_fkey" FOREIGN KEY ("settlement_batch_id") REFERENCES "v1_settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_payout_attempts" ADD CONSTRAINT "v1_payout_attempts_requested_by_admin_user_id_fkey" FOREIGN KEY ("requested_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "v1_ops_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "v1_ops_disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "v1_payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "v1_payment_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_settlement_batch_id_fkey" FOREIGN KEY ("settlement_batch_id") REFERENCES "v1_settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_payout_attempt_id_fkey" FOREIGN KEY ("payout_attempt_id") REFERENCES "v1_payout_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_actor_admin_user_id_fkey" FOREIGN KEY ("actor_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_ops_case_events" ADD CONSTRAINT "v1_ops_case_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
