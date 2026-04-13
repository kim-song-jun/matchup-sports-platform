# 01-landing — Landing & Static Pages

> **대상 페이지**: `/landing` · `/about` · `/faq` · `/guide` · `/pricing`
> **총 시나리오**: 42개
> **뷰포트**: D1(1920x1080) · D2(1440x900) · D3(1280x800) · T1(1024x768) · T2(834x1194) · T3(768x1024) · M1(430x932) · M2(393x852) · M3(375x667)

---

## A. Landing Page (`/landing`)

---

### SC-01-001: 랜딩 페이지 초기 로드

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/landing)` | 페이지 로드, `min-h-screen bg-white dark:bg-gray-900` 컨테이너 렌더링 | `SC-01-001-S01` |
| 2 | 페이지 로드 완료 대기 | LandingNav, Hero 섹션, Stats, Pain Points, Features, How It Works, Sports, Testimonials, Final CTA, LandingFooter 순서로 렌더링 | `SC-01-001-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | `LandingNav` fixed top, `z-50` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Hero 배지 `bg-blue-50 dark:bg-blue-900/30 text-blue-600` 표시 "11개 종목 · 2,400+ 매칭 완료" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Hero h1 `text-4xl font-black text-gray-900 dark:text-white` (M), `sm:text-5xl` (T), `lg:text-6xl` (D) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "AI가 찾아드려요" 텍스트 `text-blue-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Hero 서브텍스트 `text-lg lg:text-xl text-gray-500 dark:text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | ScrollReveal 애니메이션 — 각 섹션 viewport 진입 시 fade-in + slide-up (0.6s cubic-bezier) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | `prefers-reduced-motion: reduce` 시 애니메이션 비활성화 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | 다크모드 전환 시 `bg-white` → `dark:bg-gray-900`, 모든 텍스트 대비 4.5:1 유지 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-002: LandingNav — 초기 상태 및 스크롤

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | 비로그인, 페이지 최상단 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 페이지 최상단에서 Nav 확인 | Nav `bg-transparent`, 보더/그림자 없음 | `SC-01-002-S01` |
| 2 | `scroll(y > 20px)` | Nav `bg-white/92 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.05)] border-b border-gray-100/80` 전환 | `SC-01-002-S02` |
| 3 | `scroll(y = 0)` | Nav 다시 `bg-transparent`로 복귀 | `SC-01-002-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 로고 "T" 블루 박스 `bg-blue-500 h-8 w-8 rounded-lg` + "TeamMeet" `font-bold text-xl text-gray-900 dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Desktop(md+): 네비 링크 4개 표시 — 이용 가이드, 요금, FAQ, 소개 | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V3 | Desktop(md+): 현재 페이지 링크 `text-blue-500 bg-blue-50 dark:bg-blue-900/30` 활성 스타일 | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V4 | "로그인" 텍스트 링크 (`hidden sm:block`) + "시작하기" `bg-blue-500 text-white rounded-xl` 버튼 표시 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | — | — |
| V5 | Mobile(<md): 햄버거 메뉴 버튼 `md:hidden h-11 w-11` 표시 | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V6 | 다크모드 스크롤 시 `dark:bg-gray-900/88 dark:border-white/10` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | 로고 클릭 → `/` 이동 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-003: LandingNav — 모바일 햄버거 메뉴

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | 뷰포트 < md (768px) |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `click(hamburger-button)` | 드롭다운 메뉴 `animate-fade-in` 열림, 아이콘 Menu → X 전환, `aria-label="메뉴 닫기"` | `SC-01-003-S01` |
| 2 | 메뉴 내 링크 확인 | 이용 가이드, 요금, FAQ, 소개, 로그인(sm 미만만) 표시 | `SC-01-003-S02` |
| 3 | `click(FAQ 링크)` | `/faq`로 이동, 메뉴 자동 닫힘 (pathname 변경 감지) | `SC-01-003-S03` |
| 4 | `navigate(/landing)` 후 다시 메뉴 열기 → `click(X 버튼)` | 메뉴 닫힘, 아이콘 X → Menu 복귀 | `SC-01-003-S04` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 메뉴 드롭다운 `bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800` | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V2 | 각 링크 `text-md font-medium px-4 py-3 rounded-xl` (터치 타겟 44px+) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V3 | 활성 링크 `text-blue-500 bg-blue-50 dark:bg-blue-900/30` | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V4 | "로그인" 링크 `sm:hidden` — 375px(M3)에서만 표시 확인 | — | — | — | — | — | — | — | — | ☐ |
| V5 | 메뉴 열린 상태에서 Nav 배경 `bg-white/92 backdrop-blur-md` 적용 (mobileOpen = true) | — | — | — | — | — | — | ☐ | ☐ | ☐ |

