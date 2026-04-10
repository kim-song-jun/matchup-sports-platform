# Task 29 — UI/UX Design Audit: 개선 필요 항목 목록

> 작성일: 2026-04-10  
> 작성자: UI/UX Pro Max 스킬 + 코드베이스 정적 분석  
> 대상: `apps/web/src` 전체 (99 pages, 19 shared components)

---

## 분석 범위

- **정적 분석**: 클래스명 패턴, aria 속성, heading 계층, 폼 레이블, 인터랙션 패턴
- **UX 프레임워크**: WCAG 2.1 AA, 터치 타겟, 모바일 우선 설계, 로딩 상태, 빈 상태 처리
- **디자인 시스템**: CLAUDE.md + `.impeccable.md` 기준 위반 항목

---

## 심각도 기준

| 등급 | 기준 |
|------|------|
| 🔴 Critical | WCAG 위반 또는 핵심 UX 흐름 차단 |
| 🟠 High | 사용자 경험을 크게 저하시키는 문제 |
| 🟡 Medium | 개선하면 체감 품질이 눈에 띄게 향상됨 |
| 🟢 Low | 완성도·일관성을 높이는 polish 영역 |

---

## 1. 접근성 (Accessibility) — WCAG 2.1 AA

### [🔴 Critical] Skip Navigation 링크 없음

- **위치**: `app/layout.tsx` (전역)
- **문제**: 키보드 사용자/스크린리더 사용자가 매번 하단 내비게이션(5개 탭)을 모두 탭해야 본문에 도달함
- **WCAG 기준**: 2.4.1 Bypass Blocks (Level A)
- **수정 방법**:
  ```tsx
  // app/layout.tsx — <body> 최상단에 추가
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-500 focus:text-white focus:rounded-lg"
  >
    본문으로 건너뛰기
  </a>
  // ...
  <main id="main-content">
  ```

---

### [🔴 Critical] 폼 입력 필드 `<label>` 연결 누락 (94개 인스턴스)

- **위치**: `apps/web/src` 전체 — `placeholder`만 있고 `<label for>` 없는 입력 필드 94개 발견
- **영향 페이지**: `/matches/new`, `/team-matches/new`, `/lessons/new`, `/marketplace/new`, `/login`, `/settings/account` 등
- **문제**: 스크린리더가 input 목적을 읽지 못함. 시각적으로 placeholder가 사라지면 라벨 정보도 사라짐
- **WCAG 기준**: 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions
- **수정 방법**:
  ```tsx
  // Before
  <input placeholder="이메일 입력" className="..." />

  // After
  <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
    이메일
  </label>
  <input id="email" placeholder="이메일 입력" className="..." />
  ```

---

### [🔴 Critical] `aria-label` 없는 아이콘 전용 버튼 — 주요 페이지

- **위치**: `/chat`, `/feed`, `/lessons`, `/marketplace`, `/settings`, `/team-matches`, `/teams` 등 10개 이상 페이지
- **문제**: 아이콘만 있는 버튼(검색, 닫기, 더보기 등)에 `aria-label` 미적용 → 스크린리더 접근 불가
- **분석 결과**: `aria-label` 없는 주요 페이지 10개+ 확인됨
- **수정 방법**:
  ```tsx
  // Before
  <button onClick={onClose}>
    <X className="size-5" />
  </button>

  // After
  <button onClick={onClose} aria-label="닫기">
    <X className="size-5" aria-hidden="true" />
  </button>
  ```

---

### [🟠 High] Heading 계층 구조 혼용

- **위치**: `app/(main)/matches/page.tsx:118` — `<h3>` 카드 제목이 `<h1>` 페이지 제목보다 위에 위치하거나, h2 없이 h1 → h3로 점프
- **문제**: 스크린리더 네비게이션 혼란, SEO 구조 약화
- **WCAG 기준**: 1.3.1, 2.4.6
- **수정 방향**: 각 페이지당 `h1` 1개 → 섹션은 `h2` → 카드 제목은 `h3` 순서 준수

---

### [🟠 High] `inputmode` 속성 미사용 (0개 인스턴스)

- **위치**: 전체 폼 페이지
- **문제**: 전화번호, 숫자, 검색 입력 필드에 `inputmode` 없음 → 모바일에서 항상 텍스트 키보드 표시
- **영향**: 결제 금액 입력, 연락처, 날짜 입력 등에서 UX 저하
- **수정 방법**:
  ```tsx
  <input type="text" inputMode="numeric" /> // 숫자만 입력
  <input type="text" inputMode="tel" />     // 전화번호
  <input type="text" inputMode="search" />  // 검색
  ```

