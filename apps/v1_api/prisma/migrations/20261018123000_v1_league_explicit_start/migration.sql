-- Additive, constant default: existing rows retain their status and original lifecycle.
-- Old application versions omit this column and continue to create legacy-mode rows.
ALTER TABLE "v1_tournaments"
ADD COLUMN "requires_explicit_start" BOOLEAN NOT NULL DEFAULT false;
