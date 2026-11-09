#!/usr/bin/env bash
# Runtime epoch 3 understands stagePlan, per-stage rosters and independent pool standings.
# A SQL widening alone does not make an earlier application's readers/writers safe.
readonly ALPHA_TOURNAMENT_RUNTIME_VERSION=3

alpha_tournament_runtime_at_commit() {
  local ref="$1" source
  git cat-file -e "${ref}^{commit}" 2>/dev/null || { echo "Unknown release commit: ${ref}" >&2; return 1; }
  if ! git cat-file -e "${ref}:deploy/alpha-tournament-runtime.sh" 2>/dev/null; then
    printf '0\n'; return
  fi
  source="$(git show "${ref}:deploy/alpha-tournament-runtime.sh")" || return 1
  if [[ "$source" =~ (^|$'\n')readonly\ ALPHA_TOURNAMENT_RUNTIME_VERSION=([0-9]+)($|$'\n') ]]; then
    printf '%s\n' "${BASH_REMATCH[2]}"
  else
    echo "Unrecognized tournament runtime version in ${ref}" >&2; return 1
  fi
}

alpha_tournament_rollback_target() {
  local previous_sha="$1" previous_stage="$2" version
  [[ "$previous_stage" == final && "$previous_sha" != none ]] || return 0
  version="$(alpha_tournament_runtime_at_commit "$previous_sha")" || return 1
  # Only an explicitly matching runtime is compatible. Missing historical metadata
  # must not grant a downgrade, including before the first named-final write.
  if [[ "$version" == "$ALPHA_TOURNAMENT_RUNTIME_VERSION" ]]; then printf '%s\n' "$previous_sha"; fi
}

assert_alpha_tournament_rollback_runtime() {
  local active="$1" previous="$2"
  jq -e --argjson runtime "$ALPHA_TOURNAMENT_RUNTIME_VERSION" '
    .database.tournamentRuntimeVersion == $runtime
  ' "$active" >/dev/null && jq -e --argjson runtime "$ALPHA_TOURNAMENT_RUNTIME_VERSION" '
    .database.tournamentRuntimeVersion == $runtime
  ' "$previous" >/dev/null || {
    echo '[alpha-rollback] Tournament runtime is incompatible or unproven; use a compatible forward fix or the reviewed backup/restore procedure.' >&2
    return 1
  }
}
