#!/usr/bin/env bash

# Task 168 StageB post-live attestation producer (T7). Runs after the final
# runtime is composed up (once a future stageBResume wires that step — this
# script itself does not decide when it runs) and writes
# runtime-verification.json ONLY if every check below passes. Any single
# failure leaves no receipt at all — alpha-release-common.sh's
# assert_stage_b_promotion_receipt refuses to promote without one bound to
# both this migration receipt and this exact manifest.

set -Eeuo pipefail

usage() {
  echo "usage: $0 --release-sha SHA --manifest FILE --compose-prod FILE --compose-alpha FILE --env-file FILE --public-base-url URL" >&2
  exit 64
}

RELEASE_SHA= MANIFEST= COMPOSE_PROD= COMPOSE_ALPHA= ENV_FILE= PUBLIC_BASE_URL=
while (($#)); do
  case "$1" in
    --release-sha) RELEASE_SHA=${2:?}; shift 2 ;;
    --manifest) MANIFEST=${2:?}; shift 2 ;;
    --compose-prod) COMPOSE_PROD=${2:?}; shift 2 ;;
    --compose-alpha) COMPOSE_ALPHA=${2:?}; shift 2 ;;
    --env-file) ENV_FILE=${2:?}; shift 2 ;;
    --public-base-url) PUBLIC_BASE_URL=${2:?}; shift 2 ;;
    *) usage ;;
  esac
done
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ && -f "${MANIFEST}" && -f "${COMPOSE_PROD}" && -f "${COMPOSE_ALPHA}" && -f "${ENV_FILE}" && -n "${PUBLIC_BASE_URL}" ]] || usage

fail() { echo "[task168-post-live] $*" >&2; exit 1; }
sha() { sha256sum "$1" | awk '{print $1}'; }

readonly TASK168_FINAL_SCHEMA_SHA256=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46

jq -e '.database.task168.stage == "stageBFinal"' "${MANIFEST}" >/dev/null || fail 'manifest is not a StageB manifest'
manifest_sha256="$(sha "${MANIFEST}")"

STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-/home/ec2-user/.teameet-alpha-releases}/task168"
state_dir="${STATE_ROOT}/${RELEASE_SHA}"
migration_receipt="${state_dir}/migration-stage.json"
[[ -f "${migration_receipt}" ]] || fail 'no migration-stage.json for this release'
jq -e '.status == "MIGRATION_COMMITTED" or .status == "MIGRATION_COMMITTED_RECOVERED"' "${migration_receipt}" >/dev/null \
  || fail 'migration-stage.json is not a committed receipt'
migration_receipt_sha256="$(sha "${migration_receipt}")"

expected_api_image="$(jq -er '.images.api.uri' "${MANIFEST}")"
expected_web_image="$(jq -er '.images.web.uri' "${MANIFEST}")"

