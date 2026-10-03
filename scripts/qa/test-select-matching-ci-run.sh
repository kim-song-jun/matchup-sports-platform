#!/usr/bin/env bash
#
# scripts/release/select-matching-ci-run.sh 의 계약 테스트. deploy-alpha.yml 이 어떤 CI run 을
# "이 릴리스 SHA 의 CI" 로 인정하는지를 픽스처 JSON 으로 고정한다.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SELECTOR="${ROOT_DIR}/scripts/release/select-matching-ci-run.sh"
readonly SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly OTHER_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

fail() {
  echo "[test-select-matching-ci-run] $*" >&2
  exit 1
}

# run <id> <event> <status> <conclusion|null> <sha> <login> <created_at> [head_branch]
run_json() {
  local id="$1" event="$2" status="$3" conclusion="$4" sha="$5" login="$6" created="$7" branch="${8:-dev}"
  jq -nc --argjson id "${id}" --arg event "${event}" --arg status "${status}" \
    --arg conclusion "${conclusion}" --arg sha "${sha}" --arg login "${login}" \
    --arg created "${created}" --arg branch "${branch}" '{
      id: $id, event: $event, status: $status,
      conclusion: (if $conclusion == "null" then null else $conclusion end),
      head_sha: $sha, head_branch: $branch, created_at: $created,
      actor: {login: $login}, triggering_actor: {login: $login}
    }'
}

expect() {
  local name="$1" want="$2"; shift 2
  local got
  got="$(printf '{"workflow_runs":[%s]}' "$(IFS=,; echo "$*")" | bash "${SELECTOR}" "${SHA}")"
  [[ "${got}" == "${want}" ]] || fail "${name}: 기대 '${want}', 실측 '${got}'"
  echo "[test-select-matching-ci-run] ${name} -> ${want}: OK"
}

expect_empty() {
  local name="$1" want="$2" got
  got="$(printf '{"workflow_runs":[]}' | bash "${SELECTOR}" "${SHA}")"
  [[ "${got}" == "${want}" ]] || fail "${name}: 기대 '${want}', 실측 '${got}'"
  echo "[test-select-matching-ci-run] ${name} -> ${want}: OK"
}

BOT='github-actions[bot]'
T1='2026-10-03T09:00:00Z'
T2='2026-10-03T09:05:00Z'

expect_empty 'no runs' wait

expect 'push run success' pass \
  "$(run_json 1 push completed success "${SHA}" human "${T1}")"

# 회귀 대상: 버전 커밋은 push run 이 없고 Promote 의 dispatch run 만 있다.
expect 'bot workflow_dispatch success' pass \
  "$(run_json 2 workflow_dispatch completed success "${SHA}" "${BOT}" "${T1}")"

expect 'human workflow_dispatch is not accepted' wait \
  "$(run_json 3 workflow_dispatch completed success "${SHA}" kim-song-jun "${T1}")"

# triggering_actor 가 없으면 actor 로 판정한다.
fallback_run="$(run_json 4 workflow_dispatch completed success "${SHA}" "${BOT}" "${T1}" | jq -c 'del(.triggering_actor)')"
expect 'dispatch falls back to actor.login' pass "${fallback_run}"
human_fallback="$(run_json 5 workflow_dispatch completed success "${SHA}" human "${T1}" | jq -c 'del(.triggering_actor)')"
expect 'dispatch fallback actor human is not accepted' wait "${human_fallback}"

expect 'other SHA is ignored' wait \
  "$(run_json 6 push completed success "${OTHER_SHA}" human "${T1}")"

# dev→main PR 의 pull_request run 도 head_branch=dev, head_sha=dev tip 으로 찍힌다.
expect 'pull_request run is not accepted' wait \
  "$(run_json 7 pull_request completed success "${SHA}" human "${T1}")"

expect 'other branch is ignored' wait \
  "$(run_json 8 push completed success "${SHA}" human "${T1}" main)"

expect 'pending push run' wait \
  "$(run_json 9 push in_progress null "${SHA}" human "${T1}")"
expect 'queued bot dispatch run' wait \
  "$(run_json 10 workflow_dispatch queued null "${SHA}" "${BOT}" "${T1}")"

expect 'completed failure fails' 'fail failure' \
  "$(run_json 11 push completed failure "${SHA}" human "${T1}")"
expect 'completed cancelled fails' 'fail cancelled' \
  "$(run_json 12 workflow_dispatch completed cancelled "${SHA}" "${BOT}" "${T1}")"

# push 와 dispatch 가 함께 있으면 가장 최근 run 이 판정한다(입력 순서는 상관없다).
expect 'newest of push+dispatch decides (dispatch pending)' wait \
  "$(run_json 13 workflow_dispatch in_progress null "${SHA}" "${BOT}" "${T2}")" \
  "$(run_json 14 push completed success "${SHA}" human "${T1}")"
expect 'newest of push+dispatch decides (dispatch success)' pass \
  "$(run_json 15 push completed failure "${SHA}" human "${T1}")" \
  "$(run_json 16 workflow_dispatch completed success "${SHA}" "${BOT}" "${T2}")"

# 인정되지 않는 run 은 더 최근이어도 판정에 끼어들지 못한다.
expect 'newer human dispatch does not override push success' pass \
  "$(run_json 17 push completed success "${SHA}" human "${T1}")" \
  "$(run_json 18 workflow_dispatch completed failure "${SHA}" kim-song-jun "${T2}")"

echo "[test-select-matching-ci-run] all scenarios passed"
