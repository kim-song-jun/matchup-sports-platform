#!/usr/bin/env bash

# Contract test for the StageB manifest validation (D-4) and promotion gate
# (T7) added to deploy/alpha-manifest-common.sh and deploy/alpha-release-common.sh,
# plus rollback-alpha.sh's stageBFinal refusal (D-4).

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
       task168:{stage:"stageBFinal", schemaSha256:$schema, runtimeClientSchemaSha256:$schema,
         migrations:[range(0;11)|{name:("202609010000"+((10+.)|tostring)+"_v1_fixture"),sha256:("d"*64)}],
         fullMigrationHistory:[range(0;12)|{name:("202608010000"+((10+.)|tostring)+"_v1_history"),sha256:("d"*64)}],
         resolvedMigrationAttemptsSha256:("e"*64),
         migrationLockSha256:("1"*64),
         predecessor:{releaseSha:"2222222222222222222222222222222222222222",transition:"/x",transitionSha256:("f"*64),apiImage:"img",databaseIdentity:"id",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"},
         rehearsal:{mode:"waived",reason:"user-directed Alpha run without isolated rehearsal",decidedAt:"2026-09-14"},
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
  rehearsal="$(jq -c '.database.task168.rehearsal' "${manifest}")"
  fullHistory="$(jq -c '.database.task168.fullMigrationHistory' "${manifest}")"

  if validate_alpha_stage_b_final_manifest "${manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  ok: a well-formed StageB manifest validates"
  else
    echo "  FAIL: a well-formed StageB manifest was rejected" >&2
    exit 1
  fi

  if validate_alpha_stage_b_final_manifest "${manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${checksum}" "${REGISTRY}" "91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f" \
    "${migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  FAIL: a mismatched expected schema sha was accepted" >&2
    exit 1
  else
    echo "  ok: a mismatched expected schema sha is rejected"
  fi

  wrong_migrations='[{"name":"y","sha256":"'"$(printf 'd%.0s' {1..64})"'"}]'
  if validate_alpha_stage_b_final_manifest "${manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${wrong_migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  FAIL: a mismatched expected migrations array was accepted" >&2
    exit 1
  else
    echo "  ok: a mismatched expected migrations array is rejected"
  fi

  # The stored-manifest path derives the expected arrays from the manifest
  # itself, so equality alone is tautological: the per-item shape and the
  # 11-entry count are what refuse a structurally corrupt manifest there.
  short_manifest="${WORK}/direct-short.json"
  jq '.database.task168.migrations = (.database.task168.migrations[0:10])' "${manifest}" > "${short_manifest}"
  short_checksum="$(sha256sum "${short_manifest}" | awk '{print $1}')"
  short_migrations="$(jq -c '.database.task168.migrations' "${short_manifest}")"
  if validate_alpha_stage_b_final_manifest "${short_manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${short_checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${short_migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  FAIL: a StageB manifest carrying 10 Task168 migrations was accepted" >&2
    exit 1
  else
    echo "  ok: a StageB manifest without exactly 11 Task168 migrations is rejected"
  fi

  bad_name_manifest="${WORK}/direct-bad-name.json"
  jq '.database.task168.migrations[3].name = "not-a-migration-name"' "${manifest}" > "${bad_name_manifest}"
  bad_name_checksum="$(sha256sum "${bad_name_manifest}" | awk '{print $1}')"
  bad_name_migrations="$(jq -c '.database.task168.migrations' "${bad_name_manifest}")"
  if validate_alpha_stage_b_final_manifest "${bad_name_manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${bad_name_checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${bad_name_migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  FAIL: a StageB manifest carrying a malformed migration name was accepted" >&2
    exit 1
  else
    echo "  ok: a StageB manifest carrying a malformed migration name is rejected"
  fi

  dup_manifest="${WORK}/direct-dup.json"
  jq '.database.task168.migrations[5].name = .database.task168.migrations[4].name' "${manifest}" > "${dup_manifest}"
  dup_checksum="$(sha256sum "${dup_manifest}" | awk '{print $1}')"
  dup_migrations="$(jq -c '.database.task168.migrations' "${dup_manifest}")"
  if validate_alpha_stage_b_final_manifest "${dup_manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${dup_checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${dup_migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  FAIL: a StageB manifest repeating a migration name was accepted" >&2
    exit 1
  else
    echo "  ok: a StageB manifest repeating a migration name is rejected"
  fi

  # D-2 namespace (Copilot review, PR #1194): a StageA-shaped key
  # (releases/<sha>.tar.gz, no task168-stage-b/ prefix) must never validate
  # on a StageB manifest, even for the same release sha and even though it
  # still ends in .tar.gz.
  wrong_key_manifest="${WORK}/direct-wrong-key.json"
  jq --arg sha "${SHA}" '.source.key = ("releases/" + $sha + ".tar.gz")' "${manifest}" > "${wrong_key_manifest}"
  wrong_key_checksum="$(sha256sum "${wrong_key_manifest}" | awk '{print $1}')"
  if validate_alpha_stage_b_final_manifest "${wrong_key_manifest}" "${SHA}" "0.1.0-alpha.20260914.g111111111111" \
    "${wrong_key_checksum}" "${REGISTRY}" "${FINAL_SCHEMA}" "${migrations}" "${predecessor}" "${rehearsal}" "${fullHistory}"; then
    echo "  FAIL: a StageA-namespaced source key (releases/<sha>.tar.gz) was accepted on a StageB manifest" >&2
    exit 1
  else
    echo "  ok: a StageA-namespaced source key is rejected on a StageB manifest"
  fi
) && PASS=$((PASS + 4)) || FAIL=$((FAIL + 1))

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

# ── create-alpha-release-manifest.sh (StageB reuse branch): a manifest
# fetched back from S3 must have resolvedMigrationAttemptsSha256 equal to
# THIS run's freshly resolved value, not merely a well-formed sha256
# (Copilot review, PR #1194). Two real invocations of the real script share
# one fake aws: run 1 creates a manifest (captured via put-object), then the
# saved copy's resolvedMigrationAttemptsSha256 is tampered before run 2,
# which must hit the head-object/get-object reuse branch and refuse.
(
  dir="${WORK}/manifest-generator-stale-resolved"
  bin="${dir}/bin"; mkdir -p "${bin}"
  registry="${REGISTRY}"
  key="manifests/task168-stage-b/${SHA}.json"
  saved="${dir}/saved-manifest.json"
  exists_flag="${dir}/exists"

  cat > "${bin}/aws" <<EOF
#!/usr/bin/env bash
set -u
argv=("\$@")
find_val() { local flag="\$1" i; for ((i=0;i<\${#argv[@]};i++)); do [[ "\${argv[i]}" == "\${flag}" ]] && { echo "\${argv[\$((i+1))]}"; return 0; }; done; return 1; }
case "\${argv[0]} \${argv[1]}" in
  "ecr describe-images")
    tag="\$(find_val --image-ids)"
    echo "sha256:\$(printf '%s' "\${tag}" | sha256sum | awk '{print \$1}')"
    ;;
  "s3api head-object")
    [[ -f "${exists_flag}" ]] || exit 1
    echo "v1"
    ;;
  "s3api get-object")
    dst="\${argv[-1]}"
    cp "${saved}" "\${dst}"
    ;;
  "s3api put-object")
    body="\$(find_val --body)"
    cp "\${body}" "${saved}"
    : > "${exists_flag}"
    echo "v1"
    ;;
  *) echo "fake aws: unexpected invocation: \$*" >&2; exit 1 ;;
esac
EOF
  chmod +x "${bin}/aws"
  cat > "${bin}/git" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  "show -s --format=%cI "*) echo "2026-09-14T00:00:00+09:00" ;;
  *) echo "fake git: unexpected invocation: $*" >&2; exit 1 ;;
