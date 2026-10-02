#!/usr/bin/env bash

set -Eeuo pipefail
for name in RELEASE_SHA DEPLOY_BUCKET EXPECTED_BUCKET_OWNER INSTANCE_ID; do
  [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
done

parameters="$(jq -nc '{commands:["set -Eeuo pipefail","state=/home/ec2-user/.teameet-alpha-releases/state.json; legacy=/home/ec2-user/.teameet-alpha-release; canonical=none; migration=none; if [[ -f \"${state}\" ]]; then canonical=$(jq -er .active.release.sha \"${state}\"); migration=${canonical}; elif [[ -f \"${legacy}\" ]]; then migration=$(awk -F= '\''$1 == \"sha\" { print $2 }'\'' \"${legacy}\"); fi; printf '\''canonical=%s\\nmigration=%s\\n'\'' \"${canonical}\" \"${migration}\""]}')"
command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Read Teameet alpha release state" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
state_output=''
for attempt in $(seq 1 30); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      state_output="$(aws ssm get-command-invocation --command-id "${command_id}" \
        --instance-id "${INSTANCE_ID}" --query StandardOutputContent --output text)"
      break
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo "Unable to read canonical alpha release state" >&2
      exit 1
      ;;
  esac
  sleep 2
done
previous_sha="$(awk -F= '$1 == "canonical" { print $2 }' <<< "${state_output}" | tr -d '[:space:]')"
migration_base_sha="$(awk -F= '$1 == "migration" { print $2 }' <<< "${state_output}" | tr -d '[:space:]')"
[[ "${previous_sha}" == none || "${previous_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Canonical alpha release state is missing or malformed" >&2
  exit 1
}
[[ "${migration_base_sha}" == none || "${migration_base_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Alpha migration base is missing or malformed" >&2
  exit 1
}

# Task 168 M11 converged: rollbackCompatibleWith is final<->final only
# (item 8) — the creator needs to know whether the previous active release
# was itself the final policy before it may bind the new manifest's
# rollbackCompatibleWith to it. A StageA (or missing) previous release
# leaves previous_stage=none, which create-alpha-release-manifest.sh treats
# as "do not bind".
previous_stage=none
if [[ "${previous_sha}" != none ]]; then
  previous_manifest="$(mktemp)"
  aws s3api get-object --bucket "${DEPLOY_BUCKET}" --key "manifests/${previous_sha}.json" \
    --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" "${previous_manifest}" >/dev/null
  previous_stage="$(jq -r '.database.task168.stage // "none"' "${previous_manifest}")"
  rm -f "${previous_manifest}"
fi
if [[ "${migration_base_sha}" != none ]]; then
  public_sha="$(curl -fsSI https://alpha.teameet.co.kr/landing |
    awk -F': ' 'tolower($1) == "x-teameet-commit" { gsub("\r", "", $2); print $2 }')"
  [[ "${public_sha}" == "${migration_base_sha}" ]] || {
    echo "Migration base and public alpha release SHAs differ" >&2
    exit 1
  }
  if [[ "${migration_base_sha}" != "${RELEASE_SHA}" ]]; then
    bash scripts/qa/check-expand-contract-migrations.sh "${migration_base_sha}" "${RELEASE_SHA}"
  fi
fi
echo "previousSha=${previous_sha}" >> "${GITHUB_OUTPUT}"
echo "migrationBaseSha=${migration_base_sha}" >> "${GITHUB_OUTPUT}"
echo "previousStage=${previous_stage}" >> "${GITHUB_OUTPUT}"
