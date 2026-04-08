# MatchUp - AI 기반 멀티스포츠 소셜 매칭 플랫폼

풋살/농구/아이스하키/배드민턴 등 생활체육 종목의 개인 및 팀을 AI로 최적 매칭하는 플랫폼.

## Core Engineering Principles

이 프로젝트의 모든 변경에는 아래 7개 원칙이 엄격히 적용됩니다.

1. **Resolve Tech Debt — Never Defer** (기술 부채는 즉시 해결)
   - 작업 범위 안의 TODO, hack, workaround, 임시 해결책은 같은 변경에서 고친다. 별도 티켓 이연 금지.
   - 리뷰어는 범위 내 미해결 기술 부채를 **Critical**로 표시 (Warning 아님).
   - 증명된 패턴: in-memory mock → Prisma 전환, `Record<string, unknown>` → DTO 전환 (Phase 1-5 참조).

2. **Design System Consistency** (디자인 시스템 일관성)
   - 우선순위: `.impeccable.md` > `DESIGN.md` > CSS 토큰(`globals.css` @theme) > `tailwind.config.*` > 코드 추론
   - 이 프로젝트는 **utility-first (Tailwind CSS v4)** 클래스 네이밍을 사용한다.
   - **토큰 우선**: 하드코딩 컬러/간격/폰트 금지. `text-2xs~text-6xl`, `sportCardAccent[sportType]`, `bg-blue-500` 사용.
   - **컴포넌트 재사용**: 인라인 마크업 전에 `components/ui/`의 `EmptyState`, `ErrorState`, `Modal`, `Toast`, `ChatBubble` 존재 여부 확인.

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
  web/              → Next.js 15 프론트엔드 (App Router)
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
- **프레임워크**: Next.js 15 (App Router, React 19)
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
- **프레임워크**: NestJS 11 + TypeScript
- **DB**: PostgreSQL 16 (Prisma 6 ORM)
- **캐시**: Redis 7 (ioredis)
- **인증**: JWT (passport-jwt) + OAuth (카카오/네이버/애플)
- **API 문서**: Swagger (@nestjs/swagger)
- **실시간**: Socket.IO (@nestjs/websockets)
- **유효성 검증**: class-validator + class-transformer
- **테스트**: Jest 30 + ts-jest + Supertest

### 인프라
- **모노레포**: pnpm workspaces + Turborepo
- **컨테이너**: Docker Compose (개발), Dockerfile (프로덕션)
- **CI/CD**: GitHub Actions
- **배포**: Docker (deploy/Dockerfile.api, deploy/Dockerfile.web)

### 포트 맵
| 서비스 | 포트 | 용도 |
|--------|------|------|
| Next.js | 3003 | 프론트엔드 개발 서버 |
| NestJS | 8100 | 백엔드 API 서버 |
| PostgreSQL | 5432 | 데이터베이스 |
| Redis | 6379 | 캐시/세션 |

## 개발 명령어

