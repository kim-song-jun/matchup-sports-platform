# Teameet - AI 기반 멀티스포츠 소셜 매칭 플랫폼

풋살/농구/아이스하키/배드민턴 등 생활체육 종목의 개인 및 팀을 AI로 최적 매칭하는 플랫폼.

## Core Engineering Principles

이 프로젝트의 모든 변경에는 아래 7개 원칙이 엄격히 적용됩니다.

1. **Resolve Tech Debt — Never Defer** (기술 부채는 즉시 해결)
   - 작업 범위 안의 TODO, hack, workaround, 임시 해결책은 같은 변경에서 고친다. 별도 티켓 이연 금지.
   - 리뷰어는 범위 내 미해결 기술 부채를 **Critical**로 표시 (Warning 아님).
   - 증명된 패턴: in-memory mock → Prisma 전환, `Record<string, unknown>` → DTO 전환 (Phase 1-5 참조).

2. **Design System Consistency** (디자인 시스템 일관성)
   - 우선순위: `DESIGN.md` > `.impeccable.md` > CSS 토큰(`globals.css` @theme) > `tailwind.config.*` > 코드 추론
   - 문서 탐색은 `docs/DESIGN_DOCUMENT_MAP.md`를 사용하되, 이는 navigation only이며 규칙 정의 문서가 아니다.
   - 이 프로젝트는 **utility-first (Tailwind CSS v4)** 클래스 네이밍을 사용한다.
   - **토큰 우선**: 하드코딩 컬러/간격/폰트 금지. `text-2xs~text-6xl`, `sportCardAccent[sportType]`, `bg-blue-500` 사용.
   - **컴포넌트 재사용**: 인라인 마크업 전에 `components/ui/`의 `EmptyState`, `ErrorState`, `Modal`, `Toast`, `ChatBubble` 존재 여부 확인.
   - **시각 절제**: 과한 shadow, 과한 border, content-first glass 사용 금지. 기본값은 Toss-like clean layout의 solid-first rhythm이다.

3. **Security Always** (보안은 항상)
   - 태스크 종류 무관하게 모든 변경은 보안 관점에서 검토.
   - 체크: 하드코딩 시크릿 없음 / 시스템 경계 입력 검증 / 신규 엔드포인트 auth·authz / SQL injection / XSS / CSRF / 신규 의존성 CVE.
   - 백엔드: `JwtAuthGuard` + `AdminGuard` + `TeamMembershipService.assertRole` 다층 방어.
   - 프론트엔드: `dangerouslySetInnerHTML` 최소화, 사용자 입력 HTML 이스케이프, 시크릿을 프론트엔드에 두지 않음.

4. **Mock Data Discipline** (목 데이터 규율)
   - 현재 프로젝트에 전용 mock 디렉토리 없음. 테스트 mock은 `apps/api/src/**/*.spec.ts`와 `apps/web/src/**/*.test.{ts,tsx}` 파일 내부에 inline으로 작성됨.
   - **규칙**: Prisma 모델 / DTO / API 타입 변경 시, 영향받는 inline mock도 같은 커밋에서 업데이트한다.
   - Schema ↔ mock 드리프트는 리뷰어가 **Critical**로 표시.
   - **Future**: 전용 `__mocks__/` 또는 `fixtures/` 디렉토리 도입 시 이 섹션 업데이트.

5. **No Ambiguous Skipping** (모호함을 조용히 지나치지 않기)
   - 요구사항이 모호하거나 충돌하면 **추측하고 진행하지 않는다**.
   - 컴파일만 되는 "가장 쉬운 경로"를 선택하지 않는다.
   - 원본 요청의 모든 조건이 설계 → 구현 → 검증 전 단계에 살아있어야 한다.
   - 조용히 드롭된 요구사항은 리뷰어가 **Critical**로 표시.

6. **Ambiguity → Re-enter Planning** (모호함은 기획 재진입)
   - 빌더가 모호함을 만나면: 작업 중단 → 오케스트레이터에 `BLOCKED: {질문}` 보고 → `project-director` + `tech-planner` 재호출 → 기획팀이 task 문서 업데이트 → 빌더에게 재핸드오프.
   - 이 루프는 실패가 아니라 **올바른 경로**다.
   - 같은 모호함이 3회 이상 에스컬레이션되면 오케스트레이터가 사용자에게 직접 질문.

7. **Structured Task Documents** (구조화된 태스크 문서)
   - 기획팀은 `.github/tasks/{N}-{task-name}.md` 위치에 태스크 문서를 작성한다.
   - **필수 섹션**: Context / Goal / Original Conditions (체크박스) / User Scenarios / Test Scenarios (happy/edge/error/mock updates) / Parallel Work Breakdown (Backend ⟂ Frontend ⟂ Infra + 순차) / Acceptance Criteria / Tech Debt Resolved / Security Notes / Risks & Dependencies / Ambiguity Log.
   - 상세 템플릿: `.claude/agents/prompts.md.legacy`의 "Task Document Format" 섹션 참조.
   - 현재 레포 관행: `.github/tasks/`에 `qa-feedback-execution-plan.md`, `qa-followup-detailed.md`, `qa-followup-tech-design.md`, `qa-followup-completion-report.md` 존재.

## 프로젝트 구조

```
apps/
  web/              → Next.js 16 프론트엔드 (App Router)
    src/
      app/          → 페이지 라우트
        (auth)/     → 로그인 등 인증 페이지
        (main)/     → 인증 후 메인 페이지 (home, matches, marketplace 등)
        admin/      → 관리자 대시보드
        landing/    → 랜딩 페이지
      components/   → 공유 컴포넌트 (ui/, chat/, match/, venue/, landing/ 등)
      hooks/        → 커스텀 훅
      lib/          → 유틸리티 (utils.ts, api.ts, constants.ts 등)
      stores/       → Zustand 상태 관리
      i18n/         → next-intl 국제화
      types/        → TypeScript 타입 정의
  api/              → NestJS 백엔드
    src/
      auth/         → JWT + OAuth 인증 (카카오/네이버/애플)
      matches/      → 개인 매칭 (매칭 엔진 포함)
      team-matches/ → 팀 매칭 시스템
      teams/        → 팀/클럽 관리
      mercenary/    → 용병 시스템
      marketplace/  → 장터 (중고거래/대여/공동구매)
      lessons/      → 강좌/레슨
      chat/         → 채팅
      payments/     → 결제 (토스페이먼츠)
      settlements/  → 정산 관리
      reviews/      → 리뷰/평가
      venues/       → 구장 정보
      badges/       → 뱃지 시스템
      notifications/→ 알림
      disputes/     → 분쟁 처리
      admin/        → 관리자 API
      realtime/     → Socket.IO 게이트웨이
      prisma/       → Prisma 서비스
      common/       → 데코레이터, 필터, 가드, 인터셉터
    prisma/
      schema.prisma → DB 스키마
      seed.ts       → 시드 데이터
e2e/                → Playwright E2E 테스트
deploy/             → Docker/프로덕션 설정
infra/
  load/             → k6 부하 테스트 하네스 (realtime-load.js, README.md)
```

