#!/usr/bin/env bash

set -Eeuo pipefail

: "${TASK168_STAGE:?TASK168_STAGE is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${DEPLOY_BUCKET:?DEPLOY_BUCKET is required}"
: "${EXPECTED_BUCKET_OWNER:?EXPECTED_BUCKET_OWNER is required}"
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${REGISTRY:?REGISTRY is required}"
: "${AWS_REGION:?AWS_REGION is required}"

[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]
[[ "${EXPECTED_BUCKET_OWNER}" =~ ^[0-9]{12}$ ]]
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${DEPLOY_BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]
[[ "${REGISTRY}" == "${EXPECTED_BUCKET_OWNER}.dkr.ecr.${AWS_REGION}.amazonaws.com" ]]

# StageA send-command timeout (25 min, unchanged) vs StageB (executionTimeout,
# no assumed default — U11). Both are AWS-RunShellScript document parameters,
# not aws-cli client flags: RunShellScript's own executionTimeout governs how
# long the SSM agent lets the remote command run before it kills the process
# tree, which is the thing that actually needs to outlive a StageB migration.
declare -a extra_document_params=()
poll_attempts=150   # 150 * 10s = 25 minutes — StageA, unchanged.
# StageA's comment stays byte-identical to origin/dev ("Teameet alpha
# <version> <sha>"); TASK168_STAGE was not an option there because
# stageBRecover never requires RELEASE_VERSION.
comment="Teameet alpha ${TASK168_STAGE} ${RELEASE_SHA}"

