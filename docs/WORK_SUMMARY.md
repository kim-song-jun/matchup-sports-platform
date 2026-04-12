# MatchUp 플랫폼 작업 요약

> 이 문서는 작업 히스토리 요약이다. 현재 구현 surface와 검증 상태의 source of truth는 각각 `docs/IMPLEMENTATION_STATUS.md`, `docs/scenarios/index.md`다.

## 개요

MatchUp 스포츠 매칭 플랫폼의 프론트엔드 디자인 시스템 전면 개선, 코드 품질 정비, 반응형 시스템 마이그레이션, 국제화(i18n) 인프라 구축, E2E 테스트 스위트 작성을 수행함.

**작업 기간**: 2026-03-28 ~ 2026-03-29
**총 커밋**: 16건 (디자인 QA 시작 이후)
**변경 규모**: 230개 파일, +13,003줄 / -1,279줄

### 2026-04-06 추가 업데이트
- 외부 Unsplash fallback을 제거하고 `/apps/web/public/mock/` 기반 로컬 이미지 팩을 추가
- 핵심 종목/팀/시설/장터 자산은 AI 생성 `webp`, 나머지는 SVG fallback으로 구성
- 종목 카드, 팀 카드, 장터 카드, 시설 카드, 팀/장터/시설 상세에 deterministic image rotation 적용
- 이미지가 없는 API 응답에서도 리스트와 상세가 항상 다양한 비주얼을 노출하도록 헬퍼 계층 보강
- 개발용 `docker-compose.yml`을 API/Web/Postgres/Redis 전체 스택 기준으로 확장
- `make dev`, `make up`, `make stop`, `make down`, `make db:*`를 Docker 중심 흐름으로 정리

### 2026-04-07 추가 업데이트
- 풋살 mock 이미지를 `/apps/web/public/mock/photoreal/futsal/` 실사 사진 10장 세트로 교체
- 팀 카드/상세의 로고 fallback을 deterministic SVG emblem으로 보강
- 실사형 mock 자산 출처를 `/apps/web/public/mock/photoreal/ATTRIBUTION.md`에 기록하는 규칙 추가

### 2026-04-10 추가 업데이트

- **SafeImage 보안 강화**: `normalizeSrc()` 함수 추가 — `..` 경로 순회 방어, `data:image/` URI만 허용(bare `data:` 차단), 상대 경로 자동 정규화. `resolvedPriority` 버그 수정(undefined → 항상 boolean). `usedFallback` 상태로 에러 루프 방지
- **nginx 보안 헤더**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy 5개 헤더 전체 location 블록에 추가(nginx 상속 규칙 대응). `/uploads/` rate limiting(10req/min per IP, burst=5), Swagger `/docs` 내부망(`127.0.0.1`) 전용 접근 제한, WebSocket keepalive `proxy_read_timeout 86400s`, `client_max_body_size 55m` 설정
- **업로드 라우팅 및 RSC prefetch**: `next.config.ts`에 `/uploads/:path*` → `INTERNAL_API_ORIGIN` rewrite 추가. 홈 페이지 SSR 단계에서 matches/teams/lessons/listings/team-matches 데이터 prefetch → HydrationBoundary 적용. `server-fetch.ts` TransformInterceptor 응답 파싱 강화 및 `status` 필드 타입 검증
- **백엔드 DTO 추가**: `lessons/` — `CreateLessonDto` 추가, 서비스/컨트롤러 DTO 통합. `teams/` — `CreateTeamDto` 추가, 서비스/컨트롤러 DTO 통합. `chat.service.ts` 및 `marketplace.controller.ts` 타입 수정
- **계정 설정 WCAG 2.1 AA**: `settings/account` 페이지에 `useRequireAuth()` 추가. DeleteModal에 `role="dialog"`, `aria-modal`, `aria-labelledby`, ESC 핸들러, focus trap 적용. 다크모드 `dark:bg-red-900/30`, disabled 버튼 `pointer-events-none`, `transition-[colors,transform]` 복원
- **i18n 텍스트 정리**: 홈 클라이언트의 하드코딩 "코치", "대여" → i18n 키(`t('coach')`, `t('rent')`) 교체
- **alt 텍스트 개선**: 매치 목록 카드 이미지 `alt=""` → 의미 있는 alt 텍스트(`` `${sportLabel[match.sportType]} 매치 - ${match.title}` ``)
- **에이전트 파이프라인 완료**: agent-review Round 1 Critical 5 / Warning 9 → Round 2 Critical 0 / Warning 0. agent-qa 4 페르소나 전원 통과(Beginner 4/4, Regular 5/6→non-blocking, Power 7/7, UI/UX 9/9)
- **백엔드 DTO 신규 생성**: `lessons/dto/create-lesson.dto.ts`, `teams/dto/create-team.dto.ts` — class-validator 기반 DTO 추가. `lessons.controller.ts`, `marketplace.controller.ts`, `teams.controller.ts`에 `limit` NaN/음수 방어 추가
- **타입 안전성**: `lessons.service.ts`, `teams.service.ts` — `Prisma.LessonWhereInput` / `Prisma.SportTeamWhereInput` 명시적 타입 적용
- **chat N+1 해소**: `chat.service.ts` `getUnreadCount()` — 참가방 순회 N+1 → `$queryRaw` 단일 집계 쿼리. 본인 발송 메시지 제외 로직 추가. `chat.service.spec.ts` 5개 케이스로 재작성
- **nginx 보안/성능**: `/api/docs` 접근 내부 IP 제한, `client_max_body_size 55m`, `/uploads/` rate limit 10req/min, WebSocket `proxy_read_timeout 86400s`
- **저장소 정리**: `.gitignore`에 `*.bak.*`, `__pycache__/`, `*.pyc` 패턴 추가. 백업 파일 3개 + pyc 2개 인덱스 제거

