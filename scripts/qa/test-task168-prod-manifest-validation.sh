#!/usr/bin/env bash
# Task 175 Task 4, Ruling R2: validate_prod_release_manifest() (deploy/prod-manifest-common.sh)
# must accept a well-formed `database.task168` block and reject every way it
# can be malformed, bidirectionally. A manifest with no `database.task168` key
# at all (the ordinary, non-transition deploy shape) must keep passing exactly
# as before -- checked first as the baseline every mutation below is diffed
# against.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

# prod-source-common.sh derives PROD_SOURCE_RELEASES_DIR from PROD_HOME_DIR --
# only needed here for validate_stored_prod_manifest's source_dir resolution,
# not exercised by this test, but `set -u` still requires it to be bound.
export PROD_HOME_DIR="${TEST_ROOT}/home"
source "${ROOT_DIR}/deploy/prod-source-common.sh"
source "${ROOT_DIR}/deploy/prod-manifest-common.sh"

readonly REGISTRY=851725525576.dkr.ecr.ap-northeast-2.amazonaws.com
readonly SHA=1111111111111111111111111111111111111111
readonly DIGEST="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
readonly TOOL_DIGEST="sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly M11_PINNED_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# A real, on-disk migration source tree for the source-vs-manifest checksum
# comparison -- reuses this repo's ACTUAL migration files (not fixtures) so a
# real drift between manifest and source is exactly what fails.
SOURCE_DIR="${ROOT_DIR}"

task168_migrations_json() {
  local m11_sha="${1:-${M11_PINNED_SHA}}"
  jq -nc --arg m11 "${M11_NAME}" --arg m11sha "${m11_sha}" '
    [
      "20260908130000_v1_team_match_tournament_expand",
      "20260908150000_v1_operation_audit_team_match_expand",
      "20260908160000_v1_official_fact_team_match_scope",
      "20260908170000_v1_lineup_invalidation",
      "20260908180000_v1_staff_scope_team_match",
      "20260909000000_v1_tournament_result_lineage",
      "20260909110000_v1_operation_audit_canonical_binding",
      "20260910010000_v1_official_fact_source_history",
      "20260910020000_v1_canonical_game_db_guards",
      "20260910160000_v1_outbox_cutover_claim_gate"
    ] | map({name: ., sha256: ("d" * 64)}) + [{name: $m11, sha256: $m11sha}]
  '
}

# Fills in each entry's sha256 from the REAL source tree (except the caller
# may override the M11 entry to test a source-vs-manifest mismatch).
real_task168_migrations_json() {
  local m11_sha="${1:-${M11_PINNED_SHA}}"
  local names=(
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
  )
  local entries=() name sha path
  for name in "${names[@]}"; do
    path="${SOURCE_DIR}/apps/v1_api/prisma/migrations/${name}/migration.sql"
    [[ -f "${path}" ]] || { echo "fixture setup: missing real migration ${name}" >&2; exit 1; }
    sha="$(sha256sum "${path}" | awk '{print $1}')"
    entries+=("$(jq -nc --arg n "${name}" --arg s "${sha}" '{name:$n,sha256:$s}')")
  done
  entries+=("$(jq -nc --arg n "${M11_NAME}" --arg s "${m11_sha}" '{name:$n,sha256:$s}')")
  printf '%s\n' "${entries[@]}" | jq -sc .
}

make_manifest() {
  local output="$1" migrations_json="$2" stage="$3" include_tool="$4"
  local images_extra='{}'
  if [[ "${include_tool}" == true ]]; then
    images_extra="$(jq -nc --arg r "${REGISTRY}/teameet-prod-v1-api" --arg d "${TOOL_DIGEST}" \
      '{cutoverTool:{repository:$r,digest:$d,uri:($r+"@"+$d)}}')"
  fi
  jq -Sn \
    --arg sha "${SHA}" --arg registry "${REGISTRY}" --arg digest "${DIGEST}" \
    --argjson migrations "${migrations_json}" --arg stage "${stage}" \
    --argjson imagesExtra "${images_extra}" \
    '{
      schemaVersion: 1, environment: "production",
      release: {sha:$sha, version:"1.2.3", createdAt:"2026-07-19T00:00:00Z"},
      source: {transfer:"ssh-rsync", sha256:("c"*64)},
      database: {
        migrationPolicy:"expand-contract", rollbackMode:"application-images-only",
        compatibilityCheck:"expand-contract-sql-v1",
        migrationValidatedFrom:null, rollbackCompatibleWith:null,
        task168: (
          if $migrations == null then null
          else {stage:$stage, migrations:$migrations, rehearsal:{evidence:"local rehearsal log 2026-09-27"}}
          end
        )
      },
      images: (
        {
          api:{repository:($registry+"/teameet-prod-v1-api"),digest:$digest,uri:($registry+"/teameet-prod-v1-api@"+$digest)},
          web:{repository:($registry+"/teameet-prod-v1-web"),digest:$digest,uri:($registry+"/teameet-prod-v1-web@"+$digest)}
        } + $imagesExtra
      )
    }' > "${output}"
}

check() {
  local label="$1" expect="$2" manifest="$3" source_dir="${4:-}" checksum err_file
  checksum="$(sha256sum "${manifest}" | awk '{print $1}')"
  err_file="${TEST_ROOT}/.check-err"
  if validate_prod_release_manifest "${manifest}" "${SHA}" "1.2.3" "${checksum}" "${REGISTRY}" "${source_dir}" 2>"${err_file}"; then
    if [[ "${expect}" == pass ]]; then ok "${label}"; else bad "${label} -- expected rejection, was accepted"; fi
  else
    if [[ "${expect}" == reject ]]; then ok "${label}"; else
      bad "${label} -- expected acceptance, was rejected: $(cat "${err_file}")"
    fi
  fi
}