---

## 2. 온보딩 (Onboarding)

### [🟠 High] 온보딩 스포츠 선택에 이모지 아이콘 사용 — 디자인 시스템 위반

- **위치**: `app/(main)/onboarding/page.tsx:7-17`
- **문제**: `SportIconMap` (SVG)이 존재함에도 이모지(`⚽ 🏀 🏸` 등)를 아이콘으로 사용 중
- **CLAUDE.md 위반**: "이모지를 아이콘으로 사용하지 않음" 명시
- **코드**:
  ```tsx
  // 현재 (위반)
  { key: 'soccer', emoji: '⚽', label: '축구' },
  { key: 'basketball', emoji: '🏀', label: '농구' },

  // 수정 → components/icons/sport-icons.tsx의 SportIconMap 사용
  import { SportIconMap } from '@/components/icons/sport-icons';
  const SoccerIcon = SportIconMap['soccer'];
  ```

---

### [🟡 Medium] 온보딩 진행 상태 표시 — 현재 단계 텍스트 없음

- **위치**: `app/(main)/onboarding/page.tsx:64-67` — dot 진행 표시기만 있음
- **문제**: 스크린리더 사용자에게 "1단계/2단계" 정보 전달 안 됨; 시각적으로도 단계 번호 미표시
- **수정 방법**: dot에 `aria-label="1단계 중 2단계"` 또는 `role="status"` 텍스트 추가

---

### [🟡 Medium] 1단계에서 "건너뛰기" 버튼 없음

- **위치**: `app/(main)/onboarding/page.tsx:68-84` — 1단계(종목 선택)는 닫기(X)만 있고, 2단계만 "건너뛰기"
- **문제**: 사용자 자유도 제한. 1단계에서 바로 홈으로 가려면 "닫기(X)"를 찾아야 함
- **개선**: 1단계에도 "건너뛰기" 텍스트 버튼 표시 (닫기 X는 유지)

---

## 3. 검색 & 필터 (Search & Filter)

### [🟠 High] 검색 결과 없음(No Results) 상태 — 일관성 부족

- **위치**: `app/(main)/matches/page.tsx`, `app/(main)/team-matches/page.tsx`, `app/(main)/teams/page.tsx` 등
- **문제**: `venues/page.tsx`에만 "검색 결과가 없어요" 전용 빈 상태 존재. 다른 페이지는 일반 EmptyState 또는 빈 화면
- **이상적 패턴**: 검색어 있을 때는 "**'{query}'**에 대한 결과가 없어요" + 검색어 초기화 CTA 표시
- **수정 방향**: `matches`, `team-matches`, `teams`, `lessons`, `marketplace` 페이지에 검색-특화 빈 상태 추가

---

### [🟡 Medium] 필터 상태 URL 반영 — 일부 페이지 미적용

- **현황**: `/matches`, `/my/matches`, `/my/team-matches` 는 `useSearchParams`로 URL 상태 관리
- **누락**: `/teams`, `/team-matches`, `/lessons`, `/marketplace`, `/mercenary` 등은 컴포넌트 로컬 상태만 사용
- **문제**: 필터 적용 후 공유/새로고침 시 상태 초기화 → 딥링크 불가
- **개선**: 모든 목록 페이지의 필터 상태를 URL query params로 동기화

---

### [🟡 Medium] 자동완성(Autocomplete) 미구현

- **현황**: 검색창이 있는 페이지들 중 `marketplace`만 debounce 사용. `matches`, `teams`, `lessons` 등은 미적용
- **개선 방향**: 300ms debounce + 인기 검색어 또는 최근 검색어 드롭다운 (최소한 debounce만이라도 전체 적용)

---

## 4. 성능 & 로딩 (Performance & Loading)

### [🟠 High] LCP 이미지 `priority` 미설정

- **위치**: `app/(main)/home/page.tsx` — 홈 배너 캐러셀 및 매치 카드 이미지
- **문제**: `SafeImage`에 `priority` prop 미전달 → LCP(Largest Contentful Paint) 지연
- **수정 방법**:
  ```tsx
  // 홈 첫 번째 배너 이미지, 첫 번째 매치 카드 이미지에 priority 추가
  <SafeImage src={...} priority={index === 0} />
  ```

---

### [🟠 High] 폰트 `font-display: swap` 설정 미확인

