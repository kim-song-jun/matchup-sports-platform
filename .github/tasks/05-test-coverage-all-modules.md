# Task 05 — Full-Platform Isolated Test Coverage

Owner: project-director + tech-planner (consolidated)
Date drafted: 2026-04-06
Status: Draft — awaiting user approval before Stage 2 (Build)

---

## Context

Phase 1-5에서 in-memory mock → Prisma 전환, 팀 멤버십 권한 다층 방어, 채팅 영속화, FCM 토큰까지 핵심 도메인 모델이 안정화되었다. 그러나 백엔드 19개 도메인 모듈 중 service spec은 11개뿐이고, 프론트엔드 Vitest 7개, E2E 6개로 도메인 커버리지가 비대칭이다. 두 개의 미적용 마이그레이션(`20260405000000_add_team_membership_and_mercenary`, `20260406000000_add_chat_persistence_and_fcm_tokens`)이 PostgreSQL 오프라인을 이유로 deferred 상태인데, 이는 Core Principle #1(Resolve Tech Debt — Never Defer) 위반이다.

이번 작업은 (1) 미적용 마이그레이션을 즉시 적용하고, (2) 역할 기반 페르소나를 정의해 격리형 fixture로 주입한 뒤, (3) 백엔드/프론트/E2E 3계층에서 전 도메인 회귀 안전망을 구축한다. Phase 1-5의 권한·영속화 변경이 회귀 없이 동작함을 자동으로 증명할 수 있어야 다음 Phase로 진입할 수 있다.

## Goal

- 두 개의 미적용 마이그레이션이 로컬 PostgreSQL에 적용되어 `prisma migrate status`가 클린.
- 백엔드 19개 도메인 모듈 모두가 service에 1개 이상의 `*.spec.ts`를 가진다.
- 프론트엔드 핵심 hook/store/page/component가 Vitest로 검증된다.
- Playwright E2E는 6개 역할 기반 신규 시나리오 그린 (기존 6개와 합쳐 12개 이상).
- 모든 테스트는 자체 fixture를 주입하고 종료 시 cleanup. `prisma/seed.ts`는 수정하지 않는다.
- `pnpm --filter api test`, `pnpm --filter api test:integration`, `pnpm --filter web test`, `npx playwright test` 모두 첫 실행 그린.
- CI 가정: locale/timezone 독립 (`TZ=UTC`, `ko_KR` + `en_US` 양쪽 OK).

## Original Conditions (verbatim)

- [ ] 사용자 시나리오를 역할별로 만든다 (임의 생성 계정 포함)
- [ ] 모든 백엔드 모듈에 대해 Jest unit test 작성/보강
- [ ] 프론트엔드 unit test (Vitest) 작성/보강
- [ ] E2E test (Playwright) 작성/보강 — e2e 기본 + unit 포함
- [ ] 데이터는 **격리형**(테스트 셋업 주입, 끝나면 cleanup)
- [ ] `seed.ts`에 영구 추가 **금지**
- [ ] PostgreSQL 마이그레이션 직접 적용 (`docker compose up -d` + `prisma migrate deploy`)

## User Personas

| Key | 이메일 (e2e+ prefix) | 닉네임 | Role | 특징 / 등장 시나리오 |
|-----|---------------------|--------|------|---------------------|
| `sinaro` | e2e+sinaro@test.local | 시나로 | user | 일반 회원. 매칭 참가, 용병 신청, 장터 구매, 강좌 수강, 분쟁 제기 |
| `teamOwner` | e2e+owner@test.local | 팀장오너 | user | 팀 생성자. owner 멤버십, 팀 매칭 호스트, 팀 삭제 권한 |
| `teamManager` | e2e+manager@test.local | 매니저 | user | owner가 승격. 멤버 초대/추방/role 변경(member만) |
| `teamMember` | e2e+member@test.local | 일반팀원 | user | 일반 멤버. mutation 시 403 검증 |
| `mercenaryHost` | e2e+merchost@test.local | 용병호스트 | user | 다른 팀 owner. 용병 공고 게시·승인 |
| `admin` | e2e+admin@test.local | 관리자 | admin | `/admin/*` 전 엔드포인트, 정산, 분쟁 처리 |
| `lessonInstructor` | e2e+instructor@test.local | 강사 | user | 강좌 개설, 티켓 검수, 출석 관리 |
| `marketSeller` | e2e+seller@test.local | 판매자 | user | 장터 listing 게시, 에스크로 정산 수혜 |

