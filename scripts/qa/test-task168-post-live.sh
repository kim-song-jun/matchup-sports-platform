#!/usr/bin/env bash

# Contract test for scripts/release/task168-stage-b-post-live-verify.sh (T7;
# m11-stageb-spec.md §5 T7; .task168-stageb-a2-contract.md §4.3). Runs the
# real script against a fake docker/psql/curl. A working baseline is built
# first, then each of the eight checks is broken exactly once — every
# break must refuse to write a receipt and exit non-zero.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/release/task168-stage-b-post-live-verify.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

readonly SHA=1111111111111111111111111111111111111111
readonly REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
readonly API_URI="${REGISTRY}/teameet-alpha-v1-api@sha256:$(printf 'a%.0s' {1..64})"
readonly WEB_URI="${REGISTRY}/teameet-alpha-v1-web@sha256:$(printf 'b%.0s' {1..64})"
readonly TASK168_M11=20260911090000_retire_tournament_fixture_tables
readonly TASK168_M11_SHA256=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323

# Everything a passing run needs, overridable per-case via env vars read by
# the fake docker/psql below: BREAK selects which single check to break.
build_case() {
  local root="$1"
  home="${root}/home"
  state_dir="${home}/.teameet-alpha-releases/task168/${SHA}"
  bin="${root}/bin"
  mkdir -p "${state_dir}" "${bin}" "${root}/live/deploy"
  touch "${root}/live/deploy/docker-compose.prod.yml" "${root}/live/deploy/docker-compose.alpha.yml"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${root}/live/deploy/.env"

  manifest="${root}/manifest.json"
  jq -n --arg api "${API_URI}" --arg web "${WEB_URI}" \
    '{schemaVersion:1,environment:"alpha",database:{task168:{stage:"stageBFinal"}},
      images:{api:{uri:$api},web:{uri:$web}}}' > "${manifest}"

  jq -n '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED"}' \
    > "${state_dir}/migration-stage.json"
}

# $2 = BREAK name (empty for the passing baseline)
make_fake_bin() {
  local bin="$1" break_case="${2:-}"
  cat > "${bin}/curl" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *"/api/v1/health"*)
    if [[ "${break_case}" == health ]]; then echo '{"data":{"checks":{"db":false}}}'; else echo '{"data":{"checks":{"db":true}}}'; fi
    ;;
  *"-o /dev/null"*)
    if [[ "${break_case}" == smoke ]]; then echo 500; else echo 200; fi
    ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/curl"

  cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *"ps -q v1_api"*) echo api-container; exit 0 ;;
  *"ps -q v1_web"*) echo web-container; exit 0 ;;
  *"ps -q v1_game_operations_worker"*) echo worker-container; exit 0 ;;
  *"run --rm --entrypoint cat"*attestation*)
    if [[ "${break_case}" == attestation ]]; then
      echo '{"stage":"stageAIntermediate","schemaSha256":"bad"}'
    else
      echo '{"stage":"stageBFinal","schemaSha256":"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46"}'
    fi
    exit 0 ;;
  *"inspect --format {{.Config.Image}} api-container"*)
    if [[ "${break_case}" == digest ]]; then echo wrong-image; else echo "${API_URI}"; fi
    exit 0 ;;
  *"inspect --format {{.Config.Image}} web-container"*) echo "${WEB_URI}"; exit 0 ;;
  *"inspect --format {{.Config.Image}} worker-container"*) echo "${API_URI}"; exit 0 ;;
  *"inspect --format {{.State.Health.Status}} worker-container"*)
    if [[ "${break_case}" == worker ]]; then echo unhealthy; else echo healthy; fi
    exit 0 ;;
  *"migrate diff"*)
    if [[ "${break_case}" == drift ]]; then echo "drift detected" >&2; exit 2; else exit 0; fi
    ;;
  *"_prisma_migrations"*)
    if [[ "${break_case}" == ledger-count ]]; then
      echo "${TASK168_M11}|${TASK168_M11_SHA256}|applied"
    elif [[ "${break_case}" == ledger-checksum ]]; then
      for i in \$(seq 1 10); do echo "2026090\${i}0000_v1_x|deadbeef|applied"; done
      echo "${TASK168_M11}|wrongchecksum|applied"
    else
      for i in \$(seq 1 10); do echo "2026090\${i}0000_v1_x|deadbeef|applied"; done
      echo "${TASK168_M11}|${TASK168_M11_SHA256}|applied"
    fi
    exit 0 ;;
  *"to_regclass"*)
    if [[ "${break_case}" == legacy-table ]]; then echo 1; else echo 0; fi
    exit 0 ;;
  *"information_schema.columns"*)
    if [[ "${break_case}" == legacy-column ]]; then echo 1; else echo 0; fi
    exit 0 ;;
  *"v1_outbox_events"*)
    if [[ "${break_case}" == outbox ]]; then echo 3; else echo 0; fi
    exit 0 ;;
  *"v1_tournaments"*)
    echo "tour-1|match-1"
    exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/docker"
}