## 기술 스택

### 프론트엔드
- **프레임워크**: Next.js 16 (App Router, React 19.2)
- **스타일링**: Tailwind CSS v4 + PostCSS
- **UI 유틸**: clsx + class-variance-authority + tailwind-merge
- **상태 관리**: Zustand 5
- **서버 상태**: TanStack React Query 5
- **HTTP**: Axios
- **아이콘**: Lucide React
- **국제화**: next-intl
- **모바일**: Capacitor 6 (iOS/Android 래핑)
- **테스트**: Vitest + jsdom + Testing Library

### 백엔드
- **프레임워크**: NestJS 11.1 + TypeScript
- **DB**: PostgreSQL 16 (Prisma 6 ORM)
- **캐시**: Redis 7 (ioredis)
- **인증**: JWT (passport-jwt) + OAuth (카카오/네이버/애플)
- **API 문서**: Swagger (@nestjs/swagger 11.2)
- **실시간**: Socket.IO (@nestjs/websockets)
- **유효성 검증**: class-validator + class-transformer
- **테스트**: Jest 30 + ts-jest + Supertest

### 인프라
- **모노레포**: pnpm workspaces + Turborepo
- **컨테이너**: Docker Compose (개발), Dockerfile (프로덕션)
- **CI/CD**: GitHub Actions
- **배포**: Docker (deploy/Dockerfile.api, deploy/Dockerfile.web)

### 포트 맵

**Dev 환경** (로컬 + `docker-compose.yml`)
| 서비스 | 포트 | 용도 |
|--------|------|------|
| Next.js | 3003 | 프론트엔드 개발 서버 |
| NestJS | **8111** | 백엔드 API 서버 (dev) |
| PostgreSQL | 5433 | 데이터베이스 (호스트 노출) |
| Redis | 6380 | 캐시/세션 (호스트 노출) |

**Prod 환경** (`deploy/docker-compose.prod.yml`)
| 서비스 | 포트 | 비고 |
|--------|------|------|
| Next.js | 3000 | Nginx 리버스 프록시 뒷단 (`deploy/Dockerfile.web` EXPOSE 3000) |
| NestJS | **8100** | Nginx 리버스 프록시 뒷단 (`deploy/Dockerfile.api` EXPOSE 8100) |
| PostgreSQL | 5432 | 컨테이너 내부만 |
| Redis | 6379 | 컨테이너 내부만 |

> **주의**: dev 와 prod 의 API 포트(8111 vs 8100) · Web 포트(3003 vs 3000) 가 다릅니다. 주요 설정 위치: `apps/api/src/config/configuration.ts` (`API_PORT || 8111`), `apps/web/next.config.ts` (`http://localhost:8111` dev / `http://api:8100` prod), `docker-compose.yml` (dev), `deploy/docker-compose.prod.yml` (prod).

## 개발 명령어

```bash
pnpm dev              # 전체 개발 서버 (프론트 3003 + 백엔드 8111)
pnpm build            # 전체 빌드
pnpm lint             # 전체 린트
pnpm db:push          # Prisma 스키마 DB 반영
pnpm db:migrate       # Prisma 마이그레이션
pnpm db:studio        # Prisma Studio (DB 브라우저)
pnpm db:seed          # 시드 데이터 삽입
docker compose up -d  # PostgreSQL + Redis 실행
```

## 테스트

```bash
cd apps/web && pnpm test              # 프론트엔드 (Vitest, jsdom) — 19 suites
cd apps/api && pnpm test              # 백엔드 unit (Jest) — 22 suites
cd apps/api && pnpm test:integration  # 백엔드 통합 (Supertest, --runInBand) — 4 suites
cd e2e && npx playwright test         # E2E (Mobile Chrome + Desktop Chrome) — 14 specs
pnpm test:all                         # 전체 (unit + integration + E2E)
```

- 프론트엔드 테스트: `apps/web/src/**/*.test.{ts,tsx}`
- 백엔드 unit 테스트: `apps/api/src/**/*.spec.ts`
- 백엔드 통합 테스트: `apps/api/test/integration/*.e2e-spec.ts`
- E2E 테스트: `e2e/tests/`

### 테스트 인프라 (격리형)

**DB 격리**: 매 suite `beforeAll/beforeEach`에서 `truncateAll(prisma)` → fixture 주입, `afterAll`에서 정리.
- 헬퍼: `apps/api/test/helpers/db-cleanup.ts` — TRUNCATE RESTART IDENTITY CASCADE
- 토큰: `apps/api/test/helpers/auth-token.ts` — unit용 `signTestJwt()`, 통합용 `devLoginToken()`
- 앱 부트스트랩: `apps/api/test/helpers/nest-app.ts` — `createTestApp()` (main.ts 글로벌 설정 미러링)

**Fixture 팩토리**: `apps/api/test/fixtures/`
- `personas.ts` — 8개 테스트 페르소나 (sinaro/teamOwner/teamManager/teamMember/mercenaryHost/admin/instructor/seller)
- `teams.ts`, `matches.ts`, `team-matches.ts`, `mercenary.ts`, `marketplace.ts`, `payments.ts`, `lessons.ts`
- `disputes.ts` — `createDispute`, `createDisputeEvent` (Task 70 추가)
- `payouts.ts` — `createPayout`, `createPayoutBatch` (Task 70 추가)

