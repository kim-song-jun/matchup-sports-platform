#!/usr/bin/env bash

# D-5 guard contract test (m11-stageb-spec.md §0 item 4 / §3.3 row 1;
# .task168-stageb-a2-contract.md). Runs the REAL deploy/deploy-alpha.sh (not
# a reimplementation) against a fake docker/compose and an instrumented
# activate_alpha_release_source, so a real regression — the guard deleted, or
# moved to after activation — shows up as this test failing, not just a unit
# check on a hand-copied excerpt of the guard's SQL.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="${ROOT}/deploy/deploy-alpha.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

readonly REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
readonly SHA=1111111111111111111111111111111111111111
readonly VERSION=0.1.0-alpha.20260914.g111111111111
readonly SOURCE_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc

# Builds a fully self-contained fixture: a fake $HOME (ALPHA_HOME_DIR), a live
# release directory, and a candidate source payload with a valid manifest.
# $1 = case root. Returns via globals the paths the caller needs.
build_fixture() {
  local root="$1"
  home="${root}/home"
  live="${home}/teameet"
  source_dir="${root}/candidate-source"
  manifest="${root}/manifest.json"
  log="${root}/calls.log"
  : > "${log}"

  mkdir -p "${live}/deploy" "${source_dir}/deploy/migrations/x" "${home}"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${live}/deploy/.env"
  printf 'add_header X-Teameet-Release "prior" always;\n' > "${live}/deploy/release-metadata.alpha.conf"

  jq -Sn --arg sha "${SHA}" --arg version "${VERSION}" --arg registry "${REGISTRY}" \
    --arg srcSha "${SOURCE_SHA256}" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:"2026-09-14T00:00:00Z"},
      source:{bucket:"alpha-bucket",key:("releases/"+$sha+".tar.gz"),versionId:"version-1",sha256:$srcSha},
      database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",
        compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null,
        task168:{stage:"stageAIntermediate",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",
          runtimeClientSchemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",
          cutoverArchiveSha256:"829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b",
          cutoverManifestSha256:"b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74",
          migrations:[range(0;10)|{name:("2026091200000"+tostring+"_v1_fixture"),sha256:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}],
          rollbackTarget:null},
        },
      images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",uri:($registry+"/teameet-alpha-v1-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")},
        web:{repository:($registry+"/teameet-alpha-v1-web"),digest:"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",uri:($registry+"/teameet-alpha-v1-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")},
        cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",uri:($registry+"/teameet-alpha-v1-api@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")}}}' \
    > "${manifest}"

  # A pre-existing active release makes had_active=true, so deploy-alpha.sh
  # skips its separate "first immutable conversion" legacy-receipt branch —
  # that branch is unrelated to D-5 and would otherwise need its own
  # docker-container fixtures just to get past it.
  mkdir -p "${home}/.teameet-alpha-releases"
  local prior_sha=2222222222222222222222222222222222222222
  jq --arg sha "${prior_sha}" '.release.sha = $sha' "${manifest}" > "${root}/prior-manifest.json"
  local prior_checksum
  prior_checksum="$(sha256sum "${root}/prior-manifest.json" | awk '{print $1}')"
  jq -n --slurpfile active "${root}/prior-manifest.json" --arg checksum "${prior_checksum}" \
    '{schemaVersion:1, active: $active[0], activeManifestSha256: $checksum, previous: null, previousManifestSha256: null, updatedAt: "2026-09-14T00:00:00Z"}' \
    > "${home}/.teameet-alpha-releases/state.json"

  printf '#!/usr/bin/env bash\n' > "${source_dir}/deploy/deploy-alpha.sh"
  printf '#!/usr/bin/env bash\n' > "${source_dir}/deploy/task168-stage-a-migrate.sh"
  printf '#!/usr/bin/env bash\n' > "${source_dir}/deploy/rollback-alpha.sh"
  printf 'SELECT 1;\n' > "${source_dir}/deploy/alpha-sanitize.sql"
  printf 'services: {}\n' > "${source_dir}/deploy/docker-compose.alpha.yml"
  printf 'server {}\n' > "${source_dir}/deploy/nginx.alpha.conf"
  cp "${ROOT}/deploy/alpha-manifest-common.sh" "${source_dir}/deploy/alpha-manifest-common.sh"
  cp "${ROOT}/deploy/alpha-source-common.sh" "${source_dir}/deploy/alpha-source-common.sh"
  # A custom alpha-release-common.sh: sources the real one (so
  # validate_alpha_release_manifest / write_candidate_manifest /
  # prepare_alpha_release_source are the genuine implementations), then
  # overrides only activate_alpha_release_source to log the call instead of
  # doing a real symlink swap. deploy-alpha.sh sources this file *from the
  # candidate payload it is deploying* — exactly like a real release would —
  # so this is not a stub replacing the target, it is the same substitution
  # mechanism restore/rollback tests already rely on (test-alpha-release-state.sh).
  cat > "${source_dir}/deploy/alpha-release-common.sh" <<EOF
