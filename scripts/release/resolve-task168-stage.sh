#!/usr/bin/env bash

# Task 175 T5 fix round 1 (Important 1): extracted from deploy.yml's
# "Resolve Task168 stage" step so its newline/control-character injection
# guard can be unit tested in isolation. GITHUB_OUTPUT is an append-only
# key=value file that GitHub Actions parses line by line, and a later
# line for the same key wins over an earlier one. Writing an unsanitized
# workflow_dispatch string straight into it means a value containing
# `\nstage=stageA` (or any other key) forges a subsequent line that
# silently overrides the `stage=` this step already committed to, or
# truncates the `evidence=` line's own content -- so the format check
# below runs BEFORE anything is written, not after.
#
# Inputs (env): GITHUB_EVENT_NAME (GitHub Actions default), STAGE_INPUT,
# EVIDENCE_INPUT, GITHUB_OUTPUT (path).

set -Eeuo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

stage="${STAGE_INPUT:-none}"
if [[ "${GITHUB_EVENT_NAME:-}" != workflow_dispatch ]]; then
  stage="none"
fi
case "${stage}" in
  none|stageA|stageB) ;;
  *)
    echo "Unknown task168_stage: '${stage}'" >&2
    exit 1
    ;;
esac

evidence="${EVIDENCE_INPUT:-}"
# Printable characters only, no newline/control characters, length capped --
# this is the injection guard described above. Empty is allowed here; the
# "required for stageA/stageB" check below is its own separately
# diagnosable error.
#
# Length is checked SEPARATELY from the character-class regex, not as a
# `{1,500}` bound inside it -- glibc's regex engine caps repetition counts
# at RE_DUP_MAX (255) and rejects anything higher as an invalid pattern
# (verified: bash's `[[ =~ ]]` then just reports no match, silently, under
# `set -e`, without exiting the script). A `{1,500}` bound would therefore
# have made this always reject every non-empty evidence value in
# production, on any standard glibc host -- the exact opposite of what a
# format check should do.
if [[ -n "${evidence}" ]]; then
  if (( ${#evidence} > 500 )); then
    echo "task168_rehearsal_evidence must be at most 500 characters" >&2
    exit 1
  fi
  if ! [[ "${evidence}" =~ ^[[:print:]]+$ ]]; then
    echo "task168_rehearsal_evidence must contain only printable characters (no newlines or control characters)" >&2
    exit 1
  fi
fi
if [[ "${stage}" != none && -z "${evidence}" ]]; then
  echo "task168_rehearsal_evidence is required for ${stage}" >&2
  exit 1
fi

echo "stage=${stage}" >> "${GITHUB_OUTPUT}"
echo "evidence=${evidence}" >> "${GITHUB_OUTPUT}"
