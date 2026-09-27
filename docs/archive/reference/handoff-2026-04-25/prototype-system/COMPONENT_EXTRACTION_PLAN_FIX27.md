# Component Extraction Plan Fix27

`fix27`은 prototype의 5개 signature primitive(`NumberDisplay`, `MoneyRow`, `MetricStat`, `FilterChip`, `StatBar`)를 production `apps/web/src/components/ui/`로 추출하기 위한 **PR 단위·props·callers·acceptance** 결정을 한 표에 고정한다.

- Prototype reference: `lib/signatures.jsx`, `lib/screens-extras.jsx`, `lib/screens-system-foundation.jsx`
- Production target: `apps/web/src/components/ui/`
- Existing primitive in scope: `Button`, `Card`, `Input`, `Skeleton`, `EmptyState`, `Toast`, `SectionHeader`
- Existing admin-specific primitive: `apps/web/src/components/admin/kpi-card.tsx` (확장 후 `MetricStat` 통합)

## Order Rationale

순서는 **의존성 + 가치**에 따라 결정한다.

1. **NumberDisplay** — 모든 stat/money/metric의 base. caller가 가장 많고, 다른 primitive(`MoneyRow`/`MetricStat`/`StatBar`)가 의존.
2. **FilterChip** — chip은 11개 page에서 인라인 패턴으로 반복. 토큰 정렬 후 즉시 추출 가능.
3. **MoneyRow** — payments/marketplace/payouts 19+ caller. `NumberDisplay` 위에 얹는 row layout.
4. **MetricStat** — admin dashboard 5개 페이지 + ops summary. 기존 `KpiCard`를 흡수하되 `delta`/`unit`/`href` 확장.
5. **StatBar** — team trust score, 매치 분석 등 sparse하지만 중요. NumberDisplay와 같은 토큰을 사용.

## 1. NumberDisplay — `apps/web/src/components/ui/number-display.tsx`

### Prototype shape

```jsx
<NumberDisplay
  value={1240000}
  unit="원"
  sub="이번 달 정산 예정"
  size="xl"          // 'sm' | 'md' | 'lg' | 'xl' | 'display'
  tone="default"     // 'default' | 'positive' | 'negative' | 'muted'
  format="money"     // 'money' | 'integer' | 'percent' | 'decimal'
  align="left"       // 'left' | 'center' | 'right'
/>
```

### Production props (draft)

```ts
export type NumberDisplaySize = 'sm' | 'md' | 'lg' | 'xl' | 'display';
export type NumberDisplayTone = 'default' | 'positive' | 'negative' | 'muted';
export type NumberDisplayFormat = 'money' | 'integer' | 'percent' | 'decimal';

export interface NumberDisplayProps {
  value: number;
  unit?: string;
  sub?: string;
  size?: NumberDisplaySize;          // default 'md'
  tone?: NumberDisplayTone;          // default 'default'
  format?: NumberDisplayFormat;      // default 'integer'
  align?: 'left' | 'center' | 'right'; // default 'left'
  loading?: boolean;
  ariaLabel?: string;
  className?: string;
}
```

### Size mapping (Tailwind)

| size | text | weight | sub-size |
|---|---|---|---|
| sm | `text-md` (15) | 600 | `text-xs` |
| md | `text-xl` (18) | 700 | `text-sm` |
| lg | `text-3xl` (28) | 700 | `text-md` |
| xl | `text-4xl` (36) | 800 | `text-md` |
| display | `text-5xl` (44) | 800 | `text-lg` |

### Tone mapping

| tone | value color | unit color |
|---|---|---|
| default | `text-gray-900 dark:text-white` | `text-gray-500 dark:text-gray-400` |
| positive | `text-success dark:text-green-400` | -- |
| negative | `text-error dark:text-red-400` | -- |
| muted | `text-gray-600 dark:text-gray-400` | `text-gray-400` |

### Format

