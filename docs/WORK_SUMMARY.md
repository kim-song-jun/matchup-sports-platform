# MatchUp 플랫폼 작업 요약

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
