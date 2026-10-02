# Task 188: Apple JWKS 동시 검증의 진행 중 조회 공유

Status: Review
**Owner**: issue #1531 수정 세션
**Created**: 2026-10-02

## Context
- Refs #1531. [독립 리뷰](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#pullrequestreview-5389472209)는 dev `9a35d05abd32afd16c1becc1e00a5fd4ced2fc99`의 실제 service/nonce/token 코드에서 빈 JWKS 캐시의 두 번째 유효 검증이 401로 실패함을 합성 재현했다.
- `loadKeys`가 시도 시각을 갱신한 뒤 후속 요청은 60초 floor에서 빈 캐시를 반환하여 진행 중 Promise를 공유하지 못한다. 기존 테스트는 순차 조회 횟수만 검증했다.
- Scope: backend 내부 키 캐시와 회귀 테스트. UI, API/DTO/schema, 계정·권한·세션 계약, 실제 Apple/DB/alpha 데이터, 다른 PR, main 승격은 범위 밖이다.

## Goal
키가 필요한 동시 검증은 같은 진행 중 JWKS 조회를 기다리고, 기존 키로 가능한 검증과 보안 거절·조회 제한 계약은 유지한다.

## Original Conditions (must all be satisfied)
- [x] 빈 캐시의 동시 유효 토큰은 조회 1회로 모두 성공한다.
- [x] 알려진 캐시 키는 진행 중인 키 교체 조회에 불필요하게 대기하지 않는다.
- [x] 실패 시 floor, 12시간 TTL, unknown kid 재시도, nonce/서명/audience/issuer/기간 검증을 유지한다.
- [ ] 최소 수정·명시 pathspec 커밋·전용 브랜치 push·Ready/dev PR·정확한 head CI를 기록한다.
- [ ] 실제 alpha 배포와 승인된 재검증 전 이슈를 종료하지 않는다.

## User Scenarios
### Scenario 1: 동시 Apple 로그인
1. 빈 캐시에서 각각 유효한 nonce와 서명을 가진 두 요청이 겹친다.
2. JWKS 조회 완료 후 둘 다 자신의 검증된 subject를 받는다. 조회는 한 번이다.
### Scenario 2: 키 교체 / Apple 장애
새 kid 검증은 진행 중 갱신을 공유한다. 아직 신뢰 가능한 기존 캐시 키 검증은 즉시 처리한다. 빈 캐시의 조회 실패는 일반 401이며 floor 이후 정상 응답으로 복구된다.

## Test Scenarios
### Happy path
- [x] 실제 Nest DI service + 실제 RS256·nonce 검증: cold-cache sign-in/sign-in, sign-in/token-exchange 동시 성공.
- [x] 키 교체와 TTL 만료 시 진행 중 조회 공유; 알려진 캐시 키의 즉시 검증.
### Edge cases
- [x] 조회 1회, 후속 캐시 검증, floor 이후 재시도 및 inFlight 해제.
### Error paths
- [x] JWKS 503의 동시 요청 모두 거절, floor 내 추가 조회 없음, 이후 복구.
- [x] 잘못된 서명/audience/nonce와 미게시 kid는 동일 일반 401, 내부 reason 유지.
- [x] 갱신 장애 중 기존 캐시 키의 유효 토큰 검증 유지.
### Mock data updates needed
- 합성 RSA 키·토큰은 테스트 프로세스 메모리에서만 생성한다. JWKS 네트워크/시간만 대체하며 실제 verifier/nonce 코드는 대체하지 않는다. DB/API fixture 변경 없음.

## Parallel Work Breakdown
- Backend owned: `apps/v1_api/src/auth/apple-identity.service.ts`, 동일 `*.spec.ts`, 이 task, `.changeset/apple-jwks-concurrency.md`.
- Frontend/Infra: 변경 없음. QA 세션은 원 이슈 및 별도 승인된 alpha 재검증을 담당한다.
- Sequential: RED → 최소 수정 → 관련 단위/정적/aggregate 검사 → pathspec 커밋 → Ready/dev PR → 정확한 head CI.
- Forbidden: 다른 세션 worktree, 계정/팀/가입/QA179 명단/완료 QA 결과, 실제 Apple·DB 변경, main·merge·deploy.