**프론트엔드 모킹**: MSW (`apps/web/src/test/msw/`) — 네트워크 레이어 모킹. `vitest.setup.ts`에서 lifecycle 관리.

**E2E**: `e2e/global-setup.ts` — 페르소나 dev-login + storageState 저장 + 시드 데이터. `e2e/global-teardown.ts` — Prisma로 E2E 사용자 cleanup.

## 아키텍처

### 인증 플로우
- JWT 기반 인증 (access + refresh token)
- OAuth: 카카오/네이버/애플 소셜 로그인
- 개발 환경 전용 `dev-login` 엔드포인트 (프로덕션 차단)
- `JwtAuthGuard` + `@CurrentUser()` 데코레이터
- 관리자: `AdminGuard` (UserRole.admin 체크) — `/admin/*` 13개 엔드포인트 모두 적용됨
- mutation 핸들러는 `@CurrentUser()` 로 userId 추출 후 서비스 계층에서 ownership 검증

### API 응답 형식
- 모든 응답: `{ status, data, timestamp }` (TransformInterceptor)
- 에러: `HttpExceptionFilter` → 에러 코드 `DOMAIN_CODE` 형태
- 페이지네이션: Cursor 기반

### 핵심 도메인
- **개인 매칭**: 종목별 매치 생성 → 참가 신청 → 결제 → 팀 편성 → 경기 → 리뷰
- **팀 매칭**: 팀 생성 → 경기 공고 → 상대팀 신청 → 2단계 상호확인 → 도착인증 → 경기 → 상호평가
- **용병 시스템**: 팀 경기에 개인 용병 참가 (Prisma 기반, 더 이상 in-memory mock 없음)
- **장터**: 중고 장비 판매/대여/공동구매 + 에스크로 결제 — Toss 일반 결제 + in-house 에스크로 원장. `MarketplaceOrder` 상태 머신(`pending → paid → shipped → delivered → completed | auto_released`), 에스크로 자동 해제 cron (10분 주기, `DISABLE_MARKETPLACE_CRON=true` 비활성화), 분쟁 도메인(`Dispute` + `DisputeEvent` Prisma 모델, in-memory mock 완전 제거), 정산 payout 배치 워크플로우(admin 수동 배치 → mark-paid), 커미션 10% 단일 상수(`MARKETPLACE_COMMISSION_RATE`, `apps/api/src/common/constants/commission.ts`)
- **강좌**: 그룹레슨/연습경기/자유연습/클리닉 + 티켓(1회권/다회권/기간권) + 출석 관리
- **팀 신뢰 점수**: 6항목 상호평가 → TeamTrustScore 누적
- **채팅**: Prisma `ChatRoom`/`ChatMessage`/`ChatParticipant` 모델로 영속화. cursor 기반 페이지네이션, `teamMatchId` 연동, get-or-create. in-memory stub 완전 제거. `ChatService`가 persist → broadcast 단일 경로 (REST + WS 공통)
- **팀 자동 구성 (Task 71)**: ELO snake-draft 기반 균등 팀 배정 — `TeamBalancingService`가 `UserSportProfile.eloRating`을 ELO 내림차순 정렬 후 snake-draft (A-B-B-A-A-B-... 또는 A-B-C-C-B-A-... 다팀 snake)로 배분. Preview API로 dry-run 확인 후 확정 시 `$transaction`으로 원자 교체. Cold-start(`UserSportProfile` 없음) 참가자는 eloRating=1000 fallback. 알고리즘 설계 문서: `docs/design/task-71-team-balancing.md`
- **팀 자동 구성 v2 hardening (Task 72)**: preview→compose 간 **participant churn 감지** 추가. `computeParticipantHash()`(SHA-256 of sorted userIds, `apps/api/src/matches/matches.service.ts`)가 preview 응답에 `participantHash` 필드를 포함하고, compose 호출 시 stale hash 감지 → **409 `PARTICIPANTS_CHANGED`**. 프론트는 자동 재-preview + "참가자가 변경되어 다시 계산했어요" 토스트. Preview 엔드포인트에 **호스트 단위 rate limit** 적용(`@Throttle limit=20/60s`, `HostThrottlerGuard`가 `req.user.id`로 트래킹, 초과 시 429 + `Retry-After`). Modal은 `previewHistory` FIFO cap=2로 직전 preview 비교·재사용 지원. 기존 팀 배정이 있는 매치의 재확정은 `ConfirmReplaceModal`(alertdialog role)로 명시적 "교체" 확인. 4팀 그리드는 `sm:grid-cols-2 xl:grid-cols-3` responsive.

### 팀 역할 기반 권한 (Phase 1-5 추가)

팀 멤버는 `TeamMembership` 모델로 관리되며, 역할 계층은 `owner > manager > member`.

| 역할 | 멤버 초대 | 역할 변경 | 멤버 추방 | 팀 삭제 |
|------|-----------|-----------|-----------|---------|
| owner | O | O | O | O |
| manager | O | O (member만) | O (member만) | X |
| member | X | X | X | X |

- `TeamMembershipService.assertRole(teamId, userId, 'manager')` 로 권한 검증
- 팀 생성 시 시더/백필 SQL이 owner 멤버십 자동 생성
- 관련 모델: `TeamMembership`, enums `TeamRole` / `TeamMembershipStatus`
- **팀 가입 신청 수락·거부** (Task 69 추가): manager+ 는 초대(invitation) 외에 **외부 가입 신청(application)도 수락·거부**할 수 있다. `GET/PATCH /teams/:id/applications` 엔드포인트 사용. reject 후 status는 `left`(재신청 가능)로 처리하며 `removed`(영구 차단)는 사용하지 않는다.

## API 엔드포인트

### 인증 (`/auth`)
`POST register` | `POST login` | `POST dev-login` | `POST kakao/naver/apple` | `POST refresh` | `GET me` | `DELETE withdraw`

### 사용자 (`/users`)
`GET me` | `PATCH me` | `GET me/matches` | `GET :id`

### 매치 (`/matches`)
`GET /` | `GET recommended` | `POST /` | `GET :id` | `PATCH :id` | `POST :id/cancel` [idempotent] | `POST :id/close` [idempotent] | `POST :id/join` | `DELETE :id/leave` | `POST :id/teams` | `POST :id/complete` [idempotent]

