-- Expand only: a constant default needs no table rewrite, and every existing cookie (no epoch) reads as 0.
ALTER TABLE "v1_users" ADD COLUMN "session_epoch" INTEGER NOT NULL DEFAULT 0;