---

### SC-01-004: Hero CTA 버튼 — "무료로 시작하기"

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `hover("무료로 시작하기" 버튼)` | `bg-blue-500` → `hover:bg-blue-600` 전환 | `SC-01-004-S01` |
| 2 | `click("무료로 시작하기" 버튼)` | `active:scale-[0.97]` 프레스 효과, `/login`으로 이동 | `SC-01-004-S02` |
| 3 | `keyboard(Tab)` → `focus("무료로 시작하기")` | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400` 포커스 링 | `SC-01-004-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 버튼 `bg-blue-500 text-white font-bold rounded-2xl px-8 py-4 text-lg` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | ArrowRight 아이콘 `size={18}` 표시 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 모바일 `flex-col`, 데스크탑 `sm:flex-row` CTA 레이아웃 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 하단 통계 텍스트 "평균 3분 이내 매칭 · 만족도 4.8 / 5.0" `text-sm text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-005: Hero CTA 버튼 — "더 알아보기" 스크롤

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Hero 섹션 뷰 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `hover("더 알아보기" 버튼)` | `hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800` | `SC-01-005-S01` |
| 2 | `click("더 알아보기" 버튼)` | `scrollIntoView({ behavior: 'smooth' })` → `#features-section`으로 부드럽게 스크롤 | `SC-01-005-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 버튼 `text-gray-500 dark:text-gray-400 rounded-xl px-6 py-3.5 text-md font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | ChevronDown 아이콘 `size={18}` 표시 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 스크롤 후 Features 섹션 `id="features-section"` 뷰포트 상단 도달 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-006: Stats 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Stats 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | Stats 섹션 뷰포트 진입 | ScrollReveal 애니메이션 트리거, 4개 통계 카드 렌더링 | `SC-01-006-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 카드 `bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 4개 통계: "2,400+" / "520+" / "4.8" / "98%" 각 `text-2xl font-black text-gray-900 dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 레이아웃 `grid-cols-2` (M) → `sm:grid-cols-4` (D/T) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 구분선 `divide-x divide-gray-100 dark:divide-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-007: Pain Points 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Pain Points 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | "이런 경험, 있지 않나요?" 제목 + 3개 카드 렌더링 | `SC-01-007-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 제목 `text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 3개 카드: Frown(`text-red-500 bg-red-50`), SearchX(`text-amber-500 bg-amber-50`), UserX(`text-gray-500 bg-gray-100`) 아이콘+배경 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 카드 `bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 레이아웃 1col (M) → `sm:grid-cols-3` (D/T) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 하단 텍스트 "TeamMeet이 이 문제를 기술로 해결합니다." — "기술로 해결" `text-blue-500 font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-008: Features 섹션 — AI 매칭 히어로 카드

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Features 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | "주요 기능" 배지 + "스포츠 매칭, 이렇게 달라집니다" 제목 + AI 매칭 다크 카드 렌더링 | `SC-01-008-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 배경 `bg-gray-50 dark:bg-gray-800/30` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "주요 기능" 배지 `text-blue-500 bg-blue-50 dark:bg-blue-900/30` + Target 아이콘 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | AI 매칭 카드 `bg-gray-900 dark:bg-gray-800 rounded-2xl text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "핵심 기능" 태그 `bg-blue-500/20 text-blue-300` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 4개 태그(실력 분석, 위치 매칭, 매너 필터, ELO 반영) 각각 Check 아이콘 `text-blue-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | 매칭 프리뷰 카드: 실력 94% `bg-blue-500`, 매너 98% `bg-green-500`, 거리 85% `bg-amber-500` 프로그레스 바 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | "매칭 적합도 96%" `text-blue-400 bg-blue-500/10` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | Desktop `lg:flex lg:items-center lg:gap-10` 가로 레이아웃 / Mobile 세로 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-009: Features 섹션 — 서브 기능 카드 호버

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Features 섹션 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 3개 서브 기능 카드 확인 | 팀 매칭(`bg-blue-500`), 신뢰 시스템(`bg-emerald-500`), 올인원(`bg-amber-500`) 아이콘 배경 | `SC-01-009-S01` |
| 2 | `hover(팀 매칭 카드)` | 카드 `hover:bg-gray-50 dark:hover:bg-gray-700`, 아이콘 `group-hover:scale-110` | `SC-01-009-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 3개 카드 `sm:grid-cols-3 gap-5` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 각 카드 `bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 아이콘 박스 `h-12 w-12 rounded-xl` + 아이콘 `text-white size={20}` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 호버 시 아이콘 `scale-110 transition-transform duration-300` | ☐ | ☐ | ☐ | — | — | — | — | — | — |

---

### SC-01-010: How It Works 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | How It Works 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | "이용 방법" 배지 + "3단계로 시작하세요" 제목 + 3 스텝 렌더링 | `SC-01-010-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | "이용 방법" 배지 + Footprints 아이콘 `text-blue-500 bg-blue-50` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Mobile(`lg:hidden`): 수직 타임라인 — 원형 번호 `bg-blue-500 text-white h-11 w-11` + 연결선 `bg-gradient-to-b from-blue-200` | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V3 | Desktop(`hidden lg:grid lg:grid-cols-3`): 수평 3열 + 연결선 `bg-gradient-to-r from-blue-200 via-blue-300` | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V4 | Desktop 원형 번호 `ring-2 ring-white dark:ring-gray-900` | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V5 | 3단계: "프로필 만들기" / "매치 참가" / "평가하고 성장하기" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-011: Sports 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Sports 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | "지원 종목" 배지 + "11개 종목, 하나의 플랫폼" + 11개 종목 아이콘 렌더링 | `SC-01-011-S01` |
| 2 | Mobile: 가로 스크롤 | 11개 종목 카드 `overflow-x-auto` 스크롤 가능 | `SC-01-011-S02` |
| 3 | Mobile: 종목 카드 터치 | `active:scale-[0.95]` 프레스 효과 | `SC-01-011-S03` |
| 4 | Desktop: 종목 카드 호버 | `hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-200 dark:hover:border-blue-800` | `SC-01-011-S04` |
| 5 | `click("내 종목으로 매칭 시작하기" 링크)` | `/login`으로 이동 | `SC-01-011-S05` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 배경 `bg-gray-50 dark:bg-gray-800/30` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Mobile: 카드 `shrink-0 w-[88px] rounded-2xl p-3.5` / Desktop: `w-[108px] rounded-2xl p-4` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 각 종목별 아이콘+색상: soccer `bg-green-50 text-green-600`, futsal `bg-blue-50 text-blue-500` 등 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 11개 종목 모두 SportIconMap 렌더링 (null 아님) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | "내 종목으로 매칭 시작하기" `text-blue-500 hover:text-blue-600` + ArrowRight | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-012: Testimonials 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Testimonials 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | "사용자 후기" 배지 + 제목 + 3개 후기 카드 렌더링 | `SC-01-012-S01` |
| 2 | `hover(후기 카드)` | `hover:bg-gray-50 dark:hover:bg-gray-700` | `SC-01-012-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 별점 `role="img" aria-label="N점 만점"` — 접근성 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 채워진 별 `text-amber-400 fill-amber-400`, 빈 별 `text-gray-200 dark:text-gray-600` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 프로필 영역: SportIcon 또는 이니셜 `h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 레이아웃 1col(M) → `md:grid-cols-3` (D/T) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 상단 통계 "평균 만족도 4.8 / 5.0 · 리뷰 340건" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-013: Final CTA 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` |
| **권한** | all |
| **사전 조건** | Final CTA 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | 다크 배경 `bg-gray-900 dark:bg-black` + radial gradient 오버레이 | `SC-01-013-S01` |
| 2 | `hover("무료로 시작하기" 버튼)` | `hover:bg-blue-400` | `SC-01-013-S02` |
| 3 | `click("무료로 시작하기" 버튼)` | `/login` 이동 | `SC-01-013-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | "가입은 3초, 첫 매칭은 무료" `text-blue-400 font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 제목 `text-3xl lg:text-4xl font-black text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 서브텍스트 `text-md lg:text-lg text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | radial gradient `bg-[radial-gradient(circle_at_50%_0%,rgba(49,130,246,0.12),transparent_60%)]` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-014: LandingFooter

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` (모든 정적 페이지 공통) |
| **권한** | all |
| **사전 조건** | 페이지 하단 도달 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | Footer 확인 | 로고 + 브랜드 설명 + 서비스 링크 3개 + 회사 링크 3개 + 하단 바 | `SC-01-014-S01` |
| 2 | `click("이용 가이드" 링크)` | `/guide` 이동 | `SC-01-014-S02` |
| 3 | `click("요금 안내" 링크)` | `/pricing` 이동 | `SC-01-014-S03` |
| 4 | `click("자주 묻는 질문" 링크)` | `/faq` 이동 | `SC-01-014-S04` |
| 5 | `click("서비스 소개" 링크)` | `/about` 이동 | `SC-01-014-S05` |
| 6 | `click("이용약관" 링크)` | `href="#"` — 현재 미구현 | `SC-01-014-S06` |
| 7 | `click("개인정보처리방침" 링크)` | `href="#"` — 현재 미구현 | `SC-01-014-S07` |
| 8 | `click("무료로 시작하기" 링크)` | `/login` 이동 | `SC-01-014-S08` |
| 9 | `hover(서비스 링크)` | `hover:text-gray-900 dark:hover:text-white` | `SC-01-014-S09` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Footer `bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 레이아웃 `grid-cols-2` (M) → `sm:grid-cols-[2fr_1fr_1fr]` (D/T) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 섹션 제목 `text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 링크 `text-sm text-gray-600 dark:text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 하단 바 "&copy; 2026 TeamMeet" + "11개 종목 · AI 스포츠 매칭" `text-xs text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## B. About Page (`/about`)

