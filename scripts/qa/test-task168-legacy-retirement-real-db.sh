#!/usr/bin/env bash
# Task 175 Task 6 fix round 1, M-5: a cheap CI subset of the real-DB proof
# that needs no docker image build. Runs deploy/prod-task168-common.sh's own
# _prod_task168_legacy_retirement_query() SQL string (fix round 4's post-M11
# invariant: prod_assert_legacy_tables_retired()'s underlying query) against
# the REAL, fully-migrated Postgres database the "V1 migration replay + drift
# gate" CI step already built (an empty-DB replay of the full migration chain
# via a real `prisma migrate deploy` -- already past M11) -- proving the
# runner's SQL parses and evaluates correctly against a real, current-schema
# Postgres, without building any image or provisioning promo_test_pg-style
# local fixtures.
#
# Complements, does not replace, scripts/qa/test-prod-task168-real-db.sh (the
# full Stage A -> Stage B proof, deliberately NOT wired into CI -- see
# task-6-report.md for why: it needs a promo_test_pg-style sidecar + fresh
# image builds this CI job has no reason to duplicate).
set -Eeuo pipefail
: "${PGHOST:?PGHOST is required (a live, fully-migrated Postgres)}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"
command -v psql >/dev/null 2>&1 || { echo "psql is required on PATH" >&2; exit 1; }

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Sourced only for its SQL-string builder -- this file never calls
# prod_dbq()/prod_assert_legacy_tables_retired() themselves, which route
# through a one-off `docker run postgres:16-alpine psql` this CI job has no
# reason to provision when it already has a direct, unauthenticated-argv-free
# psql connection to the exact database it just built.
source "${ROOT_DIR}/deploy/prod-task168-common.sh"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

psql_at() {
  PGPASSWORD="${PGPASSWORD}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -At -c "$1"
}

retirement_sql="$(_prod_task168_legacy_retirement_query)"
result="$(psql_at "${retirement_sql}")"
if [[ "${result}" == '0|0' ]]; then
  ok "runner's legacy-retirement invariant SQL is valid against real Postgres and reports 0|0 (5 legacy tables gone, 3 link triggers gone)"
else
  bad "expected 0|0 (legacy_tables_remaining|link_triggers_remaining), got '${result}'"
fi

# Secondary, optional check (brief M-5: "필요하면 prod_ledger_rows 범위
# 쿼리"): all 11 Task168 migration names (M1..M11) are present and cleanly
# resolved in a genuine full replay -- catches a Task168 migration silently
# renamed/dropped/skipped, which the retirement query above cannot (it only
# checks the PHYSICAL post-M11 schema shape, not the migration ledger).
readonly TASK168_NAMES=(
  20260908130000_v1_team_match_tournament_expand
  20260908150000_v1_operation_audit_team_match_expand
  20260908160000_v1_official_fact_team_match_scope
  20260908170000_v1_lineup_invalidation
  20260908180000_v1_staff_scope_team_match
  20260909000000_v1_tournament_result_lineage
  20260909110000_v1_operation_audit_canonical_binding
  20260910010000_v1_official_fact_source_history
  20260910020000_v1_canonical_game_db_guards
  20260910160000_v1_outbox_cutover_claim_gate
  20260911090000_retire_tournament_fixture_tables
)
names_csv="$(printf "'%s'," "${TASK168_NAMES[@]}")"
names_csv="${names_csv%,}"
applied_count="$(psql_at "SELECT count(*) FROM _prisma_migrations WHERE migration_name IN (${names_csv}) AND finished_at IS NOT NULL AND rolled_back_at IS NULL")"
if [[ "${applied_count}" == "${#TASK168_NAMES[@]}" ]]; then
  ok "all ${#TASK168_NAMES[@]} Task168 migrations (M1..M11) are present and cleanly resolved in this full replay"
else
  bad "expected ${#TASK168_NAMES[@]} resolved Task168 migrations, found ${applied_count}"
fi

if [[ "${failures}" -gt 0 ]]; then
  echo "[test-task168-legacy-retirement-real-db] ${failures} assertion(s) failed" >&2
  exit 1
fi
echo "[test-task168-legacy-retirement-real-db] passed"
