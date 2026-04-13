# TeamMeet Design System

이 문서는 TeamMeet 프론트엔드의 **canonical design source of truth**다.
기존 디자인 관련 문서는 이 문서를 보완하거나 실행 결과를 기록할 수는 있지만, 시각 규칙을 새로 정의해서는 안 된다.

## 0. Read This First

- 디자인 규칙을 읽거나 바꿔야 한다면 항상 `DESIGN.md`부터 본다.
- 현재 코드베이스 디자인 개선 작업을 실행하려면 `DESIGN.md` 다음에 `.github/tasks/58-design-system-audit.md`를 본다. (이전 Task 52는 58에 의해 superseded)
- 과거 task, report, plan 문서는 evidence/history/reference일 뿐이고, 새로운 규칙 정의 문서가 아니다.
- 문서 읽는 순서와 active/historical 구분은 `docs/DESIGN_DOCUMENT_MAP.md`를 따른다.

## 1. Source Of Truth Order

1. `DESIGN.md` — canonical design rules, surface policy, review checklist
2. `.impeccable.md` — brand memo와 aesthetic summary를 담는 compatibility entry
3. `apps/web/src/app/globals.css` `@theme` — token truth
4. shared UI primitives and established layout patterns in `apps/web/src/components/`
5. audit/report/task documents — evidence, rollout history, follow-up only

## 2. Brand North Star

- 사용자 인상: 활발하지만 가볍지 않고, 친근하지만 싸보이지 않으며, 빠르게 읽히는 신뢰형 제품
- 시각 방향: **Toss-like clean layout**를 기본값으로 삼되 그대로 복제하지 않는다
- 기준 해석: 2026-04-04경 기준으로 관찰한 "정돈된 정보 구조, 절제된 장식, 또렷한 액션"을 reference intent로 본다
- TeamMeet의 차별점: 스포츠 에너지는 컬러 과잉이 아니라 copy, 정보 리듬, 이미지, CTA 확신으로 표현한다

### 2.1 "토스처럼"의 구체적 의미

토스에서 배울 것은 **시인성(readability)**이다. 모든 페이지에 아래 특성이 적용되어야 한다.

**타이포그래피 위계**
- 페이지 제목: `text-2xl font-bold tracking-tight` — 크고 또렷하게
- 섹션 제목: `text-base font-bold tracking-tight` — 본문보다 확실히 구분
- 카드 제목: `text-sm font-semibold` — 클릭 가능한 핵심 정보
- 보조 텍스트: `text-xs text-gray-500` — 시간, 장소, 부가 정보
- 각 단계 사이에 최소 2px 이상의 크기 차이와 weight 차이가 있어야 한다

**여백 리듬**
- 페이지 내 대섹션 간격: `mt-10` (40px) — 호흡을 준다
- 섹션 내 소항목 간격: `mt-4` ~ `mt-6` (16-24px)
- 카드 내부 패딩: `p-4` (16px) 통일 — 카드마다 다르면 안 된다
- 리스트 항목 간격: `gap-3` (12px) — 빽빽하지도 헐렁하지도 않게
- 좌우 페이지 여백: `px-5` (20px) — 모바일 기준

**카드 스타일**
- 카드는 **배경색 차이**로 구분한다: 흰 카드 on gray-50 배경, 또는 gray-50 카드 on 흰 배경
- 보더는 `border-gray-100` 한 줄이면 충분하다. 보이지 않아도 된다
- 그림자는 거의 없거나 hairline (`shadow-[0_1px_2px_rgba(0,0,0,0.04)]`)
- hover는 `hover:bg-gray-50` 배경 변화로 처리. 떠오르는 효과(lift) 금지
- 카드 안의 정보는 **primary(제목) → secondary(종목/장소) → tertiary(인원/가격)** 3단계 위계

**섹션 분리**
- 배경색 전환으로 구분한다: `bg-white` → `bg-gray-50` → `bg-white`
- 반투명 배경(`bg-gray-50/50`) 금지. 확실한 색 차이를 준다
- 섹션 제목 + "더보기" 링크가 한 줄에 나란히 위치

**CTA와 버튼**
- 주요 CTA: `bg-blue-500 text-white` 단색. 그림자 없음
- 보조 링크: `text-blue-500 font-medium` 텍스트만
- 버튼 크기: `min-h-[44px]` 터치 타겟 준수
- 페이지 내 CTA는 1-2개만. 경쟁하는 CTA가 3개 이상이면 위계가 무너진다

