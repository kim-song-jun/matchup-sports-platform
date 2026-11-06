#!/usr/bin/env bash
#
# scripts/release/promote-main.sh 의 계약 테스트. curl/gh/pnpm 을 가짜 함수로 덮어써
# 외부 호출을 흉내내고, git 은 실제 bare 저장소 쌍(main/dev)에 대해 그대로 돌린다 —
# 게이트·diff·push 실패 같은 성질은 진짜 git 이라야 의미가 있다. git 함수는 push 의
# refspec 만 기록하는 얇은 래퍼라, 어떤 경로에서도 dev 로 push 하지 않는지 검증한다.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly RESOLVER="${ROOT_DIR}/scripts/release/resolve-changeset-version.mjs"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

source "${ROOT_DIR}/scripts/release/promote-main.sh"

export GITHUB_REPOSITORY='octo/teameet-fixture'
export ALPHA_URL='https://alpha.example.invalid'

fail() {
  echo "[test-promote-main] $*" >&2
  exit 1
}

# ── 픽스처 ────────────────────────────────────────────────────────────────

write_package_json() {
  local dir="$1" name="$2" version="$3"
  mkdir -p "${dir}"
  printf '{\n  "name": "%s",\n  "version": "%s",\n  "private": true\n}\n' "${name}" "${version}" > "${dir}/package.json"
}

seed_repo() {
  local dir="$1" version="$2"
  write_package_json "${dir}/apps/v1_api" v1_api "${version}"
  write_package_json "${dir}/apps/v1_web" v1_web "${version}"
  mkdir -p "${dir}/.changeset"
  cat > "${dir}/.changeset/config.json" <<JSON
{
  "fixed": [["v1_api", "v1_web"]],
  "privatePackages": { "version": true, "tag": true },
  "changelog": "@changesets/cli/changelog",
  "baseBranch": "dev"
}
JSON
  printf '# Changesets\n' > "${dir}/.changeset/README.md"
  printf '# v1_api\n' > "${dir}/apps/v1_api/CHANGELOG.md"
  printf '# v1_web\n' > "${dir}/apps/v1_web/CHANGELOG.md"
  # 실제 저장소는 pnpm workspaces 라 항상 lockfile 이 있다 — stage_version_bump_changes 가
  # 그 경로를 pathspec 으로 받으므로 픽스처에도 있어야 한다(없으면 git add 가 fatal 로 죽는다).
  printf 'lockfileVersion: fixture\n' > "${dir}/pnpm-lock.yaml"
}

# bare origin + 작업 클론(dev 체크아웃) 쌍을 만든다. "<origin>\n<work>" 를 출력한다.
make_repo_pair() {
  local version="$1"
  local seed origin work
  seed="$(mktemp -d)"
  origin="$(mktemp -d)"
  work="$(mktemp -d)"
  git init -q -b main "${seed}"
  seed_repo "${seed}" "${version}"
  ( cd "${seed}" && git add -A && git -c user.email=t@local -c user.name=fixture commit -qm 'seed: main' )
  git init -q --bare -b main "${origin}"
  ( cd "${seed}" && git remote add origin "${origin}" && git push -q origin main )
  rm -rf "${seed}"
  git clone -q "${origin}" "${work}"
  ( cd "${work}" && git checkout -q -b dev && git push -q -u origin dev )
  printf '%s\n%s\n' "${origin}" "${work}"
}

add_pending_changeset() {
  local work="$1" name="$2" package="$3" bump="$4"
  cat > "${work}/.changeset/${name}.md" <<CS
---
"${package}": ${bump}
---

fixture changeset.
CS
  ( cd "${work}" && git add -A && git -c user.email=t@local -c user.name=fixture commit -qm "changeset: ${name}" )
}

