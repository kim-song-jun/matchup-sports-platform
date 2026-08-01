BEGIN;

ALTER TABLE "v1_tournament_fixtures"
  ADD COLUMN "field_id" TEXT;

CREATE UNIQUE INDEX "v1_tournament_fixtures_tournament_id_id_key"
  ON "v1_tournament_fixtures"("tournament_id", "id");

ALTER TABLE "v1_operation_audits"
  ADD COLUMN "tournament_id" TEXT,
  ADD COLUMN "fixture_id" TEXT,
  ADD COLUMN "field_id" TEXT;

CREATE INDEX "v1_operation_audits_request_idx"
  ON "v1_operation_audits"("request_id");
CREATE INDEX "v1_operation_audits_tournament_idx"
  ON "v1_operation_audits"("tournament_id", "created_at");
CREATE INDEX "v1_operation_audits_fixture_idx"
  ON "v1_operation_audits"("fixture_id", "created_at");
CREATE INDEX "v1_operation_audits_field_idx"
  ON "v1_operation_audits"("field_id", "created_at");

ALTER TABLE "v1_operation_audits"
  ADD CONSTRAINT "v1_operation_audits_scope_ck"
  CHECK (
    ("fixture_id" IS NULL OR "tournament_id" IS NOT NULL)
    AND ("field_id" IS NULL OR "tournament_id" IS NOT NULL)
  );

-- The existing source_ip column is retained for SQL compatibility, but its
-- persistence contract is masked-only (/24 for IPv4 and /64 for IPv6).
CREATE OR REPLACE FUNCTION v1_mask_audit_source_ip(value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $function$
DECLARE
  parsed INET;
BEGIN
  parsed := value::INET;
  RETURN host(network(set_masklen(parsed, CASE family(parsed) WHEN 4 THEN 24 ELSE 64 END)));
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$function$;

UPDATE "v1_operation_audits"
SET "source_ip" = v1_mask_audit_source_ip("source_ip")
WHERE "source_ip" IS NOT NULL;

ALTER TABLE "v1_operation_audits"
  ADD CONSTRAINT "v1_operation_audits_masked_source_ip_ck"
  CHECK (
    "source_ip" IS NULL
    OR (
      v1_mask_audit_source_ip("source_ip") IS NOT NULL
      AND "source_ip" = v1_mask_audit_source_ip("source_ip")
    )
  );

ALTER TABLE "v1_tournament_fields"
  ADD CONSTRAINT "v1_tournament_fields_tournament_fk"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_staff_assignments"
  ADD CONSTRAINT "v1_tournament_staff_assignments_tournament_fk"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "v1_tournament_staff_assignments_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "v1_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "v1_tournament_staff_assignments_grantor_fk"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "v1_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_fixtures"
  ADD CONSTRAINT "v1_tournament_fixtures_field_fk"
  FOREIGN KEY ("tournament_id", "field_id")
  REFERENCES "v1_tournament_fields"("tournament_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "v1_operation_audits"
  ADD CONSTRAINT "v1_operation_audits_tournament_fk"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "v1_operation_audits_fixture_fk"
  FOREIGN KEY ("tournament_id", "fixture_id")
  REFERENCES "v1_tournament_fixtures"("tournament_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "v1_operation_audits_field_fk"
  FOREIGN KEY ("tournament_id", "field_id")
  REFERENCES "v1_tournament_fields"("tournament_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION v1_reject_operation_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'v1_operation_audits_append_only: % is forbidden', TG_OP
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER v1_operation_audits_append_only
BEFORE UPDATE OR DELETE ON "v1_operation_audits"
FOR EACH ROW
EXECUTE FUNCTION v1_reject_operation_audit_mutation();

COMMIT;
