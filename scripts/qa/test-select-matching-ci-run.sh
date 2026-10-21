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

# run <id> <event> <status> <conclusion|null> <sha> <login> <created_at> [head_branch] [triggering_login]
# triggering_login 을 생략하면 actor 와 같다(재실행이면 사람으로 갈라진다).
run_json() {
  local id="$1" event="$2" status="$3" conclusion="$4" sha="$5" login="$6" created="$7" branch="${8:-dev}" trig="${9:-$6}"
  jq -nc --argjson id "${id}" --arg event "${event}" --arg status "${status}" \
    --arg conclusion "${conclusion}" --arg sha "${sha}" --arg login "${login}" \
    --arg created "${created}" --arg branch "${branch}" --arg trig "${trig}" '{
      id: $id, event: $event, status: $status,
      conclusion: (if $conclusion == "null" then null else $conclusion end),
      head_sha: $sha, head_branch: $branch, created_at: $created,
      actor: {login: $login}, triggering_actor: {login: $trig}
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

# workflow_dispatch run 은 HEAD^ 기준 게이트라 push 범위보다 좁게 검사할 수 있다 — 누가 걸었든(bot·사람),
# 다시 실행했든 성공·실패 어느 쪽이든 판정에 쓰지 않는다(push run 이 없으면 계속 기다린다).
expect 'bot workflow_dispatch success is not accepted' wait \
  "$(run_json 2 workflow_dispatch completed success "${SHA}" "${BOT}" "${T1}")"
expect 'bot workflow_dispatch failure is not accepted' wait \
  "$(run_json 19 workflow_dispatch completed failure "${SHA}" "${BOT}" "${T1}")"
expect 'human workflow_dispatch is not accepted' wait \
  "$(run_json 3 workflow_dispatch completed success "${SHA}" kim-song-jun "${T1}")"
expect 'human re-run of bot dispatch is not accepted' wait \
  "$(run_json 20 workflow_dispatch completed success "${SHA}" "${BOT}" "${T1}" dev kim-song-jun)"
expect 'human dispatch re-run by human is not accepted' wait \
  "$(run_json 5 workflow_dispatch completed success "${SHA}" kim-song-jun "${T1}" dev kim-song-jun)"

# `gh run rerun` 은 event 를 push 로 둔 채 triggering_actor 만 사람으로 바꾼다 — 재실행 push run 은 인정한다.
expect 'human re-run of a push run is accepted' pass \
  "$(run_json 4 push completed success "${SHA}" human "${T1}" dev kim-song-jun)"

expect 'other SHA is ignored' wait \
  "$(run_json 6 push completed success "${OTHER_SHA}" human "${T1}")"

# dev→main PR 의 pull_request run 도 head_branch=dev, head_sha=dev tip 으로 찍힌다.
expect 'pull_request run is not accepted' wait \
  "$(run_json 7 pull_request completed success "${SHA}" human "${T1}")"

expect 'other branch is ignored' wait \
  "$(run_json 8 push completed success "${SHA}" human "${T1}" main)"

expect 'pending push run' wait \
  "$(run_json 9 push in_progress null "${SHA}" human "${T1}")"

expect 'completed failure fails' 'fail failure' \
  "$(run_json 11 push completed failure "${SHA}" human "${T1}")"
expect 'completed cancelled fails' 'fail cancelled' \
  "$(run_json 12 push completed cancelled "${SHA}" human "${T1}")"

# 인정되지 않는 dispatch run 은 더 최근이어도 push run 의 판정을 덮지 못한다.
expect 'push decides over newer bot dispatch (dispatch pending)' pass \
  "$(run_json 13 workflow_dispatch in_progress null "${SHA}" "${BOT}" "${T2}")" \
  "$(run_json 14 push completed success "${SHA}" human "${T1}")"
expect 'push failure is not hidden by newer bot dispatch success' 'fail failure' \
  "$(run_json 15 push completed failure "${SHA}" human "${T1}")" \
  "$(run_json 16 workflow_dispatch completed success "${SHA}" "${BOT}" "${T2}")"
expect 'newer human dispatch does not override push success' pass \
  "$(run_json 17 push completed success "${SHA}" human "${T1}")" \
  "$(run_json 18 workflow_dispatch completed failure "${SHA}" kim-song-jun "${T2}")"

# push run 끼리는 가장 최근 run 이 판정한다(입력 순서는 상관없다).
expect 'newest push run wins over older failed one' pass \
  "$(run_json 21 push completed success "${SHA}" human "${T2}")" \
  "$(run_json 22 push completed failure "${SHA}" human "${T1}")"
expect 'newest push run failure wins over older success' 'fail failure' \
  "$(run_json 23 push completed failure "${SHA}" human "${T2}")" \
  "$(run_json 24 push completed success "${SHA}" human "${T1}")"

echo "[test-select-matching-ci-run] all scenarios passed"
