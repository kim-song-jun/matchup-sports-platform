#!/usr/bin/env bash

# Contract test for the StageB manifest validation (D-4) and promotion gate
# (T7) added to deploy/alpha-manifest-common.sh and deploy/alpha-release-common.sh,
# plus rollback-alpha.sh's stageBFinal refusal (D-4).
# (m11-stageb-spec.md §5 T4/T7; .task168-stageb-a2-contract.md §4/§5)

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

readonly REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
readonly SHA=1111111111111111111111111111111111111111
readonly FINAL_SCHEMA=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46

make_stage_b_manifest() {
  local out="$1" schema="${2:-${FINAL_SCHEMA}}"
  jq -n --arg registry "${REGISTRY}" --arg sha "${SHA}" --arg schema "${schema}" '
    {schemaVersion:1, environment:"alpha",
     release:{sha:$sha, version:"0.1.0-alpha.20260914.g111111111111", createdAt:"2026-09-14T00:00:00Z"},
     source:{bucket:"b", key:("releases/task168-stage-b/"+$sha+".tar.gz"), versionId:"v1", sha256:("c"*64)},
     database:{migrationPolicy:"task168-stageBFinal", rollbackMode:"backup-only", compatibilityCheck:"expand-contract-sql-v1",
       task168:{stage:"stageBFinal", schemaSha256:$schema,
         migrations:[{name:"x",sha256:("d"*64)}],
         fullMigrationHistory:[range(0;12)|{name:("m"+(.|tostring)),sha256:("d"*64)}],
         resolvedMigrationAttemptsSha256:("e"*64),
         predecessor:{releaseSha:"2222222222222222222222222222222222222222",transition:"/x",transitionSha256:("f"*64),apiImage:"img",databaseIdentity:"id",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"},
         finalImagePreflight:{receipt:"/y",receiptSha256:("a"*64),inputSnapshotSha256:("b"*64)},
         recoveryFrom:null, rollbackTarget:null}},
     images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("a"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("a"*64))},
       web:{repository:($registry+"/teameet-alpha-v1-web"),digest:("sha256:"+("b"*64)),uri:($registry+"/teameet-alpha-v1-web@sha256:"+("b"*64))},
       cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("c"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("c"*64))}}}' \
    > "${out}"
}

echo "== test-task168-stage-b-manifest =="

# ── validate_alpha_stage_b_final_manifest: direct call, valid + tampered ───
(
  source "${ROOT}/deploy/alpha-manifest-common.sh"
  manifest="${WORK}/direct.json"
  make_stage_b_manifest "${manifest}"
  checksum="$(sha256sum "${manifest}" | awk '{print $1}')"
  migrations="$(jq -c '.database.task168.migrations' "${manifest}")"
  predecessor="$(jq -c '.database.task168.predecessor' "${manifest}")"
  preflight="$(jq -c '.database.task168.finalImagePreflight' "${manifest}")"
  fullHistory="$(jq -c '.database.task168.fullMigrationHistory' "${manifest}")"

  if validate_alpha_stage_b_final_manifest "${manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${migrations}" "${predecessor}" "${preflight}" "${fullHistory}"; then
    echo "  ok: a well-formed StageB manifest validates"
  else
    echo "  FAIL: a well-formed StageB manifest was rejected" >&2
    exit 1
  fi

  if validate_alpha_stage_b_final_manifest "${manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${checksum}" "${REGISTRY}" "91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f" \
    "${migrations}" "${predecessor}" "${preflight}" "${fullHistory}"; then
    echo "  FAIL: a mismatched expected schema sha was accepted" >&2
    exit 1
  else
    echo "  ok: a mismatched expected schema sha is rejected"
  fi

  wrong_migrations='[{"name":"y","sha256":"'"$(printf 'd%.0s' {1..64})"'"}]'
  if validate_alpha_stage_b_final_manifest "${manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${wrong_migrations}" "${predecessor}" "${preflight}" "${fullHistory}"; then
    echo "  FAIL: a mismatched expected migrations array was accepted" >&2
    exit 1
  else
    echo "  ok: a mismatched expected migrations array is rejected"
  fi
) && PASS=$((PASS + 3)) || FAIL=$((FAIL + 1))