```bash
pnpm dev              # 전체 개발 서버 (프론트 3003 + 백엔드 8100)
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
- **장터**: 중고 장비 판매/대여/공동구매 + 에스크로 결제
- **강좌**: 그룹레슨/연습경기/자유연습/클리닉 + 티켓(1회권/다회권/기간권) + 출석 관리
- **팀 신뢰 점수**: 6항목 상호평가 → TeamTrustScore 누적
- **채팅**: Prisma `ChatRoom`/`ChatMessage`/`ChatParticipant` 모델로 영속화. cursor 기반 페이지네이션, `teamMatchId` 연동, get-or-create. in-memory stub 완전 제거. `ChatService`가 persist → broadcast 단일 경로 (REST + WS 공통)

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

## API 엔드포인트

### 인증 (`/auth`)
`POST register` | `POST login` | `POST dev-login` | `POST kakao/naver/apple` | `POST refresh` | `GET me` | `DELETE withdraw`

### 사용자 (`/users`)
`GET me` | `PATCH me` | `GET me/matches` | `GET :id`

### 매치 (`/matches`)
`GET /` | `GET recommended` | `POST /` | `GET :id` | `PATCH :id` | `POST :id/cancel` | `POST :id/close` | `POST :id/join` | `DELETE :id/leave` | `POST :id/teams` | `POST :id/complete`

### 팀 (`/teams`)
`GET /` | `GET me` (소유 팀 목록, JwtAuthGuard) | `GET :id` | `POST /` | `PATCH :id` | `DELETE :id`

**팀 멤버 관리** (Phase 1-5 추가):
`GET :id/members` | `POST :id/members` | `PATCH :id/members/:userId` | `DELETE :id/members/:userId` | `POST :id/leave`

**소유권 이전**:
`POST :id/transfer-ownership` (owner 전용, `TransferOwnershipDto` — `targetUserId`, `demoteTo: 'manager'|'member'`)

### 팀 매치 (`/team-matches`)
`GET /` | `GET :id` | `POST /` | `POST :id/apply` | `PATCH :id/applications/:appId/approve|reject` | `POST :id/check-in` | `POST :id/result` | `POST :id/evaluate` | `GET :id/referee-schedule`

**신청 조회** (Phase 1-5 추가):
`GET :id/applications` (호스트 뷰) | `GET me/applications` (신청자 본인 뷰)

### 장터 (`/marketplace`)
`GET listings` | `POST listings` | `GET listings/:id` | `POST listings/:id/order`

### 결제 (`/payments`)
`POST prepare` | `POST confirm` | `POST :id/refund` | `GET me` | `POST webhook`

### 업로드 (`/uploads`)
`POST /` (멀티파트, 최대 5개 10MB, jpeg/png/webp/gif) | `GET :id` | `DELETE :id`

### 채팅 (`/chat`)
`GET rooms` (cursor on lastMessageAt) | `GET rooms/:id` (cursor on message createdAt) | `POST rooms` (with optional teamMatchId) | `POST rooms/:id/messages` | `POST rooms/:id/read` | `GET unread-count`

### 구장 (`/venues`)
`GET /` | `GET :id` | `GET :id/schedule` | `POST :id/reviews`

### 관리자 (`/admin`)
`GET stats/users/matches/lessons/teams/venues/payments` | `POST lessons/teams/venues` | `PATCH matches/:id/status` | `PATCH lessons/:id/status` | `PATCH venues/:id`

### 정산 (`/admin/settlements`)
`GET /` | `GET summary` | `PATCH :id/process`

### 분쟁 (`/admin/disputes`)
`GET /` | `GET :id` | `POST /` | `PATCH :id/status`

### 용병 (`/mercenary`)
`GET /` | `POST /` | `GET :id` | `POST :id/apply`

**신청 관리** (Phase 1-5 추가):
`GET me/applications` (신청자 본인 뷰) | `PATCH :id/applications/:appId/accept|reject` (호스트 뷰) | `DELETE :id/applications/me` (신청 취소)

### 알림 (`/notifications`)
`GET /` | `PATCH :id/read` | `POST push-subscribe` (body `{endpoint, keys}`) | `DELETE push-unsubscribe` (body `{endpoint}`) | `GET vapid-public-key`

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

### 상태 관리
- 서버 상태: TanStack React Query (캐싱, 재요청)
- 클라이언트 상태: Zustand stores (`stores/` 디렉토리)
- 로컬 포맷터 정의 금지 — 반드시 `lib/utils.ts` 유틸 사용

### 주요 커스텀 훅 (`hooks/use-api.ts`)
- `useMyTeams()` — 로그인 유저 소유 팀 목록 (`GET /teams/me`), 팀 선택 UI·팀 매칭 생성 시 사용
- `useRequireAuth()` — 비로그인 접근 시 로그인 페이지로 redirect. **인증이 필요한 모든 페이지에 반드시 적용** (`/(main)/my/*`, `/teams/new`, `/team-matches/new`, `/mercenary/new` 등)
- `useChatUnreadTotal()` — 전체 미읽음 메시지 수 (`GET /chat/unread-count`), 하단 내비게이션 뱃지에 사용
- `useChatRoomSocket()` — Socket.IO `chat:message` 이벤트 구독, React Query 캐시 invalidate
- `useNotificationSocket()` — `notification:new` 이벤트 구독, 인앱 알림 상태 반영
- `usePushRegistration()` — Web Push 구독 (`POST /notifications/push-subscribe`), VAPID 기반, `sw-push.js` 서비스 워커 + Capacitor 분기 처리

### 유틸 함수 (lib/utils.ts)
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

상세 디자인 가이드: `.impeccable.md`

### 디자인 시스템
- **컬러**: 블루(#3182F6) 단일 액센트, Pretendard 폰트, 라이트+다크 모드
- **타입 스케일**: `globals.css` @theme 블록에 `--font-size-2xs`(10px) ~ `--font-size-6xl`(56px) 12단계. `text-[Npx]` 대신 토큰 사용
- **종목 컬러**: `lib/constants.ts`의 `sportCardAccent` — 11종목별 tint/badge/dot 클래스
- **종목 아이콘**: `components/icons/sport-icons.tsx`의 `SportIconMap` — 11종목 SVG
- **모션**: `globals.css`에 fade-in/slide-up/scale-in/badge-pulse, `prefers-reduced-motion` 대응
- **내비게이션**: 모바일 하단 플로팅 pill 바, 활성 탭 blue-500 액센트

### 공유 UI 컴포넌트
- `components/ui/empty-state.tsx` — 빈 상태 (인라인 빈 상태 대신 반드시 사용)
- `components/ui/error-state.tsx` — 에러 + 재시도
- `components/ui/modal.tsx` — 모달 (ESC, backdrop, focus trap, aria-modal)
- `components/ui/toast.tsx` — 토스트 알림
- `components/chat/chat-bubble.tsx` — 채팅 버블 시스템 (반드시 사용)
- `components/teams/transfer-ownership-modal.tsx` — 소유권 이전 확인 모달 (owner 전용, `components/ui/modal.tsx` 기반)

### 프론트엔드 품질 기준
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

1. **이미지 업로드 UI 미구현**: `/uploads` 백엔드 파이프라인(sharp 변환, 로컬 스토리지)은 완성됐으나 매치 생성/수정 등 프론트엔드 UI(`components/ui/image-upload.tsx`)는 미구현 상태. Phase 2 채팅 이미지, 도착 인증 사진 전 구현 필요.

2. **VAPID 키 미생성**: `WebPushService`는 크레덴셜 없을 때 graceful disable(`enabled=false`)로 동작하므로 빌드/머지는 가능. 실제 디바이스 푸시 수신은 아래 환경변수가 필요:
   ```bash
   # 키 생성: node -e "const wp = require('web-push'); console.log(wp.generateVAPIDKeys())"
   VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=
   VAPID_SUBJECT=mailto:admin@matchup.kr
   ```
   Capacitor 모바일 푸시는 `@capacitor/push-notifications` + 네이티브 프로젝트 설정 추가 필요.