---

### SC-01-015: About 페이지 초기 로드

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/about)` | LandingNav + Hero + Mission + Problems + Approaches + Stats/Values + Team + CTA + Footer 렌더링 | `SC-01-015-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Hero h1 "TeamMeet을 만든 이유" `text-4xl sm:text-5xl lg:text-6xl font-black` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Nav에서 "소개" 링크 활성 스타일 `text-blue-500 bg-blue-50` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 전체 페이지 `bg-white dark:bg-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-016: About — Mission 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | Mission 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | 미션 카드 렌더링 | `SC-01-016-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 카드 `bg-gray-50 dark:bg-gray-800/50 rounded-3xl p-8 sm:p-12` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | radial gradient 오버레이 적용 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 제목 `text-2xl sm:text-3xl lg:text-4xl font-black` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-017: About — Problems 섹션 (비대칭 레이아웃)

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | Problems 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 뷰포트 진입 | "우리가 해결하는 문제" 제목 + 비대칭 3카드 렌더링 | `SC-01-017-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 배경 `bg-gray-50 dark:bg-gray-800/30` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Desktop: 비대칭 `md:grid-cols-5` — 첫 카드 `md:col-span-3`, 나머지 `md:col-span-2` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | — | — |
| V3 | 첫 카드 p-8 / 나머지 p-6 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 이모지 크기: 첫 카드 `text-4xl`, 나머지 `text-2xl` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-018: About — Approaches 섹션 (넘버드 카드)

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | Approaches 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | 3개 넘버드 카드 (01 AI, 02 Shield, 03 Target) | `SC-01-018-S01` |
| 2 | `hover(01 카드)` | `hover:bg-gray-50 dark:hover:bg-gray-750` | `SC-01-018-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 번호 `text-3xl font-black text-gray-200 dark:text-gray-700 tabular-nums` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 아이콘 박스: Brain `bg-blue-50 text-blue-500`, Shield `bg-emerald-50 text-emerald-500`, Target `bg-amber-50 text-amber-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 통계 배지 "정확도 94%" / "노쇼율 2% 미만" / "11종목 지원" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Mobile `flex-col`, Desktop `sm:flex-row sm:items-start` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-019: About — Stats & Values 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | Stats 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | 좌: "숫자로 보는 TeamMeet" 4개 통계 / 우: "우리가 믿는 것" 3개 가치 | `SC-01-019-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 레이아웃 `grid lg:grid-cols-2 gap-10 lg:gap-16` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 통계 색상: "2,400+" `text-blue-500`, "520+" `text-emerald-500`, "11" `text-amber-500`, "4.8" `text-purple-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 가치 아이콘: Brain `text-blue-500 bg-blue-50`, Heart `text-red-500 bg-red-50`, Shield `text-emerald-500 bg-emerald-50` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-020: About — Team 섹션

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | Team 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | "만드는 사람들" 제목 + 4명 팀 카드 | `SC-01-020-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 레이아웃 `grid sm:grid-cols-2 gap-5` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 아바타 원형: J `bg-blue-500`, K `bg-emerald-500`, P `bg-amber-500`, L `bg-purple-500` `h-14 w-14 rounded-full` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 이름 `text-lg font-bold`, 역할 `text-sm text-gray-500`, 바이오 `text-sm text-gray-500 dark:text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-021: About — Bottom CTA

| 항목 | 값 |
|------|-----|
| **URL** | `/about` |
| **권한** | all |
| **사전 조건** | Bottom CTA 섹션 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `click("지금 시작하기" 버튼)` | `/login` 이동 | `SC-01-021-S01` |
| 2 | `click("서비스 둘러보기" 버튼)` | `/landing` 이동 | `SC-01-021-S02` |
| 3 | `hover("서비스 둘러보기")` | `hover:text-white hover:bg-white/5` | `SC-01-021-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 주 CTA `bg-blue-500 text-white font-bold px-8 py-4 rounded-2xl text-lg` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 보조 CTA `text-gray-400 rounded-xl px-6 py-3.5 text-md` + TrendingUp 아이콘 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 모바일 `flex-col`, 데스크탑 `sm:flex-row` 레이아웃 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## C. FAQ Page (`/faq`)

