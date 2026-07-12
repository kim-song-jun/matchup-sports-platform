DO $$
DECLARE
  index_name text;
BEGIN
  IF to_regclass('public.v1_tournament_registrations') IS NOT NULL THEN
    FOR index_name IN
      SELECT idx.relname
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      CROSS JOIN LATERAL (
        SELECT array_agg(att.attname::text ORDER BY keys.ordinality) AS columns
        FROM unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = keys.attnum
      ) indexed_columns
      WHERE ns.nspname = 'public'
        AND tbl.relname = 'v1_tournament_registrations'
        AND i.indisunique
        AND indexed_columns.columns IN (
          ARRAY['tournament_id'],
          ARRAY['tournament_id', 'applied_by_user_id'],
          ARRAY['applied_by_user_id', 'tournament_id']
        )
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
    END LOOP;

    DROP INDEX IF EXISTS "v1_tournament_registrations_tournament_id_team_id_key";

    CREATE UNIQUE INDEX "v1_tournament_registrations_tournament_id_team_id_key"
      ON "v1_tournament_registrations"("tournament_id", "team_id");
  END IF;
END $$;
