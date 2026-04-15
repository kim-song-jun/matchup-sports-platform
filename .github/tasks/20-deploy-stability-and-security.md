# 20 — Deploy Stability & Security Hardening (P1)

> **Parent plan**: `/Users/kimsungjun/.claude/plans/enumerated-scribbling-popcorn.md`
> **Wave**: 3 (P1, P0 task 17/18/19 머지 후 시작)
> **Owner**: 병렬 (infra-devops-dev: deploy + infra-security-dev: 가드 + backend-data-dev: e2e fixture)
> **Status**: completed
> **Estimated PRs**: 1 (deploy + security + e2e 묶어서, infra 디렉토리 위주라 충돌 적음)
> **Blocked by**: task 17 (DB migration이 같은 deploy 사이클에 들어가야 검증 가능)

---

## Context

P0 fix들이 머지된 후, 사용자 영향은 없지만 운영 안정성·보안·테스트 신뢰도를 갉아먹는 부채들을 한번에 정리한다. Phase 0 사전 조사 결과:

| # | 부채 | 증상 | 위험 |
|---|------|------|------|
| W1a | Prisma migrate가 컨테이너 boot CMD에서 실행 | deploy 시 race, 실패 시 부분 적용 | 데이터 손상 가능 |
| W1b | `seed-images` sync가 `\|\| echo "[WARN]"`로 fail-soft | 이미지 동기화 실패 무음 | 사용자에게 빈 이미지 노출 |
| W1c | Healthcheck가 단순 curl localhost | 컨테이너가 살아있어도 DB 끊겨도 통과 | 가짜 healthy |
| W2a | `auth.service.ts:120,124,253-261`에서 OAuth 키 부재 시 `mockSocialProfile()` | NODE_ENV 가드 없음 | prod에서 가짜 로그인 가능 |
| W2b | `payments.service.ts:46,56,209,234-248`에서 Toss 키 부재 시 `mockConfirm/Refund` | 동일 | 가짜 결제 |
| W3 | E2E `team-manager-membership.spec.ts` 5개 test.skip | 시드 ID가 placeholder면 자동 skip | 팀 멤버십 회귀 미가동 |
| W5 | `apps/api/tsconfig.json` strict 부분만 설정 | 새 코드에 implicit any 잠재 | 타입 안전성 약화 |

이 task는 W1, W2, W3, W5를 묶어서 한 PR로 처리. **W4 (AI 매칭 알고리즘)는 범위 외**, 별도 spec task로 분리.

## Goal

- 배포가 race-free, fail-loud
- 환경변수 누락 시 prod 부팅 실패 (fail fast)
- E2E 회귀 100% 가동
- API tsconfig strict mode 통과

## Original Conditions

- [ ] migration이 deploy job 단계에서 명시적으로 실행 (boot CMD에서 분리)
- [ ] seed-images 실패 시 deploy 중단 (또는 명시적 알림)
- [ ] healthcheck가 DB 연결까지 검증
- [ ] OAuth/Toss 키 부재 시 prod에서 mock fallback 안 됨
- [ ] e2e team-manager-membership 5개 케이스 가동
- [ ] api tsconfig `strict: true`

---

## Track A — Deploy Stability (W1)

> Wave 3A, Owner: infra-devops-dev

### Phase 20.A1 — 현황 파악

- [ ] **A1.1** `.github/workflows/deploy.yml` 전체 read → 다음 식별:
  - [ ] migration이 어디서 실행? (workflow step or container CMD)
  - [ ] seed-images sync 명령 위치 + fail-soft 패턴
  - [ ] healthcheck 명령 위치
- [ ] **A1.2** `deploy/Dockerfile.api` read → CMD/ENTRYPOINT에 prisma migrate 포함 여부
- [ ] **A1.3** `deploy/docker-compose*.yml` read (가능한 경우 — 사용자 권한 필요할 수 있음. 우선 메타데이터만 확인)
- [ ] **A1.4** `Makefile` deploy target read

### Phase 20.A2 — Migration 분리

- [ ] **A2.1** Dockerfile CMD에서 prisma migrate 제거 (있다면) → 순수 nest start만 남김
- [ ] **A2.2** Deploy workflow에 별도 step 추가:
  ```yaml
  - name: Run database migrations
    run: |
      docker compose -f deploy/docker-compose.prod.yml run --rm api \
        npx prisma migrate deploy
  ```
  → app start 전 단계로 배치