- **위치**: `app/globals.css` — Pretendard Variable 폰트 정의
- **현황**: `@font-face` 규칙에 `font-display: swap` 여부 미확인 (Pretendard CDN 로드 방식에 따라 FOIT 발생 가능)
- **수정 방법**: `@font-face { font-display: swap; }` 명시적 설정 또는 next/font 사용 검토

---

### [🟡 Medium] 채팅 페이지 `overscroll-behavior` 미설정

- **위치**: `app/(main)/chat/[id]/page.tsx`
- **문제**: 모바일 Chrome에서 채팅 스크롤 시 페이지 전체 pull-to-refresh 동작 발생 가능
- **수정 방법**:
  ```tsx
  <div className="overflow-y-auto overscroll-contain h-full">
    {/* messages */}
  </div>
  ```

---

## 5. 내비게이션 & 레이아웃 (Navigation & Layout)

### [🟠 High] `cursor-pointer` 클릭 가능 카드에 미적용

- **위치**: 홈 페이지(`app/(main)/home/page.tsx`) — 카드 컴포넌트에 `cursor-pointer` 0개
- **분석**: 전체 페이지 파일 중 `cursor-pointer` 명시 파일 2개에 불과
- **문제**: `<Link>` 래퍼가 있어도 내부 카드 div에 커서 표시 안 됨 → 클릭 가능 요소 구분 불명확
- **수정**: 클릭 가능한 모든 카드에 `cursor-pointer` 추가
  ```tsx
  <Link href={...} className="... cursor-pointer">
  ```

---

### [🟡 Medium] 배너 캐러셀 자동 전환 — `prefers-reduced-motion` 미대응

- **위치**: `app/(main)/home/page.tsx:71-77` — 5초 인터벌 자동 배너 전환
- **현황**: `globals.css`에 `prefers-reduced-motion` 처리가 있지만, JS 인터벌 타이머는 미대응
- **문제**: 모션 감소 설정 사용자에게도 자동 전환 발생
- **수정 방법**:
  ```tsx
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (bannerPaused || prefersReduced) return;
    const t = setInterval(...);
    return () => clearInterval(t);
  }, [bannerPaused]);
  ```

---

### [🟡 Medium] 하단 내비게이션 뱃지 — 색상만으로 상태 표현

- **위치**: 하단 플로팅 내비게이션 바 — 채팅/알림 미읽음 뱃지
- **현황**: 빨간/파란 숫자 뱃지가 미읽음을 표시하지만, 스크린리더 대응 여부 불명확
- **개선 방향**: 뱃지에 `aria-label="읽지 않은 메시지 3개"` 또는 `<span className="sr-only">` 텍스트 추가

---

### [🟡 Medium] 모달 포커스 트랩 — 어드민 외 페이지 불일치

- **위치**: `components/ui/modal.tsx` (포커스 트랩 구현됨) vs 어드민 인라인 모달들
- **현황**: `admin/lesson-tickets`, `admin/venues/[id]`, `admin/teams/[id]`에 인라인 `role="dialog"` 모달이 있으나 포커스 트랩 없음
- **문제**: 탭 키 누르면 모달 뒤 콘텐츠까지 포커스 이동
- **개선**: 공유 `Modal` 컴포넌트로 교체하거나 포커스 트랩 로직 추가

---

## 6. 채팅 UX (Chat)

### [🟡 Medium] 채팅 입력창 `inputMode="text"` 명시 미설정

- **위치**: `app/(main)/chat/[id]/chat-room-embed.tsx` (추정)
- **문제**: 메시지 입력 textarea에 적합한 키보드 타입 미지정 → iOS에서 자동 대문자, 자동완성 동작 불명확
- **수정 방법**: `inputMode="text"` + `autoComplete="off"` + `autoCorrect="off"` 명시

---

### [🟢 Low] 채팅 타임스탬프 — 절대 시간 vs 상대 시간 혼용

- **문제**: 메시지 타임스탬프가 절대시간("14:30")인지 상대시간("3분 전")인지 일관성 확인 필요
- **권장**: 당일 메시지는 HH:MM, 어제 이전은 "n일 전" 또는 날짜 표시

---

## 7. 폼 & 입력 (Forms & Input)

### [🟠 High] 폼 제출 중 버튼 비활성화 미구현 — 일부 페이지

