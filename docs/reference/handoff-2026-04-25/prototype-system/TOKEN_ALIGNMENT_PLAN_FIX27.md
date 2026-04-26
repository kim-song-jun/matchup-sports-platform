# Token Alignment Plan Fix27

`fix27`은 prototype의 `lib/tokens.jsx`와 production source의 `apps/web/src/app/globals.css`를 한 표에 정렬해 **개발팀이 그대로 mass-replace 가능한 결정**으로 만든다.

- **Source of truth**: `apps/web/src/app/globals.css` (`@theme {...}`)
- **Prototype reference**: `docs/reference/handoff-2026-04-25/sports-platform/project/lib/tokens.jsx` 1-119행
- **Migration direction**: prototype → source (production 토큰을 변경하지 않는다)
- **Scope**: light-only consumer + Admin sidebar dark exception (`tm-admin-sidebar`)

## Color — Blue Scale

| Token | Prototype value | Source value | Decision |
|---|---|---|---|
| `blue-50` | `#e8f3ff` | `#EFF6FF` | **source 채택**. prototype board는 #EFF6FF로 갱신 |
| `blue-100` | `#d6e7ff` | `#DBEAFE` | **source 채택** |
| `blue-200` | `#a8cdff` | (없음) | **source에 추가**: `--color-blue-200: #A8CDFF;`. badge accent용 |
| `blue-400` | `#4792f7` | (없음) | **source에 추가**: `--color-blue-400: #4792F7;`. ghost variant용 |
| `blue-500` | `#3182f6` | `#3182F6` | **일치**. 변경 없음. primary interaction. |
| `blue-600` | `#2272eb` | `#1B64DA` | **source 채택**. prototype의 `#2272eb`(밝은 톤)를 source의 `#1B64DA`(진한 톤)로 수렴. hover state로만 사용 |
| `blue-700` | `#1b64da` | `#1957C2` | **source 채택**. prototype `--blue700`은 사실상 source `blue-600`. 명확히 구분 |
| `blue-alpha-08` | `rgba(49,130,246,.08)` | (없음) | **source에 추가**: `--color-blue-alpha-08: rgba(49,130,246,.08);` |
| `blue-alpha-10` | `rgba(49,130,246,.10)` | (없음) | **source에 추가** |

### Why source wins on blue-600

prototype의 `#2272eb`은 시각적으로는 좋지만, source의 `#1B64DA`는 production button hover/pressed에 이미 묶여 있고(globals.css 31줄 `--color-primary-dark: #1B64DA`), 모든 ds-button 변종이 이를 기반으로 한다. prototype 측이 흡수하는 비용이 0에 가깝다.

## Color — Gray Scale

| Token | Prototype | Source | Decision |
|---|---|---|---|
| `gray-50` | `--grey50: #f9fafb` | `--color-gray-50: #F9FAFB` | **일치** (대소문자 차이만). prototype `grey50` → `gray-50`로 rename |
| `gray-100` | `--grey100: #f2f4f6` | `--color-gray-100: #F2F4F6` | **일치**. rename |
| `gray-150` | `--grey150: #eaedf0` | (없음) | **source에 추가**: `--color-gray-150: #EAEDF0;`. neutral hover 전용 |
| `gray-200` | `--grey200: #e5e8eb` | `--color-gray-200: #E5E8EB` | **일치**. rename |
| `gray-300` | `--grey300: #d1d6db` | `--color-gray-300: #D1D6DB` | **일치**. rename |
| `gray-400` | `--grey400: #b0b8c1` | `--color-gray-400: #B0B8C1` | **일치**. rename |
| `gray-500` | `--grey500: #8b95a1` | `--color-gray-500: #8B95A1` | **일치**. rename |
| `gray-600` | `--grey600: #6b7684` | `--color-gray-600: #6B7684` | **일치**. rename |
| `gray-700` | `--grey700: #4e5968` | `--color-gray-700: #4E5968` | **일치**. rename |
| `gray-800` | `--grey800: #333d4b` | `--color-gray-800: #333D4B` | **일치**. rename |
| `gray-900` | `--grey900: #191f28` | `--color-gray-900: #191F28` | **일치**. rename |

**핵심 결정**: prototype은 영국식 `grey-*`를 미국식 `gray-*`로 일괄 변경한다. source rename이 아니라 prototype rename. globals.css는 변경 없음.

새로 추가할 token 1개: `--color-gray-150: #EAEDF0` (현재 source에는 없지만 hover state 보강에 필요).

## Color — Semantic

