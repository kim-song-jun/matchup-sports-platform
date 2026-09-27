#!/usr/bin/env bash
# deploy/deploy-prod.sh must not write the nginx release-metadata include for
# a Stage A run: Stage A is never promoted, so an nginx restart before Stage B
# would publish the unpromoted SHA and resolve-prod-rollback-base.sh would
# refuse the Stage B build ("public SHA mismatch"). Stage B and ordinary
# deploys still write it.
#
# Extracts from `pull_release_images` through the line before the local
# v1_postgres branch by content anchor and runs it with the two helpers faked.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

start_line="$(grep -n '^pull_release_images$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
end_line="$(grep -n '^if \[\[ "\${V1_DB_HOST:-v1_postgres}" == "v1_postgres" \]\]; then$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
[[ -n "${start_line}" && -n "${end_line}" && "${start_line}" -lt "${end_line}" ]] || {
  echo "extract: could not find both anchor lines in deploy-prod.sh" >&2
  exit 1
}
sed -n "${start_line},$((end_line - 1))p" "${DEPLOY_PROD}" > "${TEST_ROOT}/segment.sh"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# run_case STAGE NAME -> sets CASE_RC, CASE_EVENTS
run_case() {
  local stage="$1" dir="${TEST_ROOT}/$2"
  mkdir -p "${dir}"
  local events="${dir}/events.log"
  : > "${events}"
  {
    printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
    printf 'task168_stage=%q\nhad_active=true\n' "${stage}"
    printf 'PROD_MANIFEST_FILE=%q\n' "${dir}/manifest.json"
    printf 'pull_release_images() { echo PULL >> %q; }\n' "${events}"
    printf 'write_release_metadata() { echo "METADATA:$1" >> %q; }\n' "${events}"
    cat "${TEST_ROOT}/segment.sh"
    printf 'echo SEGMENT_COMPLETED >> %q\n' "${events}"
  } > "${dir}/wrapper.sh"
  bash "${dir}/wrapper.sh" > "${dir}/out.log" 2>&1 && CASE_RC=0 || CASE_RC=$?
  CASE_EVENTS="$(cat "${events}")"
}

run_case stageA stage-a
if [[ "${CASE_RC}" -eq 0 && "${CASE_EVENTS}" == *SEGMENT_COMPLETED* && "${CASE_EVENTS}" != *METADATA:* ]]; then
  ok "stageA: release metadata is not written"
else
  bad "stageA: expected no metadata write, rc=${CASE_RC} events=${CASE_EVENTS}"
fi

for stage in stageB ''; do
  run_case "${stage}" "stage-${stage:-none}"
  if [[ "${CASE_RC}" -eq 0 && "${CASE_EVENTS}" == *"METADATA:${TEST_ROOT}/stage-${stage:-none}/manifest.json"* ]]; then
    ok "${stage:-ordinary deploy}: release metadata is written for the candidate manifest"
  else
    bad "${stage:-ordinary deploy}: expected a metadata write, rc=${CASE_RC} events=${CASE_EVENTS}"
  fi
done

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-deploy-prod-stage-a-metadata] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-deploy-prod-stage-a-metadata] passed"