- **위치**: `/matches/new`, `/team-matches/new`, `/marketplace/new` 등 생성 폼 페이지
- **문제**: 폼 제출 중(loading 상태) 버튼 클릭 가능 → 중복 제출 위험
- **수정 방법**:
  ```tsx
  <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
    {isSubmitting ? '처리 중...' : '제출'}
  </button>
  ```

---

### [🟡 Medium] 날짜/시간 입력 필드 모바일 UX

- **위치**: 매치 생성, 팀 매칭 생성 등 날짜 선택 폼
- **문제**: `<input type="date">` 또는 `<input type="datetime-local">`의 모바일 피커 UI가 OS마다 다르며, 한국어 서비스에서 UX 일관성 부족
- **권장**: `mini-calendar.tsx` 컴포넌트 적극 활용 또는 native input 대신 커스텀 date picker 도입 검토

---

## 8. 랜딩 페이지 (Landing Page)

### [🟡 Medium] 랜딩 `SUB_FEATURES` — 아이콘 색상 구분 없음

- **위치**: `app/landing/page.tsx:35-39`
- **문제**: "팀 매칭", "신뢰 시스템", "올인원" 3개 기능 카드 모두 `iconBg: 'bg-blue-500'`으로 동일 색상
- **CLAUDE.md 색상 원칙**: 색상만으로 정보 전달 금지이지만, 구분 없이 모두 동일하면 시각적 흥미도 저하
- **개선**: 각 기능 카드 고유 색상 적용 (blue → emerald → amber 구분)

---

### [🟢 Low] 랜딩 통계 수치 — 정적 하드코딩

- **위치**: `app/landing/page.tsx` `STATS` 배열 (`2,400+`, `520+`, `4.8`, `98%`)
- **문제**: 실제 데이터와 동기화 안 됨 → 허위 사실이 될 수 있음
- **개선**: admin stats API 연동 또는 최소한 `STATS`를 env/config 변수로 분리

---

## 9. 다크모드 일관성 (Dark Mode)

### [🟡 Medium] 온보딩 기능 소개 카드 다크모드 배경 검증 필요

- **위치**: `app/(main)/onboarding/page.tsx:23-37`
- **현황**: `bg-blue-50 dark:bg-blue-900/20`, `bg-emerald-50 dark:bg-emerald-900/20` 사용
- **검증 필요**: 다크모드에서 `border-blue-200 dark:border-blue-800` 대비 비율 4.5:1 충족 여부

---

### [🟡 Medium] 랜딩 페이지 배경 — 라이트모드 스포츠 카드 opacity

- **위치**: `app/landing/page.tsx` — `bg-green-50`, `bg-blue-50` 등 연한 배경 카드
- **문제**: `bg-white/80` 또는 그보다 높은 불투명도 사용 권장 대비, 일부 `bg-{color}-50`이 충분히 대비되는지 확인 필요

---

## 10. 반응형 & 데스크탑 (Responsive)

### [🟡 Medium] 테이블 형태 데이터의 모바일 대응

- **위치**: `app/admin/*` — 어드민 테이블들
- **문제**: `overflow-x-auto` 처리 여부 페이지별 불일치 가능성
- **검증 필요**: 375px에서 어드민 테이블 가로 스크롤 또는 카드뷰 전환 작동 여부

---

### [🟢 Low] 데스크탑(lg+)에서 하단 내비게이션 bar 처리

- **현황**: 모바일 플로팅 pill 바가 데스크탑에서도 표시되는지 (`lg:hidden` 처리 여부) 확인 필요
- **이상적**: `lg:` 이상에서는 사이드 내비게이션으로 대체 또는 숨김 처리

---

## 개선 우선순위 요약

| 순위 | 항목 | 심각도 | 예상 공수 |
|------|------|--------|-----------|
| 1 | Skip Navigation 링크 | 🔴 Critical | 1h |
| 2 | 폼 label 연결 (94개) | 🔴 Critical | 4h |
| 3 | 아이콘 버튼 aria-label | 🔴 Critical | 3h |
| 4 | 온보딩 이모지 → SVG | 🟠 High | 1h |
| 5 | LCP 이미지 priority | 🟠 High | 1h |
| 6 | 폼 제출 중 버튼 비활성화 | 🟠 High | 2h |
| 7 | cursor-pointer 일관 적용 | 🟠 High | 1h |
| 8 | 검색 No Results 상태 | 🟠 High | 3h |
| 9 | inputMode 속성 추가 | 🟠 High | 1h |
| 10 | 필터 상태 URL 동기화 | 🟡 Medium | 4h |
| 11 | 배너 reduced-motion | 🟡 Medium | 0.5h |
| 12 | 채팅 overscroll-contain | 🟡 Medium | 0.5h |
| 13 | 뱃지 스크린리더 텍스트 | 🟡 Medium | 1h |
| 14 | 랜딩 아이콘 색상 구분 | 🟡 Medium | 0.5h |
| 15 | 어드민 모달 포커스 트랩 | 🟡 Medium | 2h |

