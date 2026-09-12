#!/usr/bin/env bash

# restore_active_release() 는 배포가 실패한 뒤 **ERR trap 핸들러 안에서** 실행된다.
# bash 는 trap 핸들러 안에서 인자 없는 `return` 을 만나면 함수의 마지막 명령이 아니라
# **trap 을 일으킨 명령의 종료코드**를 돌려준다(bash(1) `return`:
# "If return is executed by a trap handler, the last command used to determine the status
# is the last command executed before the trap handler"). 그래서 정상 배포 흐름에서는
# 멀쩡히 성공하는 함수가 복구 경로에서만 조용히 실패한다 — 2026-09-08 alpha 복구가
# 다섯 번 연속 "CRITICAL: active release restore failed" 로 끝난 원인이 이것이었고,
# 그 이전 실패까지 합치면 복구는 한 번도 성공한 적이 없었다(state 디렉터리에 남은
# active.* 임시 파일 17개가 그 증거). 이 테스트는 실제 trap 문맥에서 복구를 끝까지 돌린다.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

readonly REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
readonly SHA_ACTIVE=1111111111111111111111111111111111111111
readonly SHA_CANDIDATE=2222222222222222222222222222222222222222
readonly DIGEST_A="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
readonly DIGEST_B="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

# bash 5.3 부터는 trap 안의 인자 없는 return 이 정상 값을 돌려준다(5.2 까지 재현). 그 bash 에서는
# 아래 행동 검증이 결함을 되돌려도 통과하므로, 재현 여부를 먼저 재서 정적 가드만 유효함을 알린다.
bug_reproduces="$(bash -c 'set -E; f() { [[ x == x ]]; return; }; trap "if f; then echo no; else echo yes; fi; exit 0" ERR; false')"
if [[ "${bug_reproduces}" != "yes" ]]; then
  echo "test-release-restore-in-trap: bash ${BASH_VERSION} 은 trap 안 bare return 결함을 재현하지 않는다 — 행동 검증은 무효, 정적 가드만 유효" >&2