### 2.2 글래스모피즘 범위 (Apple-style)

글래스 효과는 **아래 3곳에서만** 사용한다:
1. **하단 내비게이션 바** (`bottom-nav.tsx`) — `glass-mobile-nav`
2. **상단 고정 헤더** (`mobile-glass-header.tsx`) — `glass-mobile-header`
3. **모달 백드롭** (`modal.tsx`) — `backdrop-blur-sm` on overlay background

**그 외 모든 곳에서 glass/blur/frosted 효과 금지.** 콘텐츠 카드, 뱃지, 폼, 리스트 아이템 등은 반드시 solid surface를 사용한다.

## 3. Core Principles

1. **Layout before decoration**
   정보 구조와 행동 우선순위가 먼저 읽혀야 한다. 효과보다 레이아웃이 문제를 해결해야 한다.
2. **Solid first**
   본문 surface는 기본적으로 solid다. glass, glow, deep shadow는 예외다.
3. **Trust through restraint**
   스포츠 플랫폼의 신뢰감은 과한 스타일이 아니라 정돈된 spacing, 명확한 hierarchy, 안정된 contrast에서 나온다.
4. **One accent, quiet neutrals**
   액센트는 blue 계열에 집중하고, 나머지는 neutral hierarchy로 정리한다.
5. **Utility screens stay utilitarian**
   `profile`, `settings`, `notifications`, `chat`, `reviews` 같은 utility root는 hero-style intro보다 compact tool layout이 우선이다.

## 4. Non-Negotiable Rules

### 4.1 Shadow

- 과도한 shadow를 금지한다.
- shadow는 depth 보조 수단이지 스타일의 주인공이 아니다.
- 기본 카드에는 `none` 또는 hairline-level shadow만 허용한다.
- 큰 blur radius, 다중 누적 shadow, glow성 shadow, hover 시 과한 lift는 금지한다.
- 떠 있는 chrome, overlay, dropdown, bottom nav처럼 실제로 떠 있어야 하는 surface에서만 stronger shadow를 허용한다.

### 4.2 Border

- 과도한 border를 금지한다.
- 기본 원칙은 `subtle full border` 또는 `borderless + subtle separation` 중 하나다.
- 한 화면 안에서 여러 겹의 border container를 중첩하지 않는다.
- 한쪽 색상 보더, 굵은 outline, 카드마다 강한 stroke, border-heavy grid는 금지한다.
- 강조는 배경 톤, spacing, title hierarchy, badge, icon으로 해결하고 border에 과하게 의존하지 않는다.

### 4.3 Layout

- 기본 레이아웃은 Toss-like하게 **text-first, section-clear, action-obvious** 해야 한다.
- 페이지는 "멋있어 보이는 카드 묶음"보다 "무엇을 할 수 있는지 바로 이해되는 도구 화면"처럼 보여야 한다.
- utility page, list page, form page는 hero block이나 showcase top zone을 기본값으로 두지 않는다.
- 한 여정 안에서는 `list -> detail -> create/edit -> history`가 같은 control language를 공유해야 한다.

### 4.4 Glass

- glassmorphism은 **navbar, sticky header, bottom nav, overlay, button, panel-like chrome** 에서만 사용한다.
- dense content card, feed row, form body, transaction card, table-like surface의 기본 재질로 glass를 사용하지 않는다.
- 한 화면에서 glass가 전체 테마를 지배하면 실패로 본다.
- 원칙은 `glass as chrome, solid as content`다.

## 5. Surface Matrix

| Surface | Default Material | Allowed Emphasis | Forbidden Direction |
|---|---|---|---|
| Landing hero / public marketing | solid + clean section contrast | image, copy hierarchy, blue accent | glossy glass showcase, stacked heavy shadows |
| Main list cards | solid card | subtle full border or very light shadow | glass cards, thick borders, deep hover lift |
| Detail summary panels | solid surface | quiet accent strip, badge, media | border-heavy framing, nested outlined boxes |
| Forms | solid field + clear labels | focus ring, helper text, section title | frosted form body, decorative panels everywhere |
| Mobile sticky chrome | restrained glass allowed | blur, subtle border, soft floating depth | loud blur, opaque frosted slabs |
| Buttons / CTA trays | solid by default, selective glass allowed | blue accent, compact elevation | glass as universal default for all actions |
| Utility pages | compact solid rhythm | subtle segmentation, top header chrome | intro hero cards, oversized decorative top zones |

