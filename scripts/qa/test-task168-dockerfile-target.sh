#!/usr/bin/env bash

# Task168 StageB Dockerfile target-safety contract test.
#
# A target-less `docker build` resolves to a Dockerfile's LAST stage. Adding
# runtime-task168-final ahead of the existing (default) `runtime` stage is
# only safe if BOTH conditions hold at once:
#   1. the new stages stay textually before `runtime` in Dockerfile.v1-api
#   2. every workflow build-push step that builds Dockerfile.v1-api pins its
#      own `target:` explicitly, so it never depends on stage order at all
#
# Checks stage order and target-line presence; a real `docker build --target`
# run (verifying attestation content differs correctly) is CI-only — see
# the "Task168 Dockerfile target build" step in .github/workflows/deploy.yml
# gates, which this test cannot run locally without a full image build.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

# Returns 0 (safe) or 1 (unsafe) and prints a one-line reason to stdout.
# $1 = Dockerfile path, $2.. = workflow YAML paths to check for target: lines.
check_dockerfile_target_wiring() {
  local dockerfile="$1"; shift
  local runtime_line builder_final_line runtime_final_line

  runtime_line="$(grep -nE '^FROM .* AS runtime$' "${dockerfile}" | head -1 | cut -d: -f1)"
  builder_final_line="$(grep -nE '^FROM .* AS builder-task168-final$' "${dockerfile}" | head -1 | cut -d: -f1)"
  runtime_final_line="$(grep -nE '^FROM .* AS runtime-task168-final$' "${dockerfile}" | head -1 | cut -d: -f1)"

  if [[ -z "${runtime_line}" || -z "${builder_final_line}" || -z "${runtime_final_line}" ]]; then
    echo "missing one of: runtime(${runtime_line:-?}) builder-task168-final(${builder_final_line:-?}) runtime-task168-final(${runtime_final_line:-?})"
    return 1
  fi
  if (( builder_final_line >= runtime_line || runtime_final_line >= runtime_line )); then
    echo "StageB stage(s) are not before the default runtime stage (runtime=${runtime_line}, builder-final=${builder_final_line}, runtime-final=${runtime_final_line})"
    return 1
  fi

  local yml
  for yml in "$@"; do
    # Each build-push-action step block that names Dockerfile.v1-api runs from
    # its `- name:`/`- uses:` line to the next top-level step marker. Extract
    # each such block and require a `target:` key inside it.
    local blocks
    blocks="$(awk '
      /^      - (name:|uses:)/ { if (in_block && buf ~ /file: *deploy\/Dockerfile\.v1-api/) { print buf "\x01" }; in_block=1; buf="" }
      { buf = buf $0 "\n" }
      END { if (in_block && buf ~ /file: *deploy\/Dockerfile\.v1-api/) print buf "\x01" }
    ' "${yml}")"
    if [[ -z "${blocks}" ]]; then
      continue
    fi
    local block
    while IFS= read -r -d $'\x01' block; do
      [[ -z "${block// /}" ]] && continue
      if ! grep -qE '^ *target: ' <<< "${block}"; then
        echo "${yml}: a Dockerfile.v1-api build-push step has no target: line"
        return 1
      fi
    done <<< "${blocks}"
  done

  echo "ok"
  return 0
}

echo "== test-task168-dockerfile-target =="

if check_dockerfile_target_wiring \
  "${ROOT}/deploy/Dockerfile.v1-api" \
  "${ROOT}/.github/workflows/deploy-alpha.yml" \
  "${ROOT}/.github/workflows/deploy.yml" >/dev/null; then
  pass "real repo files pass: stage order + target: lines present"
else
  fail "real repo files failed the check: $(check_dockerfile_target_wiring "${ROOT}/deploy/Dockerfile.v1-api" "${ROOT}/.github/workflows/deploy-alpha.yml" "${ROOT}/.github/workflows/deploy.yml")"
fi

# ── Mutation 1: reorder the Dockerfile so runtime-task168-final trails runtime
mut1="${WORK}/Dockerfile.mut1"
python3 - "${ROOT}/deploy/Dockerfile.v1-api" "${mut1}" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src).read()
stages = re.split(r'(?=^FROM )', text, flags=re.M)
by_name = {}
order = []
for s in stages:
    m = re.match(r'FROM \S+ AS (\S+)', s)
    name = m.group(1) if m else '__preamble__'
    by_name[name] = s
    order.append(name)
# Move the two StageB stages to the very end (after runtime).
order = [n for n in order if n not in ('builder-task168-final', 'runtime-task168-final')]
order += ['builder-task168-final', 'runtime-task168-final']
open(dst, 'w').write(''.join(by_name[n] for n in order))
PY
if check_dockerfile_target_wiring "${mut1}" "${ROOT}/.github/workflows/deploy-alpha.yml" "${ROOT}/.github/workflows/deploy.yml" >/dev/null; then
  fail "mutation 1 (StageB stages moved after runtime) was NOT caught"
else
  pass "mutation 1 (StageB stages moved after runtime) is red"
fi

# ── Mutation 2: remove target: from both workflows' Dockerfile.v1-api steps,
# stage order left correct (isolates the target-line assertion on its own).
mut2a="${WORK}/deploy-alpha.mut2.yml"
mut2b="${WORK}/deploy.mut2.yml"
sed '/^ *target: runtime$/d' "${ROOT}/.github/workflows/deploy-alpha.yml" > "${mut2a}"
sed '/^ *target: runtime$/d' "${ROOT}/.github/workflows/deploy.yml" > "${mut2b}"
if check_dockerfile_target_wiring "${ROOT}/deploy/Dockerfile.v1-api" "${mut2a}" "${mut2b}" >/dev/null; then
  fail "mutation 2 (target: runtime removed from both workflows) was NOT caught"
else
  pass "mutation 2 (target: runtime removed from both workflows) is red"
fi

# ── Mutation 3: both at once (the spec's most adversarial combination) ─────
if check_dockerfile_target_wiring "${mut1}" "${mut2a}" "${mut2b}" >/dev/null; then
  fail "mutation 3 (reorder + target removed together) was NOT caught"
else
  pass "mutation 3 (reorder + target removed together) is red"
fi

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
