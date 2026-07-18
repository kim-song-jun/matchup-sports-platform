# 로깅 통합 + GA4 분석 도입 — 설계

- 작성일: 2026-07-18
- 대상 스택: `apps/v1_api` (NestJS), `apps/v1_web` (Next.js) — 실제 프로덕션 배포 대상(`deploy/docker-compose.prod.yml`: `v1_postgres`/`v1_api`/`v1_web`/`nginx`)만 포함. legacy `apps/api`/`apps/web`은 배포되지 않으므로 스코프 제외.
- Base 브랜치: `dev`. 워크트리 분할로 병렬 작업.

## 배경 / 현재 상태

- 백엔드: NestJS 기본 `Logger` 콘솔 출력뿐. `AllExceptionsFilter`(`apps/v1_api/src/common/filters/http-exception.filter.ts`)는 **비-HttpException(500)만 로깅**하고, 4xx 비즈니스 에러(`VALIDATION_ERROR` 등 도메인 에러)는 전혀 로깅되지 않음.
- 프론트엔드: 에러 캡처/전송 인프라 전무. `global-error.tsx`는 사용자에게 재시도 UI만 보여주고 어디에도 리포트하지 않음. `extractErrorMessage()`로 토스트에 노출되는 API 에러도 어디에도 기록되지 않음.
- GA4/analytics: 코드베이스에 전혀 없음(과거 admin 화면의 "GA" 문자열 매치는 오탐 — 실제로는 무관한 주석).
- 쿠키/추적 동의 배너: 없음. 가입 약관에만 일반 동의 문구가 녹아 있음(사용자 확인 — 별도 배너 없이 진행).
- 프로덕션 인프라: EC2 단일 서버 docker-compose. 외부 에러추적 SaaS(Sentry 등) 미도입 상태 유지(사용자 결정 — 자체호스팅 구조화 로그로 진행, 외부 계정 의존 0).

## 결정 사항 (사용자 확정)

1. GA4 Measurement ID는 아직 없음 → **env var로만 주입**, 미설정 시 완전 no-op으로 준비. 실제 GA 속성 생성은 사용자가 추후 진행.
2. 에러 수집은 **자체호스팅 구조화 로그**(pino, JSON, stdout). 외부 SaaS(Sentry 등) 도입하지 않음.
3. GA 추적 동의 배너는 **생략**. (법무 검토는 코드 작업 범위 밖 — 별도 트랙)

## 아키텍처

### 1. 백엔드 구조화 로깅 (`apps/v1_api`)

- `nestjs-pino` 도입: `app.useLogger(app.get(Logger))`로 NestJS 전역 로그(부트스트랩 로그 포함)를 JSON 구조화 출력으로 전환. 요청마다 `req.id`(requestId) 자동 부여 → 프론트 에러 리포트와 상관관계 추적 가능하도록 응답 헤더/에러 바디에 `requestId` 포함 검토.
- `AllExceptionsFilter` 보강:
  - HttpException(4xx)도 **warn 레벨로 로깅** — `{ code, statusCode, route, method, userId?, message }`. 현재 완전히 로깅되지 않는 구멍을 메움.
  - 500(비-HttpException)은 기존처럼 error 레벨 + stack.
  - `userId`는 `req.headers['x-v1-user-id']` 또는 인증된 `req.user`에서 추출(있을 때만, 없으면 생략 — PII 최소화).
- 로그 레벨: `LOG_LEVEL` env var (`debug` dev 기본값 / `info` prod 기본값).
- 출력: stdout (JSON) → Docker 기본 `json-file` 드라이버가 수집 → `docker logs v1_api`로 조회.
- **로그 로테이션**: `deploy/docker-compose.prod.yml`의 `v1_api`/`v1_web` 서비스에 `logging: driver: json-file, options: { max-size: "10m", max-file: "5" }` 추가. 로테이션 미설정 시 EC2 디스크가 무제한으로 참(기존 host-starvation 사고 재발 방지 — 인프라 세이프가드로 필수 포함).

