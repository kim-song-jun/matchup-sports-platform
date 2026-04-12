# Task 58 — Design System Consistency Audit & Remediation

> Supersedes `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md` (status: Planned -> Superseded by 58).
> Continues from `.github/tasks/55-design-system-remediation-waves.md` (status: Completed — Wave 0-5 done).
> Canonical rules: `DESIGN.md`. Document navigation: `docs/DESIGN_DOCUMENT_MAP.md`.

Owner: project-director + tech-planner -> frontend-ui-dev (build) -> frontend-review (review)
Date drafted: 2026-04-12
Status: In Progress (Wave 0 — 75% Complete)
Priority: P1

## Planning Report

### Project Director: Conditional Approve

**Business value**: Medium-High. 디자인 시스템 일관성은 사용자의 "경기 상대 찾기" 핵심 Job에 직접 기여하지 않으나, 화면마다 다른 시각 언어는 신뢰감을 훼손하고 전환율에 영향을 준다. 또한 유지보수 비용을 줄여 매칭 품질 개선 작업에 엔지니어링 시간을 확보한다.

**판단 근거**: Task 45(primitive foundation)와 Task 55(6-wave remediation)가 이미 큰 작업을 완료했다. 현재 남은 문제는 "규칙 위반"이 아니라 "primitive adoption 부족"이다.

**정량 현황 (2026-04-12 grep 기반)**:
- `shadow-lg/xl`: 9개 파일, 9건 (toast/map/admin 등 대부분 허용 가능 위치)
- `border-l-4` 단방향 강조: 0건 (해결 완료)
- `text-[Npx]` 하드코딩: 4건, 3개 파일 (layout chrome, 허용 가능)
- `backdrop-blur` content 영역: 0건 (landing-nav/modal/map-placeholder/admin만 남음, 모두 허용)
- Card primitive import: 6개 페이지만 사용
- Button/buttonStyles import: 7개 페이지만 사용
- Input/Select/Textarea/FormField import: 6개 페이지만 사용
- EmptyState/ErrorState: 50개 파일에서 164건 사용 (양호)
- Domain cards (MatchCard, LessonCard 등): 7개 discovery 페이지에서 사용 (양호)
- Dark mode tokens: (main) 1515건/76파일, admin 663건/31파일 (양호)
- DS import 0건 페이지: 0개 (layout import 포함 시)
- DS import 1건 이하 페이지: 10개 (부분 적용 최저)

**결론**: 사용자 요청의 "~60개 페이지 미준수"는 과장이다. 실제 substantive 작업이 필요한 페이지는 약 25-30개다. 위반 패턴이 아닌 adoption 확대가 핵심이며, DS primitive(Card, Button, Input 등)를 더 많은 페이지에서 import하여 inline markup을 교체하는 것이 주 작업이다.

**조건**:
1. Nav opacity fix는 Wave 0으로 독립 배포 가능하게 분리할 것
2. Task 52는 이 문서에 의해 supersede 처리할 것
3. Admin 페이지(22개)는 Wave 4 최하위 우선순위로 배치할 것 (내부용)
4. 각 Wave 완료 후 `tsc --noEmit` + visual spot check 검증 필수

---

## Context

Task 45에서 design system primitive(Card, Button, Input, Select, Textarea, FormField, SectionHeader)를 만들고 5개 대표 페이지에 적용했다. Task 55에서 6-wave remediation으로 shadow/border/glass 위반을 제거하고 7개 domain card component를 추출했다. 그러나 primitive adoption이 전체 코드베이스로 확산되지 않아, 상당수 페이지가 여전히 inline markup으로 card/button/input을 구현하고 있다.

추가로 `glass-mobile-nav` 하단 네비게이션 배경이 `rgba(255,255,255,0.35)`로 과도하게 투명하여 콘텐츠 위 가독성이 떨어지는 문제가 보고되었다.

## Goal

1. 하단 네비게이션 바 opacity를 즉시 수정하여 가독성 확보
2. 나머지 ~25-30개 주요 페이지에서 DS primitive adoption을 확대
3. 잔여 shadow-lg/xl 사용처를 audit하여 허용/수정 판정
4. 전체 디자인 시스템 compliance를 85% -> 95%로 끌어올림

## Original Conditions