# changesets version 을 실제로 돌리지 않고, 그 커밋이 남기는 결과물 모양(매니페스트 bump +
# CHANGELOG 갱신 + changeset 소비)만 재현해 "이미 한 번 release 된 dev" 상태를 만든다.
apply_release_commit() {
  local work="$1" new_version="$2" tmp
  ( cd "${work}"
    for pkg in v1_api v1_web; do
      tmp="$(mktemp)"
      jq --arg v "${new_version}" '.version = $v' "apps/${pkg}/package.json" > "${tmp}"
      mv "${tmp}" "apps/${pkg}/package.json"
      printf '\n## %s\n\n- fixture release\n' "${new_version}" >> "apps/${pkg}/CHANGELOG.md"
    done
    find .changeset -maxdepth 1 -name '*.md' ! -name README.md -delete
    git add -A
    git -c user.email=t@local -c user.name=fixture commit -qm "chore(release): version Teameet ${new_version}"
    git push -q origin dev
  )
}

resolve_expected_field() {
  local work="$1" field="$2" sha date
  sha="$(git -C "${work}" rev-parse HEAD)"
  date="$(git -C "${work}" show -s --format=%cs HEAD)"
  node "${RESOLVER}" --repo "${work}" --sha "${sha}" --date "${date}" | jq -r ".${field}"
}

resolve_expected_release() { resolve_expected_field "$1" prereleaseVersion; }
resolve_expected_stable() { resolve_expected_field "$1" stableVersion; }

# origin 에 같은 이름의 낡은 버전 브랜치(이전 실행의 잔재, 현재 dev 와 갈라진 이력)를 심는다.
seed_stale_version_branch() {
  local origin="$1" branch="$2" other
  other="$(mktemp -d)"
  git clone -q "${origin}" "${other}"
  ( cd "${other}" && git checkout -q -b "${branch}" main
    echo stale > STALE.md
    git add -A && git -c user.email=o@local -c user.name=other commit -qm 'stale version branch'
    git push -q origin "${branch}" )
  rm -rf "${other}"
}

# ── 가짜 외부 명령 (curl/gh/pnpm) ─────────────────────────────────────────

FAKE_ALPHA_RELEASE=''
FAKE_ALPHA_SHA=''
curl() {
  printf 'HTTP/2 200\r\nx-teameet-release: %s\r\nx-teameet-commit: %s\r\n' \
    "${FAKE_ALPHA_RELEASE}" "${FAKE_ALPHA_SHA}"
}

# gh 는 명령 치환($(...)) 서브셸 안에서 불리므로 호출 기록은 변수가 아니라 파일에 남긴다.
readonly FAKE_GH_LOG="${TEST_ROOT}/gh-calls.log"
readonly FAKE_GIT_PUSH_LOG="${TEST_ROOT}/git-pushes.log"
FAKE_GH_PR_LIST_MAIN_OUTPUT=''     # `pr list --base main` (dev→main PR) 응답
FAKE_GH_PR_LIST_VERSION_OUTPUT=''  # `pr list --base dev` (버전 PR) 응답
FAKE_GH_PR_CREATE_URL='https://github.com/octo/teameet-fixture/pull/9100'
FAKE_GH_PR_CREATE_FAIL=0
gh() {
  local flat="$*"
  printf '%s\n' "${flat//$'\n'/ }" >> "${FAKE_GH_LOG}"
  case "$1 $2" in
    'pr list')
      local arg prev='' base=''
      for arg in "$@"; do
        [[ "${prev}" == --base ]] && base="${arg}"
        prev="${arg}"
      done
      case "${base}" in
        main) printf '%s' "${FAKE_GH_PR_LIST_MAIN_OUTPUT}" ;;
        dev) printf '%s' "${FAKE_GH_PR_LIST_VERSION_OUTPUT}" ;;
      esac
      ;;
    'pr create')
      [[ "${FAKE_GH_PR_CREATE_FAIL}" -eq 0 ]] || { echo 'fake gh: pr create refused' >&2; return 1; }
      printf '%s\n' "${FAKE_GH_PR_CREATE_URL}"
      ;;
    *) : ;;
  esac
}

