# Sourced only (no shebang, not directly executable). Shared between
# deploy/task168-stage-b-migrate.sh (the runner, right after M11 commits) and
# deploy/deploy-alpha-stage-b.sh (stageBRecover's R-A branch), so the ledger
# and catalog evidence a MIGRATION_COMMITTED (or _RECOVERED) receipt rests on
# is one piece of code in both places, not two copies that can drift apart.
#
# Callers must define dbq() (psql -At against the already-identity-verified
# database) and fail() before calling anything below, and must set MANIFEST,
# RESOLVED_ATTEMPTS_SHA and FULL_MIGRATION_HISTORY before calling the
# functions that read them (assert_resolved_attempts, assert_full_ledger,
# ledger_assert_exact). The Task168 name/checksum constants and their short
# aliases (M11, M1, M8, M9, M10, ALL_MIGRATIONS, TASK_SCHEMA_SHA) are set here
# so both callers see the exact same values.

readonly TASK168_M11=20260911090000_retire_tournament_fixture_tables
readonly TASK168_M11_SHA256=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly TASK168_M1=(20260908130000_v1_team_match_tournament_expand 20260908150000_v1_operation_audit_team_match_expand 20260908160000_v1_official_fact_team_match_scope 20260908170000_v1_lineup_invalidation 20260908180000_v1_staff_scope_team_match 20260909000000_v1_tournament_result_lineage 20260909110000_v1_operation_audit_canonical_binding)
readonly TASK168_M8=20260910010000_v1_official_fact_source_history
readonly TASK168_M9=20260910020000_v1_canonical_game_db_guards
readonly TASK168_M10=20260910160000_v1_outbox_cutover_claim_gate
readonly TASK168_ALL_MIGRATIONS=("${TASK168_M1[@]}" "$TASK168_M8" "$TASK168_M9" "$TASK168_M10" "$TASK168_M11")
readonly TASK168_FINAL_SCHEMA_SHA256=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46

# Short aliases the functions below are written against.
readonly M11="$TASK168_M11" M11_SHA="$TASK168_M11_SHA256"
readonly M1=("${TASK168_M1[@]}")
readonly M8="$TASK168_M8" M9="$TASK168_M9" M10="$TASK168_M10"
readonly ALL_MIGRATIONS=("${TASK168_ALL_MIGRATIONS[@]}")
readonly TASK_SCHEMA_SHA="$TASK168_FINAL_SCHEMA_SHA256"