---

### SC-01-022: FAQ 페이지 초기 로드

| 항목 | 값 |
|------|-----|
| **URL** | `/faq` |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/faq)` | LandingNav + Hero + 카테고리 탭 + FAQ 아코디언 + Contact CTA + Footer 렌더링 | `SC-01-022-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Hero 배지 `bg-blue-50 text-blue-600` + MessageCircle 아이콘 + "도움이 필요하신가요?" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | h1 "자주 묻는 질문" `text-3xl sm:text-5xl lg:text-5xl font-black` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Nav "FAQ" 링크 활성 스타일 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "전체" 카테고리 기본 선택 `bg-blue-500 text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-023: FAQ — 카테고리 필터링

| 항목 | 값 |
|------|-----|
| **URL** | `/faq` |
| **권한** | all |
| **사전 조건** | FAQ 페이지 로드 완료 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | "전체" 탭 확인 | 18개 FAQ 항목 모두 표시 | `SC-01-023-S01` |
| 2 | `click("서비스" 탭)` | 서비스 카테고리 FAQ 4개만 필터, 열린 아코디언 초기화 | `SC-01-023-S02` |
| 3 | `click("매칭" 탭)` | 매칭 카테고리 FAQ 6개만 필터 | `SC-01-023-S03` |
| 4 | `click("결제" 탭)` | 결제 카테고리 FAQ 4개만 필터 | `SC-01-023-S04` |
| 5 | `click("계정" 탭)` | 계정 카테고리 FAQ 4개만 필터 | `SC-01-023-S05` |
| 6 | `click("전체" 탭)` | 전체 항목 복원 | `SC-01-023-S06` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 활성 탭 `bg-blue-500 text-white`, 비활성 `bg-gray-100 dark:bg-gray-800 text-gray-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 탭 `active:scale-[0.97]` 프레스 효과 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Mobile: 탭 `overflow-x-auto scrollbar-hide` 가로 스크롤 / Desktop: `sm:justify-center` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 비활성 탭 `hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700` 호버 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-024: FAQ — 아코디언 열기/닫기

