# Toss-Style Design Rubric — v1 측정 가능 기준

> 목적: v1 앱(apps/v1_web)의 "세련된 토스 스타일" polish 작업에서 각 규칙을 **체크리스트처럼** 적용·검증하기 위한 단일 레퍼런스.
> 각 규칙은 (1) 토스 원칙 출처 (2) v1 토큰/클래스 매핑 (3) 위반 판정 기준으로 구성된다.

---

## 1. 컬러 (Color)

### R-C1 단일 블루 액센트 원칙

**규칙:** 액센트 컬러는 `--blue500(#3182f6)` / `--blue600(#2272eb)` 하나의 계열로만. 한 화면에서 **독립 강조색(보조 액센트)은 2개 이하**. 세 번째 강조색이 등장하면 위계가 무너진다.

**출처:** toss.tech/article/toss-design-system — "One accent, quiet neutrals" 원칙; DESIGN.md §3 "One accent, quiet neutrals", §6 "Accent: `blue-500`/`blue-600` 중심".

**v1 매핑:**
- 허용: `var(--blue500)`, `var(--blue600)`, `var(--blue700)` (active 전용), `var(--blue50)` (tint only)
- 허용 보조: 의미색(`--green500`, `--red500`, `--orange500`) — 상태 표시 전용, 장식 금지
- 금지: `--prize-gold(#ffd84d)`, `--orange600(#f08a00)`를 일반 UI 강조에 사용하는 것

**위반 판정:** 한 카드/화면 내 `--blue500` 외 유채색 강조가 3개 이상 → Critical.

---

### R-C2 의미색(Semantic Color) 사용 규약

**규칙:**
- 성공/완료 → `var(--green500)` / `bg-green-50 text-green-600`
- 경고/마감임박 → `var(--orange500)` / `bg-amber-50 text-amber-600`
- 오류/취소 → `var(--red500)` / `bg-red-50 text-red-500`
- 중립/대기 → `var(--grey100)` / `bg-gray-100 text-gray-600`
- 의미색은 **상태 배지에만** 사용. 배경 전체 컬러로 칠하지 않는다.

**출처:** DESIGN.md §12 "Status & Sport Color — 상태 표시 규칙"; toss-design-system 아티클 의미색 체계.

**v1 매핑:** `.tm-badge-green`, `.tm-badge-red`, `.tm-badge-orange` 클래스; `var(--tint-green)`, `var(--tint-orange)` (tint 배경 전용, 8–10% opacity).

**위반 판정:** 배지 이외의 컴포넌트 배경에 `--green500`/`--red500`/`--orange500` 직접 fill → Critical.

---

### R-C3 컬러만으로 의미 전달 금지 (WCAG 1.4.1)

**규칙:** 상태, 종목, 결과 등 의미 있는 구분은 반드시 **컬러 + 텍스트/아이콘 중 하나를 병행**. 컬러 단독 금지.

**출처:** WCAG 2.1 SC 1.4.1; .impeccable.md "Accessibility Baseline — 컬러만으로 정보 전달 금지"; DESIGN.md §12.

**v1 매핑:** 종목 식별 = `h-2 w-2 rounded-full` 도트 + 종목 텍스트 병행; 상태 배지 = 색 배경 + 텍스트 라벨 항상.

**위반 판정:** 도트/배경색만 있고 텍스트 라벨이 없는 상태 표시 → Critical.

---

## 2. 타이포그래피 (Typography)

### R-T1 타입 위계 단수 상한 — 4단계

**규칙:** 한 화면(스크롤 없는 뷰포트 기준)에서 사용하는 타입 크기는 **최대 4단계**. 5단계 이상이면 위계가 분산된다.

**출처:** DESIGN.md §2.1 "타이포그래피 위계 — 4단계(제목·섹션·카드·보조)"; toss-design-system "수직 위계 명확화".

**v1 매핑(4단계 예시):**
1. 페이지 제목 → `.tm-text-heading` (24px/700) 또는 `font-size: var(--font-size-heading)`
2. 섹션 제목 → `.tm-text-body-lg` (17px/700) 또는 `var(--font-size-body-lg)`
3. 카드 핵심 정보 → `.tm-text-body` (15px/500) 또는 `var(--font-size-body)`
4. 보조/메타 → `.tm-text-caption` (12px/400) 또는 `var(--font-size-caption)`