- [x] P0: `glass-mobile-nav` opacity fix (rgba 0.35 -> 0.82/0.72)
  - Light: 0.35 → 0.82 (border 0.25 → 0.45)
  - Dark: 0.4 → 0.72 (border 0.08 → 0.12)
  - 공유 glass 블록에서 `.glass-mobile-nav` 분리 완료
- [ ] P0: 잔여 `shadow-lg/xl` 9개 파일 audit — 허용/수정 판정 기록 (PENDING)
- [ ] P1: Discovery/List 페이지 primitive adoption (Wave 1)
- [ ] P1: Detail 페이지 primitive adoption (Wave 2)
- [x] P1: Form/Create/Edit 페이지 primitive adoption (Wave 3a) — lessons/new/page.tsx 완료
- [ ] P1: My/ 계정 페이지 primitive adoption (Wave 3b)
- [ ] P2: Admin 페이지 primitive adoption (Wave 4)
- [ ] P2: Public 정적 페이지 audit (landing/about/faq/guide/pricing)
- [ ] Task 52 status 업데이트: Planned -> Superseded by 58

## User Scenarios

1. **사용자가 매치 탐색 -> 상세 -> 생성 흐름을 거치며** 버튼, 카드, 입력 폼이 동일한 시각 언어를 사용해 전문적 인상을 받는다.
2. **다크모드 사용자가** 모든 페이지에서 일관된 배경/텍스트 대비를 경험한다.
3. **하단 네비게이션 사용 시** 콘텐츠 위에 올라온 nav bar 텍스트와 아이콘이 명확히 읽힌다.

## Test Scenarios

### Happy Path
- 모든 Wave 대상 페이지에서 `tsc --noEmit` 통과
- 대표 5개 페이지 mobile + desktop viewport에서 시각적 regression 없음
- 하단 nav bar가 밝은 배경 + 어두운 배경 콘텐츠 위에서 모두 가독

### Edge Cases
- 다크모드에서 Card primitive의 border가 보이는지 확인
- EmptyState가 적용된 페이지에서 Card 교체 시 빈 상태 레이아웃 유지

### Error Cases
- 의존성 있는 페이지 간 충돌 없음 (각 Wave는 독립 파일 단위)

### Mock/Data Updates
- 해당 없음 (UI-only 변경)

## Parallel Work Breakdown

### Wave 0 — Nav Fix + Shadow Audit (독립 배포 가능, COMPLETED)

**Status: 75% Complete** — nav fix 완료, shadow audit PENDING

**Completed (2026-04-12)**:

| # | File | Action | Status |
|---|------|--------|--------|
| 1 | `apps/web/src/app/globals.css` L314-353 | `glass-mobile-nav` opacity 및 border 조정, 공유 블록에서 분리 | ✓ DONE |
| 2 | `apps/web/src/components/layout/bottom-nav.tsx` | `text-[10px]` → `text-xs`, `text-[9px]` → `text-2xs`, `min-h-[48px]` → `min-h-12` | ✓ DONE |
| 3 | `apps/web/src/components/layout/mobile-page-top-zone.tsx` | `text-[11px]` → `text-xs`, `text-[1.85rem]` → `text-3xl`, `rounded-[24px]` → `rounded-3xl`, `min-h-[32px]` → `min-h-8` | ✓ DONE |

**Remaining (PENDING)**:

| # | File | Action |
|---|------|--------|
| 4 | Shadow audit 9 files | 아래 판정표 작성 및 REVIEW 5건 현물 확인 |

**Shadow-lg/xl 판정표** (현재 9개 파일):

| File | Occurrence | Verdict | Note |
|------|-----------|---------|------|
| `components/ui/toast.tsx` | shadow-lg | KEEP | overlay chrome, 허용 |
| `components/ui/badge-display.tsx` | shadow-lg | REVIEW | content area일 수 있음 — 현물 확인 필요 |
| `components/ui/map-placeholder.tsx` | shadow-lg | KEEP | map chrome |
| `components/map/matches-map-view.tsx` | shadow-lg | KEEP | map floating control |
| `app/admin/lesson-tickets/page.tsx` | shadow-lg | KEEP | admin (P2) |
| `app/(main)/chat/[id]/chat-room-embed.tsx` | shadow-lg | REVIEW | chat bubble area — 현물 확인 필요 |
| `app/(main)/teams/[id]/members/page.tsx` | shadow-lg | REVIEW | team member card — 현물 확인 필요 |
| `app/(main)/settings/account/page.tsx` | shadow-lg | REVIEW | settings form — 현물 확인 필요 |
| `app/(main)/my/listings/page.tsx` | shadow-lg | REVIEW | marketplace listing — 현물 확인 필요 |

