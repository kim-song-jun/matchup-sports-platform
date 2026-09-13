#!/usr/bin/env bash
# T4: real-docker, real-postgres, real-Prisma exercise of
# deploy/task168-stage-b-migrate.sh against the states the spec requires:
#   (a) happy path -> MIGRATION_COMMITTED, ledger 11, catalog PASS
#   (b) legacy row present + one seal trigger missing -> M11 RAISE inside its
#       own transaction -> MIGRATION_DIAGNOSIS_REQUIRED receipt, writers stay
#       stopped with restart=no
#   (c) M11 already applied -> preflight rejects before any writer is touched
#   (d) before_m11 failure (pre-existing backup path) -> exact container id
#       restored with its original restart policy, running=true
#
# Every container/volume/network/image this script creates carries
# `com.teameet.task168.harness=$RUN_ID` and is removed in the EXIT trap; the
# script asserts zero leftover containers with that label before exiting.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
FIXTURES_DIR="$HERE/harness/task168-stage-b-fixtures"
IMAGE_DIR="$HERE/harness/task168-stage-b-image"
RUNNER="$REPO_ROOT/deploy/task168-stage-b-migrate.sh"
# The M11 SQL + final schema fixtures live in the untracked, read-only
# candidate output directory under the SHARED main worktree (git common dir's
# parent), not necessarily this worktree — every worktree shares one such
# directory. Override with CANDIDATE_M11_DIR/CANDIDATE_FINAL_SCHEMA if it
# ever moves.
SHARED_ROOT="$(dirname "$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)")"
CANDIDATE_M11_DIR="${CANDIDATE_M11_DIR:-$SHARED_ROOT/output/qa/task168/final-retirement-candidate-20260913/candidate/apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables}"
# The wiring track (PR-A2) already committed the final schema to
# deploy/task168-final-drop/schema.prisma on this branch; prefer that over
# the untracked candidate copy so the harness tests the same bytes the real
# wrapper/manifest reference.
CANDIDATE_FINAL_SCHEMA="${CANDIDATE_FINAL_SCHEMA:-$REPO_ROOT/deploy/task168-final-drop/schema.prisma}"
[[ -f "$RUNNER" ]] || { echo "runner not found: $RUNNER" >&2; exit 1; }
[[ -d "$CANDIDATE_M11_DIR" ]] || { echo "candidate M11 dir not found: $CANDIDATE_M11_DIR" >&2; exit 1; }
[[ -f "$CANDIDATE_FINAL_SCHEMA" ]] || { echo "candidate final schema not found: $CANDIDATE_FINAL_SCHEMA" >&2; exit 1; }

RUN_ID="t168sb-$(date +%s)-$$"
LABEL="com.teameet.task168.harness=$RUN_ID"
WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/task168-stage-b-runner-test.XXXXXX")"
REGISTRY_NAME="t168harness-registry-$RUN_ID"
PASS=0; FAIL=0; FAILED_NAMES=()

log(){ echo "[test-runner] $*"; }
ok(){ PASS=$((PASS+1)); log "PASS: $1"; }
bad(){ FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); log "FAIL: $1 -- $2"; }

cleanup(){
  local status=$?
  log "cleaning up (run id: $RUN_ID)"
  local cids nids vids
  cids="$(docker ps -aq --filter "label=$LABEL")"; [[ -z "$cids" ]] || docker rm -fv $cids >/dev/null 2>&1 || true
  nids="$(docker network ls -q --filter "label=$LABEL")"; [[ -z "$nids" ]] || docker network rm $nids >/dev/null 2>&1 || true
  vids="$(docker volume ls -q --filter "label=$LABEL")"; [[ -z "$vids" ]] || docker volume rm $vids >/dev/null 2>&1 || true
  [[ -z "${PREDECESSOR_IMAGE_TAG:-}" ]] || docker rmi -f "$PREDECESSOR_IMAGE_TAG" >/dev/null 2>&1 || true
  [[ -z "${FINAL_IMAGE_REF:-}" ]] || docker rmi -f "$FINAL_IMAGE_REF" >/dev/null 2>&1 || true
  docker rmi -f "t168harness-v1-api:$RUN_ID" >/dev/null 2>&1 || true
  rm -rf "$WORK_ROOT"
  local remaining
  remaining="$(docker ps -aq --filter "label=$LABEL" | wc -l | tr -d ' ')"
  [[ "$remaining" == 0 ]] || log "WARNING: $remaining harness containers still present after cleanup"
  log "results: $PASS passed, $FAIL failed"
  ((FAIL==0)) || log "failed: ${FAILED_NAMES[*]}"
  exit $status
}
trap cleanup EXIT
log "run id: $RUN_ID, work root: $WORK_ROOT"