fi

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# 인자: env(alpha|prod). 별도 bash 프로세스에서 "후보 활성화 → 시드 실패 → ERR trap →
# restore_active_release" 를 그대로 재현하고, 핸들러가 남긴 결과 파일로 판정한다.
run_restore_case() {
  local env="$1"
  local upper
  upper="$(tr '[:lower:]' '[:upper:]' <<< "${env}")"
  local case_root="${TEST_ROOT}/${env}"
  local home="${case_root}/home"
  local sources="${home}/.teameet-${env}-sources"
  local state_dir="${home}/.teameet-${env}-releases"
  local runtime_dir="${home}/.teameet-${env}-runtime"
  local result_file="${case_root}/result"
  local manifest="${case_root}/active-manifest.json"
  local repo_prefix="teameet-${env}-v1"
  local environment="${env}"
  [[ "${env}" == "prod" ]] && environment="production"

  mkdir -p "${sources}/${SHA_ACTIVE}/deploy" "${sources}/${SHA_CANDIDATE}/deploy" \
    "${state_dir}/failed" "${runtime_dir}"
  ln -s "${sources}/${SHA_CANDIDATE}" "${home}/teameet"

  local source_json='{"bucket":"b","key":("releases/" + $sha + ".tar.gz"),"sha256":$srcsha,"versionId":"v1"}'
  local database_json='{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null,task168:{stage:"stageAIntermediate",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",runtimeClientSchemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f",cutoverArchiveSha256:"694a17ba8ed3d062b68908d4fd4ca3085be28afbe2c9661dd7a1cfae2c6e799b",cutoverManifestSha256:"aa1753551026795af1af70352e54bfed31759fda826fe7a0244f43603ac8bb26",migrations:[range(0;10)|{name:("2026091200000"+tostring+"_v1_fixture"),sha256:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}],rollbackTarget:null}}'
  local cutover_tool_json=',cutoverTool: { repository: ($registry + "/" + $prefix + "-api"), digest: $digest, uri: ($registry + "/" + $prefix + "-api@" + $digest) }'
  [[ "${env}" == "prod" ]] && source_json='{"transfer":"ssh-rsync","sha256":$srcsha}'
  if [[ "${env}" == "prod" ]]; then
    database_json='{migrationPolicy:"expand-contract",rollbackMode:"application-images-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null}'
    cutover_tool_json=''
  fi
  jq -n --arg sha "${SHA_ACTIVE}" --arg environment "${environment}" --arg registry "${REGISTRY}" \
    --arg prefix "${repo_prefix}" --arg digest "${DIGEST_A}" \
    --arg srcsha "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" \
    "{
      schemaVersion: 1,
      environment: \$environment,
      release: { sha: \$sha, version: (\"1.0.0-\" + \$environment + \".20260908.g\" + \$sha[0:12]), createdAt: \"2026-09-08T17:16:55+09:00\" },
      source: ${source_json},
      database: ${database_json},
      images: {
        api: { repository: (\$registry + \"/\" + \$prefix + \"-api\"), digest: \$digest,
               uri: (\$registry + \"/\" + \$prefix + \"-api@\" + \$digest) },
        web: { repository: (\$registry + \"/\" + \$prefix + \"-web\"), digest: \$digest,
               uri: (\$registry + \"/\" + \$prefix + \"-web@\" + \$digest) }${cutover_tool_json}
      }
    }" > "${manifest}"
  local checksum
  checksum="$(sha256sum "${manifest}" | awk '{print $1}')"
  jq -n --slurpfile active "${manifest}" --arg checksum "${checksum}" \
    '{schemaVersion: 1, active: $active[0], activeManifestSha256: $checksum, previous: null, previousManifestSha256: null, updatedAt: "2026-09-08T08:16:00Z"}' \
    > "${state_dir}/state.json"
  jq --arg sha "${SHA_CANDIDATE}" --arg digest "${DIGEST_B}" \
    '.release.sha = $sha | .images.api.digest = $digest | .images.web.digest = $digest' \
    "${manifest}" > "${state_dir}/candidate.json"

  # 실제 deploy-*.sh 의 restore_on_failure 와 같은 모양. docker/compose/curl 은 성공하는
  # 껍데기로 바꾸되 함수(wait_for_*_health_contract 등)는 실제 것을 그대로 지나가게 한다.
  local script="${case_root}/run.sh"
  cat > "${script}" <<EOF
set -Eeuo pipefail
export ${upper}_HOME_DIR="${home}"
export ${upper}_ECR_REGISTRY="${REGISTRY}"
source "${ROOT_DIR}/deploy/${env}-release-common.sh"
active_api_image="\$(jq -r '.images.api.uri' "${manifest}")"
active_web_image="\$(jq -r '.images.web.uri' "${manifest}")"
fake_compose() {
  case "\$*" in
    *"ps -q v1_api"*) echo api-container ;;
    *"ps -q v1_web"*) echo web-container ;;
    *"ps -q v1_game_operations_worker"*) echo worker-container ;;
    *) return 0 ;;
  esac
}
compose=(fake_compose)
sudo() { "\$@"; }
sleep() { :; }
docker() {
  case "\$*" in
    pull*) echo "pulled \$2" ;;
    *"{{.State.Health.Status}}"*) echo healthy ;;
    *"web-container"*) echo "\${active_web_image}" ;;
    *) echo "\${active_api_image}" ;;
  esac
}
curl() {
  case "\$*" in
    *"/api/v1/health"*) printf '{"data":{"checks":{"db":true}}}\n' ;;
    *"-w %{http_code}"*"/v1/home"*) printf '308' ;;
    *"-w %{http_code}"*) printf '200' ;;
    *) printf 'HTTP/2 200\r\nx-teameet-release: %s\r\nx-teameet-commit: %s\r\n' \
         "\$(jq -r '.release.version' "${manifest}")" "${SHA_ACTIVE}" ;;
  esac
}
runtime_mutated=true
had_active=true
restore_on_failure() {
  local status="\$?"
  trap - ERR
  archive_failed_candidate
  if [[ "\${runtime_mutated}" == true && "\${had_active}" == true ]]; then
    if restore_active_release; then
      echo restored > "${result_file}"
    else
      echo critical > "${result_file}"
    fi
  fi
  exit "\${status}"
}
trap 'restore_on_failure' ERR
false   # 시드 실패에 해당하는 지점
EOF

  local stderr_file="${case_root}/stderr"
  local rc=0
  bash "${script}" > "${case_root}/stdout" 2> "${stderr_file}" || rc=$?

  local result
  result="$(cat "${result_file}" 2>/dev/null || echo missing)"
  [[ "${result}" == "restored" ]] ||
    fail "[${env}] ERR trap 안에서 restore_active_release 가 실패했다 (result=${result}, rc=${rc}); stderr: $(tr '\n' '|' < "${stderr_file}")"
  [[ "$(readlink "${home}/teameet")" == "${sources}/${SHA_ACTIVE}" ]] ||
    fail "[${env}] 복구 뒤 live 링크가 active 소스를 가리키지 않는다: $(readlink "${home}/teameet")"
  [[ -z "$(find "${state_dir}" -maxdepth 1 -name 'active.*' -print)" ]] ||
    fail "[${env}] 복구가 끝까지 가지 못해 active.* 임시 파일이 남았다"
  compgen -G "${state_dir}/failed/${SHA_CANDIDATE}-*.json" >/dev/null ||
    fail "[${env}] 실패한 후보 매니페스트가 failed/ 로 보관되지 않았다"
  grep -q "X-Teameet-Commit \"${SHA_ACTIVE}\"" "${runtime_dir}/release-metadata.${env}.conf" 2>/dev/null ||
    fail "[${env}] 복구가 release 메타데이터를 active SHA 로 되돌리지 않았다"
}

