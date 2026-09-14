#!/usr/bin/env bash

# Contract test for scripts/release/read-task168-stage-a-predecessor.sh — the
# StageB dispatch step's only path to the StageA transition receipt. Runs the
# REAL script (the same bytes deploy-alpha.yml ships over SSM) against a fake
# docker on PATH.
#
# Two defects this pins, both found by running the script on the live Alpha
# host, where it had never been exercised before:
#   1. it connected as a hardcoded default role instead of the database the
#      container actually serves, so every StageB dispatch died here;
#   2. it reached the container through `docker compose`, which resolves the
#      whole model — and the alpha compose files require image variables that
#      only deploy-alpha.sh exports, so any compose call fails in this
#      standalone SSM shell.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${ROOT}/scripts/release/read-task168-stage-a-predecessor.sh"
SHA="72405a2d5486d64da2855daa56339cbaf09610c3"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

echo "== test-task168-predecessor-read =="

# $1 = case name, $2 = container ids the label filter reports (newline-separated,
# may be empty), $3 = the container's POSTGRES_USER, $4 = its POSTGRES_DB,
# $5 = "receipt" to write a StageA transition receipt (anything else: none).
# Echoes the exit code; leaves stdout/stderr/calls.log under ${WORK}/$1.
run_case() {
  local name="$1" ids="$2" pg_user="$3" pg_db="$4" want_receipt="$5"
  local root="${WORK}/${name}" log
  mkdir -p "${root}/bin"
  log="${root}/calls.log"
  : > "${log}"

  if [[ "${want_receipt}" == "receipt" ]]; then
    mkdir -p "${root}/state/task168/${SHA}"
    printf '%s\n' '{"apiImage":"registry.example/v1-api@sha256:'"$(printf 'a%.0s' {1..64})"'"}' \
      > "${root}/state/task168/${SHA}/transition.json"
  fi

  cat > "${root}/bin/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$1" in
  compose) echo 'compose must not be used from the standalone SSM shell' >&2; exit 1 ;;
  ps) printf '%s' '${ids}' ;;
  inspect) printf 'PATH=/usr/local/bin\nPOSTGRES_USER=${pg_user}\nPOSTGRES_DB=${pg_db}\nLANG=en_US.utf8\n' ;;
  exec)
    # Real \`docker exec\` reads the caller's stdin only with -i. A fake that
    # always drained it would hide the bug this models: the script is piped
    # into \`bash -s\`, so a child that holds stdin swallows the rest of it.
    case " \$* " in *" -i "*) cat >/dev/null ;; esac
    case " \$* " in
      *current_database*) echo 'teameet_alpha|teameet_alpha|local|local' ;;
      *_prisma_migrations*) : ;;
    esac
    ;;
esac
exit 0
EOF
  chmod +x "${root}/bin/docker"

  local rc=0
  # Piped into `bash -s --`, exactly as deploy-alpha.yml invokes it.
  PATH="${root}/bin:${PATH}" ALPHA_RELEASE_STATE_DIR="${root}/state" \
    bash -s -- "${SHA}" < "${TARGET}" \
    > "${root}/stdout" 2> "${root}/stderr" || rc=$?
  echo "${rc}"
}

# ── Happy path ────────────────────────────────────────────────────────────
rc="$(run_case happy "abc123def456" teameet_alpha teameet_alpha receipt)"
happy="${WORK}/happy"
if [[ "${rc}" -eq 0 ]]; then
  pass "the script completes against a normal container"
else
  fail "rc=${rc}: $(cat "${happy}/stderr")"
fi

jq -e '(.path | endswith("transition.json")) and (.sha256 | test("^[0-9a-f]{64}$"))
  and (.apiImage | length > 0) and .databaseIdentity == "teameet_alpha|teameet_alpha|local|local"
  and (.resolvedMigrationAttemptsSha256 | test("^[0-9a-f]{64}$"))' \
  "${happy}/stdout" >/dev/null \
  && pass "all five contract fields are emitted and well-formed" \
  || fail "output does not satisfy the field contract: $(cat "${happy}/stdout")"

# The actual regression: the connection must name the role the container
# serves, never a compiled-in default.
grep -q -- "-U teameet_alpha -d teameet_alpha" "${happy}/calls.log" \
  && pass "psql connects as the container's own POSTGRES_USER/POSTGRES_DB" \
  || fail "psql did not use the container's role: $(grep exec "${happy}/calls.log" | head -2)"
grep -q -- "-U teameet_v1\|-d teameet_v1" "${happy}/calls.log" \
  && fail "a hardcoded teameet_v1 default is still reachable" \
  || pass "no hardcoded database-name default survives"

grep -q "^docker compose" "${happy}/calls.log" \
  && fail "the script called docker compose, which cannot resolve in this shell" \
  || pass "the container is addressed without docker compose"

# Both queries ran: the second would be missing if a child had eaten the
# script's own stdin.
[[ "$(grep -c "^docker exec" "${happy}/calls.log")" == 2 ]] \
  && pass "both psql queries run — stdin is not consumed by the exec child" \
  || fail "expected 2 docker exec calls, got $(grep -c "^docker exec" "${happy}/calls.log")"

# ── Fail-closed cases ─────────────────────────────────────────────────────
rc="$(run_case no-container "" teameet_alpha teameet_alpha receipt)"
[[ "${rc}" -ne 0 ]] && pass "no running database container is refused (rc=${rc})" \
  || fail "a missing database container was accepted"

rc="$(run_case two-containers "$(printf 'abc123\ndef456')" teameet_alpha teameet_alpha receipt)"
[[ "${rc}" -ne 0 ]] && pass "two candidate containers are refused (rc=${rc})" \
  || fail "an ambiguous container set was accepted"

rc="$(run_case bad-role "abc123def456" "" teameet_alpha receipt)"
[[ "${rc}" -ne 0 ]] && pass "a container exposing no POSTGRES_USER is refused (rc=${rc})" \
  || fail "an empty POSTGRES_USER was accepted"

rc="$(run_case injectable-role "abc123def456" 'teameet_alpha; DROP' teameet_alpha receipt)"
[[ "${rc}" -ne 0 ]] && pass "a malformed POSTGRES_USER is refused (rc=${rc})" \
  || fail "a malformed POSTGRES_USER was accepted"

rc="$(run_case no-receipt "abc123def456" teameet_alpha teameet_alpha none)"
[[ "${rc}" -ne 0 ]] && pass "a missing StageA transition receipt is refused (rc=${rc})" \
  || fail "a missing transition receipt was accepted"

bad_sha_rc=0
PATH="${happy}/bin:${PATH}" ALPHA_RELEASE_STATE_DIR="${happy}/state" \
  bash -s -- "not-a-sha" < "${TARGET}" >/dev/null 2>&1 || bad_sha_rc=$?
[[ "${bad_sha_rc}" -ne 0 ]] && pass "a non-SHA argument is refused (rc=${bad_sha_rc})" \
  || fail "a non-SHA predecessor argument was accepted"

# ── Wiring: deploy-alpha.yml must still ship THIS file ────────────────────
grep -q "base64 < scripts/release/read-task168-stage-a-predecessor.sh" \
  "${ROOT}/.github/workflows/deploy-alpha.yml" \
  && pass "deploy-alpha.yml still ships this script's own bytes" \
  || fail "deploy-alpha.yml no longer base64-ships this script"

echo "== ${PASS} passed, ${FAIL} failed =="
[[ "${FAIL}" -eq 0 ]]