**위반 판정:** 동일 화면에서 `.tm-text-micro`(11px)부터 `--font-size-heading`(24px)까지 5종 이상 동시 등장 → Warning.

---

### R-T2 하드코딩 px 폰트 크기 금지

**규칙:** `font-size` 직접 px 지정 금지. 반드시 `var(--font-size-*)` 또는 `.tm-text-*` 클래스 사용.

**출처:** DESIGN.md §6 "Typography: token-first. globals.css의 type scale을 우선 사용하고 arbitrary px 남용을 피한다"; v1-coding-patterns.md §2 "디자인 토큰 — 하드코딩 색/사이즈 금지".

**v1 토큰 목록:**
```
--font-size-micro: 11px   → .tm-text-micro
--font-size-caption: 12px → .tm-text-caption
--font-size-label: 13px   → .tm-text-label
--font-size-body-sm: 14px
--font-size-body: 15px    → .tm-text-body
--font-size-body-lg: 17px → .tm-text-body-lg
--font-size-subhead: 20px → .tm-text-subhead
--font-size-heading: 24px → .tm-text-heading
```

**위반 판정:** `font-size: 16px`, `font-size: 18px` 등 토큰 외 직접 px 값 → Warning (토큰 인접 값이면 가장 가까운 토큰으로 교체).

---

### R-T3 굵기(Weight) 사용 규약

**규칙:** 강조는 **weight로** 처리. 밑줄, 이탤릭, 컬러 단독 강조 금지.
- 제목/핵심 CTA: `font-weight: 700` (`.tm-btn`, `.tm-text-heading`, `.tm-text-subhead`)
- 보조 정보: `font-weight: 500` (`.tm-text-body`)
- 라벨/칩: `font-weight: 600`~`700` (`.tm-text-label`, `.tm-chip`)
- 캡션: `font-weight: 400` (`.tm-text-caption`)
- `font-weight: 800` 이상은 히어로 숫자·로고 한정.

**출처:** DESIGN.md §2.1 "각 단계 사이에 최소 2px 이상의 크기 차이와 weight 차이"; toss-design-system "weight로 위계 형성".

**v1 매핑:** `.tm-text-*` 클래스의 기본 weight가 이미 적용됨. 인라인 `style={{ fontWeight: 600 }}` 등 오버라이드 시 위 규약과 일치 여부 확인.

**위반 판정:** 동일 단계 텍스트에 weight 오버라이드로 700↔400 혼용 → Warning.

---

## 3. 간격 / 리듬 (Spacing & Rhythm)

### R-S1 섹션 간 여백

**규칙:**
- 대섹션 간격(페이지 내 주요 블록 구분): `mt-10` = 40px
- 소항목 간격(섹션 내): `mt-4`~`mt-6` = 16–24px
- 리스트 항목 간격: `gap-3` = 12px

**출처:** DESIGN.md §2.1 "여백 리듬 — 페이지 내 대섹션: mt-10, 소항목: mt-4~mt-6, 리스트: gap-3".

**v1 매핑:** `.tm-section-title`(line 1339 globals.css)이 올라앉는 상위 컨테이너에 `margin-top`이 명시되어야 한다. 현재 globals.css에 고정 `margin-top` 값이 섹션별로 산재(18/24/30px)함 — 토큰화 or 일치화 필요.

**위반 판정:** 대섹션 구분이 8px 이하 or 섹션 간 여백이 화면마다 제각각 → Warning.

---

### R-S2 카드 내부 패딩 통일

**규칙:** `.tm-card` 내부 `padding: 16px` (`p-4`) 통일. 카드마다 다른 패딩 금지.

**출처:** DESIGN.md §2.1 "카드 내부 패딩: p-4(16px) 통일 — 카드마다 다르면 안 된다"; DESIGN.md §10 "Card System".