**팀 자동 구성** (Task 71 추가, Task 72에서 hardening):
`POST :id/teams/preview` (호스트 전용, 팀 자동 구성 dry-run preview — body: `ComposeTeamsDto { strategy?, teamCount?, seed?, participantHash? }`, response: `PreviewTeamsResponseDto { teams, metrics: { maxEloGap, variance, stdDev, teamAvgElos, coldStartCount }, seed, participantHash }`. DB 변경 없음. **Task 72**: 응답에 `participantHash`(SHA-256 hex 64-char) 포함, `@Throttle limit=20/60s` + `HostThrottlerGuard`(req.user.id 트래킹) 적용. 초과 시 429 + `Retry-After: 60`)
`POST :id/teams` — Task 71로 확장: `ComposeTeamsDto` body 수락, ELO snake-draft(`TeamBalancingService`) 경유, `$transaction` 원자 교체. body 없는 기존 클라이언트는 `autoBalance` 플래그 기반 default 동작 유지 (back-compat). **Task 72**: optional `participantHash` 수락 — preview 시점 hash와 현재 참가자 해시 불일치 시 **409 `PARTICIPANTS_CHANGED`** 반환(프론트에서 자동 재-preview). hash 미전달 시 legacy client로 간주하여 stale check skip.

### 팀 (`/teams`)
`GET /` | `GET me` (소유 팀 목록, JwtAuthGuard) | `GET :id` | `POST /` | `PATCH :id` | `DELETE :id` | `POST :id/apply`

**팀 멤버 관리** (Phase 1-5 추가):
`GET :id/members` | `POST :id/members` | `PATCH :id/members/:userId` | `DELETE :id/members/:userId` | `POST :id/leave`

**소유권 이전**:
`POST :id/transfer-ownership` (owner 전용, `TransferOwnershipDto` — `toUserId`, `demoteTo: 'manager'|'member'`)

**팀 신청** (Task 27 추가):
`POST :id/apply` (JwtAuthGuard, 비멤버 대상, idempotent — 중복 신청 시 409)

**팀 신청 관리** (Task 69 추가, **Task 73에서 멱등**):
`GET :id/applications` (manager+ 전용, pending 신청자 목록, 각 행에 nickname/profileImageUrl/mannerScore 포함) | `PATCH :id/applications/:userId/accept` [idempotent] (manager+, pending→active, memberCount +1, 신청자에게 `team_application_accepted` 알림. 이미 active면 `alreadyProcessed: true` 반환, 트랜잭션/알림 skip) | `PATCH :id/applications/:userId/reject` [idempotent] (manager+, pending→left, 신청자에게 `team_application_rejected` 알림. 이미 left면 `alreadyProcessed: true` 반환)

**팀 전용 하위 페이지** (Task 22 추가, 프론트엔드):
- `/teams/:id/matches` — 해당 팀이 host 또는 applicant로 참여한 팀 매칭 목록 (`GET /team-matches?teamId=`)
- `/teams/:id/mercenary` — 해당 팀의 용병 모집글 목록 (`GET /mercenary?teamId=`)

### 팀 매치 (`/team-matches`)
`GET /` (쿼리: `teamId` — 호스트 또는 신청자로 참여한 팀의 매칭 필터) | `GET :id` | `POST /` | `POST :id/apply` | `PATCH :id/applications/:appId/approve` | `PATCH :id/applications/:appId/reject` | `POST :id/check-in` | `POST :id/result` | `POST :id/evaluate` | `GET :id/referee-schedule`

**신청 조회** (Phase 1-5 추가):
`GET :id/applications` (호스트 뷰) | `GET me/applications` (신청자 본인 뷰)

### 장터 (`/marketplace`)
`GET listings` | `POST listings` | `GET listings/:id` | `POST listings/:id/order`

**주문 상태 전환** (Task 70 추가):
`GET orders/me` (buyer 전용, cursor 페이지네이션) | `GET orders/:id` (buyer 또는 seller) | `POST orders/:id/ship` (seller 전용, `ShipOrderDto { carrier?, trackingNumber? }`) | `POST orders/:id/deliver` (seller 전용) | `POST orders/:id/confirm-receipt` (buyer 전용, `completed` 전환 + SettlementRecord 생성) | `POST orders/:id/dispute` (buyer 전용, `escrow_held | shipped | delivered` 상태에서만, `FileDisputeDto { type, description, attachmentUrls? }`)

**어드민 주문 강제 해제** (Task 70 추가):
`POST /admin/orders/:id/force-release` (AdminGuard, `{ note: string }` — cron과 동일 서비스 메서드, 운영 재처리 + 통합테스트 결정론용)

### 분쟁 (`/disputes`)
**구매자·판매자 뷰** (Task 70 추가 — 기존 `/admin/disputes` 완전 재작성):
`GET me` (query `?role=buyer|seller|all`, cursor 페이지네이션) | `GET :id` (participant 또는 admin) | `POST :id/respond` (seller 전용, state=filed일 때, `RespondDisputeDto`) | `POST :id/messages` (buyer/seller participant, `DisputeMessageDto`) | `POST :id/withdraw` (buyer 전용, filed/seller_responded 상태에서만)

**어드민 분쟁 관리** (Task 70 재작성 — 기존 `POST /` + `PATCH :id/status` 제거):
`GET /admin/disputes` (status / targetType / cursor 필터) | `GET /admin/disputes/:id` (Dispute + events[] + order/teamMatch snapshot) | `POST /admin/disputes/:id/review` (→ `admin_reviewing`) | `PATCH /admin/disputes/:id/resolve` (`ResolveDisputeDto { action: refund|release|dismiss, note }` — refund 시 Toss cancel 연동, release 시 SettlementRecord 생성)

### 정산 (`/admin/payouts`)
**(Task 70 신규 — 기존 `/admin/settlements` 에 payout 배치 계층 추가)**
`GET /admin/payouts` (status / recipientId / batchId / cursor 필터) | `GET /admin/payouts/eligible` (배치 대상 released settlements, recipient별 집계) | `POST /admin/payouts/batch` (`CreateBatchDto { recipientIds?, cutoffDate? }` — 서버에서 금액 계산, client 금액 신뢰 안 함) | `PATCH /admin/payouts/:id/mark-paid` (`{ externalRef?, note? }` — payout `paid`, 수령자 `payout_paid` 알림) | `PATCH /admin/payouts/:id/mark-failed` (`{ reason }` — settlements `payoutId=null` 복원, 재대기열)