- `money` — `formatCurrency(value)` 사용 (lib/utils.ts). `0 → '무료'` 보정.
- `integer` — `value.toLocaleString('ko-KR')`
- `percent` — `(value).toFixed(1) + '%'` (1 decimal)
- `decimal` — `value.toFixed(2)`

`tabular-nums` (Tailwind class `tabular-nums`)는 항상 적용.

### Caller hotspots (19 places)

- `apps/web/src/app/(main)/payments/page.tsx` (2 callers)
- `apps/web/src/app/(main)/payments/[id]/page.tsx`
- `apps/web/src/app/(main)/payments/checkout/page.tsx`
- `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
- `apps/web/src/app/(main)/marketplace/orders/[id]/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx`
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/admin/payouts/page.tsx` (5 callers)
- `apps/web/src/app/admin/lesson-tickets/page.tsx` (3 callers)
- `apps/web/src/app/admin/statistics/page.tsx` (8 callers)
- `apps/web/src/app/admin/ops/page.tsx`
- `apps/web/src/app/admin/settlements/page.tsx`
- `apps/web/src/components/admin/weekly-payout-bars.tsx`
- `apps/web/src/components/admin/payout-batch-builder.tsx`

### Acceptance

- [ ] `NumberDisplay`는 `tabular-nums`를 포함한다.
- [ ] `loading=true`이면 `Skeleton` 사용 (size별 너비 다름).
- [ ] `aria-label` 미지정 시 `${value}${unit}` 자동 합성.
- [ ] 19개 caller의 인라인 `text-3xl font-bold tabular-nums` 패턴이 사라진다.

### PR scope

- 신규 파일: `number-display.tsx` + `number-display.test.tsx`
- 기존 파일 수정: 0개 (이 PR은 컴포넌트만 추가). 첫 caller migration은 후속 PR.

---

## 2. FilterChip — `apps/web/src/components/ui/filter-chip.tsx`

source에는 chip primitive가 **없다**. 11개 page가 같은 인라인 패턴(`px-3 h-9 rounded-full text-sm border`)을 반복한다.

### Production props (draft)

```ts
export type FilterChipSize = 'sm' | 'md';
export type FilterChipVariant = 'neutral' | 'tonal';

export interface FilterChipProps {
  active: boolean;
  children: ReactNode;
  count?: number;               // optional badge
  size?: FilterChipSize;        // default 'md' (h-9 / 36px)
  variant?: FilterChipVariant;  // default 'neutral'
  onClick?: () => void;
  ariaLabel?: string;
  asLink?: { href: string };    // optional render-as-Link
  className?: string;
}
```

### Size

| size | min-height | padding | font |
|---|---|---|---|
| sm | 30 | px-3 | text-sm (13) |
| md | 36 | px-3.5 | text-sm (13) |

(prototype의 `--control-icon: 44`보다 작음. chip은 inline filter 전용이라 44px touch target은 wrapper가 보장.)

### Variant

| variant | inactive | active |
|---|---|---|
| neutral | `bg-gray-100 text-gray-700` | `bg-blue-500 text-white` |
| tonal | `bg-blue-50 text-blue-600` | `bg-blue-500 text-white` |

다크모드:

| variant | inactive (dark) | active (dark) |
|---|---|---|
| neutral | `dark:bg-gray-800 dark:text-gray-300` | `dark:bg-blue-500 dark:text-white` |
| tonal | `dark:bg-blue-500/10 dark:text-blue-400` | `dark:bg-blue-500 dark:text-white` |

### Press feedback

`active:scale-[0.98] transition-transform duration-150`. focus-visible은 globals.css 글로벌 규칙 재사용.

### Count badge

`count > 0`일 때만 노출. `ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 text-white text-xs px-1.5`.

### Caller hotspots (11 places)

