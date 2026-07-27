# CI/CD 파이프라인 실측 감사 — 2026-07-27

이 문서는 `CI / Deploy`(`deploy.yml`)와 `Deploy Alpha`(`deploy-alpha.yml`)의 소요 시간을 실제 런에서 측정하고, 그 원인과 조치를 기록한다. 추정이 아니라 GitHub Actions API의 step 타임스탬프가 근거다.

## 1. 측정값 (조치 전)

| 파이프라인 | 총 시간 | 분해 |
|---|---|---|
| PR CI (`Test` job) | 4분 35초 | 유닛 2분 1초 · 빌드체크 50초 · tsc+lint 31초 · 마이그레이션 재생+통합 25초 · 셋업 50초 |
| dev → alpha | 14분 57초 | CI 완료 폴링 대기 4분 30초 + SSM 배포 10분 27초 |
| main → prod | 44분 47초 | Test 4분 35초 + **승인 대기 29분 5초** + 배포 11분 4초 |

`main → prod` 상세 (run `30243190021`)

| 단계 | 구간 | 소요 |
|---|---|---|
| Test job | 06:34:39 → 06:39:14 | 4분 35초 |
| 승인 대기 (`environment: production`) | 06:39:14 → 07:08:19 | **29분 5초** |
| Build and deploy | 07:08:35 → 07:17:59 | 9분 24초 |
| Restart containers | 07:17:59 → 07:19:18 | 1분 19초 |
| Health check | 07:19:18 → 07:19:20 | 2초 |

`Test` job 내부 (run `30253257241`)

| 단계 | 소요 |
|---|---|
| 컨테이너 초기화 + checkout + node + `pnpm install` | 약 50초 (install 자체는 **4초**, 캐시 히트) |
| tsc + lint | 31초 |
| 마이그레이션 재생 + 드리프트 + 통합테스트 | 25초 |
| `v1_api` jest (107 suites / 1281 tests) | **45.99초** |
| `v1_web` vitest | **72.97초** (collect 36.58s + tests 47.39s) |
| `v1_api` nest build | 15초 |
| `v1_web` next build | 34초 (compile 12s + 페이지 생성 22s) |

## 2. 근본 원인

### 2-1. 두 파이프라인이 도커 캐시를 정반대 방향으로 자멸시켰다

`Dockerfile.v1-api`/`Dockerfile.v1-web`는 캐시를 잘 쓰도록 설계돼 있다 — lockfile과 `package.json`을 먼저 COPY하고 `pnpm install`을 실행한 뒤 소스를 COPY하며, pnpm store와 `.next/cache`를 BuildKit 캐시 마운트로 잡는다. 그런데

- **prod**: `docker build --no-cache`로 레이어 캐시를 명시적으로 껐다. 동시에 `buildx prune --filter until=168h`로 캐시를 7일간 보존했다 — 쌓아두고 쓰지 않았다.
- **alpha**: `--no-cache`는 없지만 빌드 직전 `docker image prune -af` + `docker builder prune -af`로 베이스 이미지와 빌드 캐시를 전부 지웠다. 쓸 캐시가 남지 않아 매 배포가 `node:22-alpine` 재다운로드 + 전체 재빌드였다. `deploy.yml`의 주석이 정확히 이 위험을 경고하고 있었는데(`-a` would delete ALL unused images including cached base layers) alpha가 그걸 하고 있었다.

`--no-cache`의 출처는 `0e3b08de` "fix CI/CD cache for reliable deploys"(2026-04-13)다. "배포해도 클라이언트가 옛 자산을 받는" 증상을 고치면서 ① nginx 디스크 캐시 퍼지와 ② `--no-cache`를 **한 커밋에 함께** 넣었다. ①은 지금도 `restart-containers.sh`에 남아 있으므로, ②는 실제 원인이 아닌 산탄총 조치였을 가능성이 높다. 두 변경이 묶여 있어 단정할 수는 없으므로, 제거 후 첫 프로덕션 배포에서 자산 최신성을 확인해야 한다.

### 2-2. prod는 롤백이 불가능하고 alpha는 가능했다 (역전)

| | 이미지 태그 | compose 참조 | 롤백 |
|---|---|---|---|
| prod (조치 전) | `teameet-v1-api` (= `:latest`만) | `teameet-v1-api:latest` | 불가 — 옛 커밋 전체 재빌드 + 승인 게이트 재통과 |
| alpha | `teameet-v1-api:${release_version}` | `${ALPHA_RELEASE_VERSION}` | env 한 줄 + `up -d` |

프로덕션이 더 약한 쪽이었다.

### 2-3. Next.js `actions/cache`가 아무것도 캐싱하지 않았다

캐시 자체는 히트했다(`Cache hit for restore-key: nextjs-v1web-...`). 문제는 담긴 양이 **95,532B**라는 것. Next 16의 `next build`가 `apps/v1_web/.next/cache`를 거의 채우지 않는다. 캐시 키에 커밋 SHA가 들어가 커밋마다 새 엔트리를 만들어, 저장소 캐시 257개 중 **233개가 이 빈 껍데기**였다(개당 92~95KB, 합계 21MB).

### 2-4. 승인 대기가 main 배포 시간의 65%였다

29분 5초. 그런데 그 시간 동안 파이프라인은 아무것도 하지 않았다 — 빌드가 승인 *뒤에* 있었기 때문이다.

## 3. 조치