# push 호출만 기록하고 나머지는 진짜 git 으로 넘긴다. 기록은 capture_main 이 켠다.
git() {
  local arg
  if [[ -n "${FAKE_GIT_PUSH_ENABLED:-}" ]]; then
    for arg in "$@"; do
      if [[ "${arg}" == push ]]; then
        printf '%s\n' "$*" >> "${FAKE_GIT_PUSH_LOG}"
        break
      fi
    done
  fi
  command git "$@"
}

FAKE_PNPM_CALLS=0
FAKE_PNPM_VERSION_OVERRIDE=''
FAKE_PNPM_KEEP_CHANGESETS=0
pnpm() {
  FAKE_PNPM_CALLS=$((FAKE_PNPM_CALLS + 1))
  local api_version new_version tmp
  api_version="$(jq -r .version apps/v1_api/package.json)"
  new_version="$(awk -F. '{printf "%d.%d.%d", $1, $2, $3+1}' <<< "${api_version}")"
  new_version="${FAKE_PNPM_VERSION_OVERRIDE:-${new_version}}"
  for pkg in v1_api v1_web; do
    tmp="$(mktemp)"
    jq --arg v "${new_version}" '.version = $v' "apps/${pkg}/package.json" > "${tmp}"
    mv "${tmp}" "apps/${pkg}/package.json"
    printf '\n## %s\n\n- fixture release\n' "${new_version}" >> "apps/${pkg}/CHANGELOG.md"
  done
  if [[ "${FAKE_PNPM_KEEP_CHANGESETS}" -eq 0 ]]; then
    find .changeset -maxdepth 1 -name '*.md' ! -name README.md -delete
  fi
}

reset_fakes() {
  FAKE_ALPHA_RELEASE=''
  FAKE_ALPHA_SHA=''
  FAKE_GH_PR_LIST_MAIN_OUTPUT=''
  FAKE_GH_PR_LIST_VERSION_OUTPUT=''
  FAKE_GH_PR_CREATE_FAIL=0
  : > "${FAKE_GH_LOG}"
  : > "${FAKE_GIT_PUSH_LOG}"
  FAKE_PNPM_CALLS=0
  FAKE_PNPM_VERSION_OVERRIDE=''
  FAKE_PNPM_KEEP_CHANGESETS=0
}

# main 을 직접(서브셸 없이) 실행해 stdout+stderr 를 파일로 모은다. `out="$(main 2>&1)"` 처럼
# 명령 치환을 쓰면 그 자체가 서브셸이라, main 안에서 가짜 pnpm/gh 가 늘리는 카운터 변수가
# 거기서 사라진다 — 그래서 리다이렉션만 쓰고 종료 코드는 if 로 받아 set -e 를 우회한다.
capture_main() {
  local out_file
  out_file="$(mktemp)"
  FAKE_GIT_PUSH_ENABLED=1
  if main > "${out_file}" 2>&1; then
    rc=0
  else
    rc=$?
  fi
  FAKE_GIT_PUSH_ENABLED=''
  out="$(cat "${out_file}")"
  rm -f "${out_file}"
}

# 이 실행이 한 모든 push 의 대상 ref(refspec 의 `:` 뒤)를 한 줄씩 낸다.
recorded_push_targets() {
  sed -E 's/.* //; s/^[^:]*://' "${FAKE_GIT_PUSH_LOG}"
}

# ── (a) alpha 가 dev 최신을 아직 반영하지 않음 → 실패, summary 없음 ─────────
test_alpha_mismatch() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-a.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA='0000000000000000000000000000000000000000'
  FAKE_ALPHA_RELEASE='0.4.1-alpha.20260101.g000000000000'

  local out rc=0
  capture_main
  [[ "${rc}" -ne 0 ]] || fail "(a) alpha SHA mismatch 인데 main 이 성공했다"
  [[ "${out}" == *"alpha 배포가 dev 최신을 아직 반영하지 않았다"* ]] || fail "(a) 예상 메시지가 없다: ${out}"
  [[ ! -s "${GITHUB_STEP_SUMMARY}" ]] || fail "(a) 실패했는데 summary 에 내용이 쓰였다"
  [[ "${FAKE_PNPM_CALLS}" -eq 0 ]] || fail "(a) 초기 검증에 실패했는데 버전 단계가 실행됐다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (a) alpha mismatch -> fail: OK"
}