### 2. 프론트엔드 에러 캡처 (`apps/v1_web`)

- 신규 엔드포인트 `POST /v1/logs/client-error` (BE, `apps/v1_api`):
  - 인증 불필요(로그인 페이지 등 비로그인 상태 에러도 잡아야 함), `@Throttle` 적용(예: `20/60s`, `HostThrottlerGuard` 없이 IP 기준 — 로그인 전이라 userId 트래킹 불가하므로 push-subscribe와 다르게 IP 또는 세션ID 기준).
  - Body DTO: `{ message: string, stack?: string, url: string, userAgent?: string, level: 'error'|'warn', context?: Record<string, unknown> }` — `class-validator`로 길이 제한(과도한 payload 방어, 예: message/stack 각 4000자 cap).
  - 동일 pino 파이프라인에 `[client]` 태그로 적재.
- 프론트 캡처 지점 3곳 (신규 `lib/client-error-reporter.ts`):
  1. `lib/api-client.ts`의 `v1Api()` — `catch` 블록에서 `V1ApiError` 발생 시(4xx/5xx 응답 또는 파싱 실패) fire-and-forget으로 리포트 후 기존처럼 rethrow. **이게 "사용자에게 노출되는 API 에러 전부"를 잡는 단일 진입점**(개별 화면마다 후킹할 필요 없음).
  2. `window.addEventListener('error', ...)` / `window.addEventListener('unhandledrejection', ...)` — `providers.tsx`에서 마운트 시 1회 등록.
  3. `global-error.tsx` — `useEffect`로 마운트 시 에러 리포트(React 렌더 예외).
  - 무한루프 방지: 리포터 자체 요청 실패는 `console.debug`만(재귀 리포트 금지), 5xx 폭주 방지용 클라이언트 사이드 rate-limit(예: 같은 message 10초 내 1회로 dedupe).

### 3. GA4 기반 통합 (`apps/v1_web`)

- `NEXT_PUBLIC_GA_MEASUREMENT_ID` env var. 미설정 시 스크립트 자체를 로드하지 않음(완전 no-op — 기존 `WebPushService` graceful-disable 패턴과 동일 철학).
- `next/script`(`strategy="afterInteractive"`)로 gtag.js 로드. 별도 `@next/third-parties` 의존성 추가하지 않음(경량화).
- `app/layout.tsx`(또는 `providers.tsx`)에 라우트 변경 감지 → `gtag('event', 'page_view', ...)` 자동 전송(Next App Router는 SPA 라우팅이므로 수동 트리거 필요).
- `lib/analytics.ts`: 단일 공개 API.
  ```ts
  export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void
  ```
  `window.gtag`가 없으면(=ID 미설정) 즉시 return하는 no-op. GA 이벤트와 백엔드 구조화 로그는 **완전히 분리된 시스템** — 이벤트를 백엔드에 이중 적재하지 않음(단순성 우선).

### 4. GA 이벤트 택소노미

GA4 명명 규칙(snake_case) 준수. 카테고리별 이벤트 카탈로그:

**계정**
- `sign_up_start { method }` / `sign_up_complete { method, sportType? }`
- `login { method }` / `login_failed { method, reason }`
- `logout {}`

**온보딩**
- `onboarding_step_complete { step, sportType? }`
- `onboarding_complete {}`

**유입/탐색**
- `landing_cta_click { cta }`
- `search { query, resultCount, domain }` (domain: match|team|tournament)
- `home_view {}`

**매칭(개인)**
- `match_view { matchId, sportType }`
- `match_join_complete { matchId, sportType }`
- `match_leave { matchId }`
- `match_create_complete { sportType }`

**팀**
- `team_create_complete { sportType }`
- `team_apply_complete { teamId }`
- `team_application_accept { teamId }` / `team_application_reject { teamId }`

**팀매칭**
- `team_match_create_complete {}`
- `team_match_apply_complete { teamMatchId }`
- `team_match_check_in { teamMatchId }`
- `team_match_result_submit { teamMatchId }`
- `team_match_evaluate_complete { teamMatchId }`

