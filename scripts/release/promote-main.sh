#!/usr/bin/env bash
#
# "Promote to main" 워크플로(.github/workflows/promote-main.yml)의 로직 본체.
#
# 함수 단위 라이브러리다 — source 만 해서는 아무것도 실행하지 않는다(각 함수는 실패 시
# stderr 메시지 + `return 1` 만 하고 `exit` 는 부르지 않는다). 그래서
# scripts/qa/test-promote-main.sh 가 curl/git/gh/pnpm 을 가짜 함수로 덮어쓰고 함수 단위로
# 호출-검증할 수 있다. 맨 아래 가드만 직접 실행(`bash scripts/release/promote-main.sh`)될
# 때 strict mode 를 켜고 main 을 부른다.
#
# 저장소 설정이 "Actions 의 PR 생성"을 허용하지 않으므로 이 스크립트는 PR 을 직접 열지
# 않는다 — dev 에 버전 커밋을 올리고, 승격 게이트를 미리 검증한 뒤 사람이 누를 PR 링크만
# job summary 에 남긴다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# REPO_ROOT: git 상태·package.json·.changeset 을 읽고 쓰는 대상 저장소.
#   프로덕션 실행에서는 워크플로가 체크아웃한 트리(기본값 `.`)와 같다.
#   테스트에서는 픽스처 git 저장소를 가리킨다 — 스크립트 자신(SCRIPT_DIR)과는 별개다.
REPO_ROOT="${REPO_ROOT:-.}"
MAIN_REF="${MAIN_REF:-origin/main}"
DEV_REF="${DEV_REF:-HEAD}"
ALPHA_URL="${ALPHA_URL:-https://alpha.teameet.co.kr}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
GITHUB_STEP_SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
CONFIRMATION="${CONFIRMATION:-}"

log() { printf '%s\n' "$*" >&2; }

require_confirmation() {
  if [[ "${CONFIRMATION}" != "PROMOTE" ]]; then
    log "confirmation 입력이 정확히 PROMOTE 가 아니다 (받은 값: '${CONFIRMATION}') — 오타로 인한 실수 실행을 막는다."
    return 1
  fi
}

fetch_alpha_headers() {
  curl -fsSI --retry 6 --retry-delay 5 "${ALPHA_URL}/landing"
}

extract_header() {
  local headers="$1" name="$2"
  awk -F': ' -v n="${name}" 'tolower($1) == tolower(n) { gsub("\r", "", $2); print $2; exit }' <<< "${headers}"
}

# alpha 가 서빙 중인 커밋이 지금 dev HEAD 와 같은지 확인한다. "alpha 에서 검증된 코드를
# 승격한다"는 전제가 성립하려면 alpha 가 최신 dev 를 반영하고 있어야 한다.
# 성공하면 stdout 에 "release=<x-teameet-release>\ncommit=<x-teameet-commit>" 를 낸다.
verify_alpha_matches_dev() {
  local dev_sha="$1"
  local headers
  headers="$(fetch_alpha_headers)" || { log "alpha 헤더를 가져오지 못했다 (curl 실패)"; return 1; }
  local alpha_release alpha_sha
  alpha_release="$(extract_header "${headers}" x-teameet-release)"
  alpha_sha="$(extract_header "${headers}" x-teameet-commit)"
  if [[ -z "${alpha_sha}" || "${alpha_sha}" != "${dev_sha}" ]]; then
    log "alpha 배포가 dev 최신을 아직 반영하지 않았다 (alpha=${alpha_sha:-<none>}, dev=${dev_sha}) — 배포 완료 후 다시 실행하라."
    return 1
  fi
  printf 'release=%s\ncommit=%s\n' "${alpha_release}" "${alpha_sha}"
}

resolve_release_metadata() {
  local sha="$1" date="$2"
  node "${SCRIPT_DIR}/resolve-changeset-version.mjs" --repo "${REPO_ROOT}" --sha "${sha}" --date "${date}"
}