# ── (b) prereleaseVersion 불일치 → 실패 ─────────────────────────────────────
test_prerelease_mismatch() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-b.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE='9.9.9-alpha.20260101.gdeadbeefcafe'

  local out rc=0
  capture_main
  [[ "${rc}" -ne 0 ]] || fail "(b) prerelease mismatch 인데 main 이 성공했다"
  [[ "${out}" == *"alpha 가 서빙 중인 버전"* ]] || fail "(b) 예상 메시지가 없다: ${out}"
  [[ "${FAKE_PNPM_CALLS}" -eq 0 ]] || fail "(b) prerelease mismatch 인데 버전 단계가 실행됐다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (b) prerelease mismatch -> fail: OK"
}

# ── (c) 미소비 changeset 0개 → 버전 단계 건너뛰고 PR 링크 출력 ─────────────
test_no_changeset_skips_version() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" temp-one v1_api patch
  apply_release_commit "${work}" 1.0.0

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-c.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"

  local out rc=0
  capture_main
  [[ "${rc}" -eq 0 ]] || fail "(c) changeset 0 케이스가 실패했다: ${out}"
  [[ "${FAKE_PNPM_CALLS}" -eq 0 ]] || fail "(c) changeset 0 인데 버전 단계가 실행됐다"
  [[ "${out}" == *"Verified main release promotion"* ]] || fail "(c) 승격 게이트가 돌지 않았다: ${out}"
  grep -q 'compare/main...dev' "${GITHUB_STEP_SUMMARY}" || fail "(c) PR 링크가 summary 에 없다"
  ! grep -q -e 'pr create' -e 'workflow' "${FAKE_GH_LOG}" || fail "(c) 버전 단계가 없는데 gh 가 PR 생성/워크플로를 호출했다: $(cat "${FAKE_GH_LOG}")"
  [[ ! -s "${FAKE_GIT_PUSH_LOG}" ]] || fail "(c) push 가 일어났다: $(cat "${FAKE_GIT_PUSH_LOG}")"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (c) changeset 0 -> skip version, print link: OK"
}

