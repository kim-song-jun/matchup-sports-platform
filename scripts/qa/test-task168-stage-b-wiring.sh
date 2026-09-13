#!/usr/bin/env bash

# Contract test for the Task168 StageB dispatch wiring (T1, m11-stageb-spec.md
# §5 T1 items 1/2/6; .task168-stageb-a2-contract.md §2/§6/§7/§8).
#
# Runs the real scripts/release/deploy-alpha-via-ssm.sh against a fake `aws`
# and a no-op `sleep` on PATH (the real 10s*N poll loop would otherwise make
# this test take minutes). Every assertion reads either the fake aws's call
# log (what commands would have reached AWS) or the script's own exit code —
# never the script's internals directly, so a real regression in the script
# shows up the same way it would against real AWS.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/release/deploy-alpha-via-ssm.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

readonly REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
readonly REGION=ap-northeast-2
readonly ACCOUNT=123456789012
readonly INSTANCE=i-0123456789abcdef0
readonly BUCKET=alpha-bucket
readonly SHA=1111111111111111111111111111111111111111
readonly VERSION=0.1.0-alpha.20260914.g111111111111
readonly SHA256_A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
readonly SHA256_B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
readonly VERSION_ID_A=version-a
readonly VERSION_ID_B=version-b

base_env() {
  unset TASK168_STAGE TASK168_STAGE_B_TIMEOUT_SECONDS RELEASE_VERSION SOURCE_VERSION_ID SOURCE_SHA256 \
    MANIFEST_VERSION_ID MANIFEST_SHA256 STAGE_B_SOURCE_VERSION_ID STAGE_B_SOURCE_SHA256 \
    STAGE_B_MANIFEST_VERSION_ID STAGE_B_MANIFEST_SHA256 2>/dev/null || true
  export RELEASE_SHA="${SHA}"
  export DEPLOY_BUCKET="${BUCKET}"
  export EXPECTED_BUCKET_OWNER="${ACCOUNT}"
  export INSTANCE_ID="${INSTANCE}"
  export REGISTRY
  export AWS_REGION="${REGION}"
}

# Builds a fake `aws` + no-op `sleep` on a fresh PATH prefix. $1 = case dir.
# `aws_mode` controls get-command-invocation's Status sequence:
#   success        -> Success immediately
#   failed         -> Failed immediately
#   always_progress -> InProgress forever (drives the poll loop to exhaustion)
make_fake_bin() {
  local dir="$1" aws_mode="$2"
  mkdir -p "${dir}"
  cat > "${dir}/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "${dir}/aws" <<EOF
#!/usr/bin/env bash
log="${dir}/aws-calls.log"
printf '%s\n' "\$*" >> "\${log}"
mode="${aws_mode}"
EOF
  cat >> "${dir}/aws" <<'EOF'
case "$1 $2" in
  "ssm send-command")
    for ((i=1; i<=$#; i++)); do
      if [[ "${!i}" == --parameters ]]; then
        j=$((i+1))
        printf '%s' "${!j}" > "$(dirname "$0")/last-parameters.json"
      fi
      if [[ "${!i}" == --comment ]]; then
        j=$((i+1))
        printf '%s' "${!j}" > "$(dirname "$0")/last-comment.txt"
      fi
    done
    echo fake-command-id
    exit 0
    ;;
  "ssm get-command-invocation")
    for ((i=1; i<=$#; i++)); do
      [[ "${!i}" == --query ]] && { j=$((i+1)); query="${!j}"; }
    done
    case "${mode}" in
      success)
        case "${query}" in
          Status) echo Success ;;
          StandardOutputContent) echo "ok" ;;
          *) echo '{"status":"Success"}' ;;
        esac
        ;;
      failed)
        case "${query}" in
          Status) echo Failed ;;
          *) echo '{"status":"Failed","stdout":"","stderr":"boom"}' ;;
        esac
        ;;
      always_progress)
        echo InProgress
        ;;
    esac
    exit 0
    ;;
  *)
    echo "unexpected aws invocation: $*" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "${dir}/aws" "${dir}/sleep"
}