| 항목 | 값 |
|------|-----|
| **URL** | `/faq` |
| **권한** | all |
| **사전 조건** | FAQ 항목 표시 상태 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `click(첫 번째 FAQ 질문)` | 답변 영역 열림 — `gridTemplateRows: 1fr, opacity: 1`, ChevronDown `rotate-180 text-blue-500` | `SC-01-024-S01` |
| 2 | `click(두 번째 FAQ 질문)` | 첫 번째 닫힘, 두 번째 열림 (한 번에 하나만 열림) | `SC-01-024-S02` |
| 3 | `click(열린 FAQ 질문)` | 해당 항목 닫힘 — `gridTemplateRows: 0fr, opacity: 0` | `SC-01-024-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 질문 버튼: `aria-expanded` true/false 토글 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 답변 패널: `role="region" aria-labelledby` 연결 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 카테고리 배지 `text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-full` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 질문 텍스트 `group-hover:text-blue-500` 호버 효과 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 아코디언 전환 `transition duration-300` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | 아코디언 컨테이너 `bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-025: FAQ — 빈 상태 (EmptyState)

| 항목 | 값 |
|------|-----|
| **URL** | `/faq` |
| **권한** | all |
| **사전 조건** | filteredItems.length === 0 (현재 데이터상 발생하지 않으나 로직 존재) |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 빈 카테고리 선택 (엣지 케이스) | EmptyState 컴포넌트: Search 아이콘 + "해당 카테고리에 질문이 없어요" + "다른 카테고리를 선택해보세요" | `SC-01-025-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | EmptyState `size="sm"` 렌더링 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-026: FAQ — Contact CTA

| 항목 | 값 |
|------|-----|
| **URL** | `/faq` |
| **권한** | all |
| **사전 조건** | 페이지 하단 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | Contact CTA 섹션 확인 | Mail 아이콘 + "더 궁금한 점이 있나요?" + 이메일 버튼 | `SC-01-026-S01` |
| 2 | `click("이메일 문의하기" 버튼)` | `mailto:support@teammeet.kr` 트리거 | `SC-01-026-S02` |
| 3 | `hover("이메일 문의하기")` | `hover:bg-blue-600` | `SC-01-026-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Mail 아이콘 박스 `h-14 w-14 rounded-2xl bg-blue-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 버튼 `bg-blue-500 text-white font-bold px-7 py-3.5 rounded-xl text-md` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 이메일 주소 텍스트 `text-sm text-gray-500` "support@teammeet.kr" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 카드 `bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## D. Guide Page (`/guide`)

---

### SC-01-027: Guide 페이지 초기 로드

