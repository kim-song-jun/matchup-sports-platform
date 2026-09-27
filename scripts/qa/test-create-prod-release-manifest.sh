#!/usr/bin/env bash
# Task 175 T5: end-to-end test for scripts/release/create-prod-release-manifest.sh.
# T4's scripts/qa/test-task168-prod-manifest-validation.sh proves the VALIDATOR
# (deploy/prod-manifest-common.sh) accepts/rejects hand-built fixture JSON. This
# test instead runs the real GENERATOR script for all three
# TASK168_STAGE shapes (none/stageA/stageB) and feeds its actual output into
# that same validator -- the two must agree, or a generator that silently
# drifts from the schema the validator expects would ship undetected.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly GENERATOR="${ROOT_DIR}/scripts/release/create-prod-release-manifest.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

export PROD_HOME_DIR="${TEST_ROOT}/home"
source "${ROOT_DIR}/deploy/prod-source-common.sh"
source "${ROOT_DIR}/deploy/prod-manifest-common.sh"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

readonly REGISTRY_FIXTURE=851725525576.dkr.ecr.ap-northeast-2.amazonaws.com
readonly RELEASE_VERSION_FIXTURE=9.9.9
readonly SOURCE_SHA256_FIXTURE="$(printf 'b%.0s' {1..64})"
# A real commit this worktree actually has -- the generator shells out to
# `git show -s --format=%cI` for release.createdAt, so this must resolve.
readonly RELEASE_SHA_FIXTURE="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
readonly API_DIGEST="sha256:$(printf 'a%.0s' {1..64})"
readonly WEB_DIGEST="sha256:$(printf 'e%.0s' {1..64})"
readonly TOOL_DIGEST="sha256:$(printf 'c%.0s' {1..64})"

# Fake `aws` covering only the one subcommand the generator calls:
# `aws ecr describe-images --repository-name <repo> --image-ids imageTag=<tag> --query ... --output text`.
# Returns a distinct fixed digest per repository so a transposition bug
# (e.g. web's digest ending up on the api image) would fail the URI checks
# in the validator below.
mkdir -p "${TEST_ROOT}/bin"
cat > "${TEST_ROOT}/bin/aws" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "\$1 \$2" == "ecr describe-images" ]]; then
  repo=""
  for ((i=3; i<=\$#; i++)); do
    if [[ "\${!i}" == --repository-name ]]; then
      j=\$((i+1)); repo="\${!j}"
    fi
  done
  case "\${repo}" in
    teameet-prod-v1-api) echo "${API_DIGEST}"; exit 0 ;;
    teameet-prod-v1-web) echo "${WEB_DIGEST}"; exit 0 ;;
    *) echo "fake aws: unexpected --repository-name '\${repo}'" >&2; exit 1 ;;
  esac
fi
echo "fake aws: unsupported invocation: \$*" >&2
exit 1
EOF
chmod +x "${TEST_ROOT}/bin/aws"
export PATH="${TEST_ROOT}/bin:${PATH}"

# Runs the real generator with the given TASK168_* overrides and returns its
# exit code; on success, prints manifestPath.
run_generator() {
  local out="${TEST_ROOT}/gh-output-$$-${RANDOM}"
  local rc=0
  (
    export GITHUB_OUTPUT="${out}"
    RELEASE_SHA="${RELEASE_SHA_FIXTURE}" \
    RELEASE_VERSION="${RELEASE_VERSION_FIXTURE}" \
    REGISTRY="${REGISTRY_FIXTURE}" \
    SOURCE_SHA256="${SOURCE_SHA256_FIXTURE}" \
    IMAGE_TAG="sha-${RELEASE_SHA_FIXTURE}" \
    PREVIOUS_SHA="none" \
    MIGRATION_BASE_SHA="none" \
    TASK168_STAGE="${1:-}" \
    TASK168_REHEARSAL_EVIDENCE="${2:-}" \
    TASK168_CUTOVER_DIGEST="${3:-}" \
      bash "${GENERATOR}"
  ) >"${TEST_ROOT}/stdout" 2>"${TEST_ROOT}/stderr" || rc=$?
  if [[ ${rc} -eq 0 ]]; then
    grep -m1 '^manifestPath=' "${out}" | cut -d= -f2-
  fi
  return "${rc}"
}

