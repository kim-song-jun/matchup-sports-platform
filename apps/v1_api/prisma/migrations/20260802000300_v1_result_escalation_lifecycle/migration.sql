ALTER TYPE "V1EscalationKind" RENAME TO "V1EscalationKind_previous";
CREATE TYPE "V1EscalationKind" AS ENUM ('ESCALATION', 'REMINDER');
ALTER TABLE "v1_result_escalations"
  ALTER COLUMN "kind" TYPE "V1EscalationKind"
  USING ("kind"::text::"V1EscalationKind");
DROP TYPE "V1EscalationKind_previous";

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

ALTER TABLE "v1_notifications"
  ADD COLUMN "business_key" TEXT;

CREATE UNIQUE INDEX "v1_notifications_business_key_key"
  ON "v1_notifications"("business_key");