esac
EOF
  chmod +x "${bin}/git"

  run_generator() {
    local rc=0 out err
    out="${dir}/stdout.$1"; err="${dir}/stderr.$1"
    : > "${dir}/github-output.$1"
    env GITHUB_OUTPUT="${dir}/github-output.$1" RELEASE_SHA="${SHA}" RELEASE_VERSION="0.1.0-alpha.20260914.g111111111111" REGISTRY="${registry}" \
      DEPLOY_BUCKET="alpha-bucket" EXPECTED_BUCKET_OWNER="123456789012" \
      SOURCE_VERSION_ID="v1" SOURCE_SHA256="$(printf 'c%.0s' {1..64})" \
      IMAGE_TAG="task168-final-${SHA}" WEB_IMAGE_TAG="sha-${SHA}" TOOL_IMAGE_TAG="task168-${SHA}" \
      TASK168_STAGE=stageBFinal \
      TASK168_PREDECESSOR_RELEASE_SHA="2222222222222222222222222222222222222222" \
      TASK168_PREDECESSOR_TRANSITION_PATH="/x" TASK168_PREDECESSOR_TRANSITION_SHA256="$(printf 'f%.0s' {1..64})" \
      TASK168_PREDECESSOR_API_IMAGE="img" TASK168_PREDECESSOR_DATABASE_IDENTITY="id" \
      TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256="${RESOLVED_SHA}" \
      TASK168_REHEARSAL_MODE=waived TASK168_REHEARSAL_REASON="test waiver" TASK168_REHEARSAL_DECIDED_AT="2026-09-14" \
      PATH="${bin}:${PATH}" bash "${ROOT}/scripts/release/create-alpha-release-manifest.sh" \
      >"${out}" 2>"${err}" || rc=$?
    echo "${rc}"
  }

  RESOLVED_SHA="$(printf 'e%.0s' {1..64})"
  rc1="$(run_generator run1)"
  if [[ "${rc1}" -eq 0 && -f "${saved}" ]]; then
    echo "  ok: run 1 creates and stores a fresh StageB manifest (resolvedMigrationAttemptsSha256=${RESOLVED_SHA:0:8}...)"
  else
    echo "  FAIL: run 1 (creating the baseline manifest) failed: rc=${rc1} $(cat "${dir}/stderr.run1" 2>/dev/null)" >&2
    exit 1
  fi

  # Tamper the stored manifest's resolvedMigrationAttemptsSha256 to a
  # different (still well-formed) value, simulating a stale S3 object left
  # over from before the predecessor/live-DB snapshot changed.
  stale="${dir}/tampered.json"
  jq '.database.task168.resolvedMigrationAttemptsSha256 = ("d"*64)' "${saved}" > "${stale}"
  mv "${stale}" "${saved}"

  # Run 2 reuses the (now-stale) stored manifest -- TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256
  # is still the same freshly-resolved "e"*64 value run 1 used, so it disagrees with the
  # tampered "d"*64 now on disk.
  rc2="$(run_generator run2)"
  if [[ "${rc2}" -ne 0 ]] && grep -q "resolvedMigrationAttemptsSha256 does not match" "${dir}/stderr.run2"; then
    echo "  ok: a reused manifest with a stale resolvedMigrationAttemptsSha256 is refused"
  else
    echo "  FAIL: a stale resolvedMigrationAttemptsSha256 was not refused: rc=${rc2} $(cat "${dir}/stderr.run2" 2>/dev/null)" >&2
    exit 1
  fi

  # Mutation regression: with the new equality check removed, the exact same
  # stale-manifest fixture must be ACCEPTED -- proves the positive assertion
  # above actually depends on this check, not on some other validation.
  # The mutated copy must live at the same relative depth as the real
  # script (scripts/release/) -- it locates alpha-manifest-common.sh via
  # "$(dirname "${BASH_SOURCE[0]}")/../../deploy", which would otherwise
  # resolve outside this temp root entirely.
  mkdir -p "${dir}/scripts/release" "${dir}/deploy"
  cp "${ROOT}/deploy/alpha-manifest-common.sh" "${dir}/deploy/alpha-manifest-common.sh"
  mutated="${dir}/scripts/release/create-alpha-release-manifest-mutated.sh"
  python3 - "${ROOT}/scripts/release/create-alpha-release-manifest.sh" "${mutated}" <<'PY'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