| Purpose | Prototype | Source | Decision |
|---|---|---|---|
| success | `--green500: #03b26c` + `--green50: #e3f8ef` | `--color-success: #34C759` | **source 채택**. prototype board에서 `#03b26c` 사용 케이스를 `#34C759`로 마이그레이션. green-50은 `#E3F8EF` 추가 (source에 없음) |
| warning | `--orange500: #fe9800` + `--orange50: #fff3e0` | `--color-warning: #FF9500` | **source 채택**. orange-50 `#FFF3E0` 추가 |
| error | `--red500: #f04452` + `--red50: #feebec` | `--color-error: #FF3B30` | **source 채택**. red-50 `#FEEBEC` 추가 |
| info accent | `--blue50` (재사용) | `bg-blue-50` (재사용) | 변경 없음 |
| neutral chip | `--grey100` | `bg-gray-100` | 변경 없음 |

### Action

`apps/web/src/app/globals.css`에 추가:

```css
@theme {
  /* Existing tokens... */
  --color-blue-200: #A8CDFF;
  --color-blue-400: #4792F7;
  --color-gray-150: #EAEDF0;
  --color-success-50: #E3F8EF;
  --color-warning-50: #FFF3E0;
  --color-error-50: #FEEBEC;
}
```

(이 변경은 prototype handoff PR이 아닌 별도 production PR에서 수행. 이 문서는 결정만 기록.)

## Type Scale

prototype은 raw px 토큰 9단계, source는 named scale 12단계 (minor third 1.2, base 14px). 매핑:

| Prototype | px | Source | px | Decision |
|---|---|---|---|---|
| `--fs-display` | 36 | `text-4xl` | 36 | **일치** |
| `--fs-title` | 30 | (없음) | -- | **source에 추가? 또는 4xl로 흡수**. |
| `--fs-heading` | 24 | (없음) | -- | **3xl(28)로 round-up, 또는 source에 `text-2.5xl: 24px` 추가 결정 필요** |
| `--fs-subhead` | 20 | (없음) | -- | **2xl(22)로 round-up** 또는 추가 |
| `--fs-body-lg` | 17 | `text-xl` | 18 | **xl(18) 채택**. 17px는 deprecate |
| `--fs-body` | 15 | `text-md` | 15 | **일치** |
| `--fs-label` | 13 | `text-sm` | 13 | **일치** |
| `--fs-caption` | 12 | (없음) | -- | **2xs(10) 또는 신규 추가**. 12px 유지 권장 |
| `--fs-micro` | 11 | `text-xs` | 11 | **일치** |
| (없음) | 14 | `text-base` | 14 | **base 14는 source의 root**. prototype에도 표기 필요 |
| (없음) | 16 | `text-lg` | 16 | **prototype에 추가**. card title용 |
| (없음) | 44 | `text-5xl` | 44 | landing display |
| (없음) | 56 | `text-6xl` | 56 | landing jumbo |

### Decision

**source의 12-step scale을 채택하되, prototype의 17/30/24/20을 어떻게 흡수할지 결정**:

- 17 → `xl(18)` (대부분의 body-lg는 xl로 흡수)
- 24 → 신규 `text-2.5xl: 1.5rem` 토큰 추가 결정 필요. **임시 결정**: 24px는 page title을 위한 별도 단계로 추가하지 않고 `text-2xl: 22px`로 round-down. 디자인 직접 검증 필요. (gate: 22 vs 24 가독성 비교)
- 20 → `text-2xl: 22px`로 round-up
- 30 → `text-4xl: 36px`로 round-up. 30px display는 deprecate (`title` 단계 흡수)

prototype `tm-text-*` class는 그대로 유지하되, mapping:

```js
.tm-text-display  → text-4xl (36)
.tm-text-title    → text-4xl (36, was 30)
.tm-text-heading  → text-2xl (22, was 24)  // visual review 필요
.tm-text-subhead  → text-2xl (22, was 20)
.tm-text-body-lg  → text-xl (18, was 17)
.tm-text-body     → text-md (15)
.tm-text-label    → text-sm (13)
.tm-text-caption  → text-xs (11, was 12)   // 또는 신규 .text-2xs 채택
.tm-text-micro    → text-xs (11)
```

## Spacing Scale

