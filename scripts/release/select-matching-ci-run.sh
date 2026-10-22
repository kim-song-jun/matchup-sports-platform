#!/usr/bin/env bash
#
# deploy-alpha.yml "Wait for matching CI success" 의 판정 본체.
# stdin: `repos/.../actions/workflows/deploy.yml/runs?branch=dev` 응답 JSON
# 인자:  RELEASE_SHA
# stdout: `pass` | `wait` | `fail <conclusion>`  (JSON 이 깨졌으면 jq 가 비 0 으로 죽는다)
#
# 인정하는 run 은 RELEASE_SHA 와 정확히 같은 dev 커밋의 push run 뿐이다.
# workflow_dispatch run 은 누가 걸었든 인정하지 않는다 — HEAD^ 기준 게이트라 여러 커밋 push 의
# 범위보다 좁게 검사할 수 있다. pull_request run 도 head_branch 가 dev 로 찍히므로 event 로 걸러야 한다.

set -Eeuo pipefail

release_sha="${1:?usage: select-matching-ci-run.sh <release-sha>}"

jq -er --arg sha "${release_sha}" '
  [ .workflow_runs[]
    | select(.head_sha == $sha and .head_branch == "dev" and .event == "push")
  ]
  | sort_by([.created_at, .id])
  | last
  | if . == null then "wait"
    elif .status != "completed" then "wait"
    elif .conclusion == "success" then "pass"
    else "fail \(.conclusion // "unknown")"
    end
' 