**대회**
- `tournament_view { tournamentId }`
- `tournament_apply_complete { tournamentId }`
- `tournament_share { channel }`

**인게이지먼트**
- `chat_room_start { type }` (direct|team_match)
- `review_submit { targetType }`
- `notification_click { type }`
- `push_subscribe_complete {}`

각 이벤트는 클릭/의도(예: `_click`)와 완료(`_complete`)를 구분해 퍼널 분석이 가능하도록 함. 실패 이벤트(`_failed`)는 계정 도메인에만 우선 적용(가장 분석 가치 높음), 나머지 도메인은 필요 시 후속 확장.

## 워크트리 / Phase 분할 (base: `dev`)

| Phase | 워크트리 | 범위 | 의존성 |
|---|---|---|---|
| 0 | `observability-skeleton` | BE: nestjs-pino, 필터 보강, `/logs/client-error` 엔드포인트, docker-compose 로그 로테이션. FE: GA 로더, `lib/analytics.ts`, `client-error-reporter.ts` 3개 캡처 지점 | 없음(선행) |
| 1 | `ga-events-auth-home` | 계정/온보딩/유입 도메인 `trackEvent` 삽입 | Phase 0 dev 머지 후 |
| 1 | `ga-events-matching` | 매치/팀매칭 도메인 `trackEvent` 삽입 | Phase 0 dev 머지 후 |
| 1 | `ga-events-teams-tournaments` | 팀/대회 도메인 `trackEvent` 삽입 | Phase 0 dev 머지 후 |
| 1 | `ga-events-engagement` | 채팅/알림/리뷰/마이페이지 `trackEvent` 삽입 | Phase 0 dev 머지 후 |

Phase 1의 4개 워크트리는 서로 다른 파일(도메인별 클라이언트 컴포넌트)만 건드리므로 병합 충돌 위험이 낮음. 각 워크트리는 독립 PR(base=`dev`)로 마무리.

## 테스트 계획

- BE: `apps/v1_api/src/**/*.spec.ts` — `AllExceptionsFilter`가 4xx도 로깅하는지(logger spy), `/logs/client-error` 엔드포인트 DTO 검증 + throttle 동작.
- FE: `apps/v1_web/src/**/*.test.{ts,tsx}` — `v1Api()` 에러 발생 시 리포터 호출되는지(fetch mock), `trackEvent()`가 `window.gtag` 없을 때 no-op인지 / 있을 때 올바른 인자로 호출되는지.
- 실제 "동작 확인"은 라이브 스크린샷이 아니라(순수 계측 코드라 시각 변경 없음) 네트워크 탭/콘솔 로그로 이벤트 발화 확인(v1 스택 기동 후 Playwright `read_console_messages`/`read_network_requests` 활용).

## 기술부채 / 리스크

- `LOG_LEVEL`/`NEXT_PUBLIC_GA_MEASUREMENT_ID` 등 신규 env var는 `.env.example`, `configuration.ts`, `docker-compose.prod.yml`, GitHub Actions secrets 경로에 모두 반영(기존 VAPID 선례와 동일 — 운영자가 실제 값 등록은 별도 수동 작업으로 Known Blockers에 기록).
- client-error 엔드포인트는 미인증 공개 API이므로 스팸/남용 방지가 필수 — Throttle + payload 길이 제한을 스코프에 포함(빠뜨리면 보안 리뷰에서 Critical).
- GA 이벤트 파라미터에 PII(이메일, 실명, 전화번호) 절대 포함 금지 — sportType/teamId/matchId 등 식별자만 사용.

## Ambiguity Log

- GA4 실측 ID·GA 속성 자체 생성: 코드 작업 범위 밖, 사용자가 직접 처리(2026-07-18 확인).
- 동의 배너: 이번 스코프에서 생략(2026-07-18 확인). 법무 검토 필요 시 별도 트랙.