| 항목 | 값 |
|------|-----|
| **URL** | `/guide` |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/guide)` | LandingNav + Hero + 6단계 튜토리얼 + 팀 매칭 가이드 + 용병/장터 가이드 + CTA + Footer 렌더링 | `SC-01-027-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Hero 배지 `bg-blue-50 text-blue-600` + BookOpen 아이콘 + "서비스 가이드" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | h1 "이용 가이드" `text-3xl sm:text-5xl lg:text-5xl font-black` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Nav "이용 가이드" 링크 활성 스타일 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-028: Guide — 6단계 튜토리얼 카드

| 항목 | 값 |
|------|-----|
| **URL** | `/guide` |
| **권한** | all |
| **사전 조건** | 6단계 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | "6단계로 시작하는 스포츠 매칭" 제목 + 6개 카드 순차 렌더링 | `SC-01-028-S01` |
| 2 | 각 카드 상세 확인 | 좌: 번호 + 아이콘 + 제목 + 부제목(blue) + 설명 + 체크리스트 / 우: Mock UI 프리뷰 | `SC-01-028-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | "시작하기" 배지 `text-blue-500 bg-blue-50` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 카드 `bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 번호 원형 `bg-blue-500 text-white h-10 w-10 rounded-full` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 부제목 `text-sm font-medium text-blue-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 체크리스트 각 항목 CheckCircle2 `text-blue-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Desktop `lg:flex` 가로 레이아웃, 짝수 카드 `lg:flex-row-reverse` | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V7 | Mock UI 프리뷰 `lg:w-[280px]` — `bg-blue-50 dark:bg-blue-900/20 rounded-2xl` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | Mock 내 첫 항목 `ring-2 ring-blue-500/20` 강조 + CheckCircle2 체크마크 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V9 | 프로그레스 바 `bg-blue-500` width N/6 * 100% | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-029: Guide — 팀 매칭 가이드

| 항목 | 값 |
|------|-----|
| **URL** | `/guide` |
| **권한** | all |
| **사전 조건** | 팀 매칭 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | "팀 매칭" 배지 + "팀 매칭 이용법" 제목 + 6개 기능 카드 + 흐름 요약 | `SC-01-029-S01` |
| 2 | `hover(기능 카드)` | `hover:bg-gray-50 dark:hover:bg-gray-750` | `SC-01-029-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | "팀 매칭" 배지 `text-blue-600 bg-blue-50` + Users 아이콘 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 6개 카드 `sm:grid-cols-2 lg:grid-cols-3 gap-5` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 아이콘 `h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-900/30` + `text-blue-600 dark:text-blue-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 흐름 요약 `bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 흐름 6단계 각 항목 `bg-white dark:bg-gray-800 rounded-lg border border-blue-200` + ArrowRight `text-blue-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-030: Guide — 용병 & 장터 가이드