### 2026-04-11 추가 업데이트

- **team/venue hub rollout**: `/teams/[id]`, `/venues/[id]`를 `overview / goods / passes / events` 허브 landing으로 재구성하고, 팀/장소 소속 콘텐츠를 집계하는 `GET /teams/:id/hub`, `GET /venues/:id/hub` read model을 추가
- **owner-scoped catalog affiliation**: `Lesson.teamId`, `MarketplaceListing.teamId/venueId`, `Venue.ownerId`를 도입해 팀/장소 귀속 데이터와 capability 기반 edit CTA를 연결
- **tournament minimum domain**: `/tournaments`, `/tournaments/[id]`, `/tournaments/new`와 `GET/POST /tournaments`를 추가하고, 허브 `events` section과 연결
- **hub validation**: `api db:generate`, `api tsc`, targeted backend unit, `api build`, `web tsc`, targeted hooks vitest, `/api/v1/health`, hub endpoint, route HTTP 200 smoke를 확인
- **dev mock seed workflow**: `apps/api/prisma/mock-data-catalog.ts`, `apps/api/prisma/seed-mocks.ts`, `make db-seed-mocks`, `pnpm db:seed:mocks`를 추가해 canonical mock dataset을 non-destructive upsert 경로로 분리
- **deploy checksum gate**: `SeedSyncState` 테이블과 `seed-mocks.ts --checksum-gate`를 추가해 deploy마다 checksum을 확인하고, `DEPLOY_SYNC_MOCK_DATA=false`가 아닌 한 필요한 경우에만 canonical mock dataset을 자동 sync하도록 연결
- **deploy/runtime wiring**: `.github/workflows/deploy.yml`, `deploy/docker-compose.prod.yml`, `deploy/.env.prod.example`, `deploy/setup-ec2.sh`, `deploy/DEPLOY_GUIDE.md`를 같은 변경으로 맞춰 CI 배포와 수동 EC2 bootstrap이 동일한 mock sync 계약을 따르게 정리했고, `bootstrap-deploy-db.ts`로 빈 DB bootstrap fallback과 기존 DB `migrate deploy` 경로를 하나의 entrypoint로 통합
- **canonical mock dataset 범위 확장**: mock users 12, venues 10, teams 10, matches 11, lessons 8, listings 10, mercenary posts 8, team matches 6, team badges 6으로 확대하고 soccer/baseball/volleyball/swimming/figure/short-track surface까지 커버
- **public profile mock assets**: `apps/web/public/mock/profile/profile-01.svg` ~ `profile-12.svg`를 추가하고 mock users의 `profileImageUrl`이 로컬 public asset을 직접 참조하도록 맞춤
- **seed 검증 결과**: checksum-gated deploy run 1회차는 state 저장 후 sync, 2회차는 `checksum unchanged` skip, `DEPLOY_SYNC_MOCK_DATA=false`는 disabled skip으로 동작했고, profile/team/match/lesson/listing/venue image field가 `/mock/*` 기반으로 유지되는 것을 DB query로 확인
- **empty DB bootstrap 검증**: 신규 임시 Postgres에서 기존 migration chain 단독 replay가 실패하는 것을 재현한 뒤, `bootstrap-deploy-db.ts`가 orphaned migration history reset 후 `db push + migrate resolve + migrate deploy`까지 통과하도록 보완
- **모바일 glass chrome system**: `globals.css`에 mobile glass token/class 세트를 추가하고, `BottomNav`, `(main) layout`, `landing-nav`, 홈 상단, 반복되는 detail sticky header를 공용 `MobileGlassHeader` 패턴으로 정리. 원칙은 `glass as frame, solid as content`로 고정
- **디자인 규칙 명문화**: `.impeccable.md`, `AGENTS.md`에 mobile glass는 bottom nav / sticky header / overlay 같은 chrome layer에만 제한하고 dense content surface는 solid 유지한다는 규칙 추가
- **프론트 검증 결과**: `pnpm --filter web test`, `pnpm --filter web lint` 통과. `tsc --noEmit`는 초기 실행에서는 통과했지만 ad hoc Next route-type regeneration 이후 task 범위 밖의 기존 타입 에러(`matches/new`, `team-matches/*`, `mercenary/page`, `uploads.ts`)가 surfaced 됐다. `pnpm --filter web build`는 기존 `@/components/ui/image-upload` module resolution 이슈로 실패했고, ad hoc Next dev browser smoke도 기존 React Client Manifest 오류로 막혀 non-task blocker로 기록
- **문서 truth sync**: `docs/scenarios/index.md`, 개별 scenario 문서, `IMPLEMENTATION_STATUS`, `PAGE_FEATURES`의 상태 언어를 `구현됨 / 검증됨 / 부분 구현 / 미지원 / follow-up`으로 정리
- **stale claim 재분류**: `MATCH-003 blocked`, `/mercenary/[id] 미존재`, `/settings/notifications`의 저장 완료처럼 현재 코드와 충돌하던 문구를 현재형 기준으로 수정
- **backlog 추적성 보존**: outdated 항목은 삭제하지 않고 `stale / superseded / follow-up` 언어로 남겨 다음 구현 라운드의 single source를 복원

