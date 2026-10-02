BEGIN;

-- Prevent legacy/direct outbox claims from racing a guarded TeamMatch cutover.
-- The cutover owns the exclusive (168, 3001) advisory lock; a claim takes
-- the shared counterpart and is suppressed when the exclusive lock is held.
CREATE OR REPLACE FUNCTION v1_guard_outbox_cutover_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'PROCESSING'::"V1OutboxStatus"
     AND OLD.status IS DISTINCT FROM 'PROCESSING'::"V1OutboxStatus"
     AND NOT pg_try_advisory_xact_lock_shared(168, 3001) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER v1_guard_outbox_cutover_claim
BEFORE UPDATE OF status ON v1_outbox_events
FOR EACH ROW
EXECUTE FUNCTION v1_guard_outbox_cutover_claim();

COMMIT;