# --- one-time: local registry + harness image, so the "final" image can be a
# real @sha256-digest reference (docker image inspect resolves it, exactly
# like a pulled immutable ECR image would). Docker Desktop for Mac runs the
# daemon inside its own VM, so a registry published via `-p 127.0.0.1:PORT`
# is only reachable from the *host*'s loopback (where curl runs) — the daemon
# itself (where `docker push`'s registry client actually runs) sees a
# different, unconnected loopback and the push fails with a bare "connection
# refused" despite 127.0.0.0/8 being in `docker info`'s insecure-registries.
# `--network host` puts the registry container in the VM's own root network
# namespace, which the daemon can reach at 127.0.0.1 directly.
REGISTRY_PORT=18917
docker run -d --label "$LABEL" --name "$REGISTRY_NAME" --network host -e REGISTRY_HTTP_ADDR=0.0.0.0:$REGISTRY_PORT registry:2 >/dev/null
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$REGISTRY_PORT/v2/" >/dev/null 2>&1 && break; sleep 1; done
docker build --label "$LABEL" -t "t168harness-v1-api:$RUN_ID" "$IMAGE_DIR" >/dev/null
PREDECESSOR_IMAGE_TAG="t168harness-v1-api:$RUN_ID-stagea"
docker tag "t168harness-v1-api:$RUN_ID" "$PREDECESSOR_IMAGE_TAG"
FINAL_LOCAL_TAG="127.0.0.1:$REGISTRY_PORT/t168harness-v1-api:final"
docker tag "t168harness-v1-api:$RUN_ID" "$FINAL_LOCAL_TAG"
docker push "$FINAL_LOCAL_TAG" >/dev/null
FINAL_IMAGE_REF="$(docker inspect --format='{{index .RepoDigests 0}}' "$FINAL_LOCAL_TAG")"
[[ "$FINAL_IMAGE_REF" =~ ^127\.0\.0\.1:[0-9]+/t168harness-v1-api@sha256:[0-9a-f]{64}$ ]] || { log "could not obtain a digest reference for the final image"; exit 1; }
log "final image (digest-pinned): $FINAL_IMAGE_REF"
log "predecessor image (plain tag): $PREDECESSOR_IMAGE_TAG"

DB_USER=teameet_v1
DB_NAME=teameet_v1
DB_PASSWORD=harness-dev-password

hex40(){ node -e "console.log(require('crypto').randomBytes(20).toString('hex'))"; }

wait_postgres_healthy(){
  local project="$1" i
  for i in $(seq 1 90); do
    [[ "$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps v1_postgres --format json 2>/dev/null | jq -rs '.[0].Health // empty' 2>/dev/null)" == healthy ]] && return 0
    sleep 1
  done
  return 1
}

# Applies real Task168 migrations (M1-M10, optionally M11) to a live project
# DB using the real repo migration SQL + the real Prisma CLI.
seed_migrations(){
  local project="$1" up_to="$2" net tmp cid rc
  # Deterministic (compose's own default-network naming), not a label lookup:
  # a label filter can return more than one match across sequential scenario
  # runs that reuse the same fixed "deploy" project name if teardown of the
  # previous scenario's network is still settling.
  net="${project}_default"
  docker network inspect "$net" >/dev/null 2>&1 || { log "compose network $net not found for $project"; return 1; }
  tmp="$(mktemp -d "$WORK_ROOT/seed.XXXXXX")"
  mkdir -p "$tmp/migrations"
  cp -R "$REPO_ROOT/apps/v1_api/prisma/migrations/." "$tmp/migrations/"
  if [[ "$up_to" == with_m11 ]]; then cp -R "$CANDIDATE_M11_DIR" "$tmp/migrations/20260911090000_retire_tournament_fixture_tables"; fi
  cp "$CANDIDATE_FINAL_SCHEMA" "$tmp/schema.prisma"
  cid="$(docker run -d --label "$LABEL" --network "$net" -e DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@v1_postgres:5432/$DB_NAME" --entrypoint sh "t168harness-v1-api:$RUN_ID" -c 'sleep 600')"
  docker exec -u 0 "$cid" mkdir -p /tmp/seed
  docker cp "$tmp/." "$cid:/tmp/seed"
  docker exec -u 0 "$cid" chown -R app:app /tmp/seed
  docker exec -u app "$cid" sh -ceu 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/seed/schema.prisma'
  rc=$?
  docker rm -f "$cid" >/dev/null 2>&1 || true
  return $rc
}

