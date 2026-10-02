#!/usr/bin/env bash
# Real-postgres regression test for T7's read-only smoke-check query
# (scripts/release/task168-stage-b-post-live-verify.sh). Round-1 review found
# that query filtering on m.status::text = 'ENDED', a value V1TeamMatchStatus
# does not have (apps/v1_api/prisma/schema.prisma:
# recruiting|closed|matched|cancelled|completed|archived) -- every real T7
# run would fail with "no canonical tournament/match available for the
# read-only smoke check". test-task168-post-live.sh's fake-docker harness
# cannot catch this class of bug: its "v1_tournaments" case returns a fixed
# "tour-1|match-1" row unconditionally, never evaluating the query text
# against a real enum. This test runs the ACTUAL query line (extracted from
# the script, not retyped) against a real postgres:16-alpine container with
# the real V1TeamMatchStatus enum.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/release/task168-stage-b-post-live-verify.sh"
[[ -f "$SCRIPT" ]] || { echo "post-live-verify script not found: $SCRIPT" >&2; exit 1; }

RUN_ID="t168plsq-$(date +%s)-$$"
LABEL="com.teameet.task168.harness=$RUN_ID"
CONTAINER="t168harness-pg-$RUN_ID"
PASS=0; FAIL=0
log(){ echo "[test-post-live-smoke-status] $*"; }
ok(){ PASS=$((PASS+1)); log "PASS: $1"; }
bad(){ FAIL=$((FAIL+1)); log "FAIL: $1"; }

BASELINE_VOLUME_COUNT="$(docker volume ls -q | wc -l | tr -d ' ')"
cleanup(){
  docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true
  local remaining final_volume_count
  remaining="$(docker ps -aq --filter "label=$LABEL" | wc -l | tr -d ' ')"
  final_volume_count="$(docker volume ls -q | wc -l | tr -d ' ')"
  [[ "$remaining" == 0 ]] && ok "harness leaves 0 labeled containers" || bad "harness labeled containers: $remaining remain"
  [[ "$final_volume_count" == "$BASELINE_VOLUME_COUNT" ]] \
    && ok "harness leaves 0 leaked volumes (baseline=$BASELINE_VOLUME_COUNT final=$final_volume_count)" \
    || bad "volume count drifted: baseline=$BASELINE_VOLUME_COUNT final=$final_volume_count"
  echo "== $PASS passed, $FAIL failed =="
  [[ "$FAIL" == 0 ]]
}
trap cleanup EXIT

log "starting postgres:16-alpine ($CONTAINER)"
docker run -d --label "$LABEL" --name "$CONTAINER" \
  -e POSTGRES_USER=teameet_v1 -e POSTGRES_PASSWORD=teameet_v1 -e POSTGRES_DB=teameet_v1 \
  postgres:16-alpine >/dev/null

psql(){ docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -At -U teameet_v1 -d teameet_v1 "$@"; }
for _ in $(seq 1 30); do docker exec "$CONTAINER" pg_isready -U teameet_v1 >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CONTAINER" pg_isready -U teameet_v1 >/dev/null 2>&1 || { echo "postgres never became ready" >&2; exit 1; }

# Minimal real schema: the exact enum values from apps/v1_api/prisma/schema.prisma
# (V1TeamMatchStatus), plus just enough of v1_tournaments/v1_team_matches for
# the smoke query's join. No 'ENDED' value exists, matching production.
psql <<'SQL'
CREATE TYPE "V1TeamMatchStatus" AS ENUM ('recruiting','closed','matched','cancelled','completed','archived');
CREATE TABLE v1_tournaments (id text PRIMARY KEY);
CREATE TABLE v1_team_matches (id text PRIMARY KEY, tournament_id text NOT NULL REFERENCES v1_tournaments(id), status "V1TeamMatchStatus" NOT NULL);
INSERT INTO v1_tournaments (id) VALUES ('tour-1');
INSERT INTO v1_team_matches (id, tournament_id, status) VALUES ('match-completed', 'tour-1', 'completed');
INSERT INTO v1_team_matches (id, tournament_id, status) VALUES ('match-archived', 'tour-1', 'archived');
SQL