## 6. Tokens And Visual Grammar

- Accent: `blue-500` / `blue-600` 중심으로 유지한다.
- Typography: token-first. `globals.css`의 type scale을 우선 사용하고 arbitrary px 남용을 피한다.
- Radius: content card보다 chrome이 더 둥글어 보이지 않도록 통제한다.
- Spacing: section 간 rhythm과 CTA proximity가 카드 장식보다 우선이다.
- Motion: `transition-all` 대신 목적이 분명한 property만 전환한다.

## 7. Component Guidance

- `BottomNav`, sticky header, floating nav, overlay header는 glass 허용 surface다.
- `MobileGlassHeader`는 utility/detail page의 chrome abstraction으로 유지하되 body를 glass화하지 않는다.
- `Card` 계열은 solid-first가 기본이다.
- `Button`은 solid/default variant가 기준이고, glass-like variant는 제한된 chrome context에서만 사용한다.
- status/trust 표현은 border보다 badge, icon, copy, background tone으로 구분한다.

## 8. Review Checklist

- shadow가 없어도 hierarchy가 유지되는가
- border를 절반 이상 줄여도 정보 구조가 무너지지 않는가
- 첫 3초에 레이아웃과 CTA가 장식보다 먼저 읽히는가
- glass가 chrome에만 머물고 content로 번지지 않는가
- utility page가 showcase 화면처럼 보이지 않는가
- Toss-like clean layout intent는 느껴지지만 TeamMeet 고유 맥락은 유지되는가

## 9. Page Layout Recipes

각 페이지 유형은 아래 구조를 따른다. 순서를 바꾸거나 단계를 빼지 않는다.

**리스트 페이지** (matches, teams, lessons, marketplace, mercenary, venues)
1. `MobilePageTopZone` — 페이지 제목 + 주요 CTA ("매치 만들기" 등)
2. 필터바 — 검색 입력 + 필터 토글 (우측). 필터바는 스크롤 시 사라져도 된다
3. 스포츠/퀵 필터 — 가로 스크롤 칩 (`flex gap-2 overflow-x-auto`). 활성 칩은 `bg-blue-500 text-white`
4. 활성 필터 요약 — 파란 배지로 현재 필터 표시 (활성일 때만 노출)
5. 결과 카운트 — `text-sm text-gray-500` 한 줄 (예: "12개 매치")
6. 카드 그리드 — `flex flex-col gap-3` (모바일) / `grid grid-cols-2` (데스크톱)
7. 하단 스페이서 — `h-24` (바텀 내비 겹침 방지)

**디테일 페이지** (matches/[id], teams/[id], lessons/[id] 등)
1. `MobileGlassHeader` — 뒤로 + 제목 + 공유
2. 히어로 미디어 — 16:9 이미지 또는 갤러리
3. 핵심 정보 — 제목, 종목 배지, 상태, 메타 정보
4. 행동 영역 — CTA 버튼 (참가, 신청, 구매 등)
5. 상세 섹션 — 설명, 참가자, 리뷰, 관련 항목
6. 데스크톱: `grid grid-cols-[1fr_380px]` 2단 레이아웃. 우측은 `sticky top-1rem`

**폼 페이지** (matches/new, teams/new 등)
1. `MobileGlassHeader` — 뒤로 + 제목
2. 단계 표시 — step indicator (multi-step인 경우)
3. 입력 필드 — 섹션별 `space-y-4`, 섹션 간 `mt-8`
4. 제출 버튼 — 폼 하단에 배치. 플로팅 금지
5. 입력 필드: `min-h-[44px]`, 레이블은 필드 위에 (`<label htmlFor>`)

**유틸리티 페이지** (profile, settings, notifications, badges)
- hero 블록 금지. compact tool layout이 기본이다
- 섹션 구분: 배경색 전환 또는 `border-t border-gray-100`
- 메뉴형 리스트: 아이콘 + 제목 + 화살표, 행 높이 `min-h-[52px]`

## 10. Card System

카드는 4가지 변형만 존재한다. 새로운 카드 패턴을 만들지 않고 아래 중 선택한다.

**배너 카드** — match card, lesson card
- 16:9 이미지 + 그래디언트 오버레이 + 3줄 텍스트
- 이미지 위: 종목 도트(좌상단), 시간 배지(우상단), 가격(좌하단), 참가 상태(우하단)
- 텍스트: 제목(`text-sm font-semibold`) → 메타(`text-xs text-gray-500`) → 배지(선택)