case "${TASK168_STAGE}" in
  stageAIntermediate)
    for name in RELEASE_VERSION SOURCE_VERSION_ID SOURCE_SHA256 MANIFEST_VERSION_ID MANIFEST_SHA256; do
      [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
    done
    [[ "${RELEASE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]{8}\.g[0-9a-f]{12}$ ]]
    [[ "${SOURCE_SHA256}" =~ ^[0-9a-f]{64}$ ]]
    [[ "${MANIFEST_SHA256}" =~ ^[0-9a-f]{64}$ ]]
    # {1,1024} bound, byte-identical to origin/dev. macOS's regcomp rejects
    # a {1,1024} bound ("maximum repetition exceeds 255"); this is validation
    # width, not a real S3 version-id constraint (S3 version ids run ~32
    # chars). Verify this script on Linux, not macOS system bash.
    [[ "${SOURCE_VERSION_ID}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
    [[ "${MANIFEST_VERSION_ID}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
    comment="Teameet alpha ${RELEASE_VERSION} ${RELEASE_SHA}"

    stage="/home/ec2-user/.teameet-alpha-staging/${RELEASE_SHA}"
    archive="/tmp/teameet-alpha-${RELEASE_SHA}.tar.gz"
    manifest="/tmp/teameet-alpha-${RELEASE_SHA}.json"
    parameters="$(jq -nc \
      --arg strict "set -Eeuo pipefail" \
      --arg cleanup "trap 'status=\$?; rm -f '${archive}' '${manifest}'; rm -rf '${stage}'; exit \${status}' EXIT" \
      --arg prepare "install -d -o ec2-user -g ec2-user '${stage}'" \
      --arg source "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'releases/${RELEASE_SHA}.tar.gz' --version-id '${SOURCE_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${archive}' >/dev/null" \
      --arg source_check "echo '${SOURCE_SHA256}  ${archive}' | sha256sum -c -" \
      --arg manifest_get "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'manifests/${RELEASE_SHA}.json' --version-id '${MANIFEST_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${manifest}' >/dev/null" \
      --arg manifest_check "echo '${MANIFEST_SHA256}  ${manifest}' | sha256sum -c -" \
      --arg extract "tar -xzf '${archive}' -C '${stage}' && chown -R ec2-user:ec2-user '${stage}' '${manifest}'" \
      --arg deploy "sudo -u ec2-user -H env ALPHA_SOURCE_DIR='${stage}' ALPHA_MANIFEST_FILE='${manifest}' ALPHA_MANIFEST_SHA256='${MANIFEST_SHA256}' ALPHA_SHA='${RELEASE_SHA}' ALPHA_RELEASE_VERSION='${RELEASE_VERSION}' ALPHA_ECR_REGISTRY='${REGISTRY}' ALPHA_AWS_REGION='${AWS_REGION}' ALPHA_SOURCE_BUCKET='${DEPLOY_BUCKET}' ALPHA_SOURCE_VERSION_ID='${SOURCE_VERSION_ID}' ALPHA_SOURCE_SHA256='${SOURCE_SHA256}' bash '${stage}/deploy/deploy-alpha.sh'" \
      '{commands:[$strict,$cleanup,$prepare,$source,$source_check,$manifest_get,$manifest_check,$extract,$deploy]}')"
    ;;

  stageBPreflight|stageBFinal|stageBRecover)
    : "${TASK168_STAGE_B_TIMEOUT_SECONDS:?TASK168_STAGE_B_TIMEOUT_SECONDS is required for ${TASK168_STAGE} (U11 has no assumed default)}"
    [[ "${TASK168_STAGE_B_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]*$ ]]
    extra_document_params=(--arg executionTimeout "${TASK168_STAGE_B_TIMEOUT_SECONDS}")
    # Poll comfortably past executionTimeout — 6 attempts/min plus a fixed
    # 10-minute buffer, mirroring the step-level `executionTimeout + 10m` rule
    # in deploy-alpha.yml so the two never disagree about who times out first.
    poll_attempts=$(( (TASK168_STAGE_B_TIMEOUT_SECONDS + 9) / 10 + 60 ))

    if [[ "${TASK168_STAGE}" == stageBRecover ]]; then
      # No new source/manifest: recovery only inspects and repairs already-staged
      # host state, off the currently-active release's own copy of the wrapper
      # script (docs/ops/task168-stage-b-runbook.md).
      parameters="$(jq -nc \
        --arg strict "set -Eeuo pipefail" \
        --arg recover "sudo -u ec2-user -H env ALPHA_SHA='${RELEASE_SHA}' TASK168_STAGE=stageBRecover bash /home/ec2-user/teameet/deploy/deploy-alpha-stage-b.sh" \
        '{commands:[$strict,$recover]}')"
    else
      for name in RELEASE_VERSION STAGE_B_SOURCE_VERSION_ID STAGE_B_SOURCE_SHA256 STAGE_B_MANIFEST_VERSION_ID STAGE_B_MANIFEST_SHA256; do
        [[ -n "${!name:-}" ]] || { echo "${name} is required for ${TASK168_STAGE}" >&2; exit 1; }
      done
      [[ "${RELEASE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]{8}\.g[0-9a-f]{12}$ ]]
      [[ "${STAGE_B_SOURCE_SHA256}" =~ ^[0-9a-f]{64}$ ]]
      [[ "${STAGE_B_MANIFEST_SHA256}" =~ ^[0-9a-f]{64}$ ]]
      # {1,1024}, same width as the StageA checks above and origin/dev.
      [[ "${STAGE_B_SOURCE_VERSION_ID}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
      [[ "${STAGE_B_MANIFEST_VERSION_ID}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
      comment="Teameet alpha ${RELEASE_VERSION} ${RELEASE_SHA}"

      # Own staging directory (task168-stage-b/<sha>), never StageA's — the two
      # can be dispatched for the same SHA without colliding (D-2).
      stage="/home/ec2-user/.teameet-alpha-staging/task168-stage-b/${RELEASE_SHA}"
      archive="/tmp/teameet-alpha-task168-stage-b-${RELEASE_SHA}.tar.gz"
      manifest="/tmp/teameet-alpha-task168-stage-b-${RELEASE_SHA}.json"
      parameters="$(jq -nc \
        --arg strict "set -Eeuo pipefail" \
        --arg cleanup "trap 'status=\$?; rm -f '${archive}' '${manifest}'; rm -rf '${stage}'; exit \${status}' EXIT" \
        --arg prepare "install -d -o ec2-user -g ec2-user '${stage}'" \
        --arg source "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'releases/task168-stage-b/${RELEASE_SHA}.tar.gz' --version-id '${STAGE_B_SOURCE_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${archive}' >/dev/null" \
        --arg source_check "echo '${STAGE_B_SOURCE_SHA256}  ${archive}' | sha256sum -c -" \
        --arg manifest_get "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'manifests/task168-stage-b/${RELEASE_SHA}.json' --version-id '${STAGE_B_MANIFEST_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${manifest}' >/dev/null" \
        --arg manifest_check "echo '${STAGE_B_MANIFEST_SHA256}  ${manifest}' | sha256sum -c -" \
        --arg extract "tar -xzf '${archive}' -C '${stage}' && chown -R ec2-user:ec2-user '${stage}' '${manifest}'" \
        --arg deploy "sudo -u ec2-user -H env ALPHA_SOURCE_DIR='${stage}' ALPHA_MANIFEST_FILE='${manifest}' ALPHA_MANIFEST_SHA256='${STAGE_B_MANIFEST_SHA256}' ALPHA_SHA='${RELEASE_SHA}' ALPHA_RELEASE_VERSION='${RELEASE_VERSION}' ALPHA_ECR_REGISTRY='${REGISTRY}' ALPHA_AWS_REGION='${AWS_REGION}' ALPHA_SOURCE_BUCKET='${DEPLOY_BUCKET}' ALPHA_SOURCE_VERSION_ID='${STAGE_B_SOURCE_VERSION_ID}' ALPHA_SOURCE_SHA256='${STAGE_B_SOURCE_SHA256}' TASK168_STAGE='${TASK168_STAGE}' bash '${stage}/deploy/deploy-alpha-stage-b.sh'" \
        '{commands:[$strict,$cleanup,$prepare,$source,$source_check,$manifest_get,$manifest_check,$extract,$deploy]}')"
    fi
    ;;

  *)
    echo "Unknown TASK168_STAGE: '${TASK168_STAGE}'" >&2
    exit 1
    ;;
esac

if ((${#extra_document_params[@]})); then
  parameters="$(jq -c "${extra_document_params[@]}" '. + {executionTimeout: [$executionTimeout]}' <<< "${parameters}")"
fi

command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "${comment}" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
for attempt in $(seq 1 "${poll_attempts}"); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query StandardOutputContent --output text
      echo "[deploy-alpha-via-ssm] result=SUCCEEDED" >&2
      exit 0
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json
      # RunShellScript's own executionTimeout, when it fires, is the SSM agent
      # killing the remote process tree — a terminal non-Success status here is
      # trusted as the host process having actually exited, not just SSM giving
      # up on watching it (that distinction is exactly what TimedOut means for
      # this document type, per AWS's own semantics for the parameter).
      echo "[deploy-alpha-via-ssm] result=FAILED_HOST_EXITED status=${status}" >&2
      exit 1
      ;;
  esac
  sleep 10
done
# The SSM invocation never reached a terminal status inside our own poll
# budget (which is set to exceed executionTimeout). This is deliberately
# NOT reported as a failure — for stageBFinal in particular, that would
# invite an operator to re-dispatch or restore over a host that may still be
# mid-migration. stageBRecover's own read-only entry-condition checks
# (docs/ops/task168-stage-b-runbook.md) are the correct next step, not this
# script.
echo "[deploy-alpha-via-ssm] result=UNKNOWN_HOST_MAY_BE_RUNNING — host may still be running; do not re-dispatch or restore, run task168_stage=stageBRecover to diagnose" >&2
exit 1