**v1 매핑:** `.tm-card`(line 1020) 자체에는 padding 미지정 — **소비 측에서 `padding: 16px` 명시 필수**. 현재 `.tm-auth-soft-card`(line 536) = `padding: 24px 20px` (auth 전용 예외, 허용). 일반 콘텐츠 카드는 16px.

**위반 판정:** 동일 목적의 콘텐츠 카드가 8px / 12px / 20px 등 불일치 → Warning.

---

### R-S3 좌우 페이지 여백

**규칙:** 모바일 기준 좌우 패딩 `px-5`(20px) 통일. 16px 이하 또는 24px 이상 혼용 금지.

**출처:** DESIGN.md §2.1 "좌우 페이지 여백: px-5(20px) — 모바일 기준"; v1 shell `--v1-shell-topbar-x` = 16px (topbar 전용 예외).

**v1 매핑:** 페이지 스크롤 영역 콘텐츠 래퍼에 `padding: 0 20px`. topbar/bottomnav chrome 제외.

**위반 판정:** 콘텐츠 영역이 12px 또는 24px로 일관되지 않게 혼용 → Warning.

---

## 4. 컴포넌트 (Component)

### R-K1 카드 반지름(Border-Radius) 통일

**규칙:**
- 콘텐츠 카드: `border-radius: 16px` (`.tm-card`: line 1022 globals.css)
- 버튼: `border-radius: 12px` (`.tm-btn`: line 1037)
- 칩/배지: `border-radius: 999px` (pill)
- 인풋: `border-radius: 14px` (`.tm-input`)
- 소형 아이콘 컨테이너: `border-radius: 9px`~`10px`

**원칙:** chrome(모달, 바텀시트)은 콘텐츠 카드보다 더 둥글어 보이지 않는다.

**출처:** DESIGN.md §6 "Radius: content card보다 chrome이 더 둥글어 보이지 않도록"; globals.css 실제 값 기준.

**v1 매핑:** `.tm-card { border-radius: 16px }`, `.tm-btn { border-radius: 12px }`, `.tm-badge { border-radius: 999px }`.

**위반 판정:** 콘텐츠 카드에 `border-radius: 24px` 이상 → Warning. 버튼/칩에 `border-radius: 4px` 등 각진 처리 → Warning.

---

### R-K2 섀도(Shadow) 절제 — hairline depth

**규칙:**
- 본문 카드 섀도: `var(--shadow-1)` = `0 1px 2px rgba(15,23,42,0.05)` 또는 섀도 없음(border로 대체)
- 엘리베이션이 필요한 경우: `var(--shadow-2)` = `0 8px 24px rgba(20,28,45,0.08)` 상한
- 모달: `var(--shadow-modal)` = `0 8px 32px rgba(20,28,45,0.14)` (모달 전용)
- `box-shadow: 0 4px 20px rgba(0,0,0,0.2)` 등 짙은 섀도 금지
- hover 시 카드 "떠오름(lift)" 효과 금지 — `hover:bg-gray-50` 배경 변화만 허용

**출처:** toss.tech/article/toss-design-system 섀도 절제 원칙; DESIGN.md §4.1 "Shadow — hairline depth"; .impeccable.md "Anti-Patterns — 과한 shadow, glow, hover lift".

**v1 매핑:** `var(--shadow-1)`, `var(--shadow-2)`, `var(--shadow-modal)` 세 레벨만.

**위반 판정:** `rgba(0,0,0,0.15)` 이상 opacity의 box-shadow → Critical.

---

### R-K3 보더(Border) 절제 — subtle only

**규칙:**
- 카드 보더: `1px solid var(--border)` = `1px solid var(--grey100)` 한 줄
- 보더 컬러 강조(한쪽 컬러 보더, `border-left: 4px solid blue`) 금지
- outline-heavy container 중첩 금지 — 카드 안에 또 다른 테두리 카드 중첩 최대 1단계
- 구분선: `border-t border-gray-100` (섹션 3순위 구분). 배경색 전환이 1순위.

**출처:** DESIGN.md §4.2 "Border — subtle full-border 중심"; .impeccable.md "Anti-Patterns — 과한 border, 한쪽 컬러 border, outline-heavy container 중첩".