| 항목 | 값 |
|------|-----|
| **URL** | `/guide` |
| **권한** | all |
| **사전 조건** | 용병/장터 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | "용병 & 장터" 배지 + 2열 카드(용병 / 장터) | `SC-01-030-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 배경 `bg-gray-50 dark:bg-gray-800/30` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 레이아웃 `grid lg:grid-cols-2 gap-8` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 카드 헤더 `bg-blue-500 px-6 py-4` 블루 배경 + 흰색 제목 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 용병 태그: "포지션별 검색", "실력 레벨 필터", "매너 점수 표시", "즉시 채팅" `text-blue-600 bg-blue-50` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 장터 태그: "종목별 카테고리", "가격 협상", "찜하기 알림", "거래 후 평가" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-031: Guide — Bottom CTA

| 항목 | 값 |
|------|-----|
| **URL** | `/guide` |
| **권한** | all |
| **사전 조건** | 페이지 하단 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | CTA 확인 | "가입 3초, 첫 매칭 무료" + "이제 직접 경험해보세요" | `SC-01-031-S01` |
| 2 | `click("지금 시작하기" 버튼)` | `/login` 이동 | `SC-01-031-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 다크 배경 `bg-gray-900 dark:bg-black` + radial gradient | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "가입 3초, 첫 매칭 무료" `text-blue-400 font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 버튼 `bg-blue-500 hover:bg-blue-400 active:scale-[0.97]` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## E. Pricing Page (`/pricing`)

---

### SC-01-032: Pricing 페이지 초기 로드

| 항목 | 값 |
|------|-----|
| **URL** | `/pricing` |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/pricing)` | LandingNav + Hero + 3개 요금 카드 + 매치 참가비 안내 + FAQ + CTA + Footer 렌더링 | `SC-01-032-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Hero 배지 `bg-blue-50 text-blue-600` + CreditCard 아이콘 + "투명한 요금 정책" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | h1 "요금 안내" `text-3xl sm:text-5xl lg:text-6xl font-black` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Nav "요금" 링크 활성 스타일 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-033: Pricing — 요금 카드 3종

| 항목 | 값 |
|------|-----|
| **URL** | `/pricing` |
| **권한** | all |
| **사전 조건** | 요금 카드 섹션 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 3개 카드 확인 | 무료(0원) / 프로(9,900원/월) / 팀(19,900원/월) | `SC-01-033-S01` |
| 2 | 프로 카드 "추천" 배지 확인 | `-top-3.5` 위치 `bg-blue-500 text-white` Sparkles 아이콘 | `SC-01-033-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 레이아웃 `md:grid-cols-3 gap-6 lg:gap-8` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 무료 카드: Sparkles `bg-gray-100 text-gray-500`, CTA `bg-gray-900 text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 프로 카드: Zap `bg-blue-100 text-blue-500`, `border-blue-500 ring-2 ring-blue-500`, CTA `bg-blue-500 text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 팀 카드: Users `bg-violet-100 text-violet-500`, CTA `bg-gray-900 text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 가격 `text-4xl lg:text-5xl font-black text-gray-900 dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | 기능 목록 `role="list"` 접근성 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | 프로 카드 체크 아이콘 `text-blue-500 bg-blue-100`, 비추천 카드 `text-gray-500 bg-gray-100` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | 다크모드: 무료/팀 CTA `dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-034: Pricing — 요금 카드 CTA 클릭

| 항목 | 값 |
|------|-----|
| **URL** | `/pricing` |
| **권한** | all |
| **사전 조건** | 요금 카드 표시 상태 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `click("무료로 시작하기")` | `/login` 이동 | `SC-01-034-S01` |
| 2 | `click("프로 시작하기")` | `/login` 이동 | `SC-01-034-S02` |
| 3 | `click("팀 시작하기")` | `/login` 이동 | `SC-01-034-S03` |
| 4 | `hover("프로 시작하기")` | `hover:bg-blue-600` | `SC-01-034-S04` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | CTA 버튼 `w-full rounded-xl px-6 py-3.5 text-base font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | `active:scale-[0.97]` 프레스 효과 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | `focus-visible:outline-2 outline-blue-400` 포커스 링 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-035: Pricing — 매치 참가비 안내

| 항목 | 값 |
|------|-----|
| **URL** | `/pricing` |
| **권한** | all |
| **사전 조건** | 매치 참가비 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 섹션 확인 | "매치 참가비" 배지 + "개별 매치 참가비 안내" 제목 + 3열 통계 + 4개 안내 항목 | `SC-01-035-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 배경 `bg-gray-50 dark:bg-gray-800/30` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 3열 통계: "5,000 ~ 30,000원" / "호스트" / "10%" `text-blue-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 카드 `bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 안내 항목 Check 아이콘 `text-blue-500` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | 구분선 `border-t border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-036: Pricing — FAQ 아코디언

| 항목 | 값 |
|------|-----|
| **URL** | `/pricing` |
| **권한** | all |
| **사전 조건** | FAQ 섹션으로 스크롤 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | FAQ 섹션 확인 | "자주 묻는 질문" 배지 + "요금 관련 FAQ" 제목 + 6개 아코디언 | `SC-01-036-S01` |
| 2 | `click("무료로도 쓸 수 있나요?" 질문)` | 답변 열림 `max-h-[300px] opacity-100`, 보더 `border-blue-200 dark:border-blue-800` | `SC-01-036-S02` |
| 3 | `click(같은 질문)` | 답변 닫힘 `max-h-0 opacity-0`, 보더 복귀 | `SC-01-036-S03` |
| 4 | `click("환불 정책은 어떻게 되나요?")` | 이전 열린 항목 닫히고, 해당 항목 열림 | `SC-01-036-S04` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 카드 `bg-white dark:bg-gray-800 rounded-2xl border` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 열린 상태 `border-blue-200 dark:border-blue-800` / 닫힌 상태 `border-gray-100 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | `aria-expanded` true/false 토글 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | `role="region" aria-labelledby` 연결 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | ChevronDown `rotate-180` 전환 `transition-transform duration-300` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | 질문 `text-md font-semibold text-gray-900 dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | 답변 `text-base text-gray-500 dark:text-gray-400 leading-relaxed` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-037: Pricing — Bottom CTA

| 항목 | 값 |
|------|-----|
| **URL** | `/pricing` |
| **권한** | all |
| **사전 조건** | 페이지 하단 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | CTA 확인 | "가입은 무료, 업그레이드는 언제든" + "지금 무료로 시작하세요" | `SC-01-037-S01` |
| 2 | `click("무료로 시작하기" 버튼)` | `/login` 이동 | `SC-01-037-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 다크 배경 `bg-gray-900 dark:bg-black` + radial gradient | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "가입은 무료, 업그레이드는 언제든" `text-blue-400 font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 버튼 `bg-blue-500 hover:bg-blue-400 active:scale-[0.97]` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## F. Cross-Page Scenarios

