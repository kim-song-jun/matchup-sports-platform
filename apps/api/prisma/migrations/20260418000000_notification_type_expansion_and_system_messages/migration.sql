-- AlterEnum: Add 14 new values to NotificationType (append-only, safe for PostgreSQL)
-- Existing rows are not affected. No rollback path needed before these values are used in production.

-- Team membership application lifecycle
ALTER TYPE "NotificationType" ADD VALUE 'team_application_received';
ALTER TYPE "NotificationType" ADD VALUE 'team_application_accepted';
ALTER TYPE "NotificationType" ADD VALUE 'team_application_rejected';

-- Team match application lifecycle
ALTER TYPE "NotificationType" ADD VALUE 'team_match_applied';
ALTER TYPE "NotificationType" ADD VALUE 'team_match_approved';
ALTER TYPE "NotificationType" ADD VALUE 'team_match_rejected';

-- Mercenary post application lifecycle
ALTER TYPE "NotificationType" ADD VALUE 'mercenary_applied';
ALTER TYPE "NotificationType" ADD VALUE 'mercenary_accepted';
ALTER TYPE "NotificationType" ADD VALUE 'mercenary_rejected';
ALTER TYPE "NotificationType" ADD VALUE 'mercenary_closed';
ALTER TYPE "NotificationType" ADD VALUE 'mercenary_cancelled';

-- Review and lesson events
ALTER TYPE "NotificationType" ADD VALUE 'review_received';
ALTER TYPE "NotificationType" ADD VALUE 'lesson_ticket_purchased';

-- Chat events (future-proof; delivery not implemented in Task 69)
ALTER TYPE "NotificationType" ADD VALUE 'chat_message';

-- AlterTable: Relax ChatMessage.senderId to nullable
-- System messages (type='system') can be stored without a real user sender.
-- Existing non-null rows remain valid; this is a DROP NOT NULL only.
ALTER TABLE "chat_messages" ALTER COLUMN "sender_id" DROP NOT NULL;
