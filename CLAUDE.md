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

## 환경 파일 접근 허용
- `.env`, `.env.local`, `.env.dev` — 읽기/수정 허용 (포트, URL 등 개발 설정 변경용)
- 단, 시크릿 값(SECRET_KEY, API_KEY, PASSWORD 등)은 출력하지 않음

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

## Agent Team 운영

글로벌 `~/.claude/CLAUDE.md`의 Agent Team 운영 섹션 참조.
프로젝트별 에이전트 프롬프트가 필요하면 `.claude/agents/` 디렉토리에 추가.

## 구현 문서 위치
구현 상세 문서는 별도 저장소에 있음. 주요 참조:
- 01_ARCHITECTURE: 시스템 아키텍처
- 02_DATABASE: DB 스키마 (Prisma 스키마로 변환 완료)
- 03_API_SPEC: API 엔드포인트
- 04_AI_MATCHING: 매칭 알고리즘
- 06_ICE_SPORTS: 빙상 스포츠 모듈
- 07_MARKETPLACE: 장터
- 08_PAYMENT: 결제 시스템
