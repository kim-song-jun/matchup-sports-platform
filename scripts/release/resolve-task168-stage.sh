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

# Fix round 2 (Important 1): fixed, not inherited from the caller's
# environment. [[:cntrl:]]/[[:print:]] classification and `${#var}`
# length are locale-dependent -- under a UTF-8 locale a Korean character
# is one printable "character", but under LC_ALL=C (reviewer-reproduced:
# `LC_ALL=C bash scripts/qa/test-resolve-task168-stage.sh`) the C locale's
# ctype tables only know 7-bit ASCII, so [[:print:]] rejected every valid
# multi-byte UTF-8 string outright -- including ordinary Korean evidence
# text. Pinning LC_ALL=C here (rather than trusting whatever locale the
# calling shell happens to have) makes the check byte-oriented and
# reproducible everywhere: under C, [[:cntrl:]] matches exactly bytes
# 0x00-0x1F and 0x7F (NUL..US, DEL -- covers LF/CR/TAB) and nothing else,
# so a UTF-8 lead/continuation byte (0x80-0xFF, i.e. any multi-byte
# character) is correctly left alone.
export LC_ALL=C

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
# No control characters (rejects the injection: LF, CR, TAB, and every
# other 0x00-0x1F/0x7F byte), length capped -- this is the injection guard
# described above. Empty is allowed here; the "required for stageA/stageB"
# check below is its own separately diagnosable error.
#
# Length is checked via `${#evidence}` SEPARATELY from the character-class
# regex, not as a `{1,N}` bound inside it -- glibc's regex engine caps
# repetition counts at RE_DUP_MAX (255) and rejects anything higher as an
# invalid pattern (verified: bash's `[[ =~ ]]` then just reports no match,
# silently, under `set -e`, without exiting the script). A `{1,500}` bound
# would therefore have made this always reject every non-empty evidence
# value in production, on any standard glibc host -- the exact opposite of
# what a format check should do.
#
# With LC_ALL=C (above), `${#evidence}` counts BYTES, not characters --
# the cap is sized accordingly (1500 bytes, not 1500 characters; Korean
# text runs ~3 bytes/character in UTF-8, so this still allows ~500 Korean
# characters, matching the original character-oriented intent).
if [[ -n "${evidence}" ]]; then
  if (( ${#evidence} > 1500 )); then
    echo "task168_rehearsal_evidence must be at most 1500 bytes" >&2
    exit 1
  fi
  if [[ "${evidence}" =~ [[:cntrl:]] ]]; then
    echo "task168_rehearsal_evidence must not contain control characters (newline, CR, tab, etc.)" >&2
    exit 1
  fi
fi
if [[ "${stage}" != none && -z "${evidence}" ]]; then
  echo "task168_rehearsal_evidence is required for ${stage}" >&2
  exit 1
fi

echo "stage=${stage}" >> "${GITHUB_OUTPUT}"
echo "evidence=${evidence}" >> "${GITHUB_OUTPUT}"