**v1 매핑:** `.tm-card { border: 1px solid var(--border) }` (line 1021). `var(--border)` = `var(--grey100)` = `#f0f4f8`.

**위반 판정:** `border: 2px solid var(--blue500)` 카드 강조 또는 `border-left: 3px solid …` → Critical.

---

### R-K4 Glass 사용 범위

**규칙:** Glass(반투명 배경) 사용은 **chrome 영역만**:
- `.tm-topbar` (상단 네비바)
- 모달/드로어 스크림
- 히어로 이미지 위 텍스트 레이어

금지 영역: 본문 카드, 폼, 리스트 아이템, 인풋, 일반 콘텐츠 섹션.

**출처:** DESIGN.md §2.2 "Glass — chrome only"; §4.4 "Glass"; .impeccable.md "glass: chrome only / Anti-Patterns — glass를 본문 카드/폼/리스트 재질로 사용하는 것".

**v1 매핑:** `var(--scrim-dark-32)`, `var(--scrim-dark-72)` = 스크림 전용. `var(--overlay-white-*)` = 히어로 위 텍스트 레이어 전용.

**위반 판정:** `backdrop-filter: blur()` 를 일반 카드 배경에 사용 → Critical.

---

### R-K5 버튼 터치 타겟 및 CTA 수 제한

**규칙:**
- 모든 인터랙티브 요소: `min-height: 44px` (`.tm-btn-sm`, `.tm-btn-md` 준수)
- 아이콘 버튼: `width: 44px height: 44px` (`.tm-btn-icon`)
- 한 화면 내 주요 CTA: **최대 1개** (`bg-blue-500` 계열)
- 보조 CTA: 최대 1개 (`border-outline` or `neutral`)
- 동급 CTA 3개 이상 금지

**출처:** DESIGN.md §2.1 "버튼 크기: min-h-[44px] 터치 타겟 준수, 페이지 내 CTA는 1-2개만"; §14 "CTA Placement — 주요 CTA 화면당 최대 1개".

**v1 매핑:** `.tm-btn-sm { min-height: 44px }`, `.tm-btn-md { min-height: 44px }`, `.tm-btn-lg { min-height: 50px }`, `.tm-btn-icon { width: 44px; height: 44px }`.

**위반 판정:** 인터랙티브 요소 높이 < 44px → Critical. 화면 내 `tm-btn-primary` 2개 이상 → Warning.

---

## 5. 데이터 / 라벨 배치 (Information Layout)

### R-D1 카드 정보 위계 3단계

**규칙:** 카드 내 정보는 항상 **primary → secondary → tertiary** 순서로 시각 위계를 형성한다.
- Primary (가장 크고 굵게): 핵심 행동 단서 (시간, 제목, 참가 현황)
- Secondary (중간): 장소, 종목, 팀명 등 맥락 정보
- Tertiary (작고 흐리게): 가격, 날짜 상세, 부가 태그

카드 내 큰 숫자(`font-size: 30px+`)는 프로필 통계/어드민 KPI에만 허용. 일반 콘텐츠 카드 금지.

**출처:** DESIGN.md §11 "Information Hierarchy — primary→secondary→tertiary 3단계".

**v1 매핑:** primary = `.tm-text-body-lg`(17px/700), secondary = `.tm-text-body`(15px/500), tertiary = `.tm-text-caption`(12px/400).

**위반 판정:** 카드 내 4단계 이상의 폰트 크기 혼용 → Warning. tertiary 정보가 primary보다 크게 표시 → Critical.

---

### R-D2 중요 정보 부각 = 나머지 후퇴

**규칙:** 한 요소를 강조할 때는 해당 요소의 weight/size/color를 올리는 동시에 **나머지 요소는 `text-gray-500`, `font-weight: 400`으로 후퇴**시킨다. 모든 요소가 동등하게 진하면 강조가 없는 것과 같다.

**출처:** DESIGN.md §2.1 "섹션 간 구분 — 3순위까지 있지만 하나만 선택"; toss 시인성(readability) 원칙.

**v1 매핑:** `var(--text-strong)` (강조) vs `var(--text-caption)` (후퇴) 쌍 사용.