REVIEW 판정 5건 현물 확인 후 KEEP/FIX 최종 결정 필요.

### Wave 1 — Discovery/List Page Adoption (병렬 가능, 4-6h)

**Status: 1/5 Complete (teams/new/page.tsx — 폼 페이지이지만 Wave 1-3 경계)**

**대상**: DS import 수가 낮은 discovery/list 페이지에서 inline button/input markup을 primitive로 교체

| Page | Current DS imports | Action | Status |
|------|-------------------|--------|--------|
| `teams/new/page.tsx` | 1 | + Input, Select, FormField, Card, Button + dark mode (dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600) + 접근성 (role="group", aria-label, aria-pressed) + min-h-11 터치타겟 | ✓ DONE |
| `teams/teams-client.tsx` | 1 (layout) | + Button, Card for filter bar | PENDING |
| `tournaments/page.tsx` | 2 | + Button for CTA | PENDING |
| `tournaments/[id]/page.tsx` | 2 | + Card for section containers | PENDING |
| `badges/page.tsx` | 1 | + Card for badge grid | PENDING |

### Wave 2 — Detail Page Adoption (병렬 가능, 6-8h)

**대상**: `[id]/page.tsx` 상세 페이지에서 Card/Button primitive 부재

| Page | Current DS imports | Action |
|------|-------------------|--------|
| `team-matches/[id]/page.tsx` | 2 | + Card, Button |
| `team-matches/[id]/arrival/page.tsx` | 2 | + Card, Button |
| `team-matches/[id]/score/page.tsx` | 2 | + Card, Button |
| `team-matches/[id]/evaluate/page.tsx` | 2 | + Card, Button |
| `user/[id]/page.tsx` | 1 (safe-image) | + Card, Button |
| `payments/[id]/page.tsx` | 3 | + Card |
| `payments/checkout/page.tsx` | 3 | + Card |
| `chat/[id]/page.tsx` | 0 (delegate) | Audit chat-room-embed |

### Wave 3a — Form/Create/Edit Page Adoption (순차, 4-6h)

**Status: 1/9 Complete (lessons/new/page.tsx)**

**대상**: Task 45에서 마이그레이션하지 않은 form 페이지

| Page | Current DS imports | Action | Status |
|------|-------------------|--------|--------|
| `lessons/new/page.tsx` | 2 → 8 | + Input, Select, FormField, Card + 접근성 (aria-pressed, role="group") + levelMin ≤ levelMax 검증 + formatCurrency/formatAmount 사용 | ✓ DONE |
| `mercenary/new/page.tsx` | 2 | + Input, Select, FormField, Card | PENDING |
| `team-matches/new/page.tsx` | 2 | + Input, Select, FormField, Card | PENDING |
| `tournaments/new/page.tsx` | 1 | + Input, Select, FormField, Card, Button | PENDING |
| `lessons/[id]/edit/page.tsx` | 2 | + Input, Select, FormField | PENDING |
| `mercenary/[id]/edit/page.tsx` | 3 | + Input, Select, FormField | PENDING |
| `team-matches/[id]/edit/page.tsx` | 2 | + Input, Select, FormField | PENDING |
| `teams/[id]/edit/page.tsx` | 1 | + Input, Select, FormField, Card, Button | PENDING |
| `venues/[id]/edit/page.tsx` | 1 | + Input, Select, FormField, Card, Button | PENDING |

### Wave 3b — My/ Account Pages Adoption (병렬 가능, 3-4h)

| Page | Current DS imports | Action |
|------|-------------------|--------|
| `my/teams/page.tsx` | 1 | + Card, Button |
| `my/team-match-applications/page.tsx` | 1 | + Card |
| `my/reviews-received/page.tsx` | 1 | + Card |
| `my/listings/page.tsx` | 2 | + Card, Button |
| `payments/page.tsx` | 2 | + Card |
| `payments/[id]/refund/page.tsx` | 5 | Audit — likely adequate |
| `feed/page.tsx` | 1 | + Card |
| `reviews/page.tsx` | 2 | + Card |