| 항목 | 변경 | 기대 효과 |
|---|---|---|
| prod 캐시 | `--no-cache` 제거, `--pull` 유지 | 빌드 9분 24초 → 3~4분 |
| alpha 캐시 | 빌드 전 `image prune -af` → `-f`, 빌드 전 `builder prune -af` 제거, 배포 후 `builder prune -af --filter until=24h` → `-f --filter until=168h` | 배포 10분 27초 → 4~5분 |
| prod 이미지 태그 | `:<커밋 SHA>`로 빌드, 승인 후에만 `:latest` 승격, 릴리스 태그 5개 보관 | 롤백 40분 → 1분 |
| 빌드/배포 분리 | `build-images`(승인 전) + `deploy`(승인 후 마이그레이션·재시작) | 승인 후 11분 → 2분 |
| Next 캐시 | `actions/cache` 스텝 제거 | 빈 캐시 엔트리 233개 발생 중단 |
| CI 병렬화 | `Test` → `Gates` / `API` / `Web` 3 job 병렬 | 4분 35초 → 약 2분 55초 (병목은 `Web`) |

`build-images`가 승인 전에 도는 것의 의미: 승인이 거부되면 프로덕션 호스트에 새 소스 트리와 사용되지 않는 `:<sha>` 이미지가 남는다. **DB·실행 중인 컨테이너·`deploy/.env`·`:latest`는 건드리지 않는다.** compose가 참조하는 `:latest`도 승격 전이므로 재부팅되어도 이전 릴리스가 뜬다. 두 job은 concurrency group `deploy-production`을 공유하므로 승인 대기 중인 릴리스가 있으면 다음 릴리스의 빌드도 큐잉된다.

런타임 env 동기화(`deploy/.env` 쓰기)는 **승인 후 `deploy` job**에 있다. 초안에서는 빌드 job에 있었는데, 그러면 승인 전에 프로덕션 런타임 설정이 바뀌어 그 사이 재부팅·수동 `up -d`가 "새 설정 + 옛 이미지" 조합을 띄울 수 있다(PR #207 Copilot 리뷰 지적). 빌드 job은 웹 이미지 빌드 인자로 쓸 값만 GitHub secret에서 직접 디코드하고 `.env`는 읽기만 한다.

릴리스 태그 정리는 빌드 **전후 두 번** 호출한다. 빌드 전 한 번만 하면 이후 새 태그가 추가되어 결과적으로 6개가 남기 때문이다(같은 리뷰 지적). 빌드 전 호출은 디스크 여유 확보, 빌드 후 호출이 정확히 5개로 맞춘다.

CI를 3 job으로 나누면 러너 시간 총합은 4.6분 → 약 6.5분으로 늘지만, 이 저장소는 public이라 Actions 사용량이 무료다.

## 4. 이번에 손대지 않은 것

### M3. `release-main.yml`이 한 번도 실행된 적이 없다 — 미해결

`Prepare Main Release PR` 워크플로는 alpha에 배포된 버전·SHA를 검증한 뒤 Changesets `version` PR을 만드는 공식 main 릴리스 경로다. 실행 이력이 **0건**이다(`gh run list --workflow="Prepare Main Release PR"` → `[]`). main PR은 `gh pr create --base main`으로 수동 생성돼 왔다.

그 결과:

- `.changeset/` 파일 **136개**가 소비되지 않고 누적
- `v1_api`/`v1_web` 버전이 **`0.0.1`** 그대로
- CHANGELOG 파일이 저장소에 **없음**

즉 changeset 게이트는 절반만 구현돼 있다 — CI는 PR마다 changeset 파일을 강제하지만, 그 파일을 소비해 버전을 올리고 CHANGELOG를 만드는 쪽이 작동하지 않는다. alpha가 쓰는 `resolve-changeset-version.mjs`는 파일을 읽기만 하고 소비하지 않으므로 alpha 버전도 계속 `0.1.0-alpha.*`에 머문다.

**필요한 결정**: 릴리스 경로를 살릴 것인지(그러면 136개를 한 번 소비해 버전·CHANGELOG를 만들어야 한다), 아니면 쓰지 않기로 하고 `release-main.yml`과 changeset 강제 게이트를 함께 재설계할 것인지. 지금 상태는 개발자에게 매 PR 비용만 물리고 산출물은 아무도 못 보는 형태다.

### M5. prod는 장기 SSH 사설키, alpha는 OIDC — 미해결

prod 배포는 `EC2_SSH_KEY`(장기 사설키)를 GitHub secret으로 들고 있고, alpha는 `id-token: write` + `configure-aws-credentials`로 OIDC 역할을 assume한다. 보안 모델이 프로덕션 쪽이 더 약하다. 전환에는 AWS IAM 역할·신뢰정책 생성이 필요하다.

### M6. prod는 실사용자 트래픽을 받는 EC2에서 직접 빌드한다

배포 중 서비스 CPU를 빌드가 잠식한다. 근본 개선은 GitHub Actions에서 이미지를 만들어 ECR에 push하고 EC2는 pull만 하는 것이다. 이번 캐시 복구로 빌드 시간·부하가 함께 줄어 증상은 완화되지만 구조는 그대로다.

### M7. `main`·`dev` 모두 브랜치 보호가 없다

`gh api .../branches/{main,dev}/protection` → `404 Branch not protected`. 활성 ruleset은 default branch의 Copilot 리뷰 요구 하나뿐이고 required status check는 없다. dev push는 alpha 실배포로, main push는 prod 배포 큐로 직결되는데 어느 쪽에도 강제 검사가 걸려 있지 않다.

### 기타

- `deploy/`에 구 스택 잔재로 보이는 `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.dev`가 남아 있다.
- E2E는 CI에서 실행되지 않는다.
- alpha의 빌드 전 정리를 dangling 이미지로 좁혔으므로, 디스크 여유는 `[alpha-deploy] ... disk reclaim` 앞뒤의 `df -h` 출력으로 계속 지켜볼 것.
