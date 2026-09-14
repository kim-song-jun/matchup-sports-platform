#!/usr/bin/env bash
# Real test for assert_task168_m11_guard() (deploy/prod-release-common.sh)
# and its call-site position in deploy/deploy-prod.sh. Sources the common
# file directly (same convention as scripts/qa/test-prod-release-state.sh)
# and calls the function against a fake `sudo`/`docker`, so no real prod
# host, network, or database is needed.
#
# Scenarios (spec item 10, prod guard (i)(ii)(iii)):
#   (i)   M11 folder present in the candidate source + prod ledger does NOT
#         show M11 as an applied row -> guard fails (rc != 0), no
#         `prisma migrate deploy` may run.
#   (ii)  M11 folder present + prod ledger already shows M11 applied with
#         the pinned checksum -> guard passes (rc == 0).
#   (iii) M11 folder absent from the candidate source (today's main) ->
#         guard is a no-op and passes without touching docker/psql at all.
#
# Expected red counts per mutation, measured at the bottom of this file:
#   - Guard deleted from deploy-prod.sh entirely: (i) turns red (the
#     migrate-deploy line becomes reachable with no guard ahead of it).
#   - Guard's pass/fail verdict inverted (accepts a mismatch, rejects a
#     match): (ii) and (iii) turn red -- 2/2.
#   - Guard call moved to after the `prisma migrate deploy` line: (i) turns
#     red (a static ordering check, since (i)'s harm is exactly that
#     ordering: touching prod's DB before validating it should be safe to).
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly M11_SOURCE="${ROOT_DIR}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
[[ -s "${M11_SOURCE}" ]] || { echo "fixture setup: M11 migration.sql is missing" >&2; exit 1; }
[[ "$(sha256sum "${M11_SOURCE}" | awk '{print $1}')" == "${M11_SHA}" ]] || {
  echo "fixture setup: M11 migration.sql does not match the pinned checksum" >&2
  exit 1
}

mock_bin="${TEST_ROOT}/mockbin"
mkdir -p "${mock_bin}"
printf '#!/usr/bin/env bash\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"

# DOCKER_DATABASE_URL / DOCKER_NETWORK_OK / DOCKER_LEDGER_CHECKSUM are read by
# the fake `docker` at call time (exported per-scenario below).
cat > "${mock_bin}/docker" <<'DOCKEREOF'
#!/usr/bin/env bash
set -Eeuo pipefail
case "$*" in
  *'compose --project-name deploy'*'run --rm --no-deps -T v1_api sh -c'*)
    printf '%s' "${DOCKER_DATABASE_URL:?}"
    ;;
  *'network ls --filter name=^deploy_default$ --format {{.Name}}'*)
    [[ "${DOCKER_NETWORK_OK:?}" == true ]] && printf 'deploy_default\n'
    ;;
  *'run --rm --network deploy_default postgres:16-alpine psql'*)
    printf '%s' "${DOCKER_LEDGER_CHECKSUM:-}"
    ;;
  *)
    echo "fake docker: unrecognized invocation: $*" >&2
    exit 1
    ;;
esac
DOCKEREOF
chmod +x "${mock_bin}/docker"
export PATH="${mock_bin}:${PATH}"

source "${ROOT_DIR}/deploy/prod-release-common.sh"
# shellcheck disable=SC2034  # read by assert_task168_m11_guard via "${compose[@]}"
compose=(sudo docker compose --project-name deploy -f /dev/null --env-file /dev/null)
export DOCKER_DATABASE_URL='postgresql://teameet_v1:pw@v1_postgres:5432/teameet_v1'
export DOCKER_NETWORK_OK=true

make_source_with_m11() {
  local dir="$1"
  mkdir -p "${dir}/apps/v1_api/prisma/migrations/${M11_NAME}"
  cp "${M11_SOURCE}" "${dir}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
}

failures=0

# ── (i) M11 in source, NOT in prod ledger -> guard fails ────────────────────
dir_i="${TEST_ROOT}/i"; make_source_with_m11 "${dir_i}"
export DOCKER_LEDGER_CHECKSUM=''
if assert_task168_m11_guard "${dir_i}"; then
  echo "(i) FAILED: guard accepted a source with M11 while prod ledger has no applied M11 row" >&2
  failures=$((failures + 1))
else
  echo "[(i)] OK: guard correctly refused (M11 in source, not applied in prod)"
fi

# ── (ii) M11 in source AND in prod ledger with the matching checksum -> pass ─
dir_ii="${TEST_ROOT}/ii"; make_source_with_m11 "${dir_ii}"
export DOCKER_LEDGER_CHECKSUM="${M11_SHA}"
if assert_task168_m11_guard "${dir_ii}"; then
  echo "[(ii)] OK: guard correctly passed (M11 already applied in prod)"
else
  echo "(ii) FAILED: guard refused a prod ledger that already shows M11 applied" >&2
  failures=$((failures + 1))
fi

# ── (iii) M11 absent from the candidate source (today's main) -> no-op pass ──
dir_iii="${TEST_ROOT}/iii"
mkdir -p "${dir_iii}/apps/v1_api/prisma/migrations"
call_log="${TEST_ROOT}/iii-calls.log"
: > "${call_log}"
# Wrap docker to also log calls for this scenario, proving the no-M11-in-
# source path never touches docker/psql at all.
docker() { printf '%s\n' "$*" >> "${call_log}"; command docker "$@"; }
export -f docker
if assert_task168_m11_guard "${dir_iii}"; then
  if [[ -s "${call_log}" ]]; then
    echo "(iii) FAILED: guard is supposed to no-op when M11 is absent from source, but it invoked docker: $(cat "${call_log}")" >&2
    failures=$((failures + 1))
  else
    echo "[(iii)] OK: guard no-op passed without touching docker (M11 absent from source, e.g. today's main)"
  fi