- `apps/web/src/app/(main)/marketplace/page.tsx` (typeFilters + sportFilters, 17 chips)
- `apps/web/src/app/(main)/lessons/page.tsx` (typeFilters)
- `apps/web/src/app/(main)/matches/page.tsx` (sport + level + region)
- `apps/web/src/app/(main)/team-matches/page.tsx`
- `apps/web/src/app/(main)/mercenary/page.tsx`
- `apps/web/src/app/(main)/tournaments/page.tsx`
- `apps/web/src/app/(main)/venues/page.tsx`
- `apps/web/src/app/(main)/my/disputes/page.tsx`
- `apps/web/src/app/admin/disputes/page.tsx`
- `apps/web/src/app/admin/payouts/page.tsx`
- `apps/web/src/app/admin/users/page.tsx`

### Acceptance

- [ ] FilterChip은 `role="button"` (button element) + `aria-pressed={active}`를 사용한다.
- [ ] `asLink` prop이 있으면 `<Link>`로 wrapping (active state 유지).
- [ ] `min-h-[44px]`는 chip 자체가 아니라 chip group container에서 보장 (chip은 36px).
- [ ] keyboard: Enter/Space로 onClick 트리거 + focus ring.

### PR scope

- 신규 파일: `filter-chip.tsx` + `filter-chip.test.tsx`
- 기존 인라인 chip을 **첫 caller (`marketplace/page.tsx`)** 만 우선 migration해 디자인 검증 (smoke). 나머지 10 caller는 후속 PR.

---

## 3. MoneyRow — `apps/web/src/components/ui/money-row.tsx`

prototype의 `MoneyRow`는 결제 history/checkout summary/order detail/payout batch에서 가장 자주 등장.

### Production props (draft)

```ts
export type MoneyRowTone = 'default' | 'strong' | 'muted' | 'positive' | 'negative';

export interface MoneyRowProps {
  label: string;
  amount: number;
  unit?: string;                // default '원'
  description?: string;         // small text under label
  strong?: boolean;             // bold + larger amount
  tone?: MoneyRowTone;          // default 'default'
  rightSlot?: ReactNode;        // chip / badge / link
  format?: 'money' | 'integer';
  className?: string;
}
```

### Layout

```
[label · description]               [amount · unit · rightSlot]
```

- left column: `flex flex-col` — label `text-md` weight 600, description `text-xs text-gray-500`
- right column: `flex items-baseline gap-1` — amount `text-md` (default) or `text-xl font-bold` (strong) + unit `text-xs text-gray-500`
- row: `flex items-baseline justify-between min-h-[44px] py-2`
- `tabular-nums` always

### Tones

| tone | label | amount |
|---|---|---|
| default | `text-gray-700` | `text-gray-900` |
| strong | `text-gray-900 font-semibold` | `text-gray-900 font-bold` |
| muted | `text-gray-500` | `text-gray-500` |
| positive | `text-gray-700` | `text-success` |
| negative | `text-gray-700` | `text-error` |

### Caller hotspots (19+)

- `apps/web/src/app/(main)/payments/[id]/page.tsx` — receipt rows
- `apps/web/src/app/(main)/payments/checkout/page.tsx` — order summary
- `apps/web/src/app/(main)/payments/[id]/refund/page.tsx`
- `apps/web/src/app/(main)/marketplace/orders/[id]/page.tsx` — order line + escrow
- `apps/web/src/app/(main)/marketplace/[id]/page.tsx` — listing price
- `apps/web/src/app/(main)/lessons/[id]/page.tsx` — ticket pricing
- `apps/web/src/app/admin/payouts/page.tsx` — batch summary
- `apps/web/src/app/admin/settlements/page.tsx` — settlement rows
- `apps/web/src/app/admin/lesson-tickets/page.tsx` — ticket metrics
- `apps/web/src/components/admin/payout-batch-builder.tsx`

### Acceptance

- [ ] `MoneyRow`는 내부에서 `NumberDisplay`(size='md', format='money')를 사용한다.
- [ ] 다중 row는 wrapper에서 `space-y-1.5 divide-y divide-gray-50` 사용.
- [ ] description 누락 시 left column이 단일 라인.