# 리졸버가 계산한 prereleaseVersion 이 alpha 가 서빙 중인 x-teameet-release 와 같아야 한다 —
# 다르면 dev 가 alpha 배포 이후 또 바뀐 것이라 alpha 검증이 지금 dev 상태를 대표하지 않는다.
verify_prerelease_match() {
  local metadata_json="$1" alpha_release="$2"
  local expected
  expected="$(jq -er '.prereleaseVersion' <<< "${metadata_json}")" \
    || { log "리졸버 출력에서 prereleaseVersion 을 읽지 못했다"; return 1; }
  if [[ "${expected}" != "${alpha_release}" ]]; then
    log "리졸버가 계산한 버전(${expected})이 alpha 가 서빙 중인 버전(${alpha_release})과 다르다."
    return 1
  fi
}

run_changesets_version() {
  # 서브셸(`( cd ... && ... )`)을 쓰면 pnpm 호출의 종료 상태는 그대로 나오지만, 테스트가
  # 덮어쓴 가짜 pnpm 함수가 그 안에서 바꾸는 카운터 변수는 서브셸 밖으로 보이지 않는다 —
  # 그래서 cd 를 직접 하고 되돌린다.
  local prev_dir rc
  prev_dir="$(pwd)"
  cd "${REPO_ROOT}" || return 1
  pnpm dlx @changesets/cli@2.30.0 version
  rc=$?
  cd "${prev_dir}" || return 1
  return "${rc}"
}

# changesets version 은 매니페스트를 수정하고 changeset 파일을 삭제한다 — 신규 삭제 모두
# 잡으려면 커밋 전에 stage 부터 해야 한다(최초 릴리스에서는 CHANGELOG.md 가 아직 없어
# 미추적 신규 파일이라 `git diff`(non-cached)에는 안 잡힌다).
stage_version_bump_changes() {
  git -C "${REPO_ROOT}" add -A -- \
    apps/v1_api/package.json apps/v1_web/package.json \
    apps/v1_api/CHANGELOG.md apps/v1_web/CHANGELOG.md \
    pnpm-lock.yaml .changeset
}

capture_staged_changed_files() {
  local out_file="$1"
  git -C "${REPO_ROOT}" diff --name-only --cached HEAD > "${out_file}"
}

# check-changeset-policy.mjs 의 "Changesets 릴리스 커밋" 예외 경로로 판정되는지 확인한다 —
# changesets version 이 실제로 유효한 release-commit 모양(매니페스트만 변경 + changeset 소비
# + 양쪽 앱 동시 bump)을 만들었는지에 대한 방어적 검증이다.
verify_release_commit_shape() {
  local changed_files_file="$1"
  node "${SCRIPT_DIR}/check-changeset-policy.mjs" --repo "${REPO_ROOT}" --changed-files-file "${changed_files_file}"
}

commit_version_bump() {
  local stable_version="$1"
  git -C "${REPO_ROOT}" \
    -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -m "chore(release): version Teameet ${stable_version}"
}

# 일반 push(force 아님)라 dev 가 그 사이 전진했으면 non-fast-forward 로 그냥 실패한다 —
# 별도 CAS 로직이 필요 없다.
push_dev() {
  if ! git -C "${REPO_ROOT}" push origin HEAD:dev; then
    log "dev 로 push 하지 못했다 — 그 사이 dev 가 전진했을 수 있다. 워크플로를 다시 실행하라."
    return 1
  fi
}

# GITHUB_TOKEN 으로 만든 push 는 다른 워크플로를 트리거하지 않으므로(workflow_dispatch 는
# 예외), 방금 push 한 버전 커밋을 alpha 에 반영하려면 배포를 직접 dispatch 해야 한다.
dispatch_alpha_deploy() {
  if ! gh workflow run deploy-alpha.yml --repo "${GITHUB_REPOSITORY}" --ref dev; then
    log "deploy-alpha.yml dispatch 에 실패했다 — 버전 커밋은 이미 dev 에 push 됐으니 수동으로 dispatch 하라."
    return 1
  fi
}

resolve_versions_at() {
  local ref="$1"
  local api_version web_version
  api_version="$(git -C "${REPO_ROOT}" show "${ref}:apps/v1_api/package.json" | jq -er .version)" || return 1
  web_version="$(git -C "${REPO_ROOT}" show "${ref}:apps/v1_web/package.json" | jq -er .version)" || return 1
  printf '%s %s\n' "${api_version}" "${web_version}"
}

