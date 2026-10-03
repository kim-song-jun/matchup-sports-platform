#!/usr/bin/env bash
#
# deploy-alpha.yml "Wait for matching CI success" 의 판정 본체.
# stdin: `repos/.../actions/workflows/deploy.yml/runs?branch=dev` 응답 JSON
# 인자:  RELEASE_SHA
# stdout: `pass` | `wait` | `fail <conclusion>`  (JSON 이 깨졌으면 jq 가 비 0 으로 죽는다)
#
# 인정하는 run 은 RELEASE_SHA 와 정확히 같은 dev 커밋의 둘뿐이다.
#   - push run
#   - Promote to main 이 버전 커밋을 push 한 뒤 직접 건 workflow_dispatch run
#     (GITHUB_TOKEN push 는 push CI 를 만들지 못한다). 사람이 건 dispatch 는 HEAD^ 기준
#     게이트라 여러 커밋 push 의 범위보다 좁게 검사할 수 있어 인정하지 않는다.
#     dispatch 주체는 actor 로만 본다: 사람이 `gh run rerun` 하면 triggering_actor 만 사람으로
#     바뀌고 actor 는 원래 dispatch 주체(bot)로 남으므로, triggering_actor 를 보면 flaky 재실행이 막힌다.
# pull_request run 도 head_branch 가 dev 로 찍히므로 event 로 걸러야 한다.
# push run 이 하나라도 있으면 push run(가장 최근)만으로 판정한다 — bot dispatch 는 HEAD^ 기준이라
# 여러 커밋 push 의 실패를 더 좁은 범위의 성공으로 덮을 수 있다. push run 이 없을 때만
# (버전 커밋) bot dispatch 중 가장 최근 것으로 판정한다.

set -Eeuo pipefail

release_sha="${1:?usage: select-matching-ci-run.sh <release-sha>}"

jq -er --arg sha "${release_sha}" '
  [ .workflow_runs[]
    | select(.head_sha == $sha and .head_branch == "dev")
    | select(
        .event == "push"
        or (.event == "workflow_dispatch"
            and .actor.login == "github-actions[bot]")
      )
  ]
  | (map(select(.event == "push")) | if length > 0 then . else null end) as $push
  | ($push // .)
  | sort_by([.created_at, .id])
  | last
  | if . == null then "wait"
    elif .status != "completed" then "wait"
    elif .conclusion == "success" then "pass"
    else "fail \(.conclusion // "unknown")"
    end
' 
