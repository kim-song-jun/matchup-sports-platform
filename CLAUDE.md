# MatchUp - AI 기반 멀티스포츠 소셜 매칭 플랫폼

## 프로젝트 개요
풋살/농구/아이스하키/배드민턴 등 생활체육 종목의 개인 및 팀을 AI로 최적 매칭하는 플랫폼.

## 기술 스택
- **모노레포**: pnpm workspaces + Turborepo
- **프론트엔드**: Next.js 15 (App Router) + Tailwind CSS v4
- **모바일**: Capacitor 6 (iOS/Android 래핑)
- **백엔드**: NestJS + TypeScript
- **DB**: PostgreSQL 16 + Redis 7
- **ORM**: Prisma
- **실시간**: Socket.IO (NestJS Gateway)
- **인증**: JWT + OAuth (카카오/네이버/애플)
- **결제**: 토스페이먼츠

## 디렉토리 구조
```
apps/web/     → Next.js 프론트엔드
apps/api/     → NestJS 백엔드
```

## 개발 명령어
```bash
pnpm dev          # 전체 개발 서버 (프론트 3003 + 백엔드 8100)
pnpm db:push      # Prisma 스키마 DB 반영
pnpm db:studio    # Prisma Studio (DB 브라우저)
docker compose up -d  # PostgreSQL + Redis 실행
```

## 테스트
```bash
cd apps/web && pnpm test       # 프론트엔드 (vitest, jsdom)
cd apps/api && pnpm test       # 백엔드 (jest)
npx playwright test            # E2E
```

### 브라우저 E2E 테스트 (Preview 도구)
```bash
# 1. 환경 준비 (DB + API 필수)
docker compose up -d                    # PostgreSQL + Redis
pnpm --filter api exec prisma generate  # Prisma client 생성
pnpm --filter api exec prisma db push   # 스키마 반영
# 2. .claude/launch.json의 "web"(3003) + "api"(8100) 서버 사용
```
- **Preview 도구 패턴**: `preview_start("web")` → `preview_snapshot` (구조) → `preview_screenshot` (시각) → `preview_console_logs(level:"error")` (에러)
- **페이지 이동**: 사이드바/Link 클릭(`preview_click`)으로 클라이언트 네비게이션 유지. `window.location.href`는 Zustand 스토어 리셋됨
- **로그인**: devLogin(`축구왕민수` 버튼)으로 테스트 계정 사용. API 서버 필수
- **인증 복원**: `auth-store.ts`에서 localStorage 토큰 기반 초기값 설정 + `providers.tsx`의 `AuthHydrator`가 `/auth/me`로 사용자 정보 복원
- **검증 순서**: 로그인 → 네비게이션(사이드바/하단탭) → 핵심 페이지 → 퍼블릭 → 마이페이지 → 어드민 → 크로스커팅(다크모드/반응형/접근성)
- **다크모드 테스트**: `preview_eval("document.documentElement.classList.toggle('dark')")`
- **반응형 테스트**: `preview_resize(preset:"mobile"|"tablet"|"desktop")` 또는 `preview_resize(width:1280, height:800)`
- **접근성 체크**: `preview_snapshot`으로 aria-label 존재 확인, `preview_inspect`로 터치 타겟 44px 검증

## 인증 아키텍처
- **스토어**: `stores/auth-store.ts` — Zustand, localStorage 토큰 존재 시 `isAuthenticated: true`로 초기화 (SSR-safe)
- **복원**: `providers.tsx`의 `AuthHydrator` — 마운트 시 `/auth/me` 호출하여 실제 사용자 정보 채움
- **토큰**: localStorage(`accessToken`/`refreshToken`) + cookie(`accessToken=1`, 미들웨어용)
- **API 인터셉터**: `lib/api.ts` — 요청마다 `Authorization: Bearer` 자동 첨부
- **가드**: 어드민 레이아웃은 `isAuthenticated` 체크 → 미인증 시 `/login` 리다이렉트
- **주의**: `window.location.href` 하드 네비게이션은 Zustand 리셋 — Next.js `<Link>` 또는 `router.push` 사용할 것

## 코드 컨벤션
- 한국어 사용자 대상이므로 UI 텍스트는 한국어
- API 응답은 `{ status, data, timestamp }` 형태
- Cursor 기반 페이지네이션 사용
- API 경로: `/api/v1/*`
- 에러 코드: `DOMAIN_CODE` 형태 (e.g., MATCH_NOT_FOUND)
- 로컬 포맷터 정의 금지 — 반드시 `lib/utils.ts` 유틸 사용