# Extract the smoke_ids SQL string verbatim from the real script, not retyped
# -- proves this test tracks the actual shipped query, not a copy that could
# silently drift from it.
query="$(grep -oE "SELECT t\.id \|\| '\|' \|\| m\.id FROM v1_tournaments[^\"]+" "$SCRIPT" | head -1)"
[[ -n "$query" ]] || { echo "could not extract smoke_ids query from $SCRIPT" >&2; exit 1; }
if [[ "$query" == *"'ENDED'"* ]]; then
  bad "extracted query still filters on the nonexistent 'ENDED' status (fix was not applied)"
else
  ok "extracted query no longer filters on the nonexistent 'ENDED' status"
fi

result="$(psql -c "$query")"
if [[ -n "$result" ]]; then
  ok "current script's smoke query finds a canonical match against the real V1TeamMatchStatus enum (result=$result)"
else
  bad "current script's smoke query returns nothing against a real DB with a completed match present"
fi

# Mutation check: the pre-fix query (status = 'ENDED') must find nothing on
# this same real DB -- proves the assertion above actually depends on this
# fix, not on some other property of the fixture.
old_query="${query//'completed'/ENDED}"
old_result="$(psql -c "$old_query" || true)"
if [[ -z "$old_result" ]]; then
  ok "mutation check: the pre-fix 'ENDED' query correctly finds nothing (red without the fix)"
else
  bad "mutation check: the pre-fix 'ENDED' query unexpectedly found a row ($old_result) -- test does not actually depend on the fix"
fi

# Zero-row scenario (round-2 review, design item 5): an Alpha DB with no
# 'completed' team match yet (e.g. right after M11 retirement, before QA
# data is recreated) must be a PASS, not a hard failure -- there is nothing
# to sample, not a broken read path.
psql -c "DELETE FROM v1_team_matches WHERE id = 'match-completed'" >/dev/null
zero_row_result="$(psql -c "$query" || true)"
if [[ -z "${zero_row_result}" ]]; then
  ok "smoke query against a DB with zero completed matches correctly returns nothing (the empty-result branch this proves)"
else
  bad "expected zero rows after deleting the only completed match, got: ${zero_row_result}"
fi
# The real script must handle that empty result as a graceful skip, not
# `fail`: assert the shipped source has BOTH the branch and the exact status
# label this test's contract with the runner/manifest side depends on.
if grep -qE 'if \[\[ -n "\$\{smoke_ids\}" \]\]; then' "$SCRIPT" && grep -q 'smoke_status=skipped_no_data' "$SCRIPT"; then
  ok "the shipped script branches on an empty smoke_ids result instead of calling fail (skipped_no_data)"
else
  bad "the shipped script no longer has the empty-result skip branch — a DB with zero completed matches would hard-fail T7"
fi

# Query-error scenario (design item 5): a real SQL error (not merely an
# empty result) must still fail closed. dbq's `-v ON_ERROR_STOP=1` makes
# psql itself exit non-zero on this bogus query, and the real script's
# `set -Eeuo pipefail` + plain `var="$(dbq ...)"` assignment (no `|| true`)
# propagates that non-zero exit -- verified here with the same shell
# contract the real script uses, not merely asserted.
broken_query="SELECT t.id FROM v1_tournaments t JOIN v1_team_matches m ON m.tournament_id = t.id WHERE m.status::text = 'not_a_real_status'::\"V1TeamMatchStatus\""
query_error_rc=0
( set -Eeuo pipefail; psql -c "${broken_query}" >/dev/null ) || query_error_rc=$?
if [[ "${query_error_rc}" -ne 0 ]]; then
  ok "a real query error (invalid enum literal) exits non-zero under set -e, matching the real script's fail-closed contract"
else
  bad "a query error against an invalid enum literal was not detected as a failure (rc=0)"
fi
