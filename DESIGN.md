# MatchUp Design System

이 문서는 MatchUp 프론트엔드의 **canonical design source of truth**다.
기존 디자인 관련 문서는 이 문서를 보완하거나 실행 결과를 기록할 수는 있지만, 시각 규칙을 새로 정의해서는 안 된다.

## 0. Read This First

- 디자인 규칙을 읽거나 바꿔야 한다면 항상 `DESIGN.md`부터 본다.
- 현재 코드베이스 디자인 개선 작업을 실행하려면 `DESIGN.md` 다음에 `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`를 본다.
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
- MatchUp의 차별점: 스포츠 에너지는 컬러 과잉이 아니라 copy, 정보 리듬, 이미지, CTA 확신으로 표현한다

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
- Toss-like clean layout intent는 느껴지지만 MatchUp 고유 맥락은 유지되는가

## 9. Document Roles

- `docs/DESIGN_DOCUMENT_MAP.md`: 읽는 순서와 active vs historical navigation hub
- `DESIGN.md`: 규칙 정의
- `.impeccable.md`: 브랜드/미감 요약
- `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`: 현재 디자인 개선 실행 계약
- `docs/DESIGN_CONSISTENCY_REPORT.md`: audit snapshot
- `docs/PROJECT_OVERVIEW.md`: 제품 소개용 요약
- `.github/tasks/45-design-system-consolidation.md`: design system rollout history
- 기타 `.github/tasks/*`, `docs/plans/*`: historical reference only
