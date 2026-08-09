---
"v1_api": patch
---

alpha 배포에 로컬 dangling 이미지 정리를 추가해 EC2 디스크가 배포마다 차오르던 문제를
고친다.

alpha 는 ECR 에서 digest 로 이미지를 pull 한다(`alpha-manifest-common.sh` 의
`images.*.uri` 가 `repository@sha256:...` 형태) — 로컬 저장소에는 태그가 붙지 않고
이전 릴리스 이미지가 그대로 `<none>` 태그의 dangling 이미지로 남는다. `deploy-prod.sh` 에는
매 배포 끝에 `docker image prune -f` 가 있었지만 `deploy-alpha.sh` 에는 동일 로직이 없었고,
실제로 EC2 루트 볼륨이 28G/30G 까지 차서 배포와 (재-pull 에 의존하는) 롤백이 함께
"no space left on device" 로 실패했다(2026-08).

- `alpha-release-common.sh` 에 `prune_stale_alpha_images()` 추가, `deploy-alpha.sh` 가
  릴리스 healthy 확인·promote 이후에 논-fatal 로 호출한다(`deploy-prod.sh` 와 동일 정책 —
  정리 실패가 배포를 실패시키지 않는다). 롤백을 깨지 않는 이유: alpha 롤백(자동 트랩 경로
  `restore_active_release`, 수동 `rollback-alpha.sh` 둘 다)은 로컬 이미지 캐시를 전혀
  참조하지 않고 항상 `pull_release_images()` 로 ECR 에서 digest 를 재-pull 한다. dangling
  필터는 태그 유무만 보고 컨테이너 참조 여부는 반영하지 않지만, `docker image prune` 의
  실제 삭제 로직은 컨테이너가 참조 중인(현재 active) 이미지는 건너뛴다 — `-a` 는 쓰지
  않는다.
- preflight 로그에 디스크 여유(`disk_available_kib`)를 추가하고, 3GiB 미만이면 배포를
  막는다. 이 시점은 이미 릴리스 소스가 전환된 뒤라 ERR 트랩(`restore_active_release`)이
  안전하게 되감으며, 디스크가 위험 수준인 채로 이미지 pull·DB 쓰기까지 진행하다 더 나쁜
  지점(복구용 재-pull 도 실패하는 지점)에서 죽는 것보다 여기서 막는 편이 안전하다고
  판단했다.
- `scripts/qa/test-alpha-image-gc.sh` 추가: 정리 함수의 호출 인자(`-f`, `-a` 아님) ·
  docker 실패 전파 · 실제 사고 시나리오(active/previous/legacy 태그 이미지 각각 생존·삭제
  여부) · `deploy-alpha.sh` 안에서 healthy 확인 뒤에만 호출되는지를 검증한다. CI(`deploy.yml`)
  에 매 push 마다 돌도록 등록.