run_case() {
  local root="$1"
  local rc=0
  ALPHA_RELEASE_STATE_DIR="${home}/.teameet-alpha-releases" PATH="${bin}:${PATH}" \
    bash "${SCRIPT}" --release-sha "${SHA}" --manifest "${manifest}" \
      --compose-prod "${root}/live/deploy/docker-compose.prod.yml" \
      --compose-alpha "${root}/live/deploy/docker-compose.alpha.yml" \
      --env-file "${root}/live/deploy/.env" \
      --public-base-url "https://alpha.example.invalid" \
      >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}

echo "== test-task168-post-live =="

root="${WORK}/pass"; mkdir -p "${root}"
build_case "${root}"
make_fake_bin "${bin}" ""
rc="$(run_case "${root}")"
[[ "${rc}" -eq 0 && -f "${state_dir}/runtime-verification.json" ]] \
  && pass "a fully passing run writes runtime-verification.json" \
  || fail "the passing baseline did not succeed: rc=${rc} $(cat "${root}/stderr")"
if [[ -f "${state_dir}/runtime-verification.json" ]]; then
  jq -e --arg m "$(sha256sum "${state_dir}/migration-stage.json" | awk '{print $1}')" \
    --arg n "$(sha256sum "${manifest}" | awk '{print $1}')" \
    '.migrationReceiptSha256 == $m and .manifestSha256 == $n and .ledgerCount == 11' \
    "${state_dir}/runtime-verification.json" >/dev/null \
    && pass "receipt binds the migration receipt and manifest hashes" \
    || fail "receipt does not bind the expected hashes"
fi

# Expected failure message per broken check: rc!=0 + no receipt alone also
# passes for an unrelated crash (e.g. an unbound-variable error), not only
# for the intended check failing. Asserting the message ties each case to
# the SPECIFIC check it broke, taken verbatim from
# scripts/release/task168-stage-b-post-live-verify.sh.
declare -A EXPECTED_MESSAGE=(
  [digest]="running API image does not match the manifest"
  [attestation]="running API image attestation is not stageBFinal"
  [ledger-count]="expected 11"
  [ledger-checksum]="M11 ledger row checksum mismatch"
  [legacy-table]="legacy tables are still present"
  [legacy-column]="legacy link columns remain"
  [drift]="live database drifts from the final schema"
  [health]="health check db is not true"
  [worker]="worker is not healthy"
  [outbox]="outbox PROCESSING rows did not converge to zero"
  [smoke]="read-only smoke check returned HTTP"
)

for break_case in digest attestation ledger-count ledger-checksum legacy-table legacy-column drift health worker outbox smoke; do
  root="${WORK}/break-${break_case}"; mkdir -p "${root}"
  build_case "${root}"
  make_fake_bin "${bin}" "${break_case}"
  rc="$(run_case "${root}")"
  expected="${EXPECTED_MESSAGE[${break_case}]}"
  if [[ "${rc}" -ne 0 && ! -f "${state_dir}/runtime-verification.json" ]] && grep -qF "${expected}" "${root}/stderr"; then
    pass "breaking '${break_case}' refuses the receipt with its specific message (rc=${rc}): ${expected}"
  else
    fail "breaking '${break_case}' did NOT refuse with the expected message '${expected}': rc=${rc} receipt-exists=$([[ -f "${state_dir}/runtime-verification.json" ]] && echo yes || echo no) stderr=$(cat "${root}/stderr")"
  fi
done

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))