---

## 4. MetricStat — `apps/web/src/components/ui/metric-stat.tsx`

기존 `apps/web/src/components/admin/kpi-card.tsx` 와 prototype의 `MetricStat`이 거의 같다. **결정**: `MetricStat`을 `apps/web/src/components/ui/`에 신규 추가하고, 기존 `KpiCard`는 그대로 두되 내부에서 `MetricStat`을 사용 (호환성 유지). `KpiCard`는 admin 전용 stable API로 보존, 일반 consumer 페이지는 `MetricStat`을 직접 사용.

### Production props (draft)

```ts
export type MetricStatTone = 'default' | 'positive' | 'negative' | 'warning';

export interface MetricStatProps {
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;               // 양수 = 증가, 음수 = 감소, 0 = 변동 없음
  deltaLabel?: string;          // 'vs 어제', '지난 주' 등
  icon?: ReactNode;
  loading?: boolean;
  tone?: MetricStatTone;
  href?: string;                // Link로 감쌀지
  className?: string;
}
```

### Layout

```
[icon]                        [tone-pill]
[value · unit]
[label]
[delta-arrow · delta% · deltaLabel]
```

### Variant tone

| tone | bg | value color | delta-arrow |
|---|---|---|---|
| default | `bg-white dark:bg-gray-800 border-gray-100` | `text-gray-900 dark:text-white` | gray |
| positive | `bg-success/5 border-success/20` | `text-gray-900` | green-500 ↑ |
| negative | `bg-error/5 border-error/20` | `text-error` | red-500 ↓ |
| warning | `bg-warning/5 border-warning/20` | `text-warning` | orange-500 |

### Delta visual

- `delta > 0`: `↑ +12.4%`
- `delta < 0`: `↓ -2.1%`
- `delta === 0`: `– 변동 없음`
- `delta` 미지정: 라인 자체 비표시

### Caller hotspots (8 places)

- `apps/web/src/app/admin/dashboard/page.tsx` (5 cards)
- `apps/web/src/app/admin/ops/page.tsx` (6 cards via KpiCard)
- `apps/web/src/app/admin/statistics/page.tsx` (8 cards)
- `apps/web/src/app/admin/payouts/page.tsx`
- `apps/web/src/app/admin/payments/page.tsx`
- `apps/web/src/app/(main)/profile/page.tsx` (consumer trust score)
- `apps/web/src/app/(main)/teams/[id]/page.tsx` (team stat block)
- `apps/web/src/components/admin/kpi-card.tsx` — 내부 사용으로 변경

### Acceptance

- [ ] `MetricStat` value는 `NumberDisplay`(size='lg' or 'xl')를 사용한다.
- [ ] `KpiCard`는 외부 API 변경 없이 내부에서 `MetricStat`을 호출한다.
- [ ] 다크모드 + warning tone(`#FF9500`) 콘트라스트 4.5:1 통과.
- [ ] `aria-label`이 자동 합성 (label + value + unit + delta).

### PR scope

이 PR이 가장 크다. KpiCard 내부 마이그레이션이 포함되므로 admin dashboard regression smoke 필수.

---

## 5. StatBar — `apps/web/src/components/ui/stat-bar.tsx`

prototype의 `StatBar`는 6항목 상호평가, 매치 분석 등에서 사용. source에는 `Progress` 같은 primitive가 없고 인라인 `<div className="h-1.5 bg-gray-200"><div className="h-full bg-blue-500" style={{ width: `${pct}%` }}/></div>` 패턴이 4-5곳에 등장.

### Production props (draft)

```ts
export type StatBarTone = 'default' | 'positive' | 'warning' | 'danger';
export type StatBarOrientation = 'horizontal' | 'vertical';

export interface StatBarProps {
  label: string;
  value: number;
  max?: number;                 // default 100
  sub?: string;
  tone?: StatBarTone;           // default 'default' (blue-500)
  orientation?: StatBarOrientation; // default 'horizontal'
  showValue?: boolean;          // default true
  unit?: string;
  ariaLabel?: string;
  className?: string;
}
```