inject_legacy_row_without_seal(){
  local project="$1"
  # The runner's own preflight_checks() replicates M11's write/row/link seal
  # count (5/5/3), the retired-table-presence check, the outbox/epoch checks
  # -- so breaking any of *those* is now caught before writers are ever
  # stopped (the newDefect fix this scenario is meant to exercise elsewhere).
  # To reach a genuine M11 RAISE that survives preflight, break a precondition
  # M11 checks internally but preflight_checks() does not duplicate: the
  # append-only audit trigger (v1_operation_audits_append_only, appendOnlyCount
  # must be exactly 1). Retirement seals stay fully intact (5/5/3) and one
  # legacy row is planted (disabling the write-seal only for that one insert).
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" exec -T v1_postgres psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" <<'SQL'
INSERT INTO v1_sports (id, code, name, updated_at) VALUES ('t168-harness-sport','t168_harness_sport','Harness Sport',now());
INSERT INTO v1_tournaments (id, sport_id, title, updated_at) VALUES ('t168-harness-tournament','t168-harness-sport','Harness Tournament',now());
ALTER TABLE v1_tournament_fixtures DISABLE TRIGGER v1_tournament_fixture_retired_write;
ALTER TABLE v1_tournament_fixtures DISABLE TRIGGER v1_tournament_fixture_retired_row_write;
INSERT INTO v1_tournament_fixtures (id, tournament_id, round, fixture_number, updated_at) VALUES ('t168-harness-fixture','t168-harness-tournament','R1',1,now());
-- M9 creates these with ENABLE ALWAYS (tgenabled='A', required by both
-- preflight_checks() and M11's own seal count) -- a plain ENABLE TRIGGER only
-- restores tgenabled='O', which would (wrongly, for this scenario) still
-- read as "seal missing".
ALTER TABLE v1_tournament_fixtures ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_write;
ALTER TABLE v1_tournament_fixtures ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_row_write;
DROP TRIGGER v1_operation_audits_append_only ON v1_operation_audits;
SQL
}

build_fixtures(){
  local work="$1" release="$2" predecessor="$3" predecessor_image="${4:-$PREDECESSOR_IMAGE_TAG}"
  API_IMAGE="$FINAL_IMAGE_REF" PREDECESSOR_API_IMAGE="$predecessor_image" \
  REPO_MIGRATIONS_DIR="$REPO_ROOT/apps/v1_api/prisma/migrations" \
  M11_DIR="$CANDIDATE_M11_DIR" FINAL_SCHEMA_FILE="$CANDIDATE_FINAL_SCHEMA" \
  WORK_DIR="$work" RELEASE_SHA="$release" PREDECESSOR_SHA="$predecessor" DB_USER="$DB_USER" DB_NAME="$DB_NAME" \
  node "$FIXTURES_DIR/build-fixtures.mjs" >"$work/fixtures.json"
}

write_env_file(){
  local out="$1" api_image="$2" db_host="${3:-}"
  cat > "$out" <<EOF
V1_DB_USER=$DB_USER
V1_DB_PASSWORD=$DB_PASSWORD
V1_DB_NAME=$DB_NAME
V1_API_IMAGE=$api_image
TEAMEET_HARNESS_RUN_ID=$RUN_ID
EOF
  [[ -z "$db_host" ]] || echo "V1_DB_HOST=$db_host" >> "$out"
}

# Starts the compose stack for one scenario with the predecessor image (the
# writers a real Stage A run would have left running), waits for postgres.
# The runner script hardcodes `--project-name deploy` (matching the real
# Alpha host layout), so every scenario reuses that one project name
# sequentially -- force a hard teardown first so no container/network from
# the previous scenario can be reused or raced against.
start_stack(){
  local project="$1" env_pre="$2" leftover
  docker compose -p "$project" -f "$FIXTURES_DIR/compose-prod.yml" -f "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_pre" down -v --remove-orphans >/dev/null 2>&1 || true
  leftover="$(docker ps -aq --filter "label=com.docker.compose.project=$project")"
  [[ -z "$leftover" ]] || docker rm -fv $leftover >/dev/null 2>&1 || true
  write_env_file "$env_pre" "$PREDECESSOR_IMAGE_TAG"
  docker compose -p "$project" -f "$FIXTURES_DIR/compose-prod.yml" -f "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_pre" up -d >/dev/null
  wait_postgres_healthy "$project" || { log "postgres never became healthy for $project"; return 1; }
}

# ---------------------------------------------------------------------------
run_scenario_a(){
  local name=a project="deploy" work="$WORK_ROOT/a" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  local env_pre="$work/pre.env"
  start_stack "$project" "$env_pre" || { bad "$name" "stack did not start"; return; }
  seed_migrations "$project" without_m11 || { bad "$name" "seeding M1-M10 failed"; return; }
  build_fixtures "$work" "$release" "$predecessor"
  local env_final="$work/final.env"; write_env_file "$env_final" "$FINAL_IMAGE_REF"
  local out rc receipt
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_final" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [a] /'
  receipt="$work/state/task168/$release/migration-stage.json"
  if [[ "$rc" == 0 ]] && jq -e '.status=="MIGRATION_COMMITTED" and .postVerification.retirementTriggers==0' "$receipt" >/dev/null 2>&1; then
    ok "$name happy-path -> MIGRATION_COMMITTED"
  else
    bad "$name happy-path" "rc=$rc receipt-exists=$([[ -f "$receipt" ]] && echo yes || echo no)"
  fi
  local quiesce="$work/state/task168/$release/quiesce.json"
  if jq -e '.preApiImage and .preWorkerImage and .restartPolicyBefore.api and .restartPolicyDuringQuiesce=="no"' "$quiesce" >/dev/null 2>&1; then
    ok "$name quiesce receipt carries writer identity + restart-policy fields"
  else
    bad "$name quiesce receipt fields" "$(cat "$quiesce" 2>/dev/null)"
  fi
  local api_id worker_id
  api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  worker_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_game_operations_worker)"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)" == false && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$api_id" 2>/dev/null)" == no ]]; then
    ok "$name writer stays stopped with restart=no after commit"
  else
    bad "$name writer restart policy after commit" "running=$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null) restart=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$api_id" 2>/dev/null)"
  fi
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" down -v >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
run_scenario_b(){
  local name=b project="deploy" work="$WORK_ROOT/b" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  local env_pre="$work/pre.env"
  start_stack "$project" "$env_pre" || { bad "$name" "stack did not start"; return; }
  seed_migrations "$project" without_m11 || { bad "$name" "seeding M1-M10 failed"; return; }
  inject_legacy_row_without_seal "$project" || { bad "$name" "legacy row injection failed"; return; }
  build_fixtures "$work" "$release" "$predecessor"
  local env_final="$work/final.env"; write_env_file "$env_final" "$FINAL_IMAGE_REF"
  local out rc receipt
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_final" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [b] /'
  receipt="$work/state/task168/$release/migration-stage.json"
  if [[ "$rc" != 0 ]] && jq -e '.status=="MIGRATION_DIAGNOSIS_REQUIRED" and (.failureReason|length>0) and (.ledgerSnapshot|contains("20260911090000_retire_tournament_fixture_tables"))' "$receipt" >/dev/null 2>&1; then
    ok "$name legacy-without-seal -> MIGRATION_DIAGNOSIS_REQUIRED with failure reason + ledger snapshot"
  else
    bad "$name legacy-without-seal" "rc=$rc receipt=$(cat "$receipt" 2>/dev/null || echo MISSING)"
  fi
  local api_id
  api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)" == false && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$api_id" 2>/dev/null)" == no ]]; then
    ok "$name writer remains stopped (restart=no) after diagnosis"
  else
    bad "$name writer state after diagnosis" "running=$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)"
  fi
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" down -v >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
run_scenario_c(){
  local name=c project="deploy" work="$WORK_ROOT/c" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  local env_pre="$work/pre.env"
  start_stack "$project" "$env_pre" || { bad "$name" "stack did not start"; return; }
  seed_migrations "$project" with_m11 || { bad "$name" "seeding M1-M11 failed"; return; }
  build_fixtures "$work" "$release" "$predecessor"
  local env_final="$work/final.env"; write_env_file "$env_final" "$FINAL_IMAGE_REF"
  local out rc
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_final" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [c] /'
  if [[ "$rc" != 0 ]] && grep -qi 'already present in the pre-retirement ledger' <<<"$out"; then
    ok "$name M11-already-applied -> preflight rejection"
  else
    bad "$name M11-already-applied rejection" "rc=$rc out=$out"
  fi
  local api_id
  api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)" == true ]]; then
    ok "$name writer never stopped (rejected before quiescing)"
  else
    bad "$name writer touched despite pre-stop rejection" "running=$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)"
  fi
  [[ ! -e "$work/state/task168/$release" ]] && ok "$name no state directory created" || bad "$name state directory should not exist" "$(ls "$work/state/task168/$release" 2>/dev/null)"
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" down -v >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# (d) before_m11 failure -> exact-container restore. Injected failure: the
# release's backup path already exists (spec-backup-overwrite's own no-clobber
# guard), which fires after writers are stopped and restart-disabled but
# before phase flips to after_m11 -- exactly the "before_m11" window the
# restore path exists for.
run_scenario_d(){
  local name=d project="deploy" work="$WORK_ROOT/d" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  local env_pre="$work/pre.env"
  start_stack "$project" "$env_pre" || { bad "$name" "stack did not start"; return; }
  seed_migrations "$project" without_m11 || { bad "$name" "seeding M1-M10 failed"; return; }
  build_fixtures "$work" "$release" "$predecessor"
  mkdir -p "$work/state/task168/$release"
  echo not-a-real-backup > "$work/state/task168/$release/pre-m11-backup.sql"
  local pre_api_id pre_worker_id
  pre_api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  pre_worker_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_game_operations_worker)"
  local env_final="$work/final.env"; write_env_file "$env_final" "$FINAL_IMAGE_REF"
  local out rc
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_final" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [d] /'
  [[ "$rc" != 0 ]] && ok "$name injected backup-path collision fails the run" || bad "$name expected nonzero exit" "rc=$rc"
  local api_id worker_id
  api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  worker_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_game_operations_worker)"
  if [[ "$api_id" == "$pre_api_id" && "$worker_id" == "$pre_worker_id" ]]; then
    ok "$name restored the exact same container ids"
  else
    bad "$name container identity after restore" "before=$pre_api_id/$pre_worker_id after=$api_id/$worker_id"
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)" == true && "$(docker inspect --format '{{.State.Running}}' "$worker_id" 2>/dev/null)" == true ]]; then
    ok "$name writers running again after restore"
  else
    bad "$name writers not running after restore" "api=$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null) worker=$(docker inspect --format '{{.State.Running}}' "$worker_id" 2>/dev/null)"
  fi
  if [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$api_id" 2>/dev/null)" == always && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$worker_id" 2>/dev/null)" == always ]]; then
    ok "$name restart policy restored to always"
  else
    bad "$name restart policy not restored" "api=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$api_id" 2>/dev/null)"
  fi
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" down -v >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# (e) r1-3: the manifest-bound predecessor image does not match the image the
# currently-running writer actually uses -> rejected before any container is
# stopped.
run_scenario_e(){
  local name=e project="deploy" work="$WORK_ROOT/e" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  local env_pre="$work/pre.env"
  start_stack "$project" "$env_pre" || { bad "$name" "stack did not start"; return; }
  seed_migrations "$project" without_m11 || { bad "$name" "seeding M1-M10 failed"; return; }
  build_fixtures "$work" "$release" "$predecessor" "${PREDECESSOR_IMAGE_TAG}-WRONG"
  local env_final="$work/final.env"; write_env_file "$env_final" "$FINAL_IMAGE_REF"
  local out rc
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_final" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [e] /'
  if [[ "$rc" != 0 ]] && grep -qi 'does not match the authenticated Stage A predecessor image' <<<"$out"; then
    ok "$name predecessor-image-mismatch -> rejection"
  else
    bad "$name predecessor-image-mismatch rejection" "rc=$rc out=$out"
  fi
  local api_id
  api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)" == true ]]; then
    ok "$name writer never stopped (rejected before quiescing)"
  else
    bad "$name writer touched despite mismatch rejection" "running=$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)"
  fi
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" down -v >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# (f) newDefect(blocking): the one-off migration runner inherits v1_api's
# compose-rendered DATABASE_URL; if that resolves to a host other than the
# verified v1_postgres service, the run must be rejected before any writer is
# touched, not after a backup/preflight against a different database.
run_scenario_f(){
  local name=f project="deploy" work="$WORK_ROOT/f" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  local env_pre="$work/pre.env"
  start_stack "$project" "$env_pre" || { bad "$name" "stack did not start"; return; }
  seed_migrations "$project" without_m11 || { bad "$name" "seeding M1-M10 failed"; return; }
  build_fixtures "$work" "$release" "$predecessor"
  local env_final="$work/final.env"; write_env_file "$env_final" "$FINAL_IMAGE_REF" "some-other-host.invalid"
  local out rc
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$env_final" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [f] /'
  if [[ "$rc" != 0 ]] && grep -qi 'DATABASE_URL host is not the verified v1_postgres service' <<<"$out"; then
    ok "$name database-url-host-mismatch -> rejection"
  else
    bad "$name database-url-host-mismatch rejection" "rc=$rc out=$out"
  fi
  local api_id
  api_id="$(docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" ps -a -q v1_api)"
  if [[ "$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)" == true ]]; then
    ok "$name writer never stopped (rejected before quiescing)"
  else
    bad "$name writer touched despite host-mismatch rejection" "running=$(docker inspect --format '{{.State.Running}}' "$api_id" 2>/dev/null)"
  fi
  docker compose -p "$project" --env-file "$env_pre" -f "$FIXTURES_DIR/compose-prod.yml" down -v >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# (g) r1-4: the manifest's own `database.task168.runtimeClientSchemaSha256`