- [ ] **A2.3** Migration 실패 시 deploy 중단 (set -e or step `if: failure()`)
- [ ] **A2.4** Rollback 가이드 추가: 최근 migration이 실패하면 어떻게 되돌리는지 README 또는 deploy.yml 주석

### Phase 20.A3 — Seed-Images Fail-Loud

- [ ] **A3.1** `\|\| echo "[WARN]"` 패턴을 찾아 다음 중 하나로 교체:
  - [ ] **Strict**: 실패 시 step fail (`set -e` 보장)
  - [ ] **Notify**: GitHub Actions의 `::warning::` 마커로 출력 + Slack 알림 (Slack webhook 있으면)
- [ ] **A3.2** sync가 idempotent한지 확인 (재실행 안전)
- [ ] **A3.3** sync 대상 디렉토리/버킷 명시 (주석)

### Phase 20.A4 — Healthcheck 강화

- [ ] **A4.1** `apps/api/src/health/health.controller.ts` (또는 `app.controller.ts`의 `/health`) read
- [ ] **A4.2** 현재 응답 구조 확인 → 단순 `{ ok: true }`이면 다음 추가:
  ```ts
  @Get('/health')
  async health() {
    const dbOk = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = await this.redis.ping().then(() => true).catch(() => false);
    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      checks: { db: dbOk, redis: redisOk },
      timestamp: new Date().toISOString(),
    };
  }
  ```
- [ ] **A4.3** Deploy workflow의 healthcheck 명령을 단순 curl → JSON 검증으로 강화:
  ```bash
  curl -fsS http://localhost:8100/api/v1/health | jq -e '.checks.db == true and .checks.redis == true'
  ```
- [ ] **A4.4** Docker compose healthcheck (있다면)도 동일 강화

### Acceptance Track A
- [ ] migration이 deploy step으로 분리됨
- [ ] seed-images 실패가 visible
- [ ] /health가 DB+Redis 검증
- [ ] deploy workflow 로컬 dry run 또는 PR-only branch에서 동작 확인

---

## Track B — Mock Fallback Guards (W2)

> Wave 3B, Owner: infra-security-dev

### Phase 20.B1 — Auth Service

- [ ] **B1.1** `apps/api/src/auth/auth.service.ts:120, 124, 253-261` read → `mockSocialProfile()` 호출 컨텍스트 파악
- [ ] **B1.2** OAuth 키 환경변수 명단 확인 (KAKAO_CLIENT_ID, NAVER_CLIENT_ID, APPLE_CLIENT_ID, ...)
- [ ] **B1.3** 가드 패턴 결정 — 두 가지 옵션:

  **Option 1: 호출 시점 가드**
  ```ts
  private mockSocialProfile(provider: string): SocialProfile {
    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(
        `OAuth credentials missing for ${provider} in production`
      );
    }
    return { ... };
  }
  ```

  **Option 2: 부팅 시 fail-fast (권장)**
  ```ts
  // auth.module.ts or app.module.ts OnModuleInit
  onModuleInit() {
    if (process.env.NODE_ENV === 'production') {
      const required = ['KAKAO_CLIENT_ID', 'NAVER_CLIENT_ID', ...];
      const missing = required.filter(k => !process.env[k]);
      if (missing.length) {
        throw new Error(`Missing OAuth env: ${missing.join(', ')}`);
      }
    }
  }
  ```
- [ ] **B1.4** **Option 2 채택** (fail-fast가 더 안전 — 부팅 자체가 실패하므로 prod 트래픽이 잘못된 상태로 흐르지 않음)
- [ ] **B1.5** dev/test에서는 mock 허용 유지 (NODE_ENV !== 'production'일 때)

### Phase 20.B2 — Payments Service

- [ ] **B2.1** `apps/api/src/payments/payments.service.ts:46, 56, 209, 234-248` read → `mockConfirm`, `mockRefund` 컨텍스트
- [ ] **B2.2** Toss 키 환경변수 명단 (TOSS_SECRET_KEY, TOSS_CLIENT_KEY, ...)
- [ ] **B2.3** 동일하게 OnModuleInit 또는 module-level 가드
- [ ] **B2.4** dev에서 결제 흐름 테스트 가능하도록 mock 유지

### Phase 20.B3 — 검증 & 테스트

- [ ] **B3.1** `apps/api/src/auth/auth.service.spec.ts`에 다음 케이스 추가:
  - [ ] NODE_ENV=development + 키 없음 → mock 반환
  - [ ] NODE_ENV=production + 키 없음 → throw
  - [ ] NODE_ENV=production + 키 있음 → 정상 동작 (모킹 OAuth 응답)