| Prototype | px | Source (Tailwind) | px | Decision |
|---|---|---|---|---|
| `--space-1` | 4 | `space-1` | 4 | 일치 |
| `--space-2` | 8 | `space-2` | 8 | 일치 |
| `--space-3` | 12 | `space-3` | 12 | 일치 |
| `--space-4` | 16 | `space-4` | 16 | 일치 |
| `--space-5` | 20 | `space-5` | 20 | 일치 |
| `--space-6` | 24 | `space-6` | 24 | 일치 |
| `--space-8` | 32 | `space-8` | 32 | 일치 |
| `--space-10` | 40 | `space-10` | 40 | 일치 |

**전체 일치**. spacing은 변경 없음. prototype 토큰을 source Tailwind 스케일로 1:1 alias.

## Radius

| Prototype | px | Source (Tailwind) | px | Decision |
|---|---|---|---|---|
| `--r-sm` | 8 | `rounded-lg` | 8 | 일치 (Tailwind name 차이) |
| `--r-md` | 12 | `rounded-xl` | 12 | 일치 |
| `--r-lg` | 16 | `rounded-2xl` | 16 | 일치 |
| `--r-pill` | 9999 | `rounded-full` | 9999 | 일치 |
| (없음) | 6 | `rounded-md` | 6 | source-only. small chips/badges |
| (없음) | 24 | `rounded-3xl` | 24 | source-only. modal/sheet |

**Decision**: prototype의 `--r-sm/md/lg/pill`은 source Tailwind class로 매핑한다. source의 `rounded-md(6)`, `rounded-3xl(24)`는 prototype에 추가 표기.

prototype-only `--control-radius: 12px` → source `rounded-xl` (12)와 동일. component class `tm-btn`/`tm-input`이 사용.

## Control Heights

prototype에만 존재하는 토큰. source에는 Tailwind utility class로 분산되어 있다.

| Prototype | px | Source equivalent | Decision |
|---|---|---|---|
| `--control-sm` | 40 | `h-10` | **source에 추가**: `--control-sm: 40px;` (현재 인라인 h-10 사용) |
| `--control-md` | 48 | `h-12` | **source에 추가**: `--control-md: 48px;` |
| `--control-lg` | 56 | `h-14` | **source에 추가**: `--control-lg: 56px;` |
| `--control-xl` | 64 | `h-16` | **source에 추가**: `--control-xl: 64px;` |
| `--control-icon` | 44 | `h-11 w-11` | **source에 추가**: `--control-icon: 44px;`. 44x44 터치 타겟 (이미 .impeccable.md에 명시) |
| `--control-radius` | 12 | `rounded-xl` | source는 `rounded-xl` 그대로 사용 |
| `--control-gap` | 8 | `gap-2` | source는 Tailwind utility 그대로 사용 |

**Action**: globals.css `:root`에 `--control-sm/md/lg/xl/icon` 추가. Button/Input primitive에서 인라인 height utility 대신 token 사용으로 점진 마이그레이션.

## Motion

| Prototype | Source | Decision |
|---|---|---|
| `--dur-fast: 120ms` | `--duration-fast: 150ms` | **decide**. source가 약간 길다. 권고: source 유지(150ms). prototype의 120ms는 너무 짧아 micro-interaction 시 끊겨 보일 수 있음 |
| `--dur-base: 180ms` | `--duration-normal: 200ms` | **source 채택** |
| `--dur-slow: 280ms` | `--duration-slow: 300ms` | **source 채택** |
| `--ease-out-quart` | (없음) | **source에 추가**: `--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);` |
| `--ease-out-quint` | (없음) | **source에 추가**: `--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);` |
| `--ease-out-expo` | (없음) | **source에 추가**: `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);` |

source globals.css의 animation 키프레임은 이미 `cubic-bezier(0.25, 1, 0.5, 1)` 사용 중 — 이는 quart와 일치. 토큰만 추가하면 의미부여 + 다른 키프레임 재활용 가능.

## Shadow

prototype `--sh-1/2/3/4`는 source에 없다. source는 Tailwind 기본 shadow utility (`shadow-sm/md/lg/xl/2xl`) 사용.

| Prototype | Tailwind equivalent | Decision |
|---|---|---|
| `--sh-1: 0 1px 3px rgba(0,0,0,.06)` | `shadow-sm` | **Tailwind 사용**. token 안 만듦 |
| `--sh-2: 0 2px 8px rgba(0,0,0,.08)` | `shadow-md` | 동상 |
| `--sh-3: 0 4px 12px rgba(0,0,0,.10)` | `shadow-lg` | 동상 |
| `--sh-4: 0 8px 24px rgba(0,0,0,.12)` | `shadow-xl` | 동상 |