# ── 1. Unknown/typo stage: rejected before any AWS call, exit != 0 ──────────
run_unknown_stage() {
  local dir="${WORK}/unknown"
  make_fake_bin "${dir}" success
  base_env
  export TASK168_STAGE=stageQ
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -ne 0 ]] && pass "unknown stage exits non-zero" || fail "unknown stage did not fail (rc=${rc})"
  [[ ! -s "${dir}/aws-calls.log" ]] && pass "unknown stage never calls aws" || fail "unknown stage called aws: $(cat "${dir}/aws-calls.log")"
}

# ── 2. StageA path is byte-identical to before StageB existed ──────────────
run_stage_a() {
  local dir="${WORK}/stage-a"
  make_fake_bin "${dir}" success
  base_env
  export TASK168_STAGE=stageAIntermediate
  export RELEASE_VERSION="${VERSION}"
  export SOURCE_VERSION_ID="${VERSION_ID_A}"
  export SOURCE_SHA256="${SHA256_A}"
  export MANIFEST_VERSION_ID="${VERSION_ID_B}"
  export MANIFEST_SHA256="${SHA256_B}"
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -eq 0 ]] || { fail "stageAIntermediate run failed: $(cat "${dir}/stderr")"; return; }
  local params
  params="$(cat "${dir}/last-parameters.json")"
  jq -e '.commands | length == 9' <<< "${params}" >/dev/null && pass "stageA sends exactly 9 commands (unchanged)" \
    || fail "stageA command count changed: ${params}"
  jq -e 'has("executionTimeout") | not' <<< "${params}" >/dev/null && pass "stageA never sets executionTimeout" \
    || fail "stageA parameters unexpectedly carry executionTimeout"
  grep -q "deploy-alpha.sh" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageA invokes deploy-alpha.sh" \
    || fail "stageA did not invoke deploy-alpha.sh"
  grep -q "deploy-alpha-stage-b.sh" <<< "$(jq -r '.commands[]' <<< "${params}")" && fail "stageA unexpectedly references deploy-alpha-stage-b.sh" \
    || pass "stageA never references deploy-alpha-stage-b.sh"
  grep -q "releases/${SHA}.tar.gz" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageA reads the unnamespaced StageA source key" \
    || fail "stageA source key changed"

  # The checks above proved command count/key/target only, never that the
  # send-command --comment and SOURCE/MANIFEST_VERSION_ID width are
  # byte-identical to origin/dev (they had in fact drifted: comment lost
  # RELEASE_VERSION, and the {1,1024} bound had silently narrowed to
  # {1,255}).
  local expected_comment="Teameet alpha ${VERSION} ${SHA}"
  [[ "$(cat "${dir}/last-comment.txt" 2>/dev/null)" == "${expected_comment}" ]] \
    && pass "stageA send-command --comment is byte-identical to origin/dev ('Teameet alpha <version> <sha>')" \
    || fail "stageA --comment changed: got '$(cat "${dir}/last-comment.txt" 2>/dev/null)', want '${expected_comment}'"
}

# ── 2b. StageA SOURCE_VERSION_ID/MANIFEST_VERSION_ID width is {1,1024}, the
# same bound origin/dev has — not the {1,255} that crept in as a macOS-bash
# regex-engine accommodation (macOS's regcomp rejects {1,1024} outright;
# real S3 version ids are ~32 chars, so this bound is validation width, not
# behavior real inputs exercise).
run_stage_a_version_id_width() {
  local dir="${WORK}/stage-a-version-id-width"
  make_fake_bin "${dir}" success
  base_env
  export TASK168_STAGE=stageAIntermediate
  export RELEASE_VERSION="${VERSION}"
  export SOURCE_VERSION_ID="$(printf 'a%.0s' $(seq 1 300))"   # 300 chars: > 255, <= 1024
  export SOURCE_SHA256="${SHA256_A}"
  export MANIFEST_VERSION_ID="${VERSION_ID_B}"
  export MANIFEST_SHA256="${SHA256_B}"
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -eq 0 ]] && pass "a 300-char SOURCE_VERSION_ID (within origin/dev's {1,1024} bound) is accepted" \
    || fail "a 300-char SOURCE_VERSION_ID was rejected (bound narrower than origin/dev's {1,1024}): $(cat "${dir}/stderr")"
}