### 결제 (`/payments`)
`POST prepare` (PreparePaymentDto) | `POST confirm` (ConfirmPaymentDto) | `POST :id/refund` (RefundPaymentDto) | `GET me` | `POST webhook`

### 업로드 (`/uploads`)
`POST /` (멀티파트, 최대 5개 10MB, jpeg/png/webp/gif) | `GET :id` | `DELETE :id`

### 채팅 (`/chat`)
`GET rooms` (cursor on lastMessageAt) | `GET rooms/:id` (cursor on message createdAt) | `POST rooms` (with optional teamMatchId) | `POST rooms/:id/messages` | `PATCH rooms/:id/read` | `GET unread-count`

### 구장 (`/venues`)
`GET /` | `GET :id` | `GET :id/schedule` | `POST :id/reviews`

### 관리자 (`/admin`)
`GET stats/users/matches/lessons/teams/venues/payments` | `POST lessons/teams/venues` | `PATCH matches/:id/status` | `PATCH lessons/:id/status` | `PATCH venues/:id`

### 정산 (`/admin/settlements`)
`GET /` | `GET summary` | `PATCH :id/process` (status 컬럼: `pending | held | processing | completed | failed | refunded` — Task 70에서 `held`/`refunded` 추가)

### 용병 (`/mercenary`)
`GET /` (모든 11 종목 필터링 지원, Task 27 수정) | `POST /` | `GET :id` (Task 27 추가, detail page 지원) | `POST :id/apply`

**신청 관리** (Phase 1-5 추가):
`GET me/applications` (신청자 본인 뷰) | `PATCH :id/applications/:appId/accept|reject` (호스트 뷰) | `DELETE :id/applications/me` (신청 취소)

**모집글 종료** (Task 69 추가, **Task 73에서 멱등**):
`POST :id/close` [idempotent] (작성자 또는 팀 manager+, filled 외 수동 종료, pending/accepted 신청자에게 `mercenary_closed` 알림. 이미 closed면 `alreadyClosed: true` 반환) | `POST :id/cancel` [idempotent] (작성자 전용, 전체 신청자에게 `mercenary_cancelled` 알림. 이미 cancelled/closed면 `alreadyCancelled: true` 반환)

### 알림 (`/notifications`)
`GET /` | `PATCH :id/read` | `POST push-subscribe` [idempotent] (body `{endpoint, keys}`, endpoint 기준 upsert — 중복 구독 시 동일 row에 keys 갱신, `@Throttle 10/60s`) | `DELETE push-unsubscribe` (body `{endpoint}`) | `GET vapid-public-key` (`@Throttle 30/60s`)

**알림 선호도** (Task 74 신규):
`GET /notifications/preferences` (JwtAuthGuard, row 없으면 default all-enabled 반환) | `PATCH /notifications/preferences` (`UpdateNotificationPreferencesDto` — 8개 boolean 필드: `teamApplication`, `matchCompleted`, `eloChanged`, `chatMessage`, `mercenaryPost`, `teamMatch`, `payment`, `system`. `@IsBoolean()` 검증 필수)

### 리뷰 (`/reviews`) — Task 73에서 멱등
`POST /` [idempotent] (body `{ matchId, targetId, skillRating, mannerRating, comment? }`. 200 + flattened review + `alreadySubmitted: boolean`. `(matchId, authorId, targetId)` unique constraint — 중복 시 기존 리뷰 반환 + `alreadySubmitted: true` + 알림/ELO/매너 업데이트 skip) | `GET pending`

### 기타
`GET /health` — 헬스체크

## 백엔드 개발 규칙

### NestJS 패턴
- 모듈 구조: `*.module.ts` + `*.controller.ts` + `*.service.ts`
- DTO: `class-validator` 데코레이터 사용, `class-transformer` 변환
- 가드: `JwtAuthGuard` (인증), `AdminGuard` (관리자 권한)
- 인터셉터: `TransformInterceptor` (응답 래핑)
- 필터: `HttpExceptionFilter` (에러 표준화)
- Prisma: `PrismaService` 주입, 트랜잭션은 `$transaction()` 사용
- `passwordHash` 필드는 API 응답에서 반드시 제거
- **팀 mutation 엔드포인트**: `TeamMembershipService.assertRole(teamId, userId, 'manager')` 로 권한 검증 필수. 직접 DB 조회로 권한 검사하지 않음
- **실시간(RealtimeGateway)**: JWT 핸드셰이크 인증, `emitToUser(userId, event, payload)` 헬퍼로 사용자 알림 전송
- **WebPushService**: `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` 없을 시 `enabled=false`로 graceful disable. `sendToUser()` no-op + warn log. 알림 create 흐름은 푸시 실패와 무관하게 성공해야 함 (fire-and-forget). Firebase 미사용 — `web-push` 패키지 + VAPID로 EC2에서 직접 발송.
- **ChatService**: 채팅 persist + broadcast 단일 경로 — REST `postMessage`와 WS `chat:message` 모두 `ChatService`를 통과. Gateway에서 직접 broadcast 금지. 참가자 검증(`assertParticipant`)은 REST + WS 양쪽에서 필수.
- **중첩 DTO 패턴**: JSON 필드에 `Record<string, unknown>` 사용 금지. 전용 DTO 클래스 정의 후 `@ValidateNested() @Type(() => XxxDto)` 적용
- **숫자 기본값**: `filter.limit || 20` 대신 `filter.limit ?? 20` — `||`는 0을 falsy로 처리하므로 nullish coalescing 사용

### API 컨벤션
- 경로: `/api/v1/*` (NestJS globalPrefix)
- Swagger: `@nestjs/swagger` 데코레이터로 API 문서화
- 에러 코드: `MATCH_NOT_FOUND`, `PAYMENT_FAILED` 등 `DOMAIN_CODE` 형태

## 프론트엔드 개발 규칙

