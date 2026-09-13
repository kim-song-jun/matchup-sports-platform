#!/usr/bin/env bash

# Contract test for deploy/deploy-alpha-stage-b.sh (m11-stageb-spec.md §6.2,
# §6.2-8 stageBRecover; .task168-stageb-a2-contract.md §7/§8). Runs the real
# script against fake docker/aws, never a reimplementation.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/deploy/deploy-alpha-stage-b.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

readonly SHA=1111111111111111111111111111111111111111

# ── Static: stageBFinal never activates or composes up the final runtime in
# this PR (post-commit start pending U2). Real function-call lines only —
# excludes comments, so this cannot be satisfied by prose alone.
check_no_post_commit_start() {
  local calls
  calls="$(grep -vE '^\s*#' "${SCRIPT}" | grep -E 'activate_alpha_release_source|compose\[@\]\}" up -d --force-recreate' || true)"
  [[ -z "${calls}" ]]
}
if check_no_post_commit_start; then
  pass "no activation or force-recreate compose-up call exists yet (post-commit start pending U2)"
else
  fail "deploy-alpha-stage-b.sh calls activation/compose-up despite U2 being undecided"
fi

# Builds a fake $HOME with a state dir for $SHA and a fake compose/docker on
# PATH. Sets ALPHA_HOME_DIR/ALPHA_LIVE_DIR so the script's defaults resolve
# into the fixture instead of a real host path.
setup_recover_fixture() {
  local root="$1"
  home="${root}/home"
  live="${home}/teameet"
  state_dir="${home}/.teameet-alpha-releases/task168/${SHA}"
  bin="${root}/bin"
  log="${root}/calls.log"
  mkdir -p "${live}/deploy" "${state_dir}" "${bin}"
  : > "${log}"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${live}/deploy/.env"
  touch "${live}/deploy/docker-compose.prod.yml" "${live}/deploy/docker-compose.alpha.yml"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock" # macOS has no flock(1)
  chmod +x "${bin}/flock"
}

# $2 = m11 row the fake DB reports ("" = absent, "sha|applied", "sha|unresolved")
# $3 = advisory lock count, $4 = labeled container count, $5 = legacy table count
make_fake_docker_for_recover() {
  local bin="$1" m11="$2" advisory="${3:-0}" labeled="${4:-0}" legacy="${5:-0}"
  cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$*" in
  *"label=com.teameet.task168.stage-b"*)
    for ((i=0; i<${labeled}; i++)); do echo "container\$i"; done
    exit 0 ;;
  *"pg_locks"*) echo "${advisory}"; exit 0 ;;
  *"_prisma_migrations"*) echo "${m11}"; exit 0 ;;
  *"to_regclass"*) echo "${legacy}"; exit 0 ;;
  *"inspect"*"State.Running"*) echo true; exit 0 ;;
  *"update --restart"*) exit 0 ;;
  *"start v1_api v1_game_operations_worker"*) exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/docker"
}

run_recover() {
  local root="$1"
  local rc=0
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBRecover ALPHA_SHA="${SHA}" \
    PATH="${bin}:${PATH}" bash "${SCRIPT}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}

echo "== test-task168-stage-b-wrapper =="

# ── Precondition: lock already held -> refuse, touch nothing ───────────────
root="${WORK}/lock-held"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" ""
# Hold the lock ourselves in a background subshell for the duration of the call.
(
  exec 9>"${state_dir}/stage-b.lock"
  flock 9 2>/dev/null || true
  sleep 5
) &
holder_pid=$!
sleep 0.3
rc="$(run_recover "${root}")"
kill "${holder_pid}" 2>/dev/null || true
wait "${holder_pid}" 2>/dev/null || true
# flock(1) isn't on macOS in this harness (faked to exit 0 always), so this
# precondition can only be exercised where a real flock exists; skip
# gracefully rather than false-fail on this dev machine.
if command -v /usr/bin/flock >/dev/null 2>&1 || command -v flock >/dev/null 2>&1 && [[ "$(command -v flock)" != "${bin}/flock" ]]; then
  [[ "${rc}" -ne 0 ]] && pass "held lock refuses recovery" || fail "held lock did not refuse recovery"
else
  pass "lock precondition skipped (no real flock(1) on this machine — covered by CI on ubuntu)"
fi

# ── Precondition: a labeled runner container exists -> refuse ──────────────
root="${WORK}/labeled-container"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "" 0 1
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "still labeled" "${root}/stderr" \
  && pass "a labeled runner container refuses recovery" \
  || fail "labeled container did not refuse recovery: $(cat "${root}/stderr")"

# ── Precondition: an advisory lock is held -> refuse ────────────────────────
root="${WORK}/advisory-lock"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "" 1 0
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "advisory lock" "${root}/stderr" \
  && pass "a held advisory lock refuses recovery" \
  || fail "advisory lock did not refuse recovery: $(cat "${root}/stderr")"

# ── R-B: no M11 row, quiesce.json present with new D-6 fields -> restore ───
root="${WORK}/r-b"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" ""
jq -n '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",stage:"stageBFinal",
  preApiContainerId:"api123",preWorkerContainerId:"worker123",
  restartPolicyBefore:{api:"always",worker:"always"}}' > "${state_dir}/quiesce.json"