### Visual

```
[label]                         [value/max]
[━━━━━━━━━━━━━━━━━━━━━━━━━━━] (h-2 rounded-full)
[sub]
```

`scaleX(value/max)`을 transform으로 적용 (CLAUDE.md: "transition-all 금지 → transition-transform"). 정확한 너비 계산은 `style={{ width: `${(value / max) * 100}%` }}` 직접 사용.

### Tone mapping

| tone | track | fill |
|---|---|---|
| default | `bg-gray-100 dark:bg-gray-700` | `bg-blue-500` |
| positive | 동상 | `bg-success` |
| warning | 동상 | `bg-warning` |
| danger | 동상 | `bg-error` |

### Caller hotspots (5+)

- `apps/web/src/app/(main)/team-matches/[id]/evaluate/page.tsx` (6 항목 평가)
- `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx` (trust score block)
- `apps/web/src/app/(main)/profile/page.tsx` (manner score)
- `apps/web/src/components/admin/weekly-payout-bars.tsx` (4 weeks bar — 개조 필요)

### Acceptance

- [ ] `role="progressbar"` + `aria-valuemin/max/now`.
- [ ] `prefers-reduced-motion` 시 fill transition 0.01ms.
- [ ] sub 누락 시 라인 자체 비표시.
- [ ] dark mode track contrast 검증.

---

## Existing Primitive Alignment (병행 작업)

| Primitive | Source 상태 | Action |
|---|---|---|
| `Button` | 존재 (`components/ui/button.tsx`) | size: `sm/md/lg/xl` 추가 + `variant`: `outline/ghost/danger` 정렬. `min-h-[44px]` 보장 |
| `Card` | 존재 (`components/ui/card.tsx`) | `interactive` prop + hover border treatment 정렬 |
| `Input` | 존재 | `tm-input`과 height 정렬. `--control-md: 48px` 사용 |
| `Skeleton` | 존재 | shimmer animation은 globals.css에 이미 있음. NumberDisplay/MetricStat loading state에서 재사용 |
| `Toast` | 존재 (`components/ui/toast.tsx`) | 변경 없음 |
| `EmptyState` | 존재 | 변경 없음 |
| `SectionHeader` | 존재 (`components/ui/section-header.tsx`) | prototype `SectionTitle`과 정렬. action slot 추가 |

## Migration Order Summary

| Wave | PR # | Component | Risk |
|---|---|---|---|
| 1 | PR-A | NumberDisplay (+ test) | 낮음. caller 변경 없음 |
| 1 | PR-B | FilterChip (+ test + first caller marketplace) | 중. visual diff 발생 가능 |
| 2 | PR-C | MoneyRow (+ test + first caller payments/[id]) | 중. checkout 검증 필수 |
| 2 | PR-D | StatBar (+ test + first caller team-matches/[id]/evaluate) | 낮음 |
| 3 | PR-E | MetricStat + KpiCard 내부 마이그레이션 | 높음. admin dashboard 회귀 위험 |
| 4+ | PR-F~K | 나머지 caller migration (sweep, 1 PR per page family) | 낮음 |

## Acceptance (전체)

- [ ] 5개 신규 primitive가 `apps/web/src/components/ui/`에 추가된다.
- [ ] 각 primitive는 dedicated unit test (Vitest + Testing Library)와 함께 들어온다.
- [ ] `KpiCard`는 외부 API 변경 없이 내부에서 `MetricStat` 사용으로 정렬된다.
- [ ] 첫 caller migration이 동일 PR 또는 직후 PR에 동반된다 (컴포넌트 dead-code 방지).
- [ ] design QA 보드는 신규 컴포넌트의 prop matrix를 시각화한 보드를 포함한다.
- [ ] 토큰 alignment(`fix27`)가 선행되거나 동일 PR에 묶인다.