### Next.js App Router
- Route Groups: `(auth)` 인증 페이지, `(main)` 메인 앱, `admin/` 관리자
- Parallel Routes: `{auth}`, `{main}` 레이아웃
- `@` alias → `src/` 디렉토리
- API 프록시: `next.config.ts` rewrites → `localhost:8111`

### 컴포넌트 개발 규칙 (React 19.2)
- `React.forwardRef` 사용 금지 — `ref`를 Props 인터페이스에 직접 포함
- 패턴: `interface FooProps { ref?: React.Ref<HTMLFooElement>; ... }`
- 적용 대상: `components/ui/button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx` 및 신규 UI 컴포넌트 전체

### 상태 관리
- 서버 상태: TanStack React Query (캐싱, 재요청)
- 클라이언트 상태: Zustand stores (`stores/` 디렉토리)
- 로컬 포맷터 정의 금지 — 반드시 `lib/utils.ts` 유틸 사용

### 주요 커스텀 훅 (`hooks/use-api.ts` → `hooks/api/<domain>.ts` 도메인별 분리, `hooks/use-api.ts` 는 re-export barrel)
- `useMyTeams()` — 로그인 유저 소속 팀 목록 (`GET /teams/me`). 백엔드 `TeamMembership[]` 응답을 `{ id, name, role, sportType, description, city, district, memberCount, level, isRecruiting, logoUrl, joinedAt }[]` 평탄화 형태로 정규화하여 반환. 팀 선택 UI·팀 매칭 생성 시 사용
- `useMyTeamMatchApplications()` — 신청자 본인이 보낸 팀 매칭 신청 목록 (`GET /team-matches/me/applications`). `/my/team-match-applications` 페이지에서 사용
- `useRequireAuth()` — 비로그인 접근 시 로그인 페이지로 redirect. **인증이 필요한 모든 페이지에 반드시 적용** (`/(main)/my/*`, `/(main)/profile`, `/(main)/matches/new`, `/(main)/lessons/new`, `/(main)/reviews`, `/teams/new`, `/team-matches/new`, `/mercenary/new` 등)
- `useChatUnreadTotal()` — 전체 미읽음 메시지 수 (`GET /chat/unread-count`), 하단 내비게이션 뱃지에 사용
- `useChatRoomSocket()` — Socket.IO `chat:message` 이벤트 구독, React Query 캐시 invalidate
- `useNotificationSocket()` — `notification:new` 이벤트 구독, 인앱 알림 상태 반영
- `usePushRegistration()` — Web Push 구독 (`POST /notifications/push-subscribe`), VAPID 기반, `sw-push.js` 서비스 워커 + Capacitor 분기 처리
- `useNotificationPreferences()` — 알림 선호도 조회 (`GET /notifications/preferences`). row 없는 신규 사용자는 default all-enabled 반환. Task 74 추가
- `useUpdateNotificationPreferences()` — 알림 선호도 저장 mutation (`PATCH /notifications/preferences`). `['notification-preferences']` invalidate. 8개 boolean 필드 `(teamApplicationEnabled, matchCompletedEnabled, eloChangedEnabled, chatMessageEnabled, mercenaryPostEnabled, teamMatchEnabled, paymentEnabled, systemEnabled)`. Task 74 추가
- `useTeamApplications(teamId)` — 팀 가입 신청자 목록 (`GET /teams/:id/applications`), manager+ 전제. 각 항목에 nickname/profileImageUrl/mannerScore 포함 (Task 69 추가)
- `useAcceptTeamApplication()` — 신청 수락 mutation (`PATCH /teams/:id/applications/:userId/accept`), `['team-applications', teamId]` + `['team-members', teamId]` invalidate (Task 69 추가)
- `useRejectTeamApplication()` — 신청 거부 mutation (`PATCH /teams/:id/applications/:userId/reject`), 동일 invalidate (Task 69 추가)
- `useUserPublicProfile(userId)` — 공개 프로필 조회 (`GET /users/:id`), PII 제외 필드만 반환 (Task 69 추가)
- `useStartDirectChat()` — 1:1 채팅방 생성 mutation (`POST /chat/rooms` type=direct), 생성 후 `/chat/:roomId` redirect (Task 69 추가)
- `useCloseMercenaryPost()` — 용병 모집글 종료 mutation (`POST /mercenary/:id/close`) (Task 69 추가)
- `useCancelMercenaryPost()` — 용병 모집글 취소 mutation (`POST /mercenary/:id/cancel`) (Task 69 추가)
- `usePreviewTeams(matchId)` — 팀 자동 구성 preview (dry-run) (`POST /matches/:id/teams/preview`), 호스트 전용. 응답: `{ teams, metrics: { maxEloGap, variance, stdDev, teamAvgElos, coldStartCount }, seed, participantHash }` (Task 71 추가, **Task 72**: `participantHash` 필드 추가로 stale preview 감지 지원). 429 수신 시 `retryAfterSeconds` 상태 노출 + info 토스트 표시(Track C에서 재추첨 버튼 60초 disable)
- `useComposeTeams(matchId, options?)` — 팀 배정 확정 (`POST /matches/:id/teams`), 성공 시 `['match', matchId]` + `['match-participants', matchId]` invalidate (Task 71 추가, **Task 72**: `options.onParticipantsChanged` 콜백 — 서버가 409 `PARTICIPANTS_CHANGED` 반환 시 stale hash 제거 후 호출자에게 재-preview 지시. info 토스트 "참가자가 변경되어 다시 계산했어요" 자동 표시)
- `useMyOrders(params?)` — buyer 주문 목록 (`GET /marketplace/orders/me`, cursor 페이지네이션) (Task 70 추가)
- `useOrder(id)` — 주문 상세 (`GET /marketplace/orders/:id`, buyer 또는 seller) (Task 70 추가)
- `useShipOrder()` — 판매자 배송 시작 mutation (`POST /marketplace/orders/:id/ship`) (Task 70 추가)
- `useDeliverOrder()` — 판매자 배송 완료 mutation (`POST /marketplace/orders/:id/deliver`) (Task 70 추가)
- `useConfirmReceipt()` — 구매자 수령 확인 mutation (`POST /marketplace/orders/:id/confirm-receipt`), `['order', id]` + `['my-orders']` invalidate (Task 70 추가)
- `useFileDispute()` — 분쟁 신청 mutation (`POST /marketplace/orders/:id/dispute`) (Task 70 추가)
- `useMyDisputes(role?)` — 내 분쟁 목록 (`GET /disputes/me?role=buyer|seller|all`) (Task 70 추가)
- `useDispute(id)` — 분쟁 상세 (`GET /disputes/:id`) (Task 70 추가)
- `useSellerRespond()` — 판매자 분쟁 답변 mutation (`POST /disputes/:id/respond`) (Task 70 추가)
- `useAddDisputeMessage()` — 분쟁 메시지 추가 mutation (`POST /disputes/:id/messages`) (Task 70 추가)
- `useWithdrawDispute()` — 분쟁 철회 mutation (`POST /disputes/:id/withdraw`) (Task 70 추가)
- `useAdminDisputes(params?)` — 어드민 분쟁 목록 (`GET /admin/disputes`) — Task 70에서 실제 Prisma 데이터로 재연결 (in-memory mock 제거) (Task 70 업데이트)
- `useAdminDispute(id)` — 어드민 분쟁 상세 (`GET /admin/disputes/:id`) (Task 70 추가)
- `useReviewDispute()` — 어드민 검토 시작 mutation (`POST /admin/disputes/:id/review`) (Task 70 추가)
- `useResolveDispute()` — 어드민 분쟁 해결 mutation (`PATCH /admin/disputes/:id/resolve`) (Task 70 추가)
- `useForceReleaseOrder()` — 어드민 에스크로 강제 해제 mutation (`POST /admin/orders/:id/force-release`) (Task 70 추가)
- `useAdminPayouts(params?)` — 어드민 payout 목록 (`GET /admin/payouts`, status/recipientId/batchId 필터) (Task 70 추가)
- `useAdminEligibleSettlements()` — 배치 가능 settlement 목록 (`GET /admin/payouts/eligible`) (Task 70 추가)
- `useCreatePayoutBatch()` — payout 배치 생성 mutation (`POST /admin/payouts/batch`) (Task 70 추가)
- `useMarkPayoutPaid()` — payout paid 처리 mutation (`PATCH /admin/payouts/:id/mark-paid`) (Task 70 추가)
- `useMarkPayoutFailed()` — payout failed 처리 mutation (`PATCH /admin/payouts/:id/mark-failed`) (Task 70 추가)