페르소나는 **단일 소스 오브 트루스** — `apps/api/test/fixtures/personas.ts`에 정의하고 E2E는 동일 객체를 재사용. dev-login으로 토큰 발급 (OAuth 외부 호출 금지).

## User Scenarios (도메인별)

- **Auth**: sinaro 가입 → 로그인 → refresh → `/auth/me` → 탈퇴. dev-login은 NODE_ENV=test에서만, production 차단 회귀 케이스.
- **Users**: sinaro 프로필 수정, `/users/me/matches`, 공개 프로필 조회. `passwordHash` 응답 누락 보안 회귀 1건.
- **Teams**: teamOwner 팀 생성 → teamManager 승격 → teamMember 초대 → member mutation 403 → owner 팀 삭제.
- **Team Membership 권한**: manager가 다른 manager 강등 시도 → 403 (owner only).
- **개인 매칭**: teamOwner 매치 생성 → sinaro 참가 → 결제(mock) → 팀 편성 → complete → 리뷰.
- **팀 매칭**: teamOwner 공고 → mercenaryHost 팀 신청 → 양측 승인 → check-in → 결과 → 평가 → TeamTrustScore 누적.
- **용병**: mercenaryHost 공고 → sinaro 신청 → 호스트 수락 → 상태 확인 → 취소 케이스.
- **장터**: marketSeller listing → sinaro 주문 → 에스크로 prepare → confirm → 정산 대기.
- **강좌**: lessonInstructor 개설 → sinaro 티켓 구매 → 출석 체크 → 잔여 차감.
- **채팅**: 매칭 채팅방 → 송수신 영속화 → 재조회 순서 보장.
- **결제**: Toss SDK 모킹 → prepare/confirm/refund 상태 머신.
- **정산**: admin이 settlements 조회 → process → 상태 전이.
- **분쟁**: sinaro 분쟁 제기 → admin 처리.
- **리뷰/뱃지**: 종료 후 양측 리뷰 → 평점 갱신 → 6항목 trust. 뱃지 자동 부여 + 중복 방지.
- **구장**: venues 목록/상세/스케줄/리뷰.
- **알림**: notifications 생성 → FCM 모킹 → 읽음.
- **실시간**: RealtimeGateway JWT 핸드셰이크 + `emitToUser` 호출 단위 검증. (실제 Socket.IO E2E는 Out of Scope — Known Blocker.)
- **관리자**: stats 7종, mutation, AdminGuard 비-admin 거부.
- **Health**: `/health` 200.

## Acceptance Criteria

**Backend**
- 19개 도메인 모두 service에 spec.ts 존재 (기존 11 + 신규 8: admin, auth, badges, disputes, marketplace, payments, settlements, users). 각 spec에 happy + 권한 거부 + 에러 케이스 최소 1개씩.
- `apps/api/test/integration/`에 Supertest 통합 4종: auth-flow, matches-flow, team-matches-flow, payments-flow.
- `passwordHash` 응답 누락 회귀 테스트 포함 (보안).

**Frontend**
- Vitest 신규 6개 이상: `useMyTeams`, `useRequireAuth`, `useApi` 핵심 mutation 훅 1~2개, `EmptyState`/`ErrorState`/`Modal` 컴포넌트, 1개 admin 또는 `my/*` 페이지.
- MSW 기반 네트워크 모킹.

**E2E**
- 신규 6 시나리오: `sinaro-signup`, `team-owner-flow`, `team-manager-membership`, `member-join-match`, `mercenary-flow`, `admin-dashboard`.
- `e2e/global-setup.ts`로 fixture 주입, 페르소나별 `storageState` 저장.
- `globalTeardown`으로 `e2e+` prefix 사용자/관련 데이터 cleanup.

