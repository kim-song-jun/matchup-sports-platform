CREATE OR REPLACE FUNCTION v1_block_team_record_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) - 'played_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'played_at')
    AND OLD.played_at IS NULL
    AND NEW.played_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'team record facts are append-only' USING ERRCODE = '55000';
END
$function$;
