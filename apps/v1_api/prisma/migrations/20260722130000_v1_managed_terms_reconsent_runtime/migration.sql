ALTER TABLE "v1_managed_terms_documents"
  ADD COLUMN "requires_reconsent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enforcement_at" TIMESTAMP(3);

CREATE INDEX "v1_managed_terms_documents_status_enforcement_at_idx"
  ON "v1_managed_terms_documents"("status", "enforcement_at");