**격리 & 마이그레이션**
- 각 spec `beforeAll`에서 `truncateAll` → fixture 주입, `seed.ts` 미변경.
- 마이그레이션 2개 적용, `prisma migrate status` 클린.
- Jest `--runInBand`로 api 패키지 실행 (schema-per-worker는 향후 작업).

**Validation Gates**
1. `docker compose up -d`
2. `cd apps/api && pnpm prisma migrate deploy`
3. `cd apps/api && pnpm test`
4. `cd apps/api && pnpm test:integration`
5. `cd apps/web && pnpm test`
6. `npx playwright test`
7. `pnpm lint` + `pnpm -r exec tsc --noEmit`

## Parallel Work Breakdown

**Sequential prerequisite**: I3 (DB 기동) → B4 (migrate deploy)

**Backend (backend-dev)** — 병렬
- **B1**: `apps/api/test/helpers/{db-cleanup,auth-token,nest-app,prisma-test-client}.ts`, `apps/api/test/fixtures/{personas,teams,matches,team-matches,mercenary,marketplace,payments,lessons}.ts`, `jest-global-setup.ts`, `jest-global-teardown.ts`, `jest.config.js` projects 분리(unit vs integration).
- **B2**: 누락 8개 service spec 작성 — admin, auth, badges, disputes, marketplace, payments, settlements, users. (realtime gateway 단위 spec 1개 포함, health smoke 1개 포함.)
- **B3**: Supertest 통합 4종 — auth, matches, team-matches, payments.
- **B4**: 마이그레이션 적용 + `TossPaymentsClient` 인터페이스 추출(결제 모킹 가능성 확보).

**Frontend (frontend-dev)** — 병렬
- **F1**: MSW 셋업 (`apps/web/src/test/msw/{server,handlers}.ts` + `setupTests` 등록).
- **F2**: Vitest 신규 6~10개 (훅/컴포넌트/페이지).

**Infra (infra-dev)** — 병렬
- **I1**: `e2e/global-setup.ts` + `e2e/global-teardown.ts` + `e2e/fixtures/test-users.ts` + `playwright.config.ts` storageState projects.
- **I2**: 6개 역할 E2E 시나리오 작성.
- **I3**: `docker compose up -d` + 헬스체크 + 마이그레이션 검증 (B4와 공동).
- **I4**: 루트 `package.json`의 `test:all` 스크립트, `apps/api/package.json` `test:integration` 스크립트.

## Tech Approach

**DB 격리**: (A) truncate + per-suite fixture 채택. 이유: NestJS `$transaction`과 충돌 없음, 서비스 코드 침습 없음. 헬퍼 `truncateAll(prisma)` — `pg_tables` 조회 후 `_prisma_migrations` 제외 전 테이블 `TRUNCATE ... RESTART IDENTITY CASCADE`. Jest `globalSetup`에서 `migrate deploy` + 초기 truncate, `globalTeardown`에서 최종 truncate. api 패키지는 `--runInBand`.

**통합 테스트 격리**: unit과 별도 Jest project (`test/integration/jest.config.js`). `Test.createTestingModule({ imports: [AppModule] })` + `app.init()` + Supertest.

**결제 모킹**: `TossPaymentsClient` 인터페이스 추출 후 DI mock. 실 sandbox 호출 금지.

**OAuth 모킹**: auth controller unit은 HTTP client mock. 통합·E2E는 dev-login만.

**E2E 격리**: `e2e+` prefix 이메일로 식별. globalSetup에서 prefix 기준 cleanup + fixture 주입 + storageState 저장. globalTeardown에서 동일 prefix cleanup.

**시간/locale**: `process.env.TZ='UTC'` Jest setup. 기존 `formatDateTime` 픽스 패턴 준수.

## Files to Touch (예상)