# ── validate_stored_alpha_manifest: stage branching ─────────────────────────
(
  source "${ROOT}/deploy/alpha-manifest-common.sh"
  manifest="${WORK}/stored.json"
  make_stage_b_manifest "${manifest}"
  checksum="$(sha256sum "${manifest}" | awk '{print $1}')"

  if validate_stored_alpha_manifest "${manifest}" "${REGISTRY}" "${checksum}"; then
    echo "  ok: validate_stored_alpha_manifest accepts a valid StageB manifest via the StageB branch"
  else
    echo "  FAIL: validate_stored_alpha_manifest rejected a valid StageB manifest" >&2
    exit 1
  fi

  # A pure structural break (fullMigrationHistory too short) — this is what
  # self-referential validation CAN catch, unlike a value tampered to agree
  # with itself (alpha-manifest-common.sh's own doc comment on this limit).
  tampered="${WORK}/stored-tampered.json"
  jq '.database.task168.fullMigrationHistory = [.database.task168.fullMigrationHistory[0]]' \
    "${manifest}" > "${tampered}"
  tampered_checksum="$(sha256sum "${tampered}" | awk '{print $1}')"
  if validate_stored_alpha_manifest "${tampered}" "${REGISTRY}" "${tampered_checksum}"; then
    echo "  FAIL: validate_stored_alpha_manifest accepted a structurally invalid StageB manifest (fullMigrationHistory length <= 11)" >&2
    exit 1
  else
    echo "  ok: validate_stored_alpha_manifest rejects a structurally invalid StageB manifest"
  fi
) && PASS=$((PASS + 2)) || FAIL=$((FAIL + 1))

# ── alpha-release-common.sh: promote requires a T7 receipt for StageB, is
# unaffected for StageA ──────────────────────────────────────────────────
(
  export ALPHA_HOME_DIR="${WORK}/promote-home"
  export ALPHA_RELEASE_STATE_DIR="${ALPHA_HOME_DIR}/.teameet-alpha-releases"
  export ALPHA_RELEASE_STATE_FILE="${ALPHA_RELEASE_STATE_DIR}/state.json"
  export ALPHA_CANDIDATE_MANIFEST="${ALPHA_RELEASE_STATE_DIR}/candidate.json"
  export ALPHA_FAILED_RELEASE_DIR="${ALPHA_RELEASE_STATE_DIR}/failed"
  mkdir -p "${ALPHA_RELEASE_STATE_DIR}"
  source "${ROOT}/deploy/alpha-release-common.sh"

  manifest="${WORK}/promote-candidate.json"
  make_stage_b_manifest "${manifest}"
  install -d -m 700 "${ALPHA_RELEASE_STATE_DIR}"
  cp "${manifest}" "${ALPHA_CANDIDATE_MANIFEST}"
  if promote_candidate_manifest 2>"${WORK}/promote-stderr"; then
    echo "  FAIL: StageB promotion succeeded with no runtime-verification.json" >&2
    exit 1
  else
    grep -q "runtime-verification.json" "${WORK}/promote-stderr" && \
      echo "  ok: StageB promotion refuses without a runtime-verification.json"
  fi
  [[ ! -f "${ALPHA_RELEASE_STATE_FILE}" ]] && echo "  ok: a refused promotion writes no state.json" \
    || { echo "  FAIL: state.json was written despite the refused promotion" >&2; exit 1; }

  state_dir="${ALPHA_RELEASE_STATE_DIR}/task168/${SHA}"
  install -d -m 700 "${state_dir}"
  jq -n '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED"}' \
    > "${state_dir}/migration-stage.json"
  migration_sha="$(sha256sum "${state_dir}/migration-stage.json" | awk '{print $1}')"
  manifest_sha="$(sha256sum "${manifest}" | awk '{print $1}')"
  jq -n --arg m "${migration_sha}" --arg n "${manifest_sha}" \
    '{schemaVersion:1,kind:"task168StageBRuntimeVerification",migrationReceiptSha256:$m,manifestSha256:$n,ledgerCount:11,driftCheck:"none",healthDbTrue:true,workerHealthy:true,completedAt:"2026-09-14T00:00:00Z"}' \
    > "${state_dir}/runtime-verification.json"
  cp "${manifest}" "${ALPHA_CANDIDATE_MANIFEST}"
  if promote_candidate_manifest; then
    echo "  ok: StageB promotion succeeds once a bound runtime-verification.json exists"
  else
    echo "  FAIL: StageB promotion still refused with a valid runtime-verification.json" >&2
    exit 1
  fi

  # StageA candidate: unaffected by the new gate (no receipt exists at all).
  stage_a_manifest="${WORK}/promote-stage-a.json"
  jq -n --arg registry "${REGISTRY}" '
    {schemaVersion:1,environment:"alpha",release:{sha:"3333333333333333333333333333333333333333",version:"0.1.0-alpha.20260914.g333333333333",createdAt:"2026-09-14T00:00:00Z"},
     source:{bucket:"b",key:"releases/3333333333333333333333333333333333333333.tar.gz",versionId:"v1",sha256:("c"*64)},
     database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null,
       task168:{stage:"stageAIntermediate",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",runtimeClientSchemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",cutoverArchiveSha256:"829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b",cutoverManifestSha256:"b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74",migrations:[range(0;10)|{name:("2026091200000"+(.|tostring)+"_v1_fixture"),sha256:("d"*64)}],rollbackTarget:null}},
     images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("a"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("a"*64))},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:("sha256:"+("b"*64)),uri:($registry+"/teameet-alpha-v1-web@sha256:"+("b"*64))},cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("c"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("c"*64))}}}' \
    > "${stage_a_manifest}"
  cp "${stage_a_manifest}" "${ALPHA_CANDIDATE_MANIFEST}"
  if promote_candidate_manifest; then
    echo "  ok: StageA promotion is unaffected by the new StageB receipt gate"
  else
    echo "  FAIL: StageA promotion was refused — the new gate leaked into the unrelated StageA path" >&2
    exit 1
  fi
) && PASS=$((PASS + 4)) || FAIL=$((FAIL + 1))