source "${ROOT}/deploy/alpha-release-common.sh"
activate_alpha_release_source() {
  echo "activate_alpha_release_source \$1" >> "${log}"
  return 0
}
EOF
}

# $1 = case root, $2 = M11 row count the fake DB reports (0 or 1+).
run_case() {
  local root="$1" m11_rows="$2"
  build_fixture "${root}"
  local bin="${root}/bin"
  mkdir -p "${bin}"
  cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$*" in
  *"up -d v1_postgres"*) exit 0 ;;
  *"pg_isready"*) exit 0 ;;
  *"_prisma_migrations"*) echo "${m11_rows}"; exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/docker"
  # flock(1) is util-linux-only (no macOS build); a real deploy host always
  # has it, so this is a test-environment shim, not a behavior change.
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock"
  chmod +x "${bin}/flock"

  local script="${root}/run.sh"
  cat > "${script}" <<EOF
export ALPHA_HOME_DIR="${home}"
export ALPHA_LIVE_DIR="${live}"
export ALPHA_SOURCE_DIR="${source_dir}"
export ALPHA_MANIFEST_FILE="${manifest}"
export ALPHA_MANIFEST_SHA256="\$(sha256sum "${manifest}" | awk '{print \$1}')"
export ALPHA_SHA="${SHA}"
export ALPHA_RELEASE_VERSION="${VERSION}"
export ALPHA_ECR_REGISTRY="${REGISTRY}"
export ALPHA_AWS_REGION="ap-northeast-2"
export ALPHA_SOURCE_BUCKET="alpha-bucket"
export ALPHA_SOURCE_VERSION_ID="version-1"
export ALPHA_SOURCE_SHA256="${SOURCE_SHA256}"
export PATH="${bin}:\${PATH}"
bash "${DEPLOY_SCRIPT}"
EOF
  local rc=0
  bash "${script}" > "${root}/stdout" 2> "${root}/stderr" || rc=$?
  echo "${rc}"
}

echo "== test-task168-d5-guard =="

# ── Negative: M11 already in the ledger -> refuse before activation ────────
neg_root="${WORK}/negative"
mkdir -p "${neg_root}"
rc="$(run_case "${neg_root}" 1)"
[[ "${rc}" -ne 0 ]] && pass "M11-present is refused (rc=${rc})" || fail "M11-present did not fail"
grep -q "activate_alpha_release_source" "${neg_root}/calls.log" 2>/dev/null \
  && fail "activate_alpha_release_source was called despite M11 already being in the ledger" \
  || pass "activate_alpha_release_source was never called when M11 is already in the ledger"
grep -q "Refusing a Stage A manifest" "${neg_root}/stderr" \
  && pass "refusal message names the reason" \
  || fail "no D-5 refusal message in stderr: $(cat "${neg_root}/stderr")"

# ── Positive: no M11 row -> the guard does not block, activation proceeds ──
# The script legitimately fails one step later (reading /proc/loadavg, which
# only exists on the real EC2 Linux host, not on this test machine) — that
# expected, unrelated failure is what proves execution reached past the
# guard rather than the guard itself succeeding by staying silent.
pos_root="${WORK}/positive"
mkdir -p "${pos_root}"
rc="$(run_case "${pos_root}" 0)"
grep -q "activate_alpha_release_source ${SHA}" "${pos_root}/calls.log" 2>/dev/null \
  && pass "activate_alpha_release_source was called once M11 is absent from the ledger" \
  || fail "the guard blocked even though no M11 row exists: $(cat "${pos_root}/stderr")"

# ── Static order guard: the D-5 block's source line must precede the
# activate_alpha_release_source call line in this file. Combined with the
# dynamic negative test above, this catches "guard moved to after
# activation" even if some future refactor made the dynamic case pass by
# accident.
guard_line="$(grep -n "Refusing a Stage A manifest" "${ROOT}/deploy/deploy-alpha.sh" | head -1 | cut -d: -f1)"
activate_line="$(grep -n 'activate_alpha_release_source "\${ALPHA_SHA}"' "${ROOT}/deploy/deploy-alpha.sh" | head -1 | cut -d: -f1)"
if [[ -n "${guard_line}" && -n "${activate_line}" && "${guard_line}" -lt "${activate_line}" ]]; then
  pass "D-5 guard (line ${guard_line}) precedes source activation (line ${activate_line}) in deploy-alpha.sh"
else
  fail "D-5 guard does not textually precede source activation (guard=${guard_line:-missing}, activate=${activate_line:-missing})"
fi

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