**신규**
- `apps/api/test/fixtures/*.ts` (~8)
- `apps/api/test/helpers/*.ts` (4)
- `apps/api/test/jest-global-setup.ts`, `jest-global-teardown.ts`
- `apps/api/test/integration/*.e2e-spec.ts` (4)
- `apps/api/src/{admin,auth,badges,disputes,marketplace,payments,settlements,users}/*.service.spec.ts` (8)
- `apps/api/src/realtime/realtime.gateway.spec.ts`, `apps/api/src/health/health.controller.spec.ts`
- `apps/web/src/test/msw/{server,handlers}.ts`
- `apps/web/src/**/__tests__/*.test.{ts,tsx}` (6~10)
- `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/fixtures/test-users.ts`
- `e2e/tests/{sinaro-signup,team-owner-flow,team-manager-membership,member-join-match,mercenary-flow,admin-dashboard}.spec.ts`

**수정**
- `apps/api/jest.config.js` (globalSetup, projects, runInBand)
- `apps/api/package.json` (`test:integration` script)
- `apps/web/vitest.config.ts` (MSW setupFiles)
- `playwright.config.ts` (globalSetup, storageState projects)
- 루트 `package.json` (`test:all`)
- `apps/api/src/payments/*` (TossPaymentsClient 인터페이스 추출 최소 변경)

## Tech Debt Resolved

1. 마이그레이션 2개 미적용 (Known Blocker) 해소.
2. 백엔드 8개 service spec 부재 해소.
3. Inline mock 분산 → `test/fixtures/` 통합 (Mock Data Discipline).
4. `TossPaymentsClient` 인터페이스 추출 — 결제 모듈 테스트 가능성 확보.
5. E2E storageState 재사용 패턴 도입.

## Security Notes

- `dev-login` production 차단 회귀 케이스 추가 (auth spec).
- `passwordHash` 응답 누락 회귀 (users spec).
- AdminGuard 비-admin 거부 (admin spec).
- `TeamMembershipService.assertRole` 경유 mutation 권한 검증 전 구간.
- 테스트용 이메일은 `e2e+` prefix로 실제 사용자와 충돌 없음.
- 테스트 시크릿은 `.env.test`에서만 로드, 커밋 금지.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Truncate 비용으로 unit suite 지연 | per-suite `beforeAll` truncate + unique key로 격리, runInBand |
| Toss 외부 의존 | `TossPaymentsClient` 인터페이스 + DI mock |
| OAuth 외부 의존 | dev-login만, controller unit만 HTTP mock |
| FCM 외부 의존 | firebase-admin 모킹 (기존 spec 패턴 확장) |
| Realtime Socket.IO E2E | Known Blocker (`socket.io-client` 미설치) — gateway emit 단위 검증만 |
| 시간/locale 의존 | `TZ=UTC` 고정 + 고정 날짜 |
| Migration 적용 실패 | postgres health check 후 retry, 실패 시 BLOCKED 보고 |
| 기존 11개 spec과 충돌 | 점진 마이그레이션, 같은 PR 안에서 일관성 유지 |

## Out of Scope

- 부하/성능 테스트 (k6, Artillery).
- 시각 회귀 (Percy, Chromatic).
- Capacitor 모바일 네이티브 E2E.
- Toss 실 sandbox 호출.
- 카카오/네이버/애플 OAuth 실 통합.
- next-intl 다국어 키 회귀.
- 접근성 자동 감사 확장 (기존 axe 스펙 유지만).
- CI 파이프라인 yml 수정 (명시 요청 시만).
- `seed.ts` 리팩토링.

## Ambiguity Log (default decisions)

1. DB 격리 단위: `beforeAll`(suite) — 속도 우선, 케이스 간 unique key로 격리.
2. TossPayments 실거래 통합: Out of Scope, 인터페이스 mock.
3. OAuth 실 통합: Out of Scope, dev-login만.
4. Realtime Socket.IO E2E: Out of Scope (Known Blocker).
5. Jest 실행 모드: api 패키지 `--runInBand`. schema-per-worker는 향후.
6. 프론트 API 모킹: MSW 채택.
7. E2E 사용자 격리: `e2e+` prefix + cleanup. 별도 schema는 과잉.
8. 시드: `prisma/seed.ts` 절대 수정 금지.
9. Health 모듈: smoke spec 1개만.
10. Notifications/FCM: 기존 spec 보강만, FCM 외부 호출 mock 유지.