# ── (d) changeset 있음 → version 커밋을 release/version-<v> 로 push, dev 대상 PR 을 열고 멈춘다 ──
test_changeset_present_opens_version_pr() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" pending-one v1_api patch

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-d.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"
  local stable branch before_head before_dev after_head out rc=0
  stable="$(resolve_expected_stable "${work}")"
  branch="release/version-${stable}"
  # 이전 실행이 남긴, dev 와 갈라진 같은 이름의 브랜치 — 봇 전용이라 덮어써야 한다.
  seed_stale_version_branch "${origin}" "${branch}"
  before_head="$(git -C "${work}" rev-parse HEAD)"
  before_dev="$(git -C "${origin}" rev-parse dev)"

  capture_main
  [[ "${rc}" -eq 0 ]] || fail "(d) changeset 있는 케이스가 실패했다: ${out}"
  [[ "${FAKE_PNPM_CALLS}" -eq 1 ]] || fail "(d) changesets version 이 정확히 한 번 호출되지 않았다 (실측 ${FAKE_PNPM_CALLS})"

  after_head="$(git -C "${work}" rev-parse HEAD)"
  [[ "${after_head}" != "${before_head}" ]] || fail "(d) 버전 커밋이 만들어지지 않았다"
  [[ "$(git -C "${work}" log -1 --format=%s "${after_head}")" == "chore(release): version Teameet ${stable}" ]] \
    || fail "(d) 커밋 메시지가 release 커밋 형태가 아니다"
  [[ "$(git -C "${work}" log -1 --format=%an "${after_head}")" == 'github-actions[bot]' ]] \
    || fail "(d) 버전 커밋 작성자가 github-actions[bot] 이 아니다"
  [[ ! -e "${work}/.changeset/pending-one.md" ]] || fail "(d) changeset 이 소비(삭제)되지 않았다"

  # push 는 정확히 한 번, 대상은 버전 브랜치뿐이다 — dev 는 어떤 방식으로도 건드리지 않는다.
  [[ "$(recorded_push_targets)" == "refs/heads/${branch}" ]] \
    || fail "(d) push 대상이 ${branch} 하나가 아니다 (실측: $(recorded_push_targets | tr '\n' ' '))"
  [[ "$(git -C "${origin}" rev-parse "${branch}")" == "${after_head}" ]] || fail "(d) 낡은 버전 브랜치를 덮어쓰지 못했다"
  [[ "$(git -C "${origin}" rev-parse dev)" == "${before_dev}" ]] || fail "(d) origin/dev 가 움직였다"

  grep -E -q "^pr create .*--base dev .*--head ${branch} " "${FAKE_GH_LOG}" \
    || fail "(d) gh pr create 가 --base dev --head ${branch} 로 호출되지 않았다: $(cat "${FAKE_GH_LOG}")"
  grep -q -- "--repo ${GITHUB_REPOSITORY} " "${FAKE_GH_LOG}" || fail "(d) gh 호출에 --repo 가 없다"
  grep -q -e "--title chore(release): version Teameet ${stable} " "${FAKE_GH_LOG}" || fail "(d) PR 제목이 버전 커밋 제목과 다르다"
  ! grep -q '^workflow' "${FAKE_GH_LOG}" || fail "(d) gh workflow 를 호출했다"
  ! grep -q -e '--base main' "${FAKE_GH_LOG}" || fail "(d) 버전 단계에서 승격 PR 조회까지 갔다"

  [[ "${out}" != *"Verified main release promotion"* ]] || fail "(d) 버전 PR 실행에서 승격 게이트가 돌았다"
  grep -q "${FAKE_GH_PR_CREATE_URL}" "${GITHUB_STEP_SUMMARY}" || fail "(d) 버전 PR URL 이 summary 에 없다"
  grep -q '다시 실행' "${GITHUB_STEP_SUMMARY}" || fail "(d) 머지 뒤 재실행 안내가 summary 에 없다"
  ! grep -q 'compare/main...dev' "${GITHUB_STEP_SUMMARY}" || fail "(d) 버전 PR 실행에서 dev→main 링크를 남겼다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (d) changeset present -> version branch + PR to dev, no dev push, no gate: OK"
}

# ── (d1) 같은 버전의 열린 버전 PR 이 이미 있음 → 아무것도 만들지 않고 그 URL 만 남긴다 ──
test_open_version_pr_reused() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" pending-one v1_api patch

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-d1.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"
  FAKE_GH_PR_LIST_VERSION_OUTPUT='https://github.com/octo/teameet-fixture/pull/9002'
  local stable before_head before_dev out rc=0
  stable="$(resolve_expected_stable "${work}")"
  before_head="$(git -C "${work}" rev-parse HEAD)"
  before_dev="$(git -C "${origin}" rev-parse dev)"

  capture_main
  [[ "${rc}" -eq 0 ]] || fail "(d1) 열린 버전 PR 이 있는 케이스가 실패했다: ${out}"
  grep -E -q "^pr list .*--base dev .*--head release/version-${stable} " "${FAKE_GH_LOG}" \
    || fail "(d1) 버전 PR 조회가 --base dev --head release/version-${stable} 로 가지 않았다: $(cat "${FAKE_GH_LOG}")"
  ! grep -q '^pr create' "${FAKE_GH_LOG}" || fail "(d1) 열린 PR 이 있는데 PR 을 또 만들었다"
  [[ ! -s "${FAKE_GIT_PUSH_LOG}" ]] || fail "(d1) 열린 PR 이 있는데 push 했다: $(cat "${FAKE_GIT_PUSH_LOG}")"
  [[ "${FAKE_PNPM_CALLS}" -eq 0 ]] || fail "(d1) 열린 PR 이 있는데 버전 단계가 실행됐다"
  [[ "$(git -C "${work}" rev-parse HEAD)" == "${before_head}" ]] || fail "(d1) 열린 PR 이 있는데 커밋했다"
  [[ -e "${work}/.changeset/pending-one.md" ]] || fail "(d1) 열린 PR 이 있는데 changeset 을 소비했다"
  [[ "$(git -C "${origin}" rev-parse dev)" == "${before_dev}" ]] || fail "(d1) origin/dev 가 움직였다"
  grep -q 'pull/9002' "${GITHUB_STEP_SUMMARY}" || fail "(d1) 기존 버전 PR URL 이 summary 에 없다"
  [[ "${out}" != *"Verified main release promotion"* ]] || fail "(d1) 승격 게이트가 돌았다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (d1) open version PR reused: no commit/push/create: OK"
}