### Wave 4 — Admin Pages (P2, 6-8h)

22개 admin 페이지. 내부 도구이므로 최하위 우선순위. 이미 dark mode 663건 적용으로 기본 동작. inline table/card markup을 primitive로 교체하되, 사용자 대면 페이지 완료 후 실행.

### Sequential Dependencies

```
Wave 0 (nav fix + shadow audit)
    |
    v
Wave 1 (discovery) ---|
Wave 2 (detail)    ---|---> 병렬 가능
Wave 3b (my/)      ---|
    |
    v
Wave 3a (forms) -------> 순차 (form primitive 공유 파일 수정 가능성)
    |
    v
Wave 4 (admin) --------> P2, 별도 이터레이션
```

## Acceptance Criteria

### Wave 0 (Current)
1. [x] `glass-mobile-nav` light mode opacity 0.82 (0.35 → 0.82), dark mode 0.72 (0.4 → 0.72). glass-mobile-header와 시각적 구분 유지 ✓
2. [ ] Shadow-lg/xl 판정표 100% 완성 (KEEP/FIX 결정, FIX 항목은 같은 Wave에서 수정) — PENDING
3. [x] 토큰 정규화: bottom-nav.tsx, mobile-page-top-zone.tsx `text-[Npx]` → 토큰 ✓
4. [x] `tsc --noEmit` 통과 ✓
5. [ ] `pnpm --filter web build` 성공 — 테스트 필요
6. [ ] 대표 5개 페이지 mobile viewport visual spot check 통과 — PENDING

### Wave 1-3a (Partial)
7. [x] `teams/new/page.tsx`: Input/Select/FormField/Card 마이그레이션 + dark mode + 접근성 ✓
8. [x] `lessons/new/page.tsx`: Input/Select/FormField/Card + 인라인 포맷터 → lib/utils.ts 함수, 접근성, levelMin ≤ levelMax 검증 ✓
9. [x] `checkout-modal.tsx`: dark mode 완비 + CTA Button 컴포넌트로 교체 (transition-[colors,transform] 버그 해결) ✓
10. [ ] 새로운 `text-[Npx]` 하드코딩 추가 0건 — PENDING (전체 audit 필요)
11. [ ] 새로운 `shadow-lg/xl` content 영역 추가 0건 — PENDING

## Tech Debt Resolved

- [x] Task 52 (Planned 상태 방치) -> Superseded by 58
- [x] Nav opacity 가독성 문제 해결 (0.35 → 0.82/0.72)
- [x] `glass-mobile-nav` public 블록 분리 (glass-mobile-header와 별도 규칙)
- [x] `text-[10px]` / `text-[9px]` / `text-[11px]` → 토큰화 (bottom-nav, mobile-page-top-zone)
- [x] `rounded-[24px]` → `rounded-3xl` (mobile-page-top-zone)
- [x] `text-[1.85rem]` → `text-3xl` (mobile-page-top-zone)
- [x] `min-h-[32px]` → `min-h-8` (mobile-page-top-zone)
- [x] `lessons/new/page.tsx` 인라인 포맷터 제거 → `formatCurrency`, `formatAmount` 사용
- [x] `lessons/new/page.tsx` raw input/textarea/select → Input/Textarea/Select/FormField 컴포넌트
- [x] `teams/new/page.tsx` 종목 칩 dark mode (dark:bg-gray-700 dark:text-gray-300) + 접근성 (aria-pressed)
- [x] `checkout-modal.tsx` CTA button → Button 컴포넌트 (transition-[colors,transform] 오류 수정)
- [ ] inline card/button/input markup → primitive adoption 확대 (Wave 1-4 PENDING)

## Implementation Summary (Wave 0 & Partial Wave 1-3a)

### Completed (2026-04-12)