## Acceptance Criteria
- [x] Original Conditions의 코드·로컬 검사 항목 충족.
- [x] RED/GREEN, 관련 Apple 검증/인증 회귀, v1_api lint, 필수 aggregate checks 통과.
- [ ] 커밋/PR diff scope와 원격 head CI 확인.
- [ ] 독립 코드 리뷰 결과 및 실제 alpha 잔여 검증을 분리 기록.
- [ ] 원 이슈 전체 수용 조건·alpha 배포/재검증 기록 후에만 종료 판단.

## Tech Debt Resolved
- floor와 진행 중 조회 공유의 순서 결함, 유효 동시 검증을 놓친 service 테스트 공백.

## Security Notes
- 가용성/정합성 결함이며 인증 우회를 확인한 것은 아니다. HMAC nonce, RS256, audience/issuer/기간/subject 검증 및 일반 401 계약을 변경하지 않는다.
- 합성 비밀 키·JWT·nonce를 파일/로그/PR에 저장하거나 출력하지 않는다. 실제 Apple endpoint, 계정 또는 DB 요청 없음.
- 기존 refresh-token 저장의 subject/audience 대조 및 로그인 throttling/세션 발급 계약 유지.

## Risks & Dependencies
- 실제 iOS/Apple 로그인·HTTP route·계정/DB 통합·alpha before/after는 이번 합성 검증 범위 밖이다. 화면 결함이 아니므로 UI viewport와 이미지는 적용되지 않는다.
- alpha 검증은 별도 승인된 배포 후 수행한다. PR 링크는 Refs #1531이며 이슈는 열어 둔다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-02 | 수정 세션 | 진행 중 조회를 무조건 먼저 기다릴 것인가? | fresh 캐시에 필요한 키가 있으면 즉시 처리하고, 갱신이 필요한 요청만 floor 앞에서 공유한다. |

## Progress Snapshot
- Base: fresh origin/dev `9a35d05abd32afd16c1becc1e00a5fd4ced2fc99`.
- Worktree: `/tmp/teameet-issue-1531-20261002`; branch: `fix/issue-1531-apple-jwks-concurrency`.
- 원 리뷰 합성 JSON 파일 존재 및 현재 v1 원인 일치 확인. 동시성 수정 전 service suite는 **7 FAIL / 8 PASS**(28.081초): sign-in/exchange 및 키 교체의 후속 요청 실패, TTL 만료의 조기 완료, 잘못된 토큰의 reason이 `unknown_key`로 가려짐.
- 수정 후 service/token/nonce **3 suite 48 PASS**(28.388초). 추가 auth/token-storage **2 suite는 공유 생성 Prisma 타입의 기존 `providerRefreshTokenCiphertext` 누락으로 컴파일 차단**; 공유 의존성을 수정하지 않고 현재 v1 스키마로 `/tmp/teameet-1531-prisma/client`에 전용 클라이언트를 생성하여 해당 2 suite만 재실행, **28 PASS**(12.111초). 합계 **5 suite 76 PASS**; service 자체 **15 PASS**(기존 5 + 새 10).
- Node 24.19.0, Jest unit `--runInBand --runTestsByPath`; 로그는 `/tmp/teameet-1531-{red,green,auth-green}.log`. 새 토큰·키는 메모리에서만 생성하며 값은 출력하지 않는다. 실제 Apple/HTTP route/계정/DB/alpha 통합 검증은 하지 않았다.
- preflight: 12 cores, load 20.46~43.85, swap 약 6.5~7.2 GiB, Node 228~270/browser 59~69. 사용자 명시 진행 지침에 따라 직렬 최소 worker. Docker `ps`는 API 500이며 이 테스트는 Docker/DB 없이 실행. 테스트/generator PID 48267/53128/65975/70460(시작 PPID 26624)을 추적하고 완료를 확인했다. 다른 세션 프로세스는 종료하지 않았다.
- v1_api lint(`tsc --noEmit` + surface check) PASS. 필수 aggregate 6개(android-play-policy, v1-db-guardrails, production-deploy-security, compose-service-parity, alpha-seed-runtime, alpha-immutable-deploy) 및 Changeset policy PASS. touched-path marker 검색 0건, `git diff --check` PASS.
- lint/aggregate PID 72856/80234(시작 PPID 26624)의 종료를 확인했다. 전용 dependency 링크를 커밋 전 회수한다. 임시 생성물과 로그는 `/tmp`에만 있으며 제품 diff에 포함하지 않는다.
- pathspec 커밋·Ready/dev PR·정확한 원격 head CI와 독립 리뷰는 후속 단계이며 PR 기록에서 결과를 갱신한다. 실제 alpha 재검증 전 issue #1531은 열어 둔다.