**가로 카드** — team card
- 정사각형 썸네일(96px) 좌측 + 텍스트 우측, 전체 높이 `h-24`
- 제목 + 종목 배지 + 멤버수 + 지역

**썸네일 카드** — marketplace listing card
- 100x100 썸네일 좌측 + 텍스트 우측
- 제목(`text-md`) → 메타 → 가격(`text-lg font-bold`) → 타입/통계

**메트릭 카드** — admin dashboard, profile 통계
- 아이콘(우측) + 숫자(크게) + 레이블(작게)
- 상세: 섹션 12 참조

모든 카드 공통: `rounded-2xl`, `border border-gray-100`, hairline shadow, `active:scale-[0.98]`

## 11. Information Hierarchy (TeamMeet 핵심)

TeamMeet은 금융 앱이 아니다. 사용자가 첫 3초에 읽어야 할 것은 숫자가 아니라 **언제, 어디서, 자리 있는지**다.

**카드에서의 정보 우선순위:**
1. **시간** — "오늘 19:00", "내일 15:00" → 시간 배지(`text-2xs bg-gray-900/70 text-white`)로 눈에 띄게
2. **장소** — "마포구 성산풋살장" → 메타 행에서 아이콘과 함께(`text-xs text-gray-500`)
3. **참가 현황** — "3/10명" → 오버레이 배지 또는 프로그레스 바. 숫자를 크게 쓰지 않고 시각적 밀도로 전달
4. **가격** — "무료" or "15,000원" → 카드 내 `text-sm font-bold`. 금액을 hero로 다루지 않는다

**큰 숫자(`text-3xl`)가 허용되는 곳:**
- 프로필 통계 카드 (매너 점수, 총 매치 수, 종목 수) — `grid grid-cols-3 text-center`
- Admin 대시보드 KPI 카드 — 메트릭 카드 패턴
- 그 외 모든 곳에서 `text-3xl` 숫자는 과잉이다

**숫자 표기 규칙:**
- 단위: 숫자와 붙여서 표시 (예: "4.2점", "48회", "12명")
- 3자리 이상: 콤마 구분 (예: "1,234")
- 금액: `formatCurrency()` 사용 (0원 → "무료")
- 날짜: `formatDate()` 계열 사용. 카드에서는 상대 시간("오늘", "내일", "이번 주")이 절대 시간보다 우선

## 12. Status & Sport Color

**종목 컬러 사용 규칙:**
- 종목 식별은 **도트(`h-2 w-2 rounded-full`) + 배지 텍스트** 조합으로만 표현한다
- 카드 배경을 종목 컬러로 칠하지 않는다. tint는 선택적으로 매우 연하게만 허용 (`/40` opacity)
- 종목 배지: `rounded-full px-2 py-0.5 text-2xs font-medium` + `sportCardAccent[type].badge`
- 배지 색상 맵: `lib/constants.ts`의 `sportCardAccent`가 유일한 source of truth

**상태 표시 규칙:**
- 모집중/마감/완료/취소 같은 상태는 **배지**로 표현한다
- 배지 패턴: `rounded-full px-2 py-0.5 text-2xs font-medium`
- 의미 있는 상태에만 semantic 컬러 사용:
  - 성공/완료: `bg-blue-50 text-blue-600`
  - 경고/거의 마감: `bg-amber-50 text-amber-600`
  - 실패/취소: `bg-red-50 text-red-500`
  - 중립/대기: `bg-gray-100 text-gray-600`
- 컬러만으로 상태를 전달하지 않는다. 반드시 텍스트를 병행한다

## 13. State Patterns

**빈 상태 (EmptyState):**
- 반드시 `components/ui/empty-state.tsx` 사용. 인라인 빈 상태 금지
- 필수 요소: 아이콘 + 제목 + 다음 행동 CTA
- 아이콘: `bg-blue-50 rounded-full` 안에 Lucide 아이콘 (`text-blue-400`)
- CTA는 사용자를 다음 논리적 단계로 안내해야 한다 (예: "매치 찾기", "팀 만들기")
- 크기: `md`(기본, 독립 영역), `sm`(카드 내부, 부분 영역)

**에러 상태 (ErrorState):**
- 반드시 `components/ui/error-state.tsx` 사용
- 재시도 버튼 필수 (`onRetry`)
- 아이콘: `bg-red-50 rounded-full` + `AlertCircle`