# deploy.yml Gates job 의 "Verify release changeset" 스텝, dev→main 분기와 동일한 계산이다
# (3-dot diff + 병합 사이 소비된 changeset 을 삭제 이력에서 복원). 그쪽과 갈라지면 이 사전
# 검증과 실제 PR CI 게이트가 다른 결론을 낼 수 있으므로 바꿀 때는 두 곳을 함께 고친다.
compute_gate_changed_files() {
  local main_ref="$1" dev_ref="$2" out_file="$3"
  local main_sha dev_sha
  main_sha="$(git -C "${REPO_ROOT}" rev-parse "${main_ref}")" || return 1
  dev_sha="$(git -C "${REPO_ROOT}" rev-parse "${dev_ref}")" || return 1
  git -C "${REPO_ROOT}" diff --name-only "${main_sha}...${dev_sha}" > "${out_file}"
  git -C "${REPO_ROOT}" log --format= --name-only --diff-filter=D \
    "${main_sha}..${dev_sha}" -- '.changeset/*.md' >> "${out_file}"
  sort -u -o "${out_file}" "${out_file}"
}

run_promotion_gate() {
  local changed_files_file="$1" base_api_version="$2" base_web_version="$3"
  node "${SCRIPT_DIR}/check-changeset-policy.mjs" \
    --repo "${REPO_ROOT}" \
    --changed-files-file "${changed_files_file}" \
    --release-promotion true \
    --base-ref main \
    --head-ref dev \
    --base-api-version "${base_api_version}" \
    --base-web-version "${base_web_version}"
}

find_existing_pr() {
  gh pr list --repo "${GITHUB_REPOSITORY}" --base main --head dev --state open \
    --json url --jq '.[0].url // empty'
}

build_compare_url() {
  local title="$1" body="$2"
  local encoded_title encoded_body
  encoded_title="$(jq -rn --arg s "${title}" '$s|@uri')"
  encoded_body="$(jq -rn --arg s "${body}" '$s|@uri')"
  printf 'https://github.com/%s/compare/main...dev?expand=1&title=%s&body=%s\n' \
    "${GITHUB_REPOSITORY}" "${encoded_title}" "${encoded_body}"
}