compose=(docker compose --project-name deploy -f "${COMPOSE_PROD}" -f "${COMPOSE_ALPHA}" --env-file "${ENV_FILE}")
dbq() { "${compose[@]}" exec -T v1_postgres psql -X -v ON_ERROR_STOP=1 -At \
  -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" -c "$1"; }

# 1. Running digests match the manifest.
api_container="$("${compose[@]}" ps -q v1_api)" || fail 'no v1_api container'
web_container="$("${compose[@]}" ps -q v1_web)" || fail 'no v1_web container'
worker_container="$("${compose[@]}" ps -q v1_game_operations_worker)" || fail 'no v1_game_operations_worker container'
[[ -n "${api_container}" && -n "${web_container}" && -n "${worker_container}" ]] || fail 'expected all three services running'
running_api_image="$(docker inspect --format '{{.Config.Image}}' "${api_container}")"
running_web_image="$(docker inspect --format '{{.Config.Image}}' "${web_container}")"
running_worker_image="$(docker inspect --format '{{.Config.Image}}' "${worker_container}")"
[[ "${running_api_image}" == "${expected_api_image}" ]] || fail 'running API image does not match the manifest'
[[ "${running_web_image}" == "${expected_web_image}" ]] || fail 'running web image does not match the manifest'
[[ "${running_worker_image}" == "${expected_api_image}" ]] || fail 'running worker image does not match the manifest API image'

# 2. API attestation is the StageB final client.
api_attestation="$(docker run --rm --entrypoint cat "${expected_api_image}" /app/apps/v1_api/.task168-runtime-client-attestation.json)" ||
  fail 'running API image has no Task168 attestation'
jq -e --arg schema "${TASK168_FINAL_SCHEMA_SHA256}" \
  '.stage == "stageBFinal" and .schemaSha256 == $schema' <<< "${api_attestation}" >/dev/null ||
  fail 'running API image attestation is not stageBFinal'

# 3. Ledger: the exact Task168 migrations from the manifest, each applied
# with the manifest's own checksum -- named individually, never matched by
# a `LIKE '202609%_v1_%'` date range (which also catches unrelated
# September migrations).
mapfile -t task168_migration_names < <(jq -r '.database.task168.migrations[].name' "${MANIFEST}")
# Exactly 11, not merely non-empty: the promotion gate
# (assert_stage_b_promotion_receipt, alpha-release-common.sh) hardcodes
# ledgerCount == 11, so a manifest with 10 or 12 entries must never reach a
# written receipt at all -- rejecting a wrong count only at promotion time
# would mean the runtime is already live and serving traffic first.
(( ${#task168_migration_names[@]} == 11 )) || fail "manifest lists ${#task168_migration_names[@]} task168 migrations, expected exactly 11"
for name in "${task168_migration_names[@]}"; do
  [[ "${name}" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] || fail "manifest migration name is not well-formed: ${name}"
done
in_list="$(printf "'%s'," "${task168_migration_names[@]}")"
in_list="${in_list%,}"
ledger_rows="$(dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE migration_name IN (${in_list}) ORDER BY migration_name")"
ledger_count="$(grep -c '|applied$' <<< "${ledger_rows}" || true)"
[[ "${ledger_count}" == "${#task168_migration_names[@]}" ]] || fail "ledger has ${ledger_count} Task168 rows, expected ${#task168_migration_names[@]}"
while IFS='|' read -r row_name row_checksum row_status; do
  expected_checksum="$(jq -er --arg n "${row_name}" '.database.task168.migrations[] | select(.name == $n) | .sha256' "${MANIFEST}")" ||
    fail "manifest has no checksum for ledger row ${row_name}"
  [[ "${row_status}" == applied && "${row_checksum}" == "${expected_checksum}" ]] ||
    fail "ledger row for ${row_name} is not applied with the manifest checksum"
done <<< "${ledger_rows}"

# 4. Catalog: legacy schema fully retired.
catalog_legacy="$(dbq "SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL")"
[[ "${catalog_legacy}" == 0 ]] || fail 'legacy tables are still present'
catalog_columns="$(dbq "SELECT count(*) FROM (VALUES ('tournament_fixture_id'),('fixture_id')) x(name) WHERE EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.column_name=x.name AND c.table_name IN ('v1_games','v1_tournament_staff_fixture_scopes','v1_operation_audits'))")"
[[ "${catalog_columns}" == 0 ]] || fail 'legacy link columns remain'

# 5. Live drift check against the final schema. The runner (§3) already
# performs `prisma migrate status` inside the migration container at M11
# time — this is a second, independent check from the RUNNING runtime image
# after activation, which is a different container than the one that ran
# the migration.
drift_rc=0
drift_output="$("${compose[@]}" exec -T v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code' 2>&1)" || drift_rc=$?
[[ "${drift_rc}" == 0 ]] || fail "live database drifts from the final schema: ${drift_output}"

# 6. Health + worker.
health_db_true="$(curl -fsS --connect-timeout 3 --max-time 10 \
  "${PUBLIC_BASE_URL%/}/api/v1/health" | jq -r '.data.checks.db // false')"
[[ "${health_db_true}" == true ]] || fail 'health check db is not true'
worker_health="$(docker inspect --format '{{.State.Health.Status}}' "${worker_container}" 2>/dev/null || true)"
[[ "${worker_health}" == healthy ]] || fail "worker is not healthy (status=${worker_health:-<none>})"

# 7. Outbox converges to zero PROCESSING rows within a bounded wait.
outbox_zero_at=''
for _ in $(seq 1 30); do
  processing="$(dbq "SELECT count(*) FROM v1_outbox_events WHERE status::text='PROCESSING'")"
  if [[ "${processing}" == 0 ]]; then
    outbox_zero_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    break
  fi
  sleep 2
done
[[ -n "${outbox_zero_at}" ]] || fail 'outbox PROCESSING rows did not converge to zero'

# 8. Read-only smoke: a real canonical tournament/fixture from the live DB,
# fetched through the public API — proves the retirement did not break the
# public read path, not merely that the DB layer is internally consistent.
smoke_ids="$(dbq "SELECT t.id || '|' || m.id FROM v1_tournaments t JOIN v1_team_matches m ON m.tournament_id = t.id WHERE m.status::text = 'ENDED' ORDER BY m.id LIMIT 1")"
[[ -n "${smoke_ids}" ]] || fail 'no canonical tournament/match available for the read-only smoke check'
smoke_tournament_id="${smoke_ids%%|*}"
smoke_match_id="${smoke_ids##*|}"
smoke_status_code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 10 \
  "${PUBLIC_BASE_URL%/}/api/v1/tournaments/${smoke_tournament_id}/matches/${smoke_match_id}")"
[[ "${smoke_status_code}" == 200 ]] || fail "read-only smoke check returned HTTP ${smoke_status_code}"

write() {
  local path="$1"
  install -d -m 700 "$(dirname "${path}")"
  local tmp
  tmp="$(mktemp "$(dirname "${path}")/.task168.XXXXXX")"
  cat > "${tmp}"
  chmod 600 "${tmp}"
  mv "${tmp}" "${path}"
}

write "${state_dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"${migration_receipt_sha256}","manifestSha256":"${manifest_sha256}","apiDigest":"${running_api_image}","webDigest":"${running_web_image}","workerDigest":"${running_worker_image}","ledgerCount":11,"catalogResult":{"legacyTables":${catalog_legacy},"legacyLinkColumns":${catalog_columns}},"driftCheck":"none","healthDbTrue":true,"workerHealthy":true,"outboxProcessingZeroAt":"${outbox_zero_at}","smokeCheck":{"tournamentId":"${smoke_tournament_id}","fixtureOrMatchId":"${smoke_match_id}","status":"ok"},"completedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
echo "[task168-post-live] runtime-verification.json written for ${RELEASE_SHA}"
