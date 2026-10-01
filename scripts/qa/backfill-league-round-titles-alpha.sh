#!/usr/bin/env bash
# 리그 대진 제목 라운드 키 백필(backfill-league-round-titles.sql)을 SSM 으로 alpha 에만 보낸다.
#   scripts/qa/backfill-league-round-titles-alpha.sh           # 읽기 전용 dry-run
#   scripts/qa/backfill-league-round-titles-alpha.sh --apply   # 한 트랜잭션으로 적용
# alpha 와 prod EC2 가 한 계정에 있다. 인스턴스는 태그로 고르고 1대·alpha 임을 단언한다.
# prod 는 이 스크립트로 실행할 수 없다 — docs/ops/prod-task168-transition-runbook.md 9절을 따른다.
set -Eeuo pipefail

usage() { echo "usage: $0 [--apply]" >&2; exit 64; }
apply=0
case "$#:${1:-}" in
  0:) ;;
  1:--apply) apply=1 ;;
  *) usage ;;
esac

sql_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backfill-league-round-titles.sql"
[[ -f "${sql_file}" ]] || { echo "SQL 파일이 없다: ${sql_file}" >&2; exit 1; }

readonly alpha_name='teameet-alpha-dev'
ids="$(aws ec2 describe-instances \
  --filters 'Name=tag:Environment,Values=alpha' "Name=tag:Name,Values=${alpha_name}" 'Name=instance-state-name,Values=running' \
  --query 'Reservations[].Instances[].InstanceId' --output text)"
read -r -a candidates <<< "${ids}"
[[ "${#candidates[@]}" -eq 1 ]] || { echo "alpha 인스턴스가 정확히 1대가 아니다(${#candidates[@]}대) — 멈춘다" >&2; exit 1; }
instance="${candidates[0]}"
# 필터 결과를 믿지 않고 고른 인스턴스의 태그를 다시 읽는다.
aws ec2 describe-instances --instance-ids "${instance}" \
  --query 'Reservations[0].Instances[0].{Name:Tags[?Key==`Name`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value}' \
  --output json | jq -e --arg name "${alpha_name}" '.Name == $name and .Environment == "alpha"' >/dev/null \
  || { echo '고른 인스턴스가 alpha 가 아니다 — 멈춘다' >&2; exit 1; }

sql_b64="$(base64 < "${sql_file}" | tr -d '\n')"
# 호스트 쪽 두 번째 울타리: alpha 의 DATABASE_URL 은 compose 안 v1_postgres 를 가리킨다(prod 는 RDS).
# 접속 문자열은 환경변수로만 넘겨 어떤 명령줄 인자에도 싣지 않는다.
remote_script="$(cat <<REMOTE
set -Eeuo pipefail
for c in teameet_v1_api teameet_v1_postgres; do
  [ "\$(docker inspect -f '{{.State.Running}}' "\$c")" = true ] || { echo "\$c 가 떠 있지 않다" >&2; exit 3; }
done
PGURL="\$(docker exec teameet_v1_api printenv DATABASE_URL)"
case "\${PGURL}" in *@v1_postgres:5432/*) ;; *) echo 'DATABASE_URL 이 alpha 의 v1_postgres 가 아니다 — 멈춘다' >&2; exit 3 ;; esac
export PGURL
printf '%s' '${sql_b64}' | base64 -d | docker exec -i -e PGURL teameet_v1_postgres \
  sh -c 'exec psql "\$PGURL" -X -q -v ON_ERROR_STOP=1 -v apply=${apply} -f -'
REMOTE
)"

params="$(jq -nc --arg c "${remote_script}" '{commands:[$c]}')"
command_id="$(aws ssm send-command --instance-ids "${instance}" --document-name AWS-RunShellScript \
  --comment "Teameet alpha league round title backfill apply=${apply}" \
  --parameters "${params}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --command-id "${command_id}" --instance-id "${instance}" || true
invocation="$(aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${instance}" --output json)"
jq -r '.StandardOutputContent' <<< "${invocation}"
stderr_text="$(jq -r '.StandardErrorContent' <<< "${invocation}")"
[[ -z "${stderr_text}" ]] || printf -- '--- stderr\n%s\n' "${stderr_text}" >&2
status="$(jq -r '.Status' <<< "${invocation}")"
[[ "${status}" == Success ]] || { echo "SSM 명령이 ${status} 로 끝났다" >&2; exit 1; }