**위반 판정:** 카드 내 모든 텍스트가 `font-weight: 600+` → Warning.

---

### R-D3 카드 정보 밀도 상한

**규칙:**
- 배너 카드: 제목 1줄 + 메타 최대 2줄 + 배지 최대 2개
- 리스트 아이템: 제목 1줄(`truncate`) + 설명 1줄(`line-clamp-1`) + 메타 1줄
- 카드 간 간격: `gap-3`(12px)
- 한 뷰포트에 3~5개 카드가 보여야 함 (카드 1개가 전체 화면 점유 금지)
- 섹션 구분 방법: 여백(1순위) → 배경색 전환(2순위) → 구분선(3순위). 동시 사용 금지.

**출처:** DESIGN.md §15 "Information Density"; §2.1 "리스트 밀도".

**v1 매핑:** `gap-3`, `truncate`, `.line-clamp-2` (globals.css line 196).

**위반 판정:** 3가지 구분 방법(여백+배경전환+구분선)을 동시에 적용 → Warning.

---

## 6. 모션 (Motion)

### R-M1 목적 분명한 속성만 transition

**규칙:** `transition-all` 금지. 반드시 목적이 명확한 속성만:
- `transition: colors` (컬러 변화)
- `transition: transform` (위치/크기 변화)
- `transition: opacity` (투명도 변화)
- duration 기본: `120ms`~`150ms`

**출처:** DESIGN.md §6 "Motion: transition-all 대신 목적이 분명한 property만"; §16 "전환 — transition-all 금지. transition-colors / transition-transform / transition-opacity. duration-150".

**v1 매핑:** `.tm-pressable { transition: transform 120ms ease, opacity 120ms ease }` (line 1027). 이 패턴을 모든 인터랙티브 요소에 적용.

**위반 판정:** `transition: all 0.3s ease` 또는 `transition: all` → Warning (Critical if 300ms+).

---

### R-M2 prefers-reduced-motion 대응

**규칙:** 모든 animation/transition은 `@media (prefers-reduced-motion: reduce)` 블록에서 duration을 `0.01ms`로 재정의.

**출처:** DESIGN.md §16 "전환"; .impeccable.md "Accessibility Baseline — prefers-reduced-motion 대응"; globals.css line ~2240 `@media (prefers-reduced-motion: reduce)`.

**v1 매핑:** globals.css에 이미 전역 규칙 존재:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
신규 keyframe animation 추가 시 이 규칙에 자동 포함됨 — **별도 처리 불필요**, 단 JS로 직접 style.transitionDuration 조작 시 이 규칙 우회 금지.

**위반 판정:** `@keyframes` 외부에서 JS로 transition duration을 하드코딩하여 prefers-reduced-motion 우회 → Critical.

---

## 7. 빈/에러/로딩 상태 일관성 (State Patterns)

### R-SP1 빈 상태(EmptyState) 컴포넌트 단일화

**규칙:** 빈 상태는 반드시 `components/ui/empty-state.tsx` 사용. 인라인 "데이터가 없습니다" 텍스트 단독 표시 금지.
필수 구성: 아이콘(bg-blue-50 rounded-full + Lucide icon text-blue-400) + 제목 + 다음 행동 CTA.

**출처:** DESIGN.md §13 "State Patterns — 빈 상태 (EmptyState): 반드시 components/ui/empty-state.tsx 사용".

**v1 매핑:** `components/ui/empty-state.tsx` — size prop: `md`(독립 영역 기본), `sm`(카드 내부).

**위반 판정:** `<p>결과가 없습니다</p>` 단독 출력 → Critical. 아이콘 없는 EmptyState → Warning.

---

### R-SP2 에러 상태(ErrorState) 재시도 필수

**규칙:** 에러 상태는 반드시 `components/ui/error-state.tsx` 사용. 재시도 버튼(`onRetry`) 필수.
아이콘: `bg-red-50 rounded-full` + `AlertCircle`.

**출처:** DESIGN.md §13 "State Patterns — 에러 상태: components/ui/error-state.tsx, 재시도 버튼 필수".

