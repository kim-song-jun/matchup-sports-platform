---
"v1_api": patch
---

alpha 게임 오퍼레이션 워커가 도입 이래 한 번도 기동하지 못하던 결함을 고친다.

`docker-compose.alpha.yml` 의 워커 서비스는 전용 이미지를 빌드하지 않고 API 이미지를
그대로 재사용한다(`alpha-release-common.sh` 의 `assert_running_release_digests` 가
`running_worker_image == ALPHA_API_IMAGE` 를 단언한다). 그런데 `command` 는 실제로는
어떤 CI/배포 경로에서도 빌드되지 않는 `deploy/v1-game-operations-worker.Dockerfile`
(`--rootDir src` 로 컴파일해 `dist/jobs/...` 를 만든다)의 CMD 를 그대로 복사한 값이었다.
API 이미지는 저장소 `tsconfig.json`(`include` 에 `prisma`·`test` 포함 → 공통 루트가
`apps/v1_api/`)으로 컴파일돼 `dist/src/...` 레이아웃을 가지므로, 워커는
`MODULE_NOT_FOUND` 로 무한 재시작 상태였다.

- `command` 를 `dist/src/jobs/v1-game-operations-worker.main.js` 로 정정 (API 본체의
  `CMD ["node", "dist/src/main.js"]` 와 같은 규칙)
- 한 번도 빌드되지 않는 `build:` 블록과 `deploy/v1-game-operations-worker.Dockerfile`
  제거 — 잘못된 경로를 다시 복사해 오게 만드는 원인이었다
- `wait_for_alpha_worker_healthy` 게이트 추가: `assert_running_release_digests` 는
  `.Config.Image` 만 읽어 재시작 루프를 정상으로 통과시켰고, 그래서 워커가 죽은 채로
  배포가 계속 "성공" 으로 보고됐다. 크래시 루프 컨테이너는 healthcheck 를 통과할 수
  없으므로 health 상태를 직접 확인한다. rollback/restore 경로에는 걸지 않는다 —
  워커가 깨진 구버전으로 되돌리는 것 자체를 막으면 장애 대응 경로가 사라진다.