# ── (d2) gh pr create 실패 → 비 0 종료 + 원인 로그, summary 는 비어 있다 ──
test_pr_create_failure() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" pending-one v1_api patch

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-d2.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"
  FAKE_GH_PR_CREATE_FAIL=1
  local stable out rc=0
  stable="$(resolve_expected_stable "${work}")"

  capture_main
  [[ "${rc}" -ne 0 ]] || fail "(d2) gh pr create 가 실패했는데 main 이 성공했다"
  [[ "${out}" == *"버전 PR 생성에 실패했다"* ]] || fail "(d2) 원인 로그가 없다: ${out}"
  [[ "${out}" == *"release/version-${stable}"* ]] || fail "(d2) 어느 브랜치가 이미 push 됐는지 안내가 없다: ${out}"
  [[ "${out}" == *"fake gh: pr create refused"* ]] || fail "(d2) gh 의 stderr 가 로그에서 사라졌다: ${out}"
  [[ "$(git -C "${origin}" rev-parse "release/version-${stable}")" == "$(git -C "${work}" rev-parse HEAD)" ]] \
    || fail "(d2) PR 생성 전에 버전 브랜치가 push 되지 않았다"
  [[ ! -s "${GITHUB_STEP_SUMMARY}" ]] || fail "(d2) PR 생성 실패인데 summary 에 내용이 남았다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (d2) pr create failure -> nonzero with cause: OK"
}

# ── (d3) 버전 브랜치 push 실패 → PR 을 만들지 않고 비 0 종료 ──
# 의도: 브랜치 없는 PR 시도(=푸시 실패를 삼킨 채 진행)를 막는다.
test_version_branch_push_failure() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" pending-one v1_api patch
  printf '#!/bin/sh\necho "rejected by fixture hook" >&2\nexit 1\n' > "${origin}/hooks/pre-receive"
  chmod +x "${origin}/hooks/pre-receive"

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-d3.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"

  local out rc=0
  capture_main
  [[ "${rc}" -ne 0 ]] || fail "(d3) push 가 거부됐는데 main 이 성공했다"
  [[ "${out}" == *"브랜치를 push 하지 못했다"* ]] || fail "(d3) 원인 로그가 없다: ${out}"
  ! grep -q '^pr create' "${FAKE_GH_LOG}" || fail "(d3) push 가 실패했는데 PR 을 만들려 했다"
  [[ ! -s "${GITHUB_STEP_SUMMARY}" ]] || fail "(d3) push 실패인데 summary 에 내용이 남았다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (d3) version branch push failure -> no PR, nonzero: OK"
}