**Decision**: prototype은 `--sh-*`을 유지하되, production 코드는 Tailwind shadow utility로 직접 사용. shadow를 token으로 추출하지 않음 (시각 절제 원칙: 깊은 그림자는 줄이고 hairline border 우선).

## Surfaces / Borders

| Prototype | Source | Decision |
|---|---|---|
| `--bg: #ffffff` | `--color-surface: #FFFFFF` | source 채택. rename |
| `--bg-surface: #f2f4f6` | `--color-gray-100: #F2F4F6` | source 채택. rename (gray-100과 동일) |
| `--border: #e5e8eb` | `--color-border: #E5E8EB` | source 채택. rename (gray-200과 동일) |
| `--border-strong: #d1d6db` | (없음) | **source에 추가**: `--color-border-strong: #D1D6DB;` (gray-300과 동일) |

## Text Roles

| Prototype | Source | Decision |
|---|---|---|
| `--text-strong: #191f28` | `--color-text-primary: #191F28` | source 채택 |
| `--text: #4e5968` | `--color-gray-700` (간접) | source 채택. text role은 `text-primary/secondary/tertiary`로 단일화 |
| `--text-muted: #6b7684` | `--color-text-secondary: #6B7684` | source 채택 |
| `--text-caption: #8b95a1` | `--color-text-tertiary: #8B95A1` | source 채택 |
| `--text-placeholder: #b0b8c1` | (gray-400 사용) | source 채택 |

## Migration Plan (Production-Side Action Items)

이 plan은 **prototype 변경 외**의 production에서 해야 할 일을 명시. PR은 이 문서가 아니라 별도 task에서 진행.

### Phase A — globals.css 보강

`apps/web/src/app/globals.css` `@theme {}`에 다음 토큰 추가:

```css
/* Blue scale: missing accents */
--color-blue-200: #A8CDFF;
--color-blue-400: #4792F7;
--color-blue-alpha-08: rgba(49,130,246,.08);
--color-blue-alpha-10: rgba(49,130,246,.10);

/* Gray: subtle hover step */
--color-gray-150: #EAEDF0;

/* Border strong */
--color-border-strong: #D1D6DB;

/* Semantic light tints */
--color-success-50: #E3F8EF;
--color-warning-50: #FFF3E0;
--color-error-50: #FEEBEC;

/* Control heights */
--control-sm: 40px;
--control-md: 48px;
--control-lg: 56px;
--control-xl: 64px;
--control-icon: 44px;
--control-radius: 12px;

/* Easing */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

### Phase B — Tailwind class alias

prototype `tm-*` class를 production에 import할 때, `tm-btn`, `tm-chip`, `tm-card`, `tm-list-row`, `tm-input` class는 source의 `Button`/`Chip`/`Card` primitive와 prop API를 일치시킨다. **CSS rule을 별도 파일로 옮기지 않고**, primitive 컴포넌트 안에서 `clsx` + token 사용.

### Phase C — sweep + grep

production source에서 다음을 grep해 일괄 정리:

| Grep | Replace | Reason |
|---|---|---|
| `text-\[(\d+)px\]` | `text-{token}` | inline px 제거 |
| `h-\[(\d+)px\]` 으로 control 흉내 | `h-10/12/14/16` 또는 `style={{ height: 'var(--control-md)' }}` | control token 일관 |
| `rounded-\[12px\]` | `rounded-xl` | radius alias |
| `#3182f6`, `#1b64da`, `#1b64da` 직접 | `bg-blue-500`, `bg-blue-600` | inline color 제거 |
| `border-l-4 border-blue-` | (전체 border + bg subtle 변경) | 한쪽 색상 보더 카드 강조 금지 (CLAUDE.md 안티패턴) |

이 sweep은 wave 0 — token alignment task에서 production-side로 분리 진행.

## Acceptance

- [ ] prototype의 `--blue50/100/600/700` 값이 source의 production 정의와 일치한다.
- [ ] `--grey-*`는 prototype에서도 `--gray-*`로 일괄 rename된다 (legacy alias 유지).
- [ ] 신규 token 12개가 globals.css에 추가될 PR이 task 문서로 분리된다.
- [ ] `tm-text-*`/`tm-btn-*`/`tm-chip-*` class가 production primitive prop API와 일대일 정렬되는 매핑 표가 board에 있다.
- [ ] shadow는 token화하지 않고 Tailwind utility를 직접 쓴다는 결정이 명시된다.
- [ ] type scale `30/24/20/17/12` round-up 결정이 visual review를 거쳐 확정된다 (gate).