else
  echo "(iii) FAILED: guard refused a source tree that does not include M11 at all" >&2
  failures=$((failures + 1))
fi
unset -f docker

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-prod-guard] FAILED: ${failures} scenario(s)" >&2
  exit 1
fi
echo "[task168-prod-guard] (i)(ii)(iii) all passed"

# ── mutation 1: guard verdict inverted (accepts mismatch, rejects match) ────
# prod-release-common.sh sources its two sibling common files by
# $(dirname "${BASH_SOURCE[0]}"), so the mutated copy must live next to
# symlinks of those siblings rather than off in $TEST_ROOT alone.
mut_dir="${TEST_ROOT}/mut-invert-dir"
mkdir -p "${mut_dir}"
ln -s "${ROOT_DIR}/deploy/prod-source-common.sh" "${mut_dir}/prod-source-common.sh"
ln -s "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${mut_dir}/prod-manifest-common.sh"
scratch_invert="${mut_dir}/prod-release-common.sh"
python3 - "${ROOT_DIR}/deploy/prod-release-common.sh" "${scratch_invert}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = 'if [[ "${m11_ledger_checksum}" != "${m11_source_sha}" ]]; then'
new = 'if [[ "${m11_ledger_checksum}" == "${m11_source_sha}" ]]; then'
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {count}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
(
  unset -f assert_task168_m11_guard 2>/dev/null || true
  # shellcheck disable=SC1090
  source "${scratch_invert}"
  compose=(sudo docker compose --project-name deploy -f /dev/null --env-file /dev/null)
  mutation_reds=0
  mutation_total=2
  export DOCKER_LEDGER_CHECKSUM="${M11_SHA}"
  if assert_task168_m11_guard "${dir_ii}"; then
    echo "[mutation verdict-inverted] (ii) NOT red -- still passed" >&2
  else
    echo "[mutation verdict-inverted] (ii) red (a legitimate already-applied M11 is now wrongly refused)"
    mutation_reds=$((mutation_reds + 1))
  fi
  export DOCKER_LEDGER_CHECKSUM=''
  if assert_task168_m11_guard "${dir_i}"; then
    echo "[mutation verdict-inverted] (i) red (an unapplied M11 is now wrongly accepted)"
    mutation_reds=$((mutation_reds + 1))
  else
    echo "[mutation verdict-inverted] (i) NOT red -- still refused" >&2
  fi
  echo "[task168-prod-guard] verdict-inverted mutation reds: ${mutation_reds}/${mutation_total} (expected 2/2)"
  [[ "${mutation_reds}" -eq "${mutation_total}" ]]
)

# ── mutation 2: guard call deleted from deploy-prod.sh -> (i)'s protection is
#    gone (static check: the call must exist and precede the migrate deploy
#    invocation) ────────────────────────────────────────────────────────────
assert_guard_precedes_migrate() {
  local script="$1"
  local guard_line migrate_line
  guard_line="$(grep -n '^assert_task168_m11_guard ' "${script}" | head -1 | cut -d: -f1)"
  migrate_line="$(grep -n "prisma migrate deploy'" "${script}" | head -1 | cut -d: -f1)"
  [[ -n "${guard_line}" && -n "${migrate_line}" ]] || return 1
  [[ "${guard_line}" -lt "${migrate_line}" ]]
}

if assert_guard_precedes_migrate "${ROOT_DIR}/deploy/deploy-prod.sh"; then
  echo "[task168-prod-guard] static ordering check: guard precedes migrate deploy (baseline OK)"
else
  echo "[task168-prod-guard] FAILED: baseline deploy-prod.sh does not call the guard before migrate deploy" >&2
  exit 1
fi

scratch_deleted="${TEST_ROOT}/deploy-prod-guard-deleted.sh"
sed '/^assert_task168_m11_guard /d' "${ROOT_DIR}/deploy/deploy-prod.sh" > "${scratch_deleted}"
if assert_guard_precedes_migrate "${scratch_deleted}"; then
  echo "[mutation guard-deleted] NOT red -- ordering check still passed after deleting the call" >&2
  exit 1
fi
echo "[mutation guard-deleted] red (correctly detected the missing guard call)"

# ── mutation 3: guard call moved to AFTER migrate deploy ────────────────────
scratch_moved="${TEST_ROOT}/deploy-prod-guard-moved.sh"
python3 - "${ROOT_DIR}/deploy/deploy-prod.sh" "${scratch_moved}" <<'PYEOF'
import re
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
lines = open(src_path, encoding='utf-8').read().split('\n')
guard_idx = next(i for i, l in enumerate(lines) if l.startswith('assert_task168_m11_guard '))
guard_line = lines.pop(guard_idx)
migrate_idx = next(i for i, l in enumerate(lines) if "prisma migrate deploy'" in l)
lines.insert(migrate_idx + 1, guard_line)
open(out_path, 'w', encoding='utf-8').write('\n'.join(lines))
PYEOF
if assert_guard_precedes_migrate "${scratch_moved}"; then
  echo "[mutation guard-moved-after-migrate] NOT red -- ordering check still passed" >&2
  exit 1
fi
echo "[mutation guard-moved-after-migrate] red (correctly detected the guard now runs after migrate deploy)"

echo "[task168-prod-guard] passed"