# ── (e) 승격 게이트 실패 → 링크 없이 실패 ───────────────────────────────────
test_gate_failure_blocks_link() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 2.0.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  # dev 의 release 커밋이 main 보다 **낮은** 버전으로 남는다 — package.json 내용이 실제로
  # 달라야 changed-files 목록에 잡히고(같은 값이면 diff 자체가 비어 게이트가 아예 안 돈다),
  # 그 상태에서 "버전이 전진하지 않았다"는 실제 거부 사유를 재현한다.
  add_pending_changeset "${work}" temp-one v1_api patch
  apply_release_commit "${work}" 1.0.0

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-e.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"

  local out rc=0
  capture_main
  [[ "${rc}" -ne 0 ]] || fail "(e) 버전이 전진하지 않았는데 main 이 성공했다"
  [[ "${out}" == *"승격 게이트 실패"* ]] || fail "(e) 예상 실패 메시지가 없다: ${out}"
  [[ ! -s "${GITHUB_STEP_SUMMARY}" ]] || fail "(e) 게이트 실패인데 summary 에 PR 링크가 남았다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (e) gate failure -> no link, fail: OK"
}

# ── (f) 이미 열린 PR 이 있으면 그 URL 을 그대로 쓴다 ───────────────────────
test_existing_pr_reused() {
  reset_fakes
  local pair origin work
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" temp-one v1_api patch
  apply_release_commit "${work}" 1.0.0

  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE GITHUB_STEP_SUMMARY="${TEST_ROOT}/summary-f.md"
  : > "${GITHUB_STEP_SUMMARY}"
  FAKE_ALPHA_SHA="$(git -C "${work}" rev-parse HEAD)"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"
  FAKE_GH_PR_LIST_MAIN_OUTPUT='https://github.com/octo/teameet-fixture/pull/9001'

  local out rc=0
  capture_main
  [[ "${rc}" -eq 0 ]] || fail "(f) 기존 PR 이 있는 케이스가 실패했다: ${out}"
  grep -q 'https://github.com/octo/teameet-fixture/pull/9001' "${GITHUB_STEP_SUMMARY}" \
    || fail "(f) 기존 PR URL 이 summary 에 없다"
  grep -q 'compare/main...dev' "${GITHUB_STEP_SUMMARY}" && fail "(f) 기존 PR 이 있는데 compare 링크를 새로 만들었다"

  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] (f) existing PR reused: OK"
}

test_alpha_mismatch
test_prerelease_mismatch
test_no_changeset_skips_version
test_changeset_present_opens_version_pr
test_open_version_pr_reused
test_pr_create_failure
test_version_branch_push_failure
test_gate_failure_blocks_link
test_existing_pr_reused

test_prepare_only() {
  reset_fakes
  local pair origin work before_head before_main before_dev before_index
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" pending-prepare v1_api patch
  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE
  if main --prepare-only > "${TEST_ROOT}/prepare-denied.log" 2>&1; then
    fail 'prepare-only must refuse dev'
  fi
  [[ "${FAKE_PNPM_CALLS}" -eq 0 ]] || fail 'protected branch changed files'
  git -C "${work}" checkout -qb fix/prepare-fixture
  before_head="$(git -C "${work}" rev-parse HEAD)"
  before_main="$(git -C "${origin}" rev-parse main)"
  before_dev="$(git -C "${origin}" rev-parse dev)"
  before_index="$(git -C "${work}" write-tree)"
  FAKE_ALPHA_SHA="${before_head}"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"
  printf 'preserve this WIP\n' > "${work}/unrelated-wip.txt"
  if main --prepare-only > "${TEST_ROOT}/prepare-dirty-denied.log" 2>&1; then
    fail 'prepare-only must refuse untracked WIP'
  fi
  grep -q 'requires a clean worktree' "${TEST_ROOT}/prepare-dirty-denied.log" || fail 'dirty-tree refusal missing'
  [[ "${FAKE_PNPM_CALLS}" -eq 0 ]] || fail 'dirty-tree refusal consumed changesets'
  [[ -e "${work}/.changeset/pending-prepare.md" ]] || fail 'dirty-tree refusal deleted changeset'
  rm "${work}/unrelated-wip.txt"
  main --prepare-only > "${TEST_ROOT}/prepare.log" 2>&1 || fail "prepare-only failed: $(cat "${TEST_ROOT}/prepare.log")"
  [[ "${FAKE_PNPM_CALLS}" -eq 1 && ! -s "${FAKE_GH_LOG}" ]] || fail "prepare-only called gh ($(cat "${FAKE_GH_LOG}"))"
  [[ "$(git -C "${work}" rev-parse HEAD)" == "${before_head}" ]] || fail 'prepare-only committed'
  [[ "$(git -C "${origin}" rev-parse dev)" == "${before_dev}" ]] || fail 'prepare-only pushed dev'
  [[ "$(git -C "${origin}" rev-parse main)" == "${before_main}" ]] || fail 'prepare-only changed main'
  [[ "$(git -C "${work}" write-tree)" == "${before_index}" ]] || fail 'prepare-only staged'
  [[ ! -e "${work}/.changeset/pending-prepare.md" ]] || fail 'prepare-only did not consume changesets'
  grep -q 'Verified main release promotion' "${TEST_ROOT}/prepare.log" || fail 'prepare-only skipped gate'
  rm -rf "${origin}" "${work}"
  echo '[test-promote-main] prepare-only -> release diff, unchanged index/refs, no gh call: OK'
}