**로딩 상태:**
- 스켈레톤: `animate-pulse bg-gray-100 rounded-xl` — 실제 콘텐츠 레이아웃과 동일한 형태
- 스피너: 페이지 전환이나 액션 대기에서만 사용. 콘텐츠 영역에서 스피너 단독 사용 금지
- 로딩 중에도 레이아웃(헤더, 바텀 내비)은 유지되어야 한다

## 14. CTA Placement

**리스트 페이지:** CTA는 `MobilePageTopZone`에만 배치. 페이지 본문에 추가 CTA 금지
**디테일 페이지:** 모바일은 콘텐츠 아래 자연 배치, 데스크톱은 우측 `sticky` 사이드바
**폼 페이지:** 제출 버튼은 폼 마지막에 배치. 플로팅/고정 CTA 금지
**유틸리티 페이지:** CTA는 인라인 텍스트 링크 또는 메뉴 행으로만 표현

**CTA 위계 (한 화면에서):**
1. 주요 CTA: `bg-blue-500 text-white` — 화면당 **최대 1개**
2. 보조 CTA: `border border-gray-200 bg-white text-gray-700` — 최대 1개
3. 텍스트 링크: `text-blue-500 font-medium` — 필요한 만큼
4. 3개 이상의 동급 CTA가 경쟁하면 위계가 무너진다. 반드시 1-2개로 줄인다

**바텀 고정 CTA 금지 원칙:**
- 바텀 내비게이션과 겹치는 고정 CTA를 만들지 않는다
- 결제/확인처럼 반드시 필요한 경우만 예외로 허용하되, `safe-area-inset-bottom` 준수

## 15. Information Density

**카드 내 정보량:**
- 배너 카드: 제목 1줄 + 메타 2줄 + 배지 최대 2개
- 가로 카드: 제목 1줄 + 설명 1줄(line-clamp-1) + 메타 1줄
- 제목이 넘치면 `truncate`. 2줄 이상 허용하지 않는다

**말줄임 규칙:**
- 제목: `truncate` (1줄)
- 설명: `line-clamp-1` 또는 `line-clamp-2`
- 3줄 이상의 텍스트가 카드 안에 있으면 정보 과밀이다

**리스트 밀도:**
- 카드 간격: `gap-3` (12px)
- 한 화면(뷰포트 높이)에 3-5개 카드가 보여야 한다
- 카드 하나가 전체 화면을 차지하면 정보 효율이 떨어진다

**섹션 간 구분:**
- 1순위: 여백 (`mt-10`)
- 2순위: 배경색 전환 (`bg-white` ↔ `bg-gray-50`)
- 3순위: 구분선 (`border-t border-gray-100`)
- 세 가지를 동시에 사용하지 않는다. 하나만 선택한다

## 16. Interaction Feedback

**탭/클릭:**
- 카드: `active:scale-[0.98]` + `transition duration-150`
- 버튼: `hover:bg-{shade}` (데스크톱), `active:scale-[0.97]` (모바일)
- 텍스트 링크: `hover:underline` 금지. `hover:text-blue-600`만 허용

**포커스:**
- 키보드 포커스: `focus-visible:ring-2 ring-blue-500 ring-offset-2`
- 마우스 클릭 시 포커스 링 숨김 (`:focus-visible`만 사용, `:focus` 단독 사용 금지)

**전환:**
- `transition-all` 금지. 목적이 분명한 속성만: `transition-colors`, `transition-transform`, `transition-opacity`
- 기본 duration: `duration-150`
- 모달/시트 진입: `animate-slide-up` (모바일), `animate-scale-in` (데스크톱)

**스크롤:**
- 가로 스크롤 영역: 스크롤바 숨김 (`scrollbar-hide`)
- 스냅: 선택적으로 `scroll-snap-x` 사용 가능 (칩 필터 등)

## 17. Document Roles

- `docs/DESIGN_DOCUMENT_MAP.md`: 읽는 순서와 active vs historical navigation hub
- `DESIGN.md`: 규칙 정의
- `.impeccable.md`: 브랜드/미감 요약
- `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`: 현재 디자인 개선 실행 계약
- `docs/DESIGN_CONSISTENCY_REPORT.md`: audit snapshot
- `docs/PROJECT_OVERVIEW.md`: 제품 소개용 요약
- `.github/tasks/45-design-system-consolidation.md`: design system rollout history
- 기타 `.github/tasks/*`, `docs/plans/*`: historical reference only