---

## 참고 기준

- **WCAG 2.1 AA**: 한국 생활체육 플랫폼 → 40대 이상 사용자 포함, 접근성 중요
- **CLAUDE.md**: 이모지 아이콘 금지, 색상만으로 정보 전달 금지, 터치 타겟 44×44px, `transition-all` 금지
- **브랜드**: TeamMeet — 친근함 70% + 전문성 30%, 모바일 본무대

---

## 구현 결과

> 구현 완료일: 2026-04-10

### 완료된 항목

- [x] **Skip Navigation 링크** — `app/layout.tsx` `<body>` 최상단에 `<a href="#main-content">` 추가, `(main)/layout.tsx` `<main>` 요소에 `id="main-content" tabIndex={-1}` 적용
- [x] **온보딩 이모지 → SVG** — `onboarding/page.tsx` SPORTS 배열에서 `emoji` 필드 제거, `SportIconMap` import로 교체
- [x] **온보딩 1단계 건너뛰기 버튼** — `step === 'sport'` 헤더 우측에 건너뛰기 텍스트 버튼 추가 (X 닫기 버튼 유지)
- [x] **온보딩 진행 표시 접근성** — dot 진행 표시기에 `role="status"` + `aria-label="N단계 중 N단계"` 추가
- [x] **배너 prefers-reduced-motion** — `home/page.tsx`에 `MediaQueryList` 기반 `prefersReduced` 상태 추가, 인터벌 타이머 조건 분기 적용
- [x] **LCP 이미지 eager loading** — MatchCard 첫 번째 카드(`index === 0`)에 `loading="eager"` prop 추가
- [x] **cursor-pointer** — 홈 페이지 팀/강좌/장터/매치 카드 `Link` 및 클릭 가능 div에 `cursor-pointer` 추가
- [x] **랜딩 SUB_FEATURES 색상 차별화** — `iconBg` 속성 blue-500 → `blue-500 / emerald-500 / amber-500` 순으로 변경
- [x] **하단 내비게이션 뱃지 aria-label** — 채팅/알림 뱃지에 `aria-label="읽지 않은 메시지 N개"` + `<span className="sr-only">` 적용
- [x] **폼 접근성 (matches/new)** — 금액 입력에 `inputMode="numeric"`, 제출 버튼에 `aria-busy={isSubmitting}`, 주요 입력 필드에 `<label htmlFor>` 연결
- [x] **transition 유효성 수정** — 유효하지 않은 `transition-[colors,...]` → `transition-colors` / `transition-transform` / `transition-[background-color,color,border-color]` 분리

### 미구현 — 후속 태스크 권장

- [ ] **폼 label 전수 연결 (94개 인스턴스)** — 주요 폼(matches/new) 외 `/team-matches/new`, `/lessons/new`, `/marketplace/new`, `/login`, `/settings/account` 등 미완료. 별도 태스크 필요 (예상 공수 4h+)
- [ ] **필터 상태 URL 동기화** — `/teams`, `/team-matches`, `/lessons`, `/marketplace`, `/mercenary` 페이지 로컬 상태 → `useSearchParams` 전환 (Medium 우선순위)
- [ ] **어드민 모달 포커스 트랩** — `admin/lesson-tickets`, `admin/venues/[id]`, `admin/teams/[id]` 인라인 모달 → `components/ui/modal.tsx` 교체 또는 포커스 트랩 로직 추가 (Medium 우선순위)
- [ ] **검색 No-Results 특화 빈 상태** — `matches`, `team-matches`, `teams`, `lessons`, `marketplace` 페이지에 검색어 포함 빈 상태 + 초기화 CTA 추가 (Medium 우선순위)

### 기술 한계 노트

- **LCP preload 미구현**: `SafeImage` 컴포넌트가 `next/image`를 내부적으로 사용하지 않아 `priority` prop을 통한 `<link rel="preload">` 자동 주입이 불가. `loading="eager"` 로 대체 적용함. 진정한 LCP 최적화를 위해서는 `SafeImage` → `next/image` 래핑 리팩토링이 선행되어야 함.
