CREATE OR REPLACE FUNCTION v1_block_team_record_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'team record facts are append-only' USING ERRCODE = '55000';
END
$function$;