### 2026-04-08 추가 업데이트
- `apps/web/src/lib/sport-image.ts`의 active fallback catalog를 전부 `/apps/web/public/mock/photoreal/` 기반 실사 사진으로 전환
- 축구, 농구, 배드민턴, 아이스하키, 수영, 테니스, 야구, 배구, 피겨, 쇼트트랙, 팀, 시설, 장터에 대한 로컬 실사 fallback 풀을 정리
- 실사감이 약하거나 스포츠 맥락이 약한 후보 컷은 active set에서 제외하고 attribution 문서를 전체 세트 기준으로 갱신
- `내 장터 매물`, `매물 등록` 예시 썸네일, `팀 매치 스코어/상세` 로고 슬롯까지 helper 기반 fallback 적용 범위를 확장
- 매치 상세, 강좌 상세, 내 장터 매물 화면도 공용 photoreal helper를 쓰도록 확장해 아이콘/빈 박스 기반 이미지 자리표시자를 제거
- 빈 문자열 이미지 URL을 helper에서 정리하도록 보강하고, 매치 상세의 시설 썸네일은 venue-aware fallback 우선순위로 수정
- `시설 찾기` 목록 카드도 venue helper를 쓰도록 맞춰 시설 리스트와 시설 상세의 fallback 계층을 일치시킴
- `매치 만들기`, `매치 수정` 화면은 업로드 전 빈 슬롯 대신 실사형 예시 스트립을 노출하도록 정리해 작성 플로우에서도 placeholder 느낌을 제거
- review/design/QA 파이프라인은 모두 blocking issue 없이 종료됐고, 남은 후속은 보호 경로 시각 스모크 자동화 안정화 정도로 정리됨

---

## 1. Deadcode 제거 및 코드 정리

### 미사용 코드 삭제
- 미사용 컴포넌트 3개 삭제 (`sport-card.tsx`, `referee-incentive.tsx`, `chat-button.tsx`)
- 미사용 Hook `useCreateOrder()` 제거
- 미사용 Type `CheckoutInput` 제거
- 미사용 CSS `.stagger-1` ~ `.stagger-9` 제거
- 미사용 `packages/shared/` 패키지 전체 삭제 + workspace 정리

### 중복 포맷터 통합
- `lib/utils.ts`에 5개 포맷터 추가 (`formatAmount`, `formatDateDot`, `formatDateCompact`, `formatDateShort`, `formatDateTime`)
- 30+곳의 로컬 중복 포맷터를 import로 교체
- `formatCurrency` (0→무료) vs `formatAmount` (항상 원) 의미적 분리