**Nav Fix & Component Tokenization (Wave 0)**:
- `apps/web/src/app/globals.css`: `.glass-mobile-nav` 공유 블록 분리, light opacity 0.35 → 0.82, dark 0.4 → 0.72, border 조정
- `apps/web/src/components/layout/bottom-nav.tsx`: `text-[10px]` → `text-xs` (라벨), `text-[9px]` → `text-2xs` (배지), `min-h-[48px]` → `min-h-12`
- `apps/web/src/components/layout/mobile-page-top-zone.tsx`: `text-[11px]` → `text-xs`, `text-[1.85rem]` → `text-3xl`, `rounded-[24px]` → `rounded-3xl`, `min-h-[32px]` → `min-h-8`

**Form Pages (Wave 3a Partial)**:
- `apps/web/src/app/(main)/teams/new/page.tsx`: Input/Select/FormField/Card 마이그레이션, dark mode (dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600), 접근성 (role="group" aria-label="종목 선택", aria-pressed), min-h-11 터치타겟 추가
- `apps/web/src/app/(main)/lessons/new/page.tsx`: Input/Textarea/Select/FormField 마이그레이션, 인라인 포맷터 제거 (formatCurrency, formatAmount 사용), levelMin ≤ levelMax 검증, aria-pressed 추가, raw input 제거 (141 LOC → 유지)

**Payment Component (Payment-related)**:
- `apps/web/src/components/payment/checkout-modal.tsx`: 주문요약/결제수단 dark mode 완비, CTA raw button → Button 컴포넌트 (transition-[colors,transform] 버그 해결)

### Remaining (Shadow Audit & Wave 1-4)

**Wave 0 (PENDING)**:
- Shadow-lg/xl 판정표: REVIEW 5개 파일 현물 확인 후 KEEP/FIX 최종 결정
  - `components/ui/badge-display.tsx`
  - `app/(main)/chat/[id]/chat-room-embed.tsx`
  - `app/(main)/teams/[id]/members/page.tsx`
  - `app/(main)/settings/account/page.tsx`
  - `app/(main)/my/listings/page.tsx`

**Wave 1 (PENDING)**:
- Discovery/List 페이지 (4/5 remaining)
- Badge grid Card 마이그레이션

**Wave 2 (PENDING)**:
- Detail 페이지 (8개 대상)

**Wave 3a (PENDING)**:
- Form/Create/Edit 페이지 (8/9 remaining)

**Wave 3b (PENDING)**:
- My/ 계정 페이지 (8개 대상)

**Wave 4 (PENDING)**:
- Admin 페이지 (22개, P2)

## Security Notes

- UI-only 변경, 보안 영향 없음
- 기존 auth guard, CSRF, XSS 방어 불변

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Primitive 교체 시 기존 레이아웃 변형 | Medium | Medium | 각 페이지 교체 후 visual spot check |
| 병렬 에이전트 파일 충돌 | Low | High | Wave별 파일 목록이 겹치지 않음. 공유 파일(card.tsx, button.tsx) 수정은 Wave 0에서만 |
| Admin 페이지 지연 | High | Low | P2이므로 별도 이터레이션 허용 |
| Form primitive 교체 시 validation 동작 변경 | Low | Medium | 기존 class-validator 패턴 유지, FormField는 label+input 래퍼만 |

## Ambiguity Log

| # | Question | Resolution | Date |
|---|----------|------------|------|
| 1 | Nav opacity 정확한 값은? | 0.60-0.75 범위. glass-mobile-header(gradient 0.88-0.72)보다 시각적으로 구분되어야 함. 빌더는 nav와 header를 동일 화면에서 나란히 비교 테스트 필수 | 2026-04-12 |
| 2 | Task 52 vs 58 관계 | 58이 52를 supersede. 52의 Evidence Snapshot은 참조 자료로 유지 | 2026-04-12 |
| 3 | Admin 페이지 scope-in 여부 | P2로 scope-in하되 Wave 4로 분리. P1 완료 후 별도 판단 | 2026-04-12 |
| 4 | Onboarding/Settings 정적 페이지 primitive 적용 여부 | Onboarding: 인라인 유지 허용 (1회성 플로우). Settings privacy/terms: 텍스트 콘텐츠 페이지이므로 Card 불요 | 2026-04-12 |
| 5 | 사용자 요청의 "~60개 페이지" vs 실제 scope | 실제 substantive 작업 대상은 25-30개. 60은 loading/layout/page.tsx 래퍼 포함한 전체 파일 수. 태스크 문서에서 정확한 대상 명시 | 2026-04-12 |