# ── 3. stageBFinal: namespaced keys, executionTimeout present, wrapper called
run_stage_b_final() {
  local dir="${WORK}/stage-b-final"
  make_fake_bin "${dir}" success
  base_env
  export TASK168_STAGE=stageBFinal
  export TASK168_STAGE_B_TIMEOUT_SECONDS=5400
  export RELEASE_VERSION="${VERSION}"
  export STAGE_B_SOURCE_VERSION_ID="${VERSION_ID_A}"
  export STAGE_B_SOURCE_SHA256="${SHA256_A}"
  export STAGE_B_MANIFEST_VERSION_ID="${VERSION_ID_B}"
  export STAGE_B_MANIFEST_SHA256="${SHA256_B}"
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -eq 0 ]] || { fail "stageBFinal run failed: $(cat "${dir}/stderr")"; return; }
  local params
  params="$(cat "${dir}/last-parameters.json")"
  [[ "$(jq -r '.executionTimeout[0]' <<< "${params}")" == 5400 ]] && pass "stageBFinal sets executionTimeout=5400" \
    || fail "stageBFinal executionTimeout wrong: ${params}"
  grep -q "deploy-alpha-stage-b.sh" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageBFinal invokes deploy-alpha-stage-b.sh" \
    || fail "stageBFinal did not invoke deploy-alpha-stage-b.sh"
  grep -q "releases/task168-stage-b/${SHA}.tar.gz" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageBFinal reads the namespaced source key" \
    || fail "stageBFinal source key not namespaced"
  grep -q "manifests/task168-stage-b/${SHA}.json" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageBFinal reads the namespaced manifest key" \
    || fail "stageBFinal manifest key not namespaced"
}

# ── 4. stageBRecover: no source/manifest staging, uses the live wrapper copy
run_stage_b_recover() {
  local dir="${WORK}/stage-b-recover"
  make_fake_bin "${dir}" success
  base_env
  export TASK168_STAGE=stageBRecover
  export TASK168_STAGE_B_TIMEOUT_SECONDS=900
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -eq 0 ]] || { fail "stageBRecover run failed: $(cat "${dir}/stderr")"; return; }
  local params
  params="$(cat "${dir}/last-parameters.json")"
  grep -q "deploy-alpha-stage-b.sh" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageBRecover invokes deploy-alpha-stage-b.sh" \
    || fail "stageBRecover did not invoke deploy-alpha-stage-b.sh"
  grep -q "TASK168_STAGE=stageBRecover" <<< "$(jq -r '.commands[]' <<< "${params}")" && pass "stageBRecover passes its own stage name through" \
    || fail "stageBRecover did not pass TASK168_STAGE=stageBRecover"
  grep -q "s3api get-object" <<< "$(jq -r '.commands[]' <<< "${params}")" && fail "stageBRecover unexpectedly stages a source/manifest" \
    || pass "stageBRecover never stages a new source or manifest"
}

# ── 5. Missing executionTimeout for a StageB stage: rejected, no AWS call ──
run_missing_timeout() {
  local dir="${WORK}/missing-timeout"
  make_fake_bin "${dir}" success
  base_env
  export TASK168_STAGE=stageBPreflight
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -ne 0 ]] && pass "missing task168_stage_b_timeout_seconds exits non-zero" \
    || fail "missing timeout did not fail"
  [[ ! -s "${dir}/aws-calls.log" ]] && pass "missing timeout never calls aws" \
    || fail "missing timeout called aws"
}