---

### SC-01-038: Nav 링크 간 페이지 전환

| 항목 | 값 |
|------|-----|
| **URL** | `/landing` → 각 페이지 |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/landing)` → `click(Nav "이용 가이드")` | `/guide` 이동, Nav "이용 가이드" 활성 | `SC-01-038-S01` |
| 2 | `click(Nav "요금")` | `/pricing` 이동, Nav "요금" 활성 | `SC-01-038-S02` |
| 3 | `click(Nav "FAQ")` | `/faq` 이동, Nav "FAQ" 활성 | `SC-01-038-S03` |
| 4 | `click(Nav "소개")` | `/about` 이동, Nav "소개" 활성 | `SC-01-038-S04` |
| 5 | `click(Nav 로고 "TeamMeet")` | `/` 이동 | `SC-01-038-S05` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 각 페이지 전환 시 활성 링크 스타일 올바르게 변경 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 전환 시 LandingNav + LandingFooter 일관 렌더링 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-039: Nav "시작하기" / "로그인" 버튼

| 항목 | 값 |
|------|-----|
| **URL** | 모든 정적 페이지 |
| **권한** | all |
| **사전 조건** | 비로그인 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `click(Nav "시작하기" 버튼)` | `/login` 이동 | `SC-01-039-S01` |
| 2 | `hover(Nav "시작하기")` | `hover:bg-blue-600` + `shadow-sm shadow-blue-500/20` | `SC-01-039-S02` |
| 3 | `click(Nav "로그인" 텍스트)` | `/login` 이동 | `SC-01-039-S03` |
| 4 | `hover(Nav "로그인")` | `hover:text-gray-900` | `SC-01-039-S04` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | "시작하기" `bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "로그인" `hidden sm:block text-gray-500 hover:text-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | — | — |

---

### SC-01-040: 키보드 네비게이션 (접근성)

| 항목 | 값 |
|------|-----|
| **URL** | 모든 정적 페이지 |
| **권한** | all |
| **사전 조건** | 키보드 전용 사용 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `Tab` 연타 | 모든 인터랙티브 요소(링크, 버튼) 순차 포커스 | `SC-01-040-S01` |
| 2 | 포커스 링 확인 | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400` | `SC-01-040-S02` |
| 3 | FAQ 아코디언에서 `Enter`/`Space` | 아코디언 열기/닫기 토글 | `SC-01-040-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Nav 링크 → CTA 버튼 → 콘텐츠 링크 → Footer 링크 순서 포커스 이동 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 모든 `<button>`, `<a>` 요소 포커스 가능 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 포커스 링 `blue-500` 색상, 2px offset | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-041: 다크모드 전환

| 항목 | 값 |
|------|-----|
| **URL** | 모든 정적 페이지 |
| **권한** | all |
| **사전 조건** | 시스템 다크모드 설정 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 시스템 다크모드 활성화 | 전체 페이지 다크 테마 전환 | `SC-01-041-S01` |
| 2 | 각 섹션 다크모드 확인 | 모든 텍스트/배경 다크 변형 적용 | `SC-01-041-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 메인 배경 `dark:bg-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 카드 `dark:bg-gray-800 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 제목 `dark:text-white`, 본문 `dark:text-gray-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 배지 `dark:bg-blue-900/30 dark:text-blue-400` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Nav 스크롤 시 `dark:bg-gray-900/88 dark:border-white/10` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Footer `dark:bg-gray-900 dark:border-gray-800` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | 모든 텍스트-배경 대비 WCAG 2.1 AA (4.5:1) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-01-042: 모바일 터치 타겟 검증

| 항목 | 값 |
|------|-----|
| **URL** | 모든 정적 페이지 |
| **권한** | all |
| **사전 조건** | 모바일 뷰포트 |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | 모든 버튼/링크 터치 타겟 측정 | 최소 44x44px 충족 | `SC-01-042-S01` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Nav 햄버거 버튼 `h-11 w-11` (44px) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V2 | Hero CTA 버튼 `px-8 py-4` (높이 > 44px) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V3 | FAQ 카테고리 탭 `px-5 py-2.5` (높이 ~40px, 확인 필요) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V4 | FAQ 아코디언 질문 영역 `py-5` (높이 > 44px) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V5 | Nav 모바일 메뉴 링크 `px-4 py-3` (터치 영역 충분) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V6 | Footer 링크 간 `space-y-3` 간격으로 오터치 방지 | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V7 | Pricing CTA 버튼 `w-full py-3.5` (높이 > 44px) | — | — | — | — | — | — | ☐ | ☐ | ☐ |