build_pr_body() {
  local old_version="$1" new_version="$2" commit_count="$3"
  cat <<PRBODY
## dev → main 승격

- 버전: \`${old_version}\` → \`${new_version}\`
- 커밋 수: ${commit_count}
- 게이트: \`check-changeset-policy.mjs --release-promotion\` 통과(버전 상승 + changeset 소비 확인됨)

## 머지 후 절차

1. 이 PR 머지가 트리거하는 \`deploy.yml\` push 배포가 승인 대기 상태로 뜨면, **승인하지 말고
   취소**한다.
2. \`docs/ops/prod-task168-transition-runbook.md\` 를 따라 \`deploy.yml\` 을
   \`workflow_dispatch\`(\`task168_stage=stageA\`)로 실행 → 승인 → \`stageB\` 실행 → 승인한다.
   **M11 마이그레이션이 이미 프로덕션 원장에 적용되어 있다면 이 Stage A/B 단계는 필요 없다** —
   그 경우 1번에서 취소한 배포를 \`task168_stage=none\`(기본값)으로 그대로 재실행한다.

🤖 Generated by \`Promote to main\` workflow
PRBODY
}

write_summary() {
  local pr_url="$1" is_existing="$2" old_version="$3" new_version="$4" commit_count="$5" versioned="$6"
  {
    echo '## dev → main 승격 준비 완료'
    echo
    if [[ "${is_existing}" == true ]]; then
      echo '이미 열려 있는 PR 을 찾았다:'
    else
      echo 'PR 을 만들 링크다 (저장소 설정이 Actions 의 PR 생성을 허용하지 않아 사람이 직접 눌러야 한다):'
    fi
    echo
    echo "${pr_url}"
    echo
    echo "- 버전: \`${old_version}\` → \`${new_version}\`"
    echo "- 커밋 수(main..dev): ${commit_count}"
    echo "- 이번 실행에서 버전 커밋 생성: ${versioned}"
  } >> "${GITHUB_STEP_SUMMARY}"
}

main() {
  require_confirmation || return 1

  local dev_sha
  dev_sha="$(git -C "${REPO_ROOT}" rev-parse "${DEV_REF}")" || return 1

  local alpha_info
  alpha_info="$(verify_alpha_matches_dev "${dev_sha}")" || return 1
  local alpha_release
  alpha_release="$(sed -n 's/^release=//p' <<< "${alpha_info}")"

  local release_date
  release_date="$(git -C "${REPO_ROOT}" show -s --format=%cs "${dev_sha}")" || return 1
  local metadata
  metadata="$(resolve_release_metadata "${dev_sha}" "${release_date}")" \
    || { log "리졸버 실행에 실패했다"; return 1; }
  verify_prerelease_match "${metadata}" "${alpha_release}" || return 1

  local changesets_count
  changesets_count="$(jq -er '.changesets | length' <<< "${metadata}")"

  local versioned=false
  if [[ "${changesets_count}" -gt 0 ]]; then
    log "미소비 changeset ${changesets_count}개 — 버전을 올린다"
    run_changesets_version || { log "changesets version 실행에 실패했다"; return 1; }
    stage_version_bump_changes || { log "버전 변경분을 stage 하지 못했다"; return 1; }

    local dirty_changed_files
    dirty_changed_files="$(mktemp)"
    capture_staged_changed_files "${dirty_changed_files}"
    if [[ ! -s "${dirty_changed_files}" ]]; then
      log "changesets version 이 아무것도 바꾸지 않았다 — 리졸버와 changesets/cli 상태가 어긋난다"
      rm -f "${dirty_changed_files}"
      return 1
    fi
    if ! verify_release_commit_shape "${dirty_changed_files}"; then
      rm -f "${dirty_changed_files}"
      return 1
    fi
    rm -f "${dirty_changed_files}"

    local stable_version
    stable_version="$(jq -er '.stableVersion' <<< "${metadata}")"
    commit_version_bump "${stable_version}" || { log "버전 커밋 생성에 실패했다"; return 1; }
    push_dev || return 1
    dispatch_alpha_deploy || return 1
    versioned=true
  else
    log "미소비 changeset 없음 — 버전 단계를 건너뛴다"
  fi

  local base_versions
  base_versions="$(resolve_versions_at "${MAIN_REF}")" || { log "main 의 버전을 읽지 못했다"; return 1; }
  local base_api_version base_web_version
  base_api_version="$(cut -d' ' -f1 <<< "${base_versions}")"
  base_web_version="$(cut -d' ' -f2 <<< "${base_versions}")"

  local gate_changed_files
  gate_changed_files="$(mktemp)"
  if ! compute_gate_changed_files "${MAIN_REF}" "${DEV_REF}" "${gate_changed_files}"; then
    rm -f "${gate_changed_files}"
    return 1
  fi
  if ! run_promotion_gate "${gate_changed_files}" "${base_api_version}" "${base_web_version}"; then
    log "승격 게이트 실패 — PR 링크를 만들지 않는다"
    rm -f "${gate_changed_files}"
    return 1
  fi
  rm -f "${gate_changed_files}"

  local commit_count new_web_version
  commit_count="$(git -C "${REPO_ROOT}" rev-list --count "${MAIN_REF}..${DEV_REF}")"
  new_web_version="$(git -C "${REPO_ROOT}" show "${DEV_REF}:apps/v1_web/package.json" | jq -er .version)"

  local pr_url
  pr_url="$(find_existing_pr)"
  local is_existing=true
  if [[ -z "${pr_url}" ]]; then
    is_existing=false
    local title body
    title="chore(release): promote Teameet ${new_web_version} to main"
    body="$(build_pr_body "${base_web_version}" "${new_web_version}" "${commit_count}")"
    pr_url="$(build_compare_url "${title}" "${body}")"
  fi

  write_summary "${pr_url}" "${is_existing}" "${base_web_version}" "${new_web_version}" "${commit_count}" "${versioned}"
  log "완료 — ${pr_url}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -Eeuo pipefail
  main "$@"
fi
