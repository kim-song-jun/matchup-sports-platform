#!/usr/bin/env bash
# Private-key (.p8 / service-account PEM) handling shared by the runtime-env sync scripts.
#
# A key reaches CI in whichever shape the person storing it chose, and all of these are
# reasonable: the PEM pasted as-is, the same thing already flattened to one line with literal
# backslash-n, or the file base64-encoded — which is what a lot of "how to put a .p8 in CI"
# advice tells people to do. Rejecting the last two would be rejecting a correct key.
#
# Accepted only if OpenSSL can actually read it as a private key. Looking for a BEGIN marker
# is not enough: a secret truncated on paste, or a base64 value that decoded partially, still
# contains the BEGIN line, passes a substring check, gets written to the host, and then fails
# at the first send as a 403 that names nothing — the worst place to discover it.
#
# Measured: the first version of the alpha script accepted only a raw PEM and failed the
# deploy with "does not look like a .p8 PEM" on a key that was in fact fine.
#
# Source this file; do not execute it.

is_private_key() {
  printf '%s' "$1" | openssl pkey -noout >/dev/null 2>&1
}

# Prints the key as a real multi-line PEM, whatever shape it arrived in. Returns 1 when no
# shape parses — the caller decides whether that fails the deploy or only skips the key.
normalize_private_key() {
  local raw="$1" candidate
  # A PEM as stored, either with real newlines or flattened to literal backslash-n.
  if is_private_key "${raw}"; then printf '%s' "${raw}"; return 0; fi
  # The newline is built first. Inside a ${var//pattern/replacement} the $'...' form is not
  # ANSI-C quoting — it is inserted verbatim, so the key ends up containing the four
  # characters $'\n' and stops parsing. Caught by the parse check; a marker check would have
  # accepted it.
  # A plain assignment, not command substitution: $( ) strips trailing newlines, so
  # newline="$(printf '\n')" silently yields the empty string and the replacement deletes
  # the separators instead of restoring them.
  local newline=$'\n'
  candidate="${raw//\\n/${newline}}"
  if is_private_key "${candidate}"; then printf '%s' "${candidate}"; return 0; fi
  # base64 of a PEM. `base64 -d` is lenient about wrapping; a value that is not base64 at all
  # fails here and falls through.
  candidate="$(printf '%s' "${raw}" | tr -d '[:space:]' | base64 -d 2>/dev/null || true)"
  if is_private_key "${candidate}"; then printf '%s' "${candidate}"; return 0; fi
  return 1
}

# One line, literal backslash-n — the only shape that survives a KEY=VALUE .env file. A key
# written with real newlines truncates the assignment (every following PEM line becomes a
# junk key), and the failure then surfaces much later as an unhelpful signing error. Both
# consumers turn the literal back into newlines (`ApnsProviderToken`, the Firebase adapter).
private_key_one_line() {
  printf '%s' "$1" | awk 'BEGIN{ORS="\\n"} {print}'
}