# ── rollback-alpha.sh refuses when the active manifest is stageBFinal ──────
(
  root="${WORK}/rollback"
  home="${root}/home"
  live="${home}/teameet"
  mkdir -p "${live}/deploy" "${home}/.teameet-alpha-releases"
  printf 'V1_DB_USER=teameet_v1\n' > "${live}/deploy/.env"
  ln -s "${ROOT}/deploy/alpha-release-common.sh" "${live}/deploy/alpha-release-common.sh"
  ln -s "${ROOT}/deploy/alpha-manifest-common.sh" "${live}/deploy/alpha-manifest-common.sh"
  ln -s "${ROOT}/deploy/alpha-source-common.sh" "${live}/deploy/alpha-source-common.sh"
  manifest="${WORK}/rollback-active.json"
  make_stage_b_manifest "${manifest}"
  checksum="$(sha256sum "${manifest}" | awk '{print $1}')"
  # rollback-alpha.sh reads .previous unconditionally before this test's
  # target check ever runs (pre-existing behavior, not something this test
  # changes) — give it a valid StageA-shaped previous so execution reaches
  # the stageBFinal refusal rather than crashing on a null .previous first.
  previous_manifest="${WORK}/rollback-previous.json"
  jq -n --arg registry "${REGISTRY}" '
    {schemaVersion:1,environment:"alpha",release:{sha:"4444444444444444444444444444444444444444",version:"0.1.0-alpha.20260914.g444444444444",createdAt:"2026-09-14T00:00:00Z"},
     source:{bucket:"b",key:"releases/4444444444444444444444444444444444444444.tar.gz",versionId:"v1",sha256:("c"*64)},
     database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null,
       task168:{stage:"stageAIntermediate",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",runtimeClientSchemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",cutoverArchiveSha256:"829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b",cutoverManifestSha256:"b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74",migrations:[range(0;10)|{name:("2026091200000"+(.|tostring)+"_v1_fixture"),sha256:("d"*64)}],rollbackTarget:null}},
     images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("a"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("a"*64))},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:("sha256:"+("b"*64)),uri:($registry+"/teameet-alpha-v1-web@sha256:"+("b"*64))},cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("c"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("c"*64))}}}' \
    > "${previous_manifest}"
  previous_checksum="$(sha256sum "${previous_manifest}" | awk '{print $1}')"
  jq -n --slurpfile active "${manifest}" --slurpfile previous "${previous_manifest}" \
    --arg checksum "${checksum}" --arg previousChecksum "${previous_checksum}" \
    '{schemaVersion:1, active: $active[0], activeManifestSha256: $checksum, previous: $previous[0], previousManifestSha256: $previousChecksum, updatedAt: "2026-09-14T00:00:00Z"}' \
    > "${home}/.teameet-alpha-releases/state.json"
  bin="${root}/bin"; mkdir -p "${bin}"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock"; chmod +x "${bin}/flock"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/aws"; chmod +x "${bin}/aws"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/docker"; chmod +x "${bin}/docker"

  rc=0
  ALPHA_LIVE_DIR="${live}" ALPHA_HOME_DIR="${home}" ALPHA_ECR_REGISTRY="${REGISTRY}" \
    ALPHA_AWS_REGION="ap-northeast-2" \
    ALPHA_EXPECTED_ACTIVE_SHA="${SHA}" PATH="${bin}:${PATH}" \
    bash "${ROOT}/deploy/rollback-alpha.sh" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  [[ "${rc}" -ne 0 ]] && grep -q "backup-only" "${root}/stderr" \
    && echo "  ok: rollback-alpha.sh refuses a stageBFinal active release with a backup-only message" \
    || { echo "  FAIL: rollback-alpha.sh did not refuse: rc=${rc} $(cat "${root}/stderr")" >&2; exit 1; }
) && PASS=$((PASS + 1)) || FAIL=$((FAIL + 1))

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