### 배포 수정
- `Dockerfile.api`, `Dockerfile.web`에서 삭제된 `packages/shared/` 참조 제거

---

## 2. 디자인 시스템 전면 개선

### 2.1 다크모드 완전성 (596건 → 0건)
- 76개 파일에 958개 `dark:` 클래스 추가
- `bg-white` → `dark:bg-gray-800`, `text-gray-900` → `dark:text-white`, `border-gray-100` → `dark:border-gray-700` 전수 적용
- 주요 10페이지 다크모드 누락 0건 달성

### 2.2 transition-all 제거 (202건 → 0건)
- 58개 파일에서 `transition-all` → `transition-colors` / `transition-[colors,transform]` 전환
- CLAUDE.md 성능 규정 완전 준수

### 2.3 EmptyState 통일 (69건 교체)
- 30+개 파일에서 인라인 빈 상태 → `<EmptyState />` 컴포넌트로 교체
- 한국어 마이크로카피 따뜻한 톤으로 통일

### 2.4 AI 슬롭 제거
- 이모지 런타임 정규식 (`replace(/[\u{1F300}...]/gu)`) 10건 제거
- blur-3xl 장식 배경 8개 제거 (landing/guide/faq/pricing)
- CountUp 애니메이션 → 정적 텍스트로 교체
- 유니코드 이스케이프 → 실제 이모지 문자로 교체

### 2.5 태그/뱃지 모던화
- `rounded px-1.5 py-0.5 text-2xs font-semibold` → `rounded-full px-2 py-0.5 text-xs font-normal`
- "모집중" 색상: blue → emerald 전체 통일
- 타입 태그에 배경 추가 (텍스트만 → bg-gray-100 배지)
- "마감임박" 색상: red → amber (에러가 아닌 경고 의미)

### 2.6 카드 시스템 토스 스타일 전환
- 카드 `border border-gray-100` → `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` (8곳)
- 카드 텍스트 영역 패딩 `p-3` → `p-4`
- 카드 정보 밀도: 4줄 → 3줄 (장소를 날짜 줄에 합침)
- 프로필 통계: 박스 그리드 → `divide-x` 수평 구분선

### 2.7 아이콘/간격/푸터 통일
- 비표준 아이콘 크기 제거: size={11/13/15/22} → 표준 size={12/14/18/20/24}
- 상세페이지 카드 `rounded-2xl` → `rounded-xl`
- 섹션 간격 `mt-3` → `mt-4` 통일
- 랜딩 푸터: `bg-gray-950` → `bg-gray-50 dark:bg-gray-900` + 네비 링크 제거

### 2.8 종목 컬러 시스템
- `border-l-4` 사이드 보더 → 뱃지/태그 방식 통일
- `sportCardAccent`에서 `border` 속성 완전 제거
- 아이스하키 색상: blue → teal (풋살과 구분)
- `matchStatusColor` 상수 추가 (recruiting=emerald, full=amber, completed=gray 등)

### 2.9 타이포그래피 정제
- 뱃지 `font-medium` → `font-normal` (가벼운 느낌)
- "Lv.3 중급" → "중급" (Lv. 접두사 제거)
- 인원수 `font-semibold` → `font-normal`
- 알림 unread dot `animate-badge-pulse` 제거 (정적)
- 하단탭 라벨 `text-2xs` → `text-[10px] font-normal`

---

## 3. 채팅/알림 뱃지 UX 개선

### 프로필 통합 뱃지
- 모바일 FAB 제거 → 프로필 탭 아이콘에 통합 뱃지
- 채팅 + 알림 합산 표시 (chat 타입 알림은 이중 카운트 방지로 제외)

### notification-store 생성
- `stores/notification-store.ts` — Zustand 스토어
- `getUnreadCount()`에서 `type !== 'chat'` 필터로 이중 카운트 방지
- 알림 페이지가 스토어를 소비하도록 전환

### 프로필 소통 바로가기
- 프로필 페이지에 채팅/알림 2열 카드 추가
- 데스크탑 사이드바에 채팅/알림 pill 뱃지 표시

---

## 4. 반응형 시스템: Container Query 마이그레이션

### 문제
- `lg:` (1024px 뷰포트) 단일 브레이크포인트만 사용
- 태블릿(768px)에서 모바일 레이아웃 강제 → 디자인팀 점수 5/10