# ── 6. SSM classification: Failed -> FAILED_HOST_EXITED, InProgress forever -> UNKNOWN
run_classification() {
  local dir="${WORK}/classify-failed"
  make_fake_bin "${dir}" failed
  base_env
  export TASK168_STAGE=stageBRecover
  export TASK168_STAGE_B_TIMEOUT_SECONDS=60
  local rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -ne 0 ]] && grep -q FAILED_HOST_EXITED "${dir}/stderr" \
    && pass "a terminal non-Success SSM status classifies as FAILED_HOST_EXITED" \
    || fail "Failed status did not classify as FAILED_HOST_EXITED: $(cat "${dir}/stderr")"

  dir="${WORK}/classify-unknown"
  make_fake_bin "${dir}" always_progress
  base_env
  export TASK168_STAGE=stageBRecover
  export TASK168_STAGE_B_TIMEOUT_SECONDS=10
  rc=0
  PATH="${dir}:${PATH}" bash "${SCRIPT}" >/dev/null 2>"${dir}/stderr" || rc=$?
  [[ "${rc}" -ne 0 ]] && grep -q UNKNOWN_HOST_MAY_BE_RUNNING "${dir}/stderr" \
    && ! grep -qi '"failed"' "${dir}/stderr" \
    && pass "polling exhaustion classifies as UNKNOWN_HOST_MAY_BE_RUNNING, never as a bare failure" \
    || fail "InProgress-forever did not classify as UNKNOWN_HOST_MAY_BE_RUNNING: $(cat "${dir}/stderr")"
  # executionTimeout=10s -> poll_attempts = (10+9)/10 + 60 = 61, so the fake
  # aws's get-command-invocation must have been called at least that many
  # times — proving the poll budget genuinely outlives executionTimeout
  # rather than a mutated formula quietly poll_attempts=1'ing past it.
  local calls
  calls="$(grep -c 'get-command-invocation' "${dir}/aws-calls.log" || true)"
  [[ "${calls}" -ge 61 ]] && pass "poll budget (${calls} attempts) exceeds executionTimeout as required" \
    || fail "poll budget only made ${calls} attempts, expected >= 61"
}

# ── 7. deploy-alpha.yml: push never reaches StageB (T1 completion #1) ──────
# Extracts the REAL "Resolve Task 168 stage" step's run: block out of the
# live workflow YAML (never a hand-copied excerpt) and executes it, so a
# regression that weakens the push-pins-to-stageAIntermediate guard shows up
# here even though this test never actually dispatches the workflow.
run_stage_resolution_guard() {
  local dir="${WORK}/stage-resolution"
  mkdir -p "${dir}"
  python3 - "${ROOT}/.github/workflows/deploy-alpha.yml" "${dir}/resolve.sh" <<'PY'
import sys, yaml
workflow_path, out_path = sys.argv[1], sys.argv[2]
doc = yaml.safe_load(open(workflow_path))
job = doc["jobs"]["deploy"]
for step in job["steps"]:
    if step.get("name") == "Resolve Task 168 stage":
        assert step.get("id") == "task168", "step id changed away from 'task168'"
        open(out_path, "w").write(step["run"])
        break
else:
    raise SystemExit("could not find the 'Resolve Task 168 stage' step in the deploy job")
PY
  [[ -s "${dir}/resolve.sh" ]] || { fail "could not extract the Resolve Task 168 stage run: block"; return; }

  # push event, dispatch input claims stageBFinal -> must still resolve to
  # stageAIntermediate and must not require a timeout.
  local out="${dir}/github_output"
  : > "${out}"
  local rc=0
  ( GITHUB_EVENT_NAME=push STAGE_INPUT=stageBFinal TIMEOUT_INPUT='' GITHUB_OUTPUT="${out}" \
    bash "${dir}/resolve.sh" ) > "${dir}/push-stdout" 2> "${dir}/push-stderr" || rc=$?
  [[ "${rc}" -eq 0 ]] && grep -q '^stage=stageAIntermediate$' "${out}" \
    && pass "a push event resolves to stage=stageAIntermediate regardless of a stale dispatch input" \
    || fail "a push event did not resolve to stageAIntermediate: rc=${rc} $(cat "${out}" "${dir}/push-stderr" 2>/dev/null)"

  # workflow_dispatch + a StageB stage but no timeout -> must reject (U11: no
  # assumed default), never silently pick one.
  : > "${out}"
  rc=0
  ( GITHUB_EVENT_NAME=workflow_dispatch STAGE_INPUT=stageBFinal TIMEOUT_INPUT='' GITHUB_OUTPUT="${out}" \
    bash "${dir}/resolve.sh" ) > "${dir}/nodispatch-stdout" 2> "${dir}/nodispatch-stderr" || rc=$?
  [[ "${rc}" -ne 0 ]] && grep -q "task168_stage_b_timeout_seconds is required" "${dir}/nodispatch-stderr" \
    && pass "a StageB dispatch with no executionTimeout is rejected (U11)" \
    || fail "a StageB dispatch with no timeout was not rejected: rc=${rc} $(cat "${dir}/nodispatch-stderr" 2>/dev/null)"

  # Mutation-style regression: with the push-pins-to-stageAIntermediate guard
  # deleted, the same push+stageBFinal input must NOT resolve to
  # stageAIntermediate — proves the test above actually depends on that guard
  # rather than passing for an unrelated reason.
  python3 -c "
s = open('${dir}/resolve.sh').read()
guard = '''if [[ \"\${GITHUB_EVENT_NAME}\" != workflow_dispatch ]]; then
  stage=\"stageAIntermediate\"
fi
'''
assert guard in s, 'guard text not found verbatim -- update this mutation to match the real block'
open('${dir}/resolve-mutated.sh', 'w').write(s.replace(guard, '', 1))
"
  : > "${out}"
  rc=0
  ( GITHUB_EVENT_NAME=push STAGE_INPUT=stageBFinal TIMEOUT_INPUT=60 GITHUB_OUTPUT="${out}" \
    bash "${dir}/resolve-mutated.sh" ) > /dev/null 2>&1 || rc=$?
  grep -q '^stage=stageAIntermediate$' "${out}" 2>/dev/null \
    && fail "removing the push guard still resolved to stageAIntermediate (mutation not detected)" \
    || pass "removing the push guard changes the result (mutation correctly detected)"
}