full_ledger_rows(){ dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL ORDER BY migration_name,id"; }
resolved_attempt_rows(){ dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || COALESCE(finished_at::text,'') || '|' || COALESCE(rolled_back_at::text,'') FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL ORDER BY migration_name,rolled_back_at,checksum,id"; }
resolved_attempt_sha(){ local rows; rows="$(resolved_attempt_rows)" || fail 'resolved migration-attempt query failed'; printf '%s' "$rows" | sha256sum | awk '{print $1}'; }
assert_resolved_attempts(){ [[ "$(resolved_attempt_sha)" == "$RESOLVED_ATTEMPTS_SHA" ]] || fail 'resolved migration-attempt audit snapshot changed'; [[ "$(dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE (finished_at IS NULL AND rolled_back_at IS NULL) OR (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)")" == 0 ]] || fail 'unresolved or unclassified migration attempt exists'; }
expected_full_ledger(){ local include_m11="$1"; jq -r --arg m11 "$M11" --argjson include "$include_m11" '.[] | select($include or .name != $m11) | .name + "|" + .sha256 + "|applied"' <<<"$FULL_MIGRATION_HISTORY"; }
assert_full_ledger_rows(){ local include_m11="$1" actual="$2" expected; expected="$(expected_full_ledger "$include_m11")"; [[ "$actual" == "$expected" ]] || fail 'database migration ledger differs from the complete source history'; }
assert_full_ledger(){ local include_m11="$1" actual; actual="$(full_ledger_rows)" || fail 'complete migration ledger query failed'; assert_full_ledger_rows "$include_m11" "$actual"; }
ledger_rows(){ dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL AND migration_name IN ('${M1[0]}','${M1[1]}','${M1[2]}','${M1[3]}','${M1[4]}','${M1[5]}','${M1[6]}','$M8','$M9','$M10','$M11') ORDER BY migration_name"; }
ledger_assert_exact(){
  local expected_count="$1"; local rows="$2"; shift 2; local name expected actual
  [[ "$(grep -c '|applied$' <<<"$rows")" == "$expected_count" ]] || fail "ledger does not contain exactly $expected_count applied migrations"
  for name in "$@"; do
    expected="$(jq -er --arg n "$name" '.database.task168.migrations[] | select(.name==$n) | .sha256' "$MANIFEST")" || fail "manifest checksum unavailable: $name"
    [[ "$(grep -c "^$name|" <<<"$rows")" == 1 ]] || fail "ledger does not contain exactly one row for $name"
    actual="$(awk -F'|' -v n="$name" '$1==n {print $2}' <<<"$rows")"
    [[ "$actual" == "$expected" ]] || fail "database ledger checksum mismatch: $name"
  done
}

# Direct-catalog evidence M11's DDL landed: legacy tables/columns/functions/
# triggers gone, the guard functions and CHECK constraints M11 rewrites are
# exactly as expected, retired enum types gone, no outbox event stuck
# mid-processing. Returns 0 and prints nothing when every invariant holds;
# otherwise prints one short violation code and returns 1, so each caller can
# translate it into its own wording (the runner and stageBRecover's R-A have
# used different phrasing for the same failure since before this file
# existed, and existing tests assert on that exact wording).
post_m11_catalog_violation(){
  [[ "$(dbq "SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL")" == 0 ]] || { echo legacy_tables; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_block_tournament_result_lineage_game_reparent' AND t.tgfoid=to_regprocedure('v1_block_tournament_result_lineage_game_reparent()') AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal AND t.tgrelid='v1_games'::regclass")" == 1 ]] || { echo lineage_trigger; return 1; }
  [[ "$(dbq "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='v1_games_canonical_source_guard_ck'")" == "CHECK ((((source_type)::text = 'TEAM_MATCH'::text) AND (team_match_id IS NOT NULL)))" ]] || { echo games_guard_ck; return 1; }
  [[ "$(dbq "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='v1_staff_scope_canonical_source_guard_ck'")" == "CHECK (((team_match_id IS NOT NULL) AND (tournament_id IS NOT NULL)))" ]] || { echo staff_guard_ck; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_constraint WHERE conname='v1_operation_audits_canonical_source_guard_ck'")" == 0 ]] || { echo audit_guard_ck; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_resolve_canonical_guard_game' AND pg_get_function_result(p.oid)='TABLE(team_match_id text, semantic_tournament_id text, home_team_id text, away_team_id text)'")" == 1 ]] || { echo guard_fn_resolve; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_guard_staff_fixture_scope' AND pg_get_function_result(p.oid)='trigger'")" == 1 ]] || { echo guard_fn_staff; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_guard_tournament_result_lineage_insert' AND pg_get_function_result(p.oid)='trigger'")" == 1 ]] || { echo guard_fn_lineage; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_type WHERE typname IN ('V1TournamentGoalTeam','V1TournamentFixtureStatus')")" == 0 ]] || { echo retired_enums; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_proc WHERE proname IN ('v1_reject_retired_tournament_fixture_write','v1_reject_retired_tournament_fixture_link')")" == 0 ]] || { echo retirement_functions; return 1; }
  [[ "$(dbq "SELECT count(*) FROM pg_trigger WHERE tgname IN ('v1_tournament_fixture_retired_write','v1_tournament_fixture_retired_row_write','v1_000_tournament_fixture_retired_link')")" == 0 ]] || { echo retirement_triggers; return 1; }
  [[ "$(dbq "SELECT count(*) FROM (VALUES ('tournament_fixture_id'),('fixture_id')) x(name) WHERE EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.column_name=x.name AND c.table_name IN ('v1_games','v1_tournament_staff_fixture_scopes','v1_operation_audits'))")" == 0 ]] || { echo legacy_link_columns; return 1; }
  [[ "$(dbq "SELECT count(*) FROM v1_outbox_events WHERE status::text='PROCESSING'")" == 0 ]] || { echo processing_outbox; return 1; }
  return 0
}

# Read-only `prisma migrate status`, using a migration source directory that
# already contains schema.prisma + migrations/ (the runner copies its own
# into a long-lived container instead of calling this; this throwaway-
# container form is for stageBRecover, which has no running migration
# container left to exec into). Goes through `compose run` (caller must
# define a `compose` array, matching dbq's convention), not a bare
# `docker create <image>` -- verified experimentally that the latter has
# neither the DATABASE_URL nor the network the compose-managed v1_api service
# has, and fails closed with "Environment variable not found: DATABASE_URL"
# before ever reaching prisma. The caller must have already confirmed
# compose's current v1_api image is the pinned final image (the runner does
# the equivalent check at task168-stage-b-migrate.sh's "compose v1_api image
# does not match the immutable manifest image").
assert_prisma_migrate_status_clean(){
  local source_dir="$1" cid rc
  # `compose create` does not accept --no-deps/--entrypoint/a command
  # override (verified: "unknown flag: --no-deps") -- only `run` does, so
  # this uses the exact same `run -d --no-deps --entrypoint sh` shape the
  # runner itself uses for its own migration container.
  cid="$("${compose[@]}" run --pull never -d --no-deps --entrypoint sh v1_api -c 'while :; do sleep 3600; done')" || fail 'could not create a status-check container'
  docker exec -u 0 "$cid" sh -ceu 'mkdir -p /tmp/task168.staging' || { docker rm -f "$cid" >/dev/null 2>&1; fail 'could not prepare the status-check container'; }
  docker cp "$source_dir/." "$cid:/tmp/task168.staging" || { docker rm -f "$cid" >/dev/null 2>&1; fail 'could not copy the frozen migration source into the status-check container'; }
  docker exec -u 0 "$cid" sh -ceu 'chown -R app:app /tmp/task168.staging && mv /tmp/task168.staging /tmp/task168' || { docker rm -f "$cid" >/dev/null 2>&1; fail 'could not prepare the status-check container'; }
  docker exec -u app "$cid" sh -ceu 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate status --schema /tmp/task168/schema.prisma'; rc=$?
  docker rm -f "$cid" >/dev/null 2>&1 || true
  [[ "$rc" == 0 ]] || fail 'prisma migrate status reports drift against the pinned final image'
}