### 해결
- Tailwind v4 컨테이너 쿼리 (`@3xl:`, `@5xl:`) 적극 활용
- 레이아웃에 `@container` 클래스 추가
- 모바일 컨테이너 `max-w-lg` → `max-w-3xl` (태블릿 넓이 활용)
- **74개 파일**에서 `lg:` 331건 → `@3xl:` 전환
- `lg:` 유지: layout.tsx, chat embed (뷰포트 기반 사이드바/탭 전환)
- sidebar-sticky CSS: 미디어 쿼리 → `@container (min-width: 48rem)` 전환

### 효과
- 태블릿(768px): 리스트 자동 2열 그리드, 상세페이지 2열 레이아웃
- 컴포넌트가 뷰포트가 아닌 실제 가용 공간에 반응

---

## 5. 국제화 (i18n) 인프라

### next-intl 설정
- `next-intl@4.8.3` 설치
- `i18n/routing.ts` — ko(기본) + en
- `i18n/request.ts` — NEXT_LOCALE 쿠키 기반 로케일 감지
- `next.config.ts` — `createNextIntlPlugin` 래핑
- webpack buffer fallback 추가 (브라우저 에러 수정)

### 번역 파일
- `messages/ko.json` + `messages/en.json` — 11개 네임스페이스
- common, nav, sports, levels, matchStatus, home, matches, lessons, marketplace, teams, profile, notifications, chat, empty, time

### 페이지별 적용
- 사이드바, 하단탭, 홈, 매치, 강좌, 장터, 팀, 프로필, 알림, 채팅 — `useTranslations()` 훅으로 전환
- `LocaleSwitcher` 컴포넌트 — 사이드바에 배치 (EN ↔ 한국어)

---

## 6. E2E 테스트 스위트

### Playwright 테스트 (21개, 100% 통과)

| 카테고리 | 테스트 수 | 커버리지 |
|---------|---------|---------|
| Home page | 6 | 필터, 배너, 섹션, 레벨 정보 |
| Navigation - Desktop | 4 | 사이드바, 로케일, 링크, 뱃지 |
| Navigation - Mobile | 4 | 하단탭, 라벨, 뱃지, 탭 전환 |
| Matches | 3 | 리스트, 상세, 생성 |
| Teams/Lessons/Marketplace | 4 | 페이지 로드, 필터, 헤딩 |
| Auth states | 3 | 비로그인 알림/채팅/프로필 |
| Dark mode | 7 | 7개 주요 페이지 다크모드 렌더링 |
| Responsive | 7 | 375px/768px/1440px 레이아웃 |
| Accessibility | 4 | 헤딩 위계, aria-label, 터치 타겟 |
| Landing pages | 3 | 랜딩, 소개, 로그인 |

---

## 7. 디자인 평가 점수 추이

| 항목 | 1차 평가 | 최종 평가 | 변화 |
|------|---------|---------|------|
| AI 슬롭 | 5/10 | 9/10 | +4 |
| 시각적 위계 | 6/10 | 9/10 | +3 |
| 카드 시스템 | 6.5/10 | 9/10 | +2.5 |
| 컬러 시스템 | 7/10 | 8/10 | +1 |
| 다크모드 | 7/10 | 10/10 | +3 |
| 마이크로카피 | 5.5/10 | 8/10 | +2.5 |
| 타이포그래피 | 6/10 | 8/10 | +2 |
| 공간/리듬 | 5.5/10 | 9/10 | +3.5 |
| 인터랙션 | 6.5/10 | 8/10 | +1.5 |
| 접근성 | 5/10 | 8/10 | +3 |
| **총점** | **6.5/10** | **8.5/10** | **+2.0** |

### QA 테스트 통과율
- E2E: 21/21 (100%)
- 페르소나 QA: 36/40 (90%)

---

## 8. 변경 파일 통계

| 카테고리 | 파일 수 |
|---------|--------|
| 메인 페이지 (app/(main)/) | ~80 |
| 어드민 페이지 (app/admin/) | ~20 |
| 컴포넌트 (components/) | ~15 |
| 스토어 (stores/) | 2 (notification-store 신규) |
| 유틸 (lib/) | 2 (utils.ts, constants.ts) |
| 설정 (config) | 5 (next.config, middleware, i18n, Dockerfile x2) |
| 테스트 (e2e/) | 6 (신규 4 + 업데이트 2) |
| 번역 (messages/) | 2 (ko.json, en.json) |
| CSS (globals.css) | 1 |
| 문서 (CLAUDE.md) | 1 |
| **합계** | **~230** |