# $1 label, $2 TASK168_STAGE, $3 evidence, $4 cutover digest, $5 expected
# stage in the produced manifest ('' means database.task168 must be absent),
# $6 'true' iff images.cutoverTool must be present.
check_stage() {
  local label="$1" stage="$2" evidence="$3" digest="$4" expect_stage="$5" expect_tool="$6"
  local manifest checksum
  if ! manifest="$(run_generator "${stage}" "${evidence}" "${digest}")"; then
    bad "${label} -- generator exited nonzero: $(cat "${TEST_ROOT}/stderr")"
    return
  fi
  [[ -s "${manifest}" ]] || { bad "${label} -- generator reported a manifest path that doesn't exist"; return; }

  local actual_stage
  actual_stage="$(jq -r '.database.task168.stage // ""' "${manifest}")"
  if [[ "${actual_stage}" != "${expect_stage}" ]]; then
    bad "${label} -- database.task168.stage was '${actual_stage}', expected '${expect_stage}'"
    return
  fi
  local has_tool
  has_tool="$(jq -r 'if .images.cutoverTool == null then "false" else "true" end' "${manifest}")"
  if [[ "${has_tool}" != "${expect_tool}" ]]; then
    bad "${label} -- images.cutoverTool presence was '${has_tool}', expected '${expect_tool}'"
    return
  fi

  # Feed the generator's REAL output into the REAL validator (T4's own
  # deploy/prod-manifest-common.sh), including the on-disk source_dir check
  # -- this repo IS the source tree the migrations were hashed from.
  checksum="$(sha256sum "${manifest}" | awk '{print $1}')"
  if validate_prod_release_manifest "${manifest}" "${RELEASE_SHA_FIXTURE}" "${RELEASE_VERSION_FIXTURE}" \
    "${checksum}" "${REGISTRY_FIXTURE}" "${ROOT_DIR}" 2>"${TEST_ROOT}/validate-err"; then
    ok "${label} -- generated manifest passes validate_prod_release_manifest (incl. on-disk migration checksum)"
  else
    bad "${label} -- validator rejected the generator's own output: $(cat "${TEST_ROOT}/validate-err")"
  fi
}

check_stage "none" "" "" "" "" false
check_stage "stageA" "stageA" "local rehearsal log 2026-09-27" "${TOOL_DIGEST}" "stageA" true
check_stage "stageB" "stageB" "local rehearsal log 2026-09-27" "" "stageB" false

# ── negative controls: the generator must refuse, not silently ship a
#    manifest missing a field the validator (or the runner) requires ────────
if run_generator stageA "" "${TOOL_DIGEST}" >/dev/null 2>"${TEST_ROOT}/stderr"; then
  bad "stageA without TASK168_REHEARSAL_EVIDENCE was accepted (must be required)"
else
  ok "stageA without TASK168_REHEARSAL_EVIDENCE is rejected"
fi

if run_generator stageA "local rehearsal log 2026-09-27" "" >/dev/null 2>"${TEST_ROOT}/stderr"; then
  bad "stageA without TASK168_CUTOVER_DIGEST was accepted (must be required)"
else
  ok "stageA without TASK168_CUTOVER_DIGEST is rejected"
fi

if run_generator bogusStage "local rehearsal log 2026-09-27" "${TOOL_DIGEST}" >/dev/null 2>"${TEST_ROOT}/stderr"; then
  bad "an unknown TASK168_STAGE value was accepted"
else
  ok "an unknown TASK168_STAGE value is rejected"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[create-prod-release-manifest] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[create-prod-release-manifest] passed"