test_prepare_only

test_prepare_failure() {
  local failure_kind="$1" pair origin work before_head before_index before_dev before_main
  reset_fakes
  pair="$(make_repo_pair 0.4.0)"
  origin="$(sed -n 1p <<< "${pair}")"
  work="$(sed -n 2p <<< "${pair}")"
  add_pending_changeset "${work}" pending-failure v1_api patch
  git -C "${work}" checkout -qb fix/prepare-failure
  export REPO_ROOT="${work}" CONFIRMATION=PROMOTE
  before_head="$(git -C "${work}" rev-parse HEAD)"
  before_index="$(git -C "${work}" write-tree)"
  before_dev="$(git -C "${origin}" rev-parse dev)"
  before_main="$(git -C "${origin}" rev-parse main)"
  FAKE_ALPHA_SHA="${before_head}"
  FAKE_ALPHA_RELEASE="$(resolve_expected_release "${work}")"
  if [[ "${failure_kind}" == version ]]; then
    FAKE_PNPM_VERSION_OVERRIDE=9.9.9
  else
    FAKE_PNPM_KEEP_CHANGESETS=1
  fi
  if main --prepare-only > "${TEST_ROOT}/prepare-failure-${failure_kind}.log" 2>&1; then
    fail "prepare-only ${failure_kind} failure returned success"
  fi
  if [[ "${failure_kind}" == version ]]; then
    grep -q 'Changesets output does not match' "${TEST_ROOT}/prepare-failure-${failure_kind}.log" || fail 'version refusal missing'
  else
    grep -q 'must not contain unreleased Changesets' "${TEST_ROOT}/prepare-failure-${failure_kind}.log" || fail 'real promotion gate refusal missing'
  fi
  grep -q 'retry in a fresh isolated worktree' "${TEST_ROOT}/prepare-failure-${failure_kind}.log" || fail 'failure recovery guidance missing'
  [[ "${FAKE_PNPM_CALLS}" -eq 1 && ! -s "${FAKE_GH_LOG}" ]] || fail "failure called gh ($(cat "${FAKE_GH_LOG}"))"
  [[ "$(git -C "${work}" rev-parse HEAD)" == "${before_head}" ]] || fail 'failure committed'
  [[ "$(git -C "${work}" write-tree)" == "${before_index}" ]] || fail 'failure staged'
  [[ "$(git -C "${origin}" rev-parse dev)" == "${before_dev}" ]] || fail 'failure pushed dev'
  [[ "$(git -C "${origin}" rev-parse main)" == "${before_main}" ]] || fail 'failure changed main'
  [[ "$(jq -r .version "${work}/apps/v1_api/package.json")" != 0.4.0 ]] || fail 'diagnostic diff was erased'
  rm -rf "${origin}" "${work}"
  echo "[test-promote-main] prepare-only ${failure_kind} failure -> nonzero, preserved diff/refs, no gh call: OK"
}

test_prepare_failure version
test_prepare_failure gate

echo "[test-promote-main] all scenarios passed"
