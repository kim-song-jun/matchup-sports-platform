-- "V1EscalationKind" used to be created as ('REMINDER', 'ESCALATION') in
-- 20260729000100_v1_game_operations and then immediately rename/recreate/
-- alter-column/drop'd here into ('ESCALATION', 'REMINDER') — the same two
-- values, just reordered. v1_result_escalations (the only table with a
-- column of this type) is itself new in this same migration batch, so
-- nothing has ever depended on the original order; 20260729000100 now
-- declares the enum with the final ('ESCALATION', 'REMINDER') order
-- directly (matching schema.prisma), which makes this whole rename dance
-- dead work rather than something that needs an expand/contract split.
ALTER TYPE "V1EscalationStatus" ADD VALUE 'CLOSED';

ALTER TABLE "v1_result_escalations"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "v1_result_escalations"
  ADD CONSTRAINT "v1_result_escalations_revision_fk"
  FOREIGN KEY ("result_revision_id")
  REFERENCES "v1_game_result_revisions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "v1_result_escalations"
  ADD CONSTRAINT "v1_result_escalations_ack_user_fk"
  FOREIGN KEY ("ack_by_user_id")
  REFERENCES "v1_users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "v1_result_escalations"
  ADD CONSTRAINT "v1_result_escalations_resolved_user_fk"
  FOREIGN KEY ("resolved_by_user_id")
  REFERENCES "v1_users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE TRIGGER v1_result_escalation_version_cas
BEFORE UPDATE ON "v1_result_escalations"
FOR EACH ROW EXECUTE FUNCTION v1_guard_version_increment();

-- v1_notifications is a pre-existing table with live rows. This unique
-- index is additive despite that: business_key is nullable and brand new
-- (added by the very next statement), a legacy app instance never
-- populates it (leaves every row NULL), and Postgres unique indexes never
-- treat two NULLs as colliding — so no pre-existing or legacy-app-written
-- row can ever violate it. This also is NOT merely a nice-to-have: real,
-- already-shipped code
-- (apps/v1_api/src/jobs/result-escalation/game-result-submitted-escalation.service.ts's
-- notifyReviewer()) does a raw `INSERT ... ON CONFLICT (business_key) DO
-- NOTHING`, which requires this exact index to exist or the whole
-- surrounding transaction throws
-- "no unique or exclusion constraint matching the ON CONFLICT
-- specification" — confirmed by actually running the Task 22 result-review
-- integration suite against a build that deferred this index, which
-- silently dropped every GAME_RESULT_SUBMITTED escalation because the
-- failure rolled the whole outbox-handler transaction back. Deferring it
-- would not have been an expand/contract nuance, it would have been a
-- regression.
ALTER TABLE "v1_notifications"
  ADD COLUMN "business_key" TEXT;

CREATE UNIQUE INDEX "v1_notifications_business_key_key"
  ON "v1_notifications"("business_key");
