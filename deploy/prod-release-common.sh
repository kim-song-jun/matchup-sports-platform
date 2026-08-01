#!/usr/bin/env bash
# 프로덕션 릴리스 이미지 관리 헬퍼.
#
# `.github/workflows/deploy.yml` 의 build-images job 이 이 파일을 source 한다.
# Sync code 스텝이 저장소 전체를 ~/teameet 로 rsync 한 뒤에 실행되므로 호스트에 존재한다.
#
# 워크플로 YAML 안의 heredoc 에 함수를 직접 적어 두면 테스트할 방법이 없다 — 그래서
# main push 때만 도는 경로의 버그가 몇 주씩 발견되지 않았다(아래 참조). alpha 가
# deploy/alpha-*-common.sh + scripts/qa/test-alpha-release-state.sh 로 쓰는 것과 같은
# 구조로 분리해 scripts/qa/test-prod-release-prune.sh 가 실제로 호출할 수 있게 한다.

# 릴리스 태그를 `keep` 개까지만 남긴다. 예전에는 dangling 이미지만 정리해도 됐지만
# 이제 커밋 SHA 로 태그를 붙이므로 정리하지 않으면 디스크가 찬다.
# `:latest` 는 마지막 '승인된' 배포를 가리키므로 절대 지우지 않는다.
prune_stale_release_tags() {
  local repo="$1"
  local keep="$2"

  # 여기서 grep -v 를 쓰면 안 된다. grep 은 출력이 한 줄도 없으면 exit 1 이고,
  # 이 함수를 부르는 원격 스크립트는 `set -euo pipefail` 로 돈다 — 즉 "지울 게 없다"는
  # 지극히 정상적인 상태가 배포 전체를 중단시킨다.
  #
  # 2026-08-01 에 실제로 그렇게 터졌다. 프로덕션 호스트에는 SHA 태그가 하나도 없고
  # `:latest` 뿐이었으므로 grep -v 가 전부 걸러내 exit 1 → 배포 실패.
  # 게다가 이 상태는 스스로 풀리지 않는다: 빌드가 막혀 SHA 태그가 영영 생기지 않으니
  # 이후 모든 프로덕션 배포가 같은 지점에서 죽는 교착이 된다.
  #
  # awk 는 일치하는 줄이 없어도 0 을 반환하므로 실패 모드 자체가 사라진다.
  # docker images 자체가 실패하는 경우는 pipefail 이 그대로 잡는다 — 진짜 오류를
  # 덮는 `|| true` 와는 다르다.
  sudo docker images --filter "reference=${repo}:*" \
      --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' \
    | awk -F'|' -v latest="${repo}:latest" '$2 != latest' \
    | sort -r \
    | awk -F'|' -v keep="${keep}" 'NR > keep { print $2 }' \
    | while IFS= read -r stale_image; do
        echo "[cleanup] dropping stale release tag ${stale_image}"
        sudo docker rmi "${stale_image}" >/dev/null 2>&1 || true
      done
}