## 유틸 함수 (lib/utils.ts)
- `formatCurrency(n)` — 금액 (0 → '무료', 그 외 'N원')
- `formatAmount(n)` — 결제 금액 (항상 'N원', 0도 '0원')
- `formatDate(dateStr)` / `formatMatchDate` — M/D (요일)
- `formatFullDate(dateStr)` — YYYY년 M월 D일 (요일)
- `formatDateDot(dateStr)` — YYYY.M.D (요일)
- `formatDateCompact(dateStr)` — YYYY.MM.DD
- `formatDateShort(dateStr)` — M월 D일
- `formatDateTime(dateStr)` — YYYY년 M월 D일 HH:MM
- `getTimeBadge(dateStr)` — 날짜 뱃지 (오늘/내일/이번 주)

## Design Context
- **타겟**: 20~40대 생활체육 동호인, 모바일 중심 사용
- **브랜드 성격**: 활발 · 스마트 · 친근
- **감정 목표**: 신뢰감 + 활기 (친근함 70% + 전문성 30%)
- **레퍼런스**: 플랩(PLAB), 당근마켓, 토스(Toss), 나이키 런 클럽(NRC)
- **안티**: 올드한 웹 느낌, 과한 장식/효과, 복잡한 네비게이션
- **원칙**: 즉시 이해 / 신뢰 우선 / 절제된 에너지 / 모바일 본무대 / 개성 있는 깔끔함
- **상세**: `.impeccable.md` 참조

## 디자인 시스템
- **타입 스케일**: `globals.css` @theme 블록에 `--font-size-2xs`(10px) ~ `--font-size-6xl`(56px) 12단계 정의. `text-[Npx]` 대신 `text-2xs`~`text-6xl` 토큰 사용
- **종목 컬러**: `lib/constants.ts`의 `sportCardAccent` — 11종목별 tint/badge/dot 클래스. 카드에 종목 뱃지(`sportCardAccent[sportType]?.badge`)로 종목 구분
- **종목 아이콘**: `components/icons/sport-icons.tsx`의 `SportIconMap` — 11종목 SVG 컴포넌트
- **컬러**: 블루(#3182F6) 단일 액센트, Pretendard 폰트. 다크모드 전체 페이지 지원
- **모션**: `globals.css`에 fade-in/slide-up/scale-in/badge-pulse 등 정의, `prefers-reduced-motion` 대응 완료

## 공유 UI 컴포넌트
- `components/ui/empty-state.tsx` — 빈 상태 표시 (icon, title, description, action, size='sm'|'md')
- `components/ui/error-state.tsx` — 에러 + 재시도 버튼
- `components/ui/modal.tsx` — 공유 모달 (ESC, backdrop, focus trap, aria-modal)
- `components/ui/toast.tsx` — 토스트 알림
- 인라인 빈 상태 대신 반드시 `<EmptyState />` 사용할 것

## 프론트엔드 품질 기준
- 다크모드: 모든 `bg-white`에 `dark:bg-gray-800`, `text-gray-900`에 `dark:text-white`, `border-gray-100`에 `dark:border-gray-700`
- 터치 타겟: 모든 인터랙티브 요소 최소 44x44px (`min-h-[44px]`)
- 접근성: 아이콘 전용 버튼에 `aria-label`, 장식 요소에 `aria-hidden="true"`, 모달에 `role="dialog"` + ESC 핸들러
- 성능: `transition-all` 대신 `transition-colors`/`transition-transform` 사용, progress bar는 `transform:scaleX()` 사용
- 폼: `<label htmlFor>` + `<input id>` 연결, placeholder만으로 라벨 대체 금지

## 구현 문서 위치
구현 상세 문서는 별도 저장소에 있음. 주요 참조:
- 01_ARCHITECTURE: 시스템 아키텍처
- 02_DATABASE: DB 스키마 (Prisma 스키마로 변환 완료)
- 03_API_SPEC: API 엔드포인트
- 04_AI_MATCHING: 매칭 알고리즘
- 06_ICE_SPORTS: 빙상 스포츠 모듈
- 07_MARKETPLACE: 장터
- 08_PAYMENT: 결제 시스템