text = open(src_path).read()
marker = 'jq -e --arg expected "$resolved_migration_attempts_sha256" \\\n      \'.database.task168.resolvedMigrationAttemptsSha256 == $expected\' "$manifest" >/dev/null ||\n      { echo "Reused StageB manifest\'s resolvedMigrationAttemptsSha256 does not match the freshly resolved snapshot" >&2; exit 1; }\n'
assert marker in text, "could not find the resolvedMigrationAttemptsSha256 equality check to mutate away"
open(out_path, "w").write(text.replace(marker, "", 1))
PY
  chmod +x "${mutated}"
  rc3=0
  : > "${dir}/github-output.mutated"
  env GITHUB_OUTPUT="${dir}/github-output.mutated" RELEASE_SHA="${SHA}" RELEASE_VERSION="0.1.0-alpha.20260914.g111111111111" REGISTRY="${registry}" \
    DEPLOY_BUCKET="alpha-bucket" EXPECTED_BUCKET_OWNER="123456789012" \
    SOURCE_VERSION_ID="v1" SOURCE_SHA256="$(printf 'c%.0s' {1..64})" \
    IMAGE_TAG="task168-final-${SHA}" WEB_IMAGE_TAG="sha-${SHA}" TOOL_IMAGE_TAG="task168-${SHA}" \
    TASK168_STAGE=stageBFinal \
    TASK168_PREDECESSOR_RELEASE_SHA="2222222222222222222222222222222222222222" \
    TASK168_PREDECESSOR_TRANSITION_PATH="/x" TASK168_PREDECESSOR_TRANSITION_SHA256="$(printf 'f%.0s' {1..64})" \
    TASK168_PREDECESSOR_API_IMAGE="img" TASK168_PREDECESSOR_DATABASE_IDENTITY="id" \
    TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256="${RESOLVED_SHA}" \
    TASK168_REHEARSAL_MODE=waived TASK168_REHEARSAL_REASON="test waiver" TASK168_REHEARSAL_DECIDED_AT="2026-09-14" \
    PATH="${bin}:${PATH}" bash "${mutated}" >"${dir}/stdout.mutated" 2>"${dir}/stderr.mutated" || rc3=$?
  if [[ "${rc3}" -eq 0 ]]; then
    echo "  ok: removing the equality check accepts the same stale manifest (mutation correctly detected)"
  else
    echo "  FAIL: the mutated script (no equality check) still refused: rc=${rc3} $(cat "${dir}/stderr.mutated" 2>/dev/null)" >&2
    exit 1
  fi
) && PASS=$((PASS + 3)) || FAIL=$((FAIL + 1))

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