# ── baseline: no database.task168 at all -- must keep passing exactly as a
#    plain (non-transition) manifest always has ──────────────────────────────
m_none="${TEST_ROOT}/none.json"
make_manifest "${m_none}" 'null' '' false
check "no database.task168 -- ordinary manifest still passes" pass "${m_none}"

# ── stageB, well-formed, no source_dir given (skips the disk comparison) ────
m_stageb="${TEST_ROOT}/stageb.json"
make_manifest "${m_stageb}" "$(task168_migrations_json)" stageB false
check "well-formed stageB manifest passes" pass "${m_stageb}"

# ── stageA, well-formed WITH cutoverTool ────────────────────────────────────
m_stagea="${TEST_ROOT}/stagea.json"
make_manifest "${m_stagea}" "$(task168_migrations_json)" stageA true
check "well-formed stageA manifest (with cutoverTool) passes" pass "${m_stagea}"

# ── stageA missing cutoverTool -- must be rejected ──────────────────────────
m_stagea_notool="${TEST_ROOT}/stagea-notool.json"
make_manifest "${m_stagea_notool}" "$(task168_migrations_json)" stageA false
check "stageA without images.cutoverTool is rejected" reject "${m_stagea_notool}"

# ── invalid stage value ─────────────────────────────────────────────────────
m_badstage="${TEST_ROOT}/badstage.json"
make_manifest "${m_badstage}" "$(task168_migrations_json)" stageC false
check "database.task168.stage outside {stageA,stageB} is rejected" reject "${m_badstage}"

# ── wrong migration count (10 instead of 11) ────────────────────────────────
m_shortlist="${TEST_ROOT}/shortlist.json"
make_manifest "${m_shortlist}" "$(task168_migrations_json | jq -c '.[:-1]')" stageB false
check "database.task168.migrations with only 10 entries is rejected" reject "${m_shortlist}"

# ── foreign migration name -- same length/order, one name swapped for a
#    non-pinned value, isolating this from the separate ordering test below ─
m_foreign="${TEST_ROOT}/foreign.json"
make_manifest "${m_foreign}" "$(task168_migrations_json | jq -c '.[0].name = "20260101000000_not_a_real_migration"')" stageB false
check "database.task168.migrations with a non-pinned name is rejected" reject "${m_foreign}"

# ── out-of-order names (same 11 names, not ascending) ───────────────────────
m_unordered="${TEST_ROOT}/unordered.json"
make_manifest "${m_unordered}" "$(task168_migrations_json | jq -c '[.[1],.[0]] + .[2:]')" stageB false
check "database.task168.migrations out of ascending order is rejected" reject "${m_unordered}"

# ── malformed sha256 (not 64 lowercase hex) ─────────────────────────────────
m_badsha="${TEST_ROOT}/badsha.json"
make_manifest "${m_badsha}" "$(task168_migrations_json | jq -c '.[0].sha256 = "not-a-checksum"')" stageB false
check "a non-hex64 migrations[].sha256 is rejected" reject "${m_badsha}"

# ── empty rehearsal.evidence ─────────────────────────────────────────────────
m_noevidence="${TEST_ROOT}/noevidence.json"
jq '.database.task168.rehearsal.evidence = ""' "${m_stageb}" > "${m_noevidence}"
check "empty database.task168.rehearsal.evidence is rejected" reject "${m_noevidence}"

# ── stageA cutoverTool digest malformed ─────────────────────────────────────
m_badtool="${TEST_ROOT}/badtool.json"
jq '.images.cutoverTool.digest = "sha256:bad"' "${m_stagea}" > "${m_badtool}"
check "stageA images.cutoverTool.digest not hex64 is rejected" reject "${m_badtool}"

# ── stageA cutoverTool in the wrong ECR repository ──────────────────────────
m_wrongrepo="${TEST_ROOT}/wrongrepo.json"
jq --arg d "${TOOL_DIGEST}" '.images.cutoverTool.repository = "851725525576.dkr.ecr.ap-northeast-2.amazonaws.com/some-other-repo" | .images.cutoverTool.uri = ("851725525576.dkr.ecr.ap-northeast-2.amazonaws.com/some-other-repo@" + $d)' "${m_stagea}" > "${m_wrongrepo}"
check "stageA cutoverTool outside teameet-prod-v1-api is rejected" reject "${m_wrongrepo}"

# ── migrations[] vs source tree (only checked when a source_dir is given) ──
m_realmatch="${TEST_ROOT}/realmatch.json"
make_manifest "${m_realmatch}" "$(real_task168_migrations_json)" stageB false
check "migrations[] matching the real source tree passes with source_dir given" pass "${m_realmatch}" "${SOURCE_DIR}"

m_realmismatch="${TEST_ROOT}/realmismatch.json"
make_manifest "${m_realmismatch}" "$(real_task168_migrations_json "$(printf 'f%.0s' {1..64})")" stageB false
check "a tampered M11 checksum vs the real source tree is rejected when source_dir is given" reject "${m_realmismatch}" "${SOURCE_DIR}"
check "the SAME tampered manifest passes when no source_dir is given (disk comparison skipped)" pass "${m_realmismatch}"

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-prod-manifest-validation] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-prod-manifest-validation] passed"