- [ ] **B3.2** payments도 동일
- [ ] **B3.3** integration: NODE_ENV=production으로 실제 부팅 시도 → 실패 확인 (스크립트로)

### Acceptance Track B
- [ ] OAuth/Toss 키 누락 시 prod 부팅 실패
- [ ] dev/test에서는 기존 동작 유지
- [ ] tests 통과

---

## Track C — E2E Skip 해제 (W3)

> Wave 3C, Owner: backend-data-dev (fixture 강화) + e2e 담당

### Phase 20.C1 — Skip 원인 파악

- [ ] **C1.1** `e2e/tests/team-manager-membership.spec.ts:64, 76, 96, 150, 173` read → skip 조건 식별 (각 line이 placeholder-team-id 체크)
- [ ] **C1.2** `e2e/global-setup.ts` read → 시드가 어떻게 team을 만들고 ID를 저장하는지 확인
- [ ] **C1.3** placeholder-team-id가 발생하는 시나리오:
  - [ ] 시드 데이터에 팀이 없음 → 픽스처 누락
  - [ ] 시드는 했지만 ID 추출 실패 → 코드 버그

### Phase 20.C2 — 시드 강화

- [ ] **C2.1** `apps/api/test/fixtures/teams.ts` 또는 e2e 시드에 owner/manager/member 멤버십이 정확히 포함된 팀 확실히 생성
- [ ] **C2.2** `e2e/global-setup.ts`에서 생성된 팀의 ID를 storageState 또는 env로 e2e 테스트에 전달
- [ ] **C2.3** team-manager-membership.spec.ts에서 ID 참조 코드 수정 (placeholder 분기 제거)

### Phase 20.C3 — Skip 제거 & 통과

- [ ] **C3.1** 5개 test.skip → test로 변경
- [ ] **C3.2** 로컬 e2e 실행:
  ```bash
  cd e2e && npx playwright test team-manager-membership
  ```
- [ ] **C3.3** 전부 통과 확인

### Acceptance Track C
- [ ] team-manager-membership.spec.ts에 skip 0
- [ ] 5개 케이스 모두 pass
- [ ] global-setup이 안정적으로 팀 ID 제공

---

## Track D — API tsconfig Strict (W5)

> Wave 3D, Owner: backend-api-dev, 다른 track과 병렬

### Phase 20.D1 — Strict 활성화

- [ ] **D1.1** `apps/api/tsconfig.json` 현재 strict 관련 설정 확인
- [ ] **D1.2** `"strict": true`로 변경 (개별 플래그 제거)
- [ ] **D1.3** `pnpm --filter @teameet/api exec tsc --noEmit` 실행 → 신규 에러 카운트

### Phase 20.D2 — 에러 fix

- [ ] **D2.1** 에러를 카테고리별로 분류:
  - [ ] `strictNullChecks`: null/undefined 누락
  - [ ] `strictFunctionTypes`: 함수 시그니처 불일치
  - [ ] `strictPropertyInitialization`: 클래스 필드 초기화
  - [ ] `noImplicitThis`: this 타입 누락
- [ ] **D2.2** 각 카테고리 fix
- [ ] **D2.3** 에러 개수가 너무 많으면 (>50) follow-up task로 분리하고 본 task에서는 strict 활성화만 + `// @ts-expect-error TODO(task-N)` 임시 마커

### Phase 20.D3 — 회귀

- [ ] **D3.1** `tsc --noEmit` clean
- [ ] **D3.2** unit + integration + e2e 통과

### Acceptance Track D
- [ ] tsconfig strict: true
- [ ] tsc 에러 0 (또는 expect-error로 명시 + follow-up)

---

## User Scenarios

이 task는 사용자 노출 영향이 거의 없음 (운영/보안). 시나리오는 운영자/배포 관점:

### Happy
- 운영자가 deploy 트리거 → migration → seed → app start → healthcheck 통과
- 새 PR 머지 → CI lint/typecheck/test/e2e 모두 통과 (e2e 5개 추가 가동)

### Edge
- migration 실패 → deploy 중단, 이전 버전 유지
- seed-images 부분 실패 → workflow warning, 운영자 notified
- 환경변수 누락된 채 prod 부팅 시도 → 즉시 부팅 실패 (no traffic served)

### Error
- DB 연결 실패 → /health가 `degraded` 반환 → 외부 monitor 알람
- OAuth 키 잘못된 값 → OAuth provider 응답 에러 → 일반 에러 처리

---

## Test Scenarios