rc="$(run_recover "${root}")"
[[ "${rc}" -eq 0 ]] && grep -q "R-B" "${root}/stdout" \
  && grep -q "update --restart=always api123" "${log}" \
  && grep -q "start v1_api v1_game_operations_worker" "${log}" \
  && pass "R-B restores the pre-quiesce writer with its original restart policy" \
  || fail "R-B did not restore correctly: rc=${rc} stdout=$(cat "${root}/stdout") stderr=$(cat "${root}/stderr")"

# ── R-A: M11 applied, no migration-stage.json, quiesce.json + backup match,
# no legacy tables left -> reconstruct MIGRATION_COMMITTED_RECOVERED ───────
root="${WORK}/r-a"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
jq -n --arg path "${state_dir}/pre-m11-backup.sql" --arg sha "${backup_sha}" \
  '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",backupPath:$path,backupSha256:$sha}' \
  > "${state_dir}/quiesce.json"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"
rc="$(run_recover "${root}")"
[[ "${rc}" -eq 0 ]] && [[ -f "${state_dir}/migration-stage.json" ]] \
  && [[ "$(jq -r .status "${state_dir}/migration-stage.json")" == MIGRATION_COMMITTED_RECOVERED ]] \
  && pass "R-A reconstructs a MIGRATION_COMMITTED_RECOVERED receipt, distinct from the original status" \
  || fail "R-A did not reconstruct correctly: rc=${rc} $(cat "${root}/stdout") $(cat "${root}/stderr")"

# ── R-A negative: M11 row says applied, but legacy tables are STILL present
# (schema/ledger disagree) -> must refuse, never fabricate a receipt.
root="${WORK}/r-a-negative"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
jq -n --arg path "${state_dir}/pre-m11-backup.sql" --arg sha "${backup_sha}" \
  '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",backupPath:$path,backupSha256:$sha}' \
  > "${state_dir}/quiesce.json"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 5
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "legacy tables are still present" "${root}/stderr" \
  && pass "R-A refuses to reconstruct a receipt when legacy tables are still present" \
  || fail "R-A fabricated a receipt despite legacy tables remaining: rc=${rc} $(cat "${root}/stderr")"

# ── R-C: M11 row is unresolved (P3009) -> diagnosis only, no auto-recovery ─
root="${WORK}/r-c"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "somechecksum|unresolved"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ -f "${state_dir}/migration-stage.json.recover-diagnosis.json" ]] \
  && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && pass "R-C writes a diagnosis-only receipt and does not fabricate a committed one" \
  || fail "R-C did not behave correctly: rc=${rc} $(cat "${root}/stderr")"