### 에러 처리 규칙
- **에러 메시지**: `catch (err)` 블록에서 직접 타입 단언 금지. `extractErrorMessage(err, 'fallback 메시지')` (`@/lib/utils`) 사용
- **에러 메시지 어조**: fallback 메시지는 반드시 **해요체** (`~했어요`, `~해주세요`). 합니다체 금지
- **SportType 타입**: `lib/constants.ts`의 `SportType` + `SPORT_TYPES` 사용. `@prisma/client` 직접 import 금지 (프론트엔드에서)

### 유틸 함수 (lib/utils.ts)
- `extractErrorMessage(err, fallback)` — catch 블록 에러 메시지 추출 (타입 단언 대신 반드시 사용)
- `formatCurrency(n)` — 금액 (0 → '무료', 그 외 'N원')
- `formatAmount(n)` — 결제 금액 (항상 'N원', 0도 '0원')
- `formatDate(dateStr)` / `formatMatchDate` — M/D (요일)
- `formatFullDate(dateStr)` — YYYY년 M월 D일 (요일)
- `formatDateDot(dateStr)` — YYYY.M.D (요일)
- `formatDateCompact(dateStr)` — YYYY.MM.DD
- `formatDateShort(dateStr)` — M월 D일
- `formatDateTime(dateStr)` — YYYY년 M월 D일 HH:MM
- `getTimeBadge(dateStr)` — 날짜 뱃지 (오늘/내일/이번 주)

## 디자인 원칙

- **타겟**: 20~40대 생활체육 동호인, 모바일 중심 사용
- **브랜드 성격**: 활발 · 스마트 · 친근 (친근함 70% + 전문성 30%)
- **원칙**: 즉시 이해 / 신뢰 우선 / 절제된 에너지 / 모바일 본무대 / 개성 있는 깔끔함
- **안티**: 올드한 웹 느낌, 과한 장식/효과, 복잡한 네비게이션

상세 디자인 가이드: `DESIGN.md` (`.impeccable.md`는 compatibility summary)