| Track | 종류 | 케이스 | 위치 |
|-------|------|--------|------|
| A | Edge | migration 실패 시뮬 | manual workflow dispatch |
| A | Happy | healthcheck JSON 검증 | curl + jq |
| B | Happy | NODE_ENV=dev + 키 없음 → mock | unit |
| B | Error | NODE_ENV=production + 키 없음 → throw | unit + boot test |
| C | Happy | 5개 멤버십 케이스 | e2e |
| D | Build | strict tsc | typecheck |

---

## Parallel Work Breakdown

| Wave | Track | Phase | Owner | 병렬 가능 |
|------|-------|-------|-------|-----------|
| 3 | A (deploy) | A1-A4 | infra-devops-dev | B/C/D와 병렬 |
| 3 | B (security) | B1-B3 | infra-security-dev | A/C/D와 병렬 |
| 3 | C (e2e) | C1-C3 | backend-data-dev | A/B/D와 병렬 |
| 3 | D (tsconfig) | D1-D3 | backend-api-dev | A/B/C와 병렬 |

4개 track 모두 file 영역이 다름 → 동시 머지 가능. 단 D는 다른 backend track의 코드를 건드릴 수 있음 (strict 에러 fix 시) → 최종 conflict resolution은 마지막에.

**Do NOT touch (다른 task 영역)**:
- `apps/web/**` (task 18 hooks fix와 task 19 image-upload UI가 cover)
- `apps/api/src/team-matches/**` (task 17)
- `apps/api/src/admin/**` (task 19)

---

## Acceptance Criteria

- [ ] Track A: deploy.yml 4개 변경 (migration 분리, seed loud, healthcheck JSON, /health 강화) + dry run 통과
- [ ] Track B: OAuth/Toss prod 가드, dev 동작 유지, tests 통과
- [ ] Track C: 5개 e2e skip 제거 + pass
- [ ] Track D: api tsconfig strict + tsc clean
- [ ] 4개 track 모두 다른 task 파일 영역 침범 없음
- [ ] CI 전체 green

## Tech Debt Resolved

- W1: deploy race + fail-soft + 약한 healthcheck
- W2: mock fallback의 prod 누출 위험
- W3: e2e 멤버십 회귀 미가동
- W5: API tsconfig 부분 strict

W4(AI 매칭)는 별도 task — 본 task 범위 외.

## Security Notes

- **Track B의 가드는 보안 핵심**. NODE_ENV=production에서 OAuth/결제 mock이 동작하면 인증 우회 + 가짜 결제가 가능 → 즉시 부팅 실패가 안전한 기본값
- migration step 분리는 데이터 무결성 보호
- /health 강화는 DoS/모니터링 정확도 향상
- 모든 변경에 대해:
  - [ ] 하드코딩 시크릿 없음
  - [ ] 시스템 경계 입력 검증 (해당 없음 — 내부 변경)
  - [ ] 신규 엔드포인트 auth/authz (해당 없음 — /health는 public 유지)
  - [ ] CVE 점검: 이 task에서 신규 패키지 추가 없음

## Risks & Dependencies

- **R1**: deploy.yml 변경 후 첫 실제 배포 시 새 race condition 발견 가능 → fallback: 이전 boot CMD 옵션을 주석으로 보존
- **R2**: tsconfig strict로 다른 모듈에 대량 에러 → 별도 task로 분리 옵션
- **R3**: e2e 시드 강화가 다른 e2e suite를 깨뜨릴 수 있음 → 전체 e2e 회귀 필수
- **R4**: NODE_ENV 가드가 staging 환경 (NODE_ENV=staging)에서 어떻게 동작? → 'production'만 strict, 'staging'은 dev처럼 mock 허용 (또는 별도 처리). 명시적 결정 필요
- **D1**: blocked by task 17 (DB migration 분리가 task 17의 새 migration 적용 후 검증 가능)
- **D2**: 다른 task와 file overlap 없음

## Ambiguity Log

- **Q1**: staging 환경의 mock 정책? → MVP는 production에서만 strict, staging은 dev처럼 동작
- **Q2**: deploy.yml 변경을 PR로 검증할 방법? → workflow_dispatch + manual approval로 dry run
- **Q3**: tsconfig strict 마이그레이션 전략? → 본 task에서 활성화 + 첫 100건만 fix, 나머지 expect-error → follow-up
- **Q4**: e2e team membership 픽스처가 다른 spec과 공유? → fixture 단일 정의 후 spec별 import
- **Q5**: healthcheck를 readiness/liveness로 분리? → MVP는 단일 /health, 분리는 follow-up