# ── 8. deploy-alpha.yml: EVERY StageB-only step (an exact, named set — not
# a >=N threshold) evaluates its if: to false once
# steps.task168.outputs.stage is stageAIntermediate. A prior version of
# this check used a >=5-conditions threshold plus a grep -v mutation that
# happened to remove all 6 identical-text guards at once, and so could not
# tell "one guard deleted" from "nothing changed" — deleting a single
# step's if: alone still passed.
#
# Identification of "is this step StageB-only" is deliberately independent
# of the if: field's CONTENT (name/id only) — the exact failure mode this
# guards against is a step whose if: was deleted entirely, which must still
# be found and then fail the "evaluates false" check, not silently vanish
# from the count the way the old regex-over-if-conditions approach would.
run_stage_b_step_conditions() {
  local out="${WORK}/stage-b-step-conditions.json"
  local py_rc=0
  python3 - "${ROOT}/.github/workflows/deploy-alpha.yml" "${out}" > "${out}" <<'PY' || py_rc=$?
import json, sys, yaml

workflow_path, out_path = sys.argv[1], sys.argv[2]
doc = yaml.safe_load(open(workflow_path))
steps = doc["jobs"]["deploy"]["steps"]

EXPECTED_NAMES = [
    "Resolve Task168 StageB final image tag",
    "Build and push Task168 StageB final API image",
    "Prepare Task168 StageB final source inputs",
    "Package and upload Task168 StageB source",
    "Resolve Task168 StageA predecessor transition",
    "Create or reuse Task168 StageB release manifest",
]


def is_stage_b_only(step):
    name = step.get("name", "")
    step_id = str(step.get("id", ""))
    # Name/id convention marker, not the if: field -- a step whose if: was
    # deleted still carries its name/id and must still be picked up here.
    return name in EXPECTED_NAMES or step_id.startswith("stageb-")


def evaluates_false_for_stage_a(cond):
    if cond is None or cond == "":
        return False  # no guard at all -> the step always runs -> not false
    expr = cond
    expr = expr.replace("steps.task168.outputs.stage", "'stageAIntermediate'")
    expr = expr.replace("steps.stageb-images.outputs.final_exists", "''")
    expr = expr.replace("||", " or ").replace("&&", " and ")
    return not eval(expr)  # noqa: S307 -- trusted repo YAML, not user input


found = [s for s in steps if is_stage_b_only(s)]
names_found = sorted(s.get("name") for s in found)
if names_found != sorted(EXPECTED_NAMES):
    print(json.dumps({"error": "StageB-only step set changed", "found": names_found, "expected": sorted(EXPECTED_NAMES)}))
    sys.exit(1)

red = [s.get("name") for s in found if not evaluates_false_for_stage_a(s.get("if"))]
print(json.dumps({"total": len(found), "red": red}))
sys.exit(1 if red else 0)
PY
  if [[ "${py_rc}" -eq 0 ]]; then
    local total; total="$(jq -r '.total' "${out}" 2>/dev/null || echo '?')"
    pass "found exactly the expected ${total} StageB-only step if: conditions, all false for stage=stageAIntermediate"
  else
    fail "StageB-only step if: check failed: $(cat "${out}" 2>/dev/null)"
  fi

  # Mutation-style regression: remove ONE step's if: field at a time (not
  # all 5 identically-worded guards at once, the old grep -v's blind spot)
  # and require exactly THAT step to come back red, for every one of the 6
  # — proves a missing guard on any single step is caught individually, not
  # just "the total count changed".
  local mut_out="${WORK}/stage-b-step-conditions-mutated.json"
  local all_mutations_ok=true target
  while IFS= read -r target; do
    [[ -n "${target}" ]] || continue
    local mut_rc=0
    TARGET_STEP_NAME="${target}" python3 - "${ROOT}/.github/workflows/deploy-alpha.yml" "${mut_out}" > "${mut_out}" <<'PY' || mut_rc=$?
import json, os, sys, yaml

workflow_path, out_path = sys.argv[1], sys.argv[2]
target_name = os.environ["TARGET_STEP_NAME"]
doc = yaml.safe_load(open(workflow_path))
steps = doc["jobs"]["deploy"]["steps"]

mutated = False
for step in steps:
    if step.get("name") == target_name:
        assert "if" in step, f"expected step {target_name!r} to have an if: to delete"
        del step["if"]
        mutated = True
        break
assert mutated, f"could not find step {target_name!r} to mutate"


def is_stage_b_only(step):
    name = step.get("name", "")
    step_id = str(step.get("id", ""))
    return name in [
        "Resolve Task168 StageB final image tag",
        "Build and push Task168 StageB final API image",
        "Prepare Task168 StageB final source inputs",
        "Package and upload Task168 StageB source",
        "Resolve Task168 StageA predecessor transition",
        "Create or reuse Task168 StageB release manifest",
    ] or step_id.startswith("stageb-")


def evaluates_false_for_stage_a(cond):
    if cond is None or cond == "":
        return False
    expr = cond
    expr = expr.replace("steps.task168.outputs.stage", "'stageAIntermediate'")
    expr = expr.replace("steps.stageb-images.outputs.final_exists", "''")
    expr = expr.replace("||", " or ").replace("&&", " and ")
    return not eval(expr)  # noqa: S307


found = [s for s in steps if is_stage_b_only(s)]
red = [s.get("name") for s in found if not evaluates_false_for_stage_a(s.get("if"))]
print(json.dumps({"total": len(found), "red": red}))
sys.exit(1 if red else 0)
PY
    local red_names; red_names="$(jq -r '.red | join(",")' "${mut_out}" 2>/dev/null || echo '')"
    if [[ "${mut_rc}" -ne 0 && "${red_names}" == "${target}" ]]; then
      :
    else
      all_mutations_ok=false
      fail "removing '${target}''s if: guard did not produce exactly one red step (itself): rc=${mut_rc} red=${red_names}"
    fi
  done <<'NAMES'
Resolve Task168 StageB final image tag
Build and push Task168 StageB final API image
Prepare Task168 StageB final source inputs
Package and upload Task168 StageB source
Resolve Task168 StageA predecessor transition
Create or reuse Task168 StageB release manifest
NAMES
  [[ "${all_mutations_ok}" == true ]] \
    && pass "removing any single step's if: guard (all 6, one at a time) is caught as exactly that one step red"
}

echo "== test-task168-stage-b-wiring =="
run_unknown_stage
run_stage_a
run_stage_a_version_id_width
run_stage_b_final
run_stage_b_recover
run_missing_timeout
run_classification
run_stage_resolution_guard
run_stage_b_step_conditions

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