run_restore_case alpha
run_restore_case prod

# 같은 결함이 다시 들어오지 않게 정적으로도 막는다: ERR trap 을 거는 배포 스크립트와 그것들이
# source 하는 *-common.sh 안에서는 인자 없는 `return` 을 쓰지 않는다(성공이면 `return 0`, 조건의 결과를
# 돌려주려면 `|| return 1` 뒤에 `return 0`).
guarded_files="$(grep -lE 'trap [^#]*ERR' "${ROOT_DIR}"/deploy/*.sh; ls "${ROOT_DIR}"/deploy/*-common.sh)"
# 가드가 조용히 비지 않게: 대상 파일이 있어야 하고, grep 은 1(매치 없음)만 정상이며 2(파일 오류)는 실패다.
grep -qx "${ROOT_DIR}/deploy/deploy-alpha.sh" <<< "${guarded_files}" ||
  fail "정적 가드 대상 목록에 deploy-alpha.sh 가 없다 — 목록 도출이 깨졌다"
grep_rc=0
bare_returns="$(grep -nE '^[[:space:]]*return[[:space:]]*(;|#.*)?$' ${guarded_files})" || grep_rc=$?
(( grep_rc == 0 || grep_rc == 1 )) ||
  fail "정적 가드 grep 이 rc=${grep_rc} 로 실패했다 (파일 누락/오류) — 검사가 수행되지 않았다"
[[ -z "${bare_returns}" ]] ||
  fail "인자 없는 return 이 배포 스크립트에 남아 있다 (trap 핸들러 안에서는 trap 을 일으킨 종료코드를 돌려준다):"$'\n'"${bare_returns}"

if (( failures > 0 )); then
  echo "test-release-restore-in-trap: ${failures} failure(s)" >&2
  exit 1
fi
echo "test-release-restore-in-trap: ok"