### 디자인 시스템
- **컬러**: 블루(#3182F6) 단일 액센트, Pretendard 폰트, 라이트+다크 모드
- **타입 스케일**: `globals.css` @theme 블록에 `--font-size-2xs`(10px) ~ `--font-size-6xl`(56px) 12단계. `text-[Npx]` 대신 토큰 사용
- **종목 컬러**: `lib/constants.ts`의 `sportCardAccent` — 11종목별 tint/badge/dot 클래스
- **종목 아이콘**: `components/icons/sport-icons.tsx`의 `SportIconMap` — 11종목 SVG
- **모션**: `globals.css`에 fade-in/slide-up/scale-in/badge-pulse, `prefers-reduced-motion` 대응
- **내비게이션**: 모바일 하단 플로팅 pill 바, 활성 탭 blue-500 액센트
- **레이아웃 재질**: 본문은 solid-first, glass는 navbar/header/overlay/button/panel chrome에서만 허용
  - **CSS 클래스 관리**: `globals.css`의 glass 패턴:
    - `.glass-mobile-header` (gradient: 0.88-0.72) — navbar/header 용
    - `.glass-mobile-nav` / `.floating-bottom-nav` (solid: light 0.82 / dark 0.72) — 하단 모바일 nav 전용, header와 별도 관리
- **스타일 절제**: shadow는 hairline-depth 중심, border는 subtle full-border 중심으로 사용

### 공유 UI 컴포넌트
- `components/ui/empty-state.tsx` — 빈 상태 (인라인 빈 상태 대신 반드시 사용)
- `components/ui/error-state.tsx` — 에러 + 재시도
- `components/ui/modal.tsx` — 모달 (ESC, backdrop, focus trap, aria-modal)
- `components/ui/toast.tsx` — 토스트 알림
- `components/chat/chat-bubble.tsx` — 채팅 버블 시스템 (반드시 사용)
- `components/teams/transfer-ownership-modal.tsx` — 소유권 이전 확인 모달 (owner 전용, `components/ui/modal.tsx` 기반)
- `components/user/user-card.tsx` — 재사용 가능 사용자 신원 카드 (avatar + nickname + sport profile + manner score + CTA slots). applicant row / mercenary applicant / team-match opponent에서 동일 컴포넌트 사용. 44x44 터치 타겟 + `aria-label` 내장 (Task 69 추가)
- `components/marketplace/confirm-receipt-button.tsx` — 구매자 수령 확인 CTA. T-7d 카운트다운 + 상태 aware (Task 70 추가)
- `components/marketplace/file-dispute-modal.tsx` — 분쟁 신청 모달 (`components/ui/modal.tsx` 기반, `FileDisputeDto` 폼) (Task 70 추가)
- `components/marketplace/seller-actions.tsx` — 판매자용 ship/deliver 액션 버튼 그룹, 주문 상태에 따라 노출 CTA 전환 (Task 70 추가)
- `components/dispute/dispute-message-thread.tsx` — 분쟁 메시지 스레드 (`components/chat/chat-bubble.tsx` 재사용, actorRole별 정렬) (Task 70 추가)
- `components/dispute/dispute-resolve-modal.tsx` — 어드민 분쟁 해결 모달 (action: refund | release | dismiss, note 입력, `components/ui/modal.tsx` 기반) (Task 70 추가)
- `components/admin/payout-batch-builder.tsx` — 어드민 payout 배치 생성 UI (eligible settlement 선택 → batch 생성 → mark-paid 흐름) (Task 70 추가)
- `lib/dispute-labels.ts` — 분쟁 status/type 레이블 단일 소스. 어드민 목록·상세·필터 전체에서 공유 (Task 70 추가)
- `components/match/auto-balance-modal.tsx` — 팀 자동 구성 모달 (preview → 재추첨 → 확정). **Task 72**에서 `previewHistory`(FIFO cap=2) 비교 토글, 재추첨 rate-limit 카운트다운 disable, aria-live dedup 공지 추가
- `components/match/confirm-replace-modal.tsx` — 기존 팀 배정이 있는 매치 재확정 경고 alertdialog. current teams 요약 + "교체"/"취소" CTA (Task 72 추가)

### 프론트엔드 품질 기준
- **Open Redirect 방지**: `/login?redirect=...` 파라미터는 반드시 `sanitizeRedirect()` (`apps/web/src/app/(auth)/login/page.tsx`)를 통과시켜 **상대 경로만** 허용한다. 절대 URL, `javascript:`, `//host/` 형태는 모두 차단하고 `/home`으로 fallback.
- **접근성 기준**: **WCAG 2.1 AA** 준수 (토스·당근마켓 동급). 컬러 대비 4.5:1, 키보드 접근성, 스크린리더 대응, `prefers-reduced-motion` 필수.
- **컬러만으로 정보 전달 금지**: 종목·상태·알림 등 의미 있는 구분은 반드시 **컬러 + 아이콘/텍스트/패턴**을 병행. 예: recruiting = 파란 점 + "모집중" 텍스트. 색맹 시뮬레이션 대응.
- **다크모드**: 모든 `bg-white` → `dark:bg-gray-800`, `text-gray-900` → `dark:text-white`. 라이트/다크 전환 시 4.5:1 대비 유지. 누락은 Critical.
- **터치 타겟**: 인터랙티브 요소 최소 44x44px (`min-h-[44px]`)
- **접근성 요소**: 아이콘 버튼 `aria-label`, 장식 `aria-hidden="true"`, 모달 `role="dialog"` + `aria-modal="true"` + ESC 핸들러 + focus trap
- **포커스 링**: 키보드 포커스 시 `blue-500` outline + 2px offset. 컬러에만 의존하지 않는 시각적 피드백.
- **성능**: `transition-all` 금지 → `transition-colors`/`transition-transform`, scaleX() 프로그레스
- **폼**: `<label htmlFor>` + `<input id>` 연결 필수, placeholder만으로 라벨 대체 금지

## 코드 컨벤션

- Git 컨벤션, 코드 품질, 응답 구조: 글로벌 `~/.claude/CLAUDE.md` 참조
- 한국어 사용자 대상이므로 UI 텍스트는 한국어
- 에러 코드: `DOMAIN_CODE` 형태 (e.g., MATCH_NOT_FOUND)

## Agent Team 운영

글로벌 `~/.claude/CLAUDE.md`의 Agent Team 운영 섹션 참조.
프로젝트별 에이전트 프롬프트: `.claude/agents/` 디렉토리 (개별 파일, 19 에이전트)

## 구현 문서 위치

구현 상세 문서는 별도 저장소. 주요 참조:
- 01_ARCHITECTURE: 시스템 아키텍처
- 02_DATABASE: DB 스키마 (Prisma 스키마로 변환 완료)
- 03_API_SPEC: API 엔드포인트
- 04_AI_MATCHING: 매칭 알고리즘
- 06_ICE_SPORTS: 빙상 스포츠 모듈
- 07_MARKETPLACE: 장터
- 08_PAYMENT: 결제 시스템

## Known Blockers

1. ~~**VAPID 키 미생성**~~ **Resolved in Task 74** — `WebPushService` 실제 `webpush.sendNotification()` 연결 완료. VAPID 3종 환경변수 주입 경로(`.env.example`, `configuration.ts`, `deploy/docker-compose.prod.yml`, GitHub Actions secrets) 정비 완료. 키 생성·갱신·롤백 절차: `docs/ops/vapid-setup.md` 참조.
   - **운영자 수동 필요**: GitHub Actions secrets(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) 실제 등록 — `docs/ops/vapid-setup.md` 1단계 참조.
   - **Capacitor iOS APNs** 네이티브 통합은 Apple Developer 계정 확정 후 **Task 75에서 활성화 예정**. Android는 VAPID 공유 경로(ChromeWebView) 재사용으로 추가 작업 없음.

2. **마켓플레이스 cron**: `DISABLE_MARKETPLACE_CRON` 환경변수가 설정되지 않으면 cron이 10분 주기로 자동 실행됨. 테스트 환경에서는 `DISABLE_MARKETPLACE_CRON=true` 로 비활성화 필요 (신규, Task 70 추가).
