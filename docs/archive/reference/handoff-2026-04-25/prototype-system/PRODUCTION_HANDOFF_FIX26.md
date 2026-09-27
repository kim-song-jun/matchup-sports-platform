# Production Handoff Fix26

## 목적

`fix26`은 `Teameet Design.html`을 실제 개발 착수에 사용할 수 있도록 토큰, 컴포넌트, 페이지 이행 순서, QA gate를 분리한 handoff 기준이다.

- Prototype URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix26`
- Prototype section: `00l · 개발 핸드오프`
- New boards:
  - `dev-token-map`
  - `dev-component-map`
  - `dev-page-waves`
  - `dev-qa-gates`

## 남은 단계

### Wave 0. Route Ownership Manifest

실제 `apps/web/src/app`의 `page.tsx` route는 현재 101개다. 먼저 모든 route를 `01~18` module 또는 `19` common flow에 매핑해야 한다.

결정이 필요한 항목:

- bottom nav: prototype은 `home / matches / lessons / marketplace / my`, source는 `home / matches / teams / marketplace / more`
- route alias: `/users/[id]` vs `/user/[id]`
- settings route: prototype의 `/privacy`, `/terms`를 source의 `/settings/privacy`, `/settings/terms`로 수렴
- admin root: prototype `/admin`, `/admin/reports`, `/admin/tournaments`와 source `/admin/dashboard`, `/admin/disputes`, `/admin/reviews`, `/admin/statistics`, `/admin/ops` 정합
- future scope: `/rentals/*`, `/sports`, `/profile/edit`, `/venues/[id]/schedule`, `/admin/tournaments`, `/admin/reports`

### Wave 1. Token Alignment

Prototype token을 그대로 복사하지 않고 실제 앱 token에 흡수한다.

바로 옮길 수 있는 항목:

- `gray-150: #eaedf0`
- `blue-200: #a8cdff`
- `blue-400: #4792f7`
- `control-icon: 44px`
- `control-md: 48px`
- `control-lg: 56px`
- `control-xl: 64px`
- `radius-control: 12px`
- `ease-out-quart`, `ease-out-quint`, `ease-out-expo`
- `tabular-nums`, `break-keep`

주의할 drift:

- prototype `blue600`은 `#2272eb`, app `blue600`은 `#1b64da`
- prototype은 `grey-*`, app은 `gray-*`
- prototype `text-17`, `text-30` 같은 numeric class는 app named type scale과 충돌
- prototype shadow scale은 app 원칙상 그대로 promotion하지 않는다
- consumer prototype migration은 light-only 기준이며, Admin sidebar만 dark panel 예외다

### Wave 2. Shared Component Extraction

우선 추출 대상:

| Component | Props draft | Target |
|---|---|---|
| `NumberDisplay` | `value`, `unit`, `sub`, `size`, `tone`, `format` | `apps/web/src/components/ui/number-display.tsx` |
| `MoneyRow` | `label`, `amount`, `unit`, `description`, `strong`, `tone`, `rightSlot` | `apps/web/src/components/ui/money-row.tsx` |
| `MetricStat` | `label`, `value`, `unit`, `delta`, `deltaLabel`, `icon`, `loading`, `href` | `apps/web/src/components/ui/metric-stat.tsx` |
| `FilterChip` | `active`, `children`, `count`, `size`, `variant`, `onClick`, `ariaLabel` | `apps/web/src/components/ui/filter-chip.tsx` |
| `StatBar` | `label`, `value`, `max`, `sub`, `tone`, `orientation` | `apps/web/src/components/ui/stat-bar.tsx` |

기존 컴포넌트와 API 정렬이 우선인 항목:

- `SectionTitle` -> `SectionHeader`
- `Skeleton` -> existing `Skeleton`
- `Toast` -> existing `ToastProvider`
- `EmptyState` -> existing `EmptyState`
- `Button`, `Card`, `Input` -> 기존 primitive variant와 size 계약 정렬

Production hotspot:

- `apps/web/src/app/(main)/matches/[id]/page.tsx`
- `apps/web/src/app/admin/lesson-tickets/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/members/page.tsx`
- `apps/web/src/app/admin/statistics/page.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`

### Wave 3. Page Migration

이행 순서:

1. 직접 매칭되는 consumer core: `auth`, `home`, `matches`, `teams`, `lessons`, `marketplace`, `community`, `public`
2. 거래/신뢰/마이: `payments`, `refund`, `disputes`, `profile`, `reviews`, `badges`, `my/*`
3. 운영/부분 매칭: `venues`, `mercenary`, `tournaments`, `admin`
4. 신규 결정 필요: `rentals`, standalone `sports/certification`, `/venues/[id]/schedule`, `/admin/tournaments`, `/admin/reports`, `/my`

## QA Gate

Prototype QA가 보장하는 것:

- `fix26` prototype 렌더링 무결성
- duplicate artboard id 없음
- dark-mode board 없음
- leaf text clipping 의심 없음
- `00l` 개발 핸드오프 보드 존재

Production migration에서 추가로 보장해야 하는 것:

- route별 Next rendering, type check, unit/integration test
- mobile/tablet/desktop viewport screenshots
- keyboard focus와 44px hit target
- empty/loading/error/success/disabled/pending/deadline/sold out/permission denied 상태의 원인, 복구, 다음 상태
- 결제/환불/예약/admin 결정 액션의 실제 API 실패/보류/성공 분리
- direct `<button style=...>`와 새 one-off color/radius/height 금지

## Acceptance Checklist

- [x] route ownership manifest가 101개 source route를 모두 포함한다. (`ROUTE_OWNERSHIP_MANIFEST_FIX27.md`)
- [x] bottom nav canonical contract가 하나로 확정된다. (`BOTTOM_NAV_CONTRACT_FIX27.md` — source 5 tab)
- [x] token alignment 계획이 prototype `lib/tokens.jsx`와 source `globals.css` 두 측의 결정을 모두 명시한다. (`TOKEN_ALIGNMENT_PLAN_FIX27.md`)
- [x] `NumberDisplay`, `MoneyRow`, `MetricStat`, `FilterChip`, `StatBar` 추출 순서·props·caller hotspot이 정해진다. (`COMPONENT_EXTRACTION_PLAN_FIX27.md`)
- [ ] `Button`, `Card`, `Input`이 `00k` size/radius/motion contract와 정렬된다. (production PR)
- [ ] 위 5개 primitive가 production component로 실제 추출된다. (production PR)
- [ ] 각 module의 state/edge/interaction board가 production route scenario로 변환된다.
- [ ] high-risk 거래/운영 flow는 mock success가 아니라 실제 pending/error/unavailable state를 가진다.
- [ ] viewport band QA와 route smoke가 migration PR마다 첨부된다.