**위반 판정:** 에러 시 재시도 버튼 없음 → Critical. ErrorState 컴포넌트 대신 인라인 에러 텍스트 → Warning.

---

### R-SP3 로딩 상태 — 스켈레톤 형태 일치

**규칙:**
- 콘텐츠 영역 로딩: `animate-pulse bg-gray-100 rounded-xl` 스켈레톤 — **실제 콘텐츠와 동일한 레이아웃 형태**
- 스피너: 페이지 전환/액션 대기에만. 콘텐츠 영역 단독 사용 금지
- 로딩 중에도 상단바/하단 내비는 유지

**출처:** DESIGN.md §13 "로딩 상태 — 스켈레톤: animate-pulse, 실제 콘텐츠 레이아웃과 동일한 형태".

**위반 판정:** 카드 목록 로딩 중 전체 화면 스피너만 표시 → Warning. 스켈레톤이 실제 카드와 크기/구조 불일치 → Warning.

---

## 8. 접근성 (Accessibility)

### R-A1 터치 타겟 44×44px 최소

**규칙:** 모든 인터랙티브 요소(버튼, 링크, 칩, 토글) `min-width: 44px`, `min-height: 44px`.

**출처:** v1-coding-patterns.md §3 "a11y — WCAG 2.1 AA + 프로젝트 44px"; globals.css `.tm-chip { min-height: 44px }`.

**v1 매핑:** `.tm-btn-icon { width: 44px; height: 44px }`, `.tm-btn-sm { min-height: 44px }`, `.tm-chip { min-height: 44px }`.

**위반 판정:** 아이콘 버튼 24×24px 단독 → Critical.

---

### R-A2 키보드 포커스 링

**규칙:** 키보드 포커스 시 `outline: 2px solid var(--blue500); outline-offset: 2px`. `:focus` 단독 사용 금지, `:focus-visible`만.

**출처:** v1-coding-patterns.md §3; DESIGN.md §16 "포커스 — focus-visible:ring-2 ring-blue-500 ring-offset-2".

**v1 매핑:** `.tm-btn:focus-visible, .tm-pressable:focus-visible { outline: 2px solid var(--blue500); outline-offset: 2px }` (globals.css line 1114).

**위반 판정:** `outline: none` + `:focus` 제거 → Critical.

---

### R-A3 아이콘 버튼 aria-label

**규칙:** 텍스트 없는 아이콘 버튼은 `aria-label` 필수. 장식용 SVG는 `aria-hidden="true"`.

**출처:** v1-coding-patterns.md §3 "아이콘/무텍스트 버튼 aria-label"; DESIGN.md §16.

**위반 판정:** `<button><svg/></button>` aria-label 없음 → Critical.

---

## 빠른 체크리스트 요약

| # | 규칙 | 기준 | 위반 등급 |
|---|------|------|-----------|
| R-C1 | 단일 블루 액센트 | 한 화면 강조색 ≤ 2종(의미색 포함) | Critical |
| R-C2 | 의미색 = 배지 전용 | 배경 fill 금지 | Critical |
| R-C3 | 컬러 + 텍스트 병행 | 컬러 단독 상태 표시 금지 | Critical |
| R-T1 | 타입 위계 ≤ 4단계 | 뷰포트 내 5종 이상 크기 혼용 | Warning |
| R-T2 | 폰트 토큰 필수 | `font-size: Npx` 직접 지정 금지 | Warning |
| R-T3 | Weight 규약 | 캡션에 700, 제목에 400 금지 | Warning |
| R-S1 | 섹션 간격 40px | 대섹션 구분 ≤ 8px | Warning |
| R-S2 | 카드 패딩 16px 통일 | 동일 목적 카드 패딩 불일치 | Warning |
| R-S3 | 좌우 여백 20px | 콘텐츠 12px 이하 또는 24px+ | Warning |
| R-K1 | 카드 radius 16px | 카드 24px 이상 과도한 radius | Warning |
| R-K2 | Shadow ≤ shadow-2 | rgba opacity 0.15 이상 짙은 그림자 | Critical |
| R-K3 | Border = grey100 한 줄 | 컬러 강조 보더 또는 중첩 | Critical |
| R-K4 | Glass = chrome only | 본문 카드에 backdrop-filter | Critical |
| R-K5 | 터치타겟 44px, CTA ≤ 1주요 | 주요 CTA 2개+ | Critical/Warning |
| R-D1 | 카드 정보 3단계 | 4단계 이상 혼용 | Warning |
| R-D2 | 강조 = 나머지 후퇴 | 전체 bold 동등 처리 | Warning |
| R-D3 | 카드 밀도 상한 | 3가지 구분법 동시 사용 | Warning |
| R-M1 | transition-colors/transform | transition-all 사용 | Warning |
| R-M2 | prefers-reduced-motion | JS로 duration 하드코딩 우회 | Critical |
| R-SP1 | EmptyState 컴포넌트 | 인라인 텍스트 단독 | Critical |
| R-SP2 | ErrorState + onRetry | 재시도 없는 에러 표시 | Critical |
| R-SP3 | 스켈레톤 형태 일치 | 전체 스피너 단독 사용 | Warning |
| R-A1 | 44×44px 터치타겟 | 아이콘 버튼 24px 단독 | Critical |
| R-A2 | focus-visible ring | outline: none 제거 | Critical |
| R-A3 | aria-label 필수 | 아이콘 버튼 라벨 없음 | Critical |