# must match `schemaSha256` -- one of the fields the candidate never checked
# and this delegation's inline jq expansion adds. No live stack needed: the
# manifest contract check runs before any docker/compose command.
run_scenario_g(){
  local name=g work="$WORK_ROOT/g" release predecessor
  mkdir -p "$work"
  release="$(hex40)"; predecessor="$(hex40)"
  build_fixtures "$work" "$release" "$predecessor"
  local tampered; tampered="$(jq '.database.task168.runtimeClientSchemaSha256 = "0000000000000000000000000000000000000000000000000000000000000000"[0:64]' "$work/manifest.json")"
  printf '%s\n' "$tampered" > "$work/manifest.json"
  local empty_env="$work/empty.env"; : > "$empty_env"
  local out rc
  set +e
  out="$(ALPHA_RELEASE_STATE_DIR="$work/state" "$RUNNER" --source-dir "$work/source" --manifest "$work/manifest.json" --compose-prod "$FIXTURES_DIR/compose-prod.yml" --compose-alpha "$FIXTURES_DIR/compose-alpha.yml" --env-file "$empty_env" 2>&1)"; rc=$?
  set -e
  echo "$out" | sed 's/^/  [g] /'
  if [[ "$rc" != 0 ]] && grep -qi 'manifest is not the exact StageBFinal/backup-only contract' <<<"$out"; then
    ok "$name runtimeClientSchemaSha256-tampered -> rejected by the manifest contract check"
  else
    bad "$name runtimeClientSchemaSha256-tampered rejection" "rc=$rc out=$out"
  fi
}

# Optional: T168_ONLY=a|b|c|d|e|f|g runs a single scenario (used for fast
# mutation iteration during development; a plain run with no filter runs all).
case "${T168_ONLY:-}" in
  a) run_scenario_a ;;
  b) run_scenario_b ;;
  c) run_scenario_c ;;
  d) run_scenario_d ;;
  e) run_scenario_e ;;
  f) run_scenario_f ;;
  g) run_scenario_g ;;
  "") run_scenario_a; run_scenario_b; run_scenario_c; run_scenario_d; run_scenario_e; run_scenario_f; run_scenario_g ;;
  *) echo "unknown T168_ONLY=$T168_ONLY (expected a|b|c|d|e|f|g)" >&2; exit 64 ;;
esac

log "=== summary: $PASS passed, $FAIL failed ==="
if ((FAIL>0)); then exit 1; fi