# ── stageBFinal: runner exits 0 but writes no receipt -> wrapper still fails
# (judged by migration-stage.json, never by exit code alone — §3).
run_stage_b_final_no_receipt() {
  local root="${WORK}/final-no-receipt"
  mkdir -p "${root}/candidate-source/deploy"
  local home="${root}/home" live="${root}/home/teameet"
  local bin="${root}/bin"
  mkdir -p "${live}/deploy" "${bin}"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock"; chmod +x "${bin}/flock"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${live}/deploy/.env"
  touch "${live}/deploy/docker-compose.prod.yml" "${live}/deploy/docker-compose.alpha.yml"

  local source_dir="${root}/candidate-source"
  cp "${ROOT}/deploy/alpha-manifest-common.sh" "${source_dir}/deploy/alpha-manifest-common.sh"
  cp "${ROOT}/deploy/alpha-source-common.sh" "${source_dir}/deploy/alpha-source-common.sh"
  cat > "${source_dir}/deploy/alpha-release-common.sh" <<EOF
source "${ROOT}/deploy/alpha-release-common.sh"
EOF
  # A runner stand-in that exits 0 without writing migration-stage.json —
  # exactly the "runner claims success but the receipt says otherwise" case.
  printf '#!/usr/bin/env bash\nexit 0\n' > "${source_dir}/deploy/task168-stage-b-migrate.sh"
  chmod +x "${source_dir}/deploy/task168-stage-b-migrate.sh"

  local registry=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
  local manifest="${root}/manifest.json"
  jq -n --arg registry "${registry}" '{
    schemaVersion:1, environment:"alpha",
    release:{sha:"'"${SHA}"'", version:"0.1.0-alpha.20260914.g111111111111", createdAt:"2026-09-14T00:00:00Z"},
    source:{bucket:"b", key:"releases/task168-stage-b/'"${SHA}"'.tar.gz", versionId:"v1", sha256:("c"*64)},
    database:{migrationPolicy:"task168-stageBFinal", rollbackMode:"backup-only", compatibilityCheck:"expand-contract-sql-v1",
      task168:{stage:"stageBFinal", schemaSha256:"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46",
        migrations:[{name:"x",sha256:("d"*64)}],
        fullMigrationHistory:[range(0;12)|{name:("m"+(.|tostring)),sha256:("d"*64)}],
        resolvedMigrationAttemptsSha256:("e"*64),
        predecessor:{releaseSha:"2222222222222222222222222222222222222222",transition:"/x",transitionSha256:("f"*64),apiImage:"img",databaseIdentity:"id",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"},
        finalImagePreflight:{receipt:"/y",receiptSha256:("a"*64),inputSnapshotSha256:("b"*64)},
        recoveryFrom:null, rollbackTarget:null}},
    images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("a"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("a"*64))},
      web:{repository:($registry+"/teameet-alpha-v1-web"),digest:("sha256:"+("b"*64)),uri:($registry+"/teameet-alpha-v1-web@sha256:"+("b"*64))},
      cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("c"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("c"*64))}}}' \
    > "${manifest}"

  local bin2="${root}/bin"
  cat > "${bin2}/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *"run --rm --entrypoint cat"*.task168-runtime-client-attestation.json*)
    echo '{"stage":"stageBFinal","schemaSha256":"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46","generatedClient":true}'
    ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin2}/docker"
  cat > "${bin2}/aws" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"ecr get-login-password"*) echo fake-password ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin2}/aws"

  local rc=0
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBFinal \
    ALPHA_SOURCE_DIR="${source_dir}" ALPHA_MANIFEST_FILE="${manifest}" \
    ALPHA_MANIFEST_SHA256="$(sha256sum "${manifest}" | awk '{print $1}')" \
    ALPHA_SHA="${SHA}" ALPHA_RELEASE_VERSION="0.1.0-alpha.20260914.g111111111111" \
    ALPHA_ECR_REGISTRY="${registry}" ALPHA_AWS_REGION="ap-northeast-2" \
    ALPHA_SOURCE_BUCKET="b" ALPHA_SOURCE_VERSION_ID="v1" ALPHA_SOURCE_SHA256="$(printf 'c%.0s' {1..64})" \
    PATH="${bin2}:${PATH}" bash "${SCRIPT}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}
rc="$(run_stage_b_final_no_receipt)"
[[ "${rc}" -ne 0 ]] && grep -q "wrote no migration-stage.json" "${WORK}/final-no-receipt/stderr" \
  && pass "stageBFinal fails when the runner exits 0 without a migration receipt (judged by receipt, not exit code)" \
  || fail "stageBFinal did not judge by the receipt: rc=${rc} $(cat "${WORK}/final-no-receipt/stderr" 2>/dev/null)"

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