---

## v1이 토스 대비 약한 지점 (조사 기반 진단)

1. **간격/여백 비일관성** (`R-S1`, `R-S2`): globals.css에 `margin-top: 18px / 22px / 24px / 30px`이 문맥 없이 산재. 토스는 8px 배수 + 특정 단계값(16/24/40)으로 수렴. v1은 컴포넌트별 임의값 → 섹션마다 리듬이 다르게 보임. 파일: `apps/v1_web/src/app/globals.css` line 540–560 영역.

2. **타입 위계 5단계 혼용 화면 존재** (`R-T1`): `--font-size-micro(11px)` → `--font-size-caption(12px)` → `--font-size-label(13px)` → `--font-size-body(15px)` → `--font-size-heading(24px)` 5종이 일부 상세 화면에 동시 등장. 토스는 3–4단계로 압축. 특히 대회/매칭 상세 카드.

3. **섹션 구분 3가지 동시 적용** (`R-D3`): `margin-top` + `bg-gray-50` 배경 + `border-t` 구분선을 한 섹션 경계에 동시 적용하는 패턴이 일부 페이지에서 발견됨. DESIGN.md §15에 "하나만 선택"이 명시됐으나 실제 구현에서 누락. `apps/v1_web/src/app/(v1)/` 하위 페이지 전수 확인 필요.

4. **`prize-gold`/`orange600` 장식 컬러 사용** (`R-C1`): `var(--prize-gold: #ffd84d)`, `var(--orange600: #f08a00)` 토큰이 대회 상금 표시 외에 섹션 강조에 사용될 경우 단일 액센트 원칙 위반. `apps/v1_web/src/app/` 내 `prize-gold` 참조 위치 검토 필요.

5. **로딩 스켈레톤 형태 불일치** (`R-SP3`): 일부 리스트 화면에서 실제 카드(16px radius, 수평 레이아웃)와 다른 형태의 스켈레톤(전체 가로 줄 3개) 사용. 토스는 실제 콘텐츠 레이아웃과 1:1 형태 일치를 요구. `apps/v1_web/src/components/` 내 skeleton 컴포넌트 전수 확인 필요.

---

## 참고: 피그마 직접 열람 불가 고지

이 rubric은 피그마 파일을 직접 열람하지 못하는 환경 제약으로 인해, **공개 아티클·문서로 대체**하여 작성되었다. 참조 소스: `toss.tech/article/toss-design-system` (토스 기술 블로그, 2024), `DESIGN.md`/`.impeccable.md`/`docs/v1-coding-patterns.md` (v1 프로젝트 내 기존 설계 문서), `apps/v1_web/src/app/globals.css` (실제 구현 토큰). 토스의 내부 Figma 라이브러리나 비공개 디자인 스펙과 상이할 수 있으며, 공개 자료에서 관찰 가능한 패턴 기반으로 합리적으로 재구성하였다.
