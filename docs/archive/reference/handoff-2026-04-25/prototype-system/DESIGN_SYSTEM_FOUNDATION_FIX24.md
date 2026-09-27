# Design System Foundation Fix24

## 목적

`fix24`는 화면을 더 늘리는 pass가 아니라, 개발팀이 실제 구현에 착수하기 전에 필요한 공통 디자인 시스템 계약을 고정하는 pass다.

- Typography scale
- Button size / variant / state
- Chip / input / list / card 규격
- Motion / animation / interaction timing
- Mobile / tablet / desktop layout storyboard
- Tailwind class usage contract

## 기준 보드

`Teameet Design.html?v=20260425-fix24`의 `00k · 디자인 시스템 Foundation` 섹션이 기준이다.

| Board | Purpose |
|---|---|
| `system-typography` | 9단계 type scale, weight, line-height, tabular number 기준 |
| `system-buttons` | 버튼 높이, padding, variant, hover/pressed/disabled 기준 |
| `system-controls` | chip, input, list row, card 공통 규격 |
| `system-motion` | tap, enter, sheet, skeleton, reduced-motion 기준 |
| `system-layout` | mobile/tablet/desktop 재배치 storyboard |
| `system-handoff` | Tailwind class contract와 Do/Do not 구현 기준 |

## Typography

타이포그래피는 9단계만 사용한다. 새 화면에서 임의 `font-size`를 만들지 않는다.

| Token | Size / line-height | Weight | Usage |
|---|---:|---:|---|
| `tm-text-display` | `36 / 44` | `700` | 핵심 KPI, 성공 화면, 404 |
| `tm-text-title` | `30 / 36` | `700` | 데스크탑 보드 제목, 큰 섹션 제목 |
| `tm-text-heading` | `24 / 32` | `700` | 상세 상단, 모바일 주요 타이틀 |
| `tm-text-subhead` | `20 / 28` | `700` | 카드 그룹, sheet 제목 |
| `tm-text-body-lg` | `17 / 26` | `600` | 강조 본문, 리스트 primary |
| `tm-text-body` | `15 / 22` | `400` | 기본 설명, 폼 도움말 |
| `tm-text-label` | `13 / 19` | `600` | chip, filter, section helper |
| `tm-text-caption` | `12 / 18` | `400` | meta, time, empty state 설명 |
| `tm-text-micro` | `11 / 15` | `600` | badge, table helper |

숫자/금액/시간/점수는 항상 `tm-tabular` 또는 기존 `tab-num`을 함께 사용한다.

## Button Contract

버튼은 `tm-btn + size + variant` 조합으로 만든다. 화면별 직접 `height`, `padding`, `borderRadius`를 다시 정의하지 않는다.

| Size | Height | Padding | Usage |
|---|---:|---|---|
| `tm-btn-sm` | `40px` | `px-4` | compact row action |
| `tm-btn-md` | `48px` | `px-5` | 기본 폼 CTA |
| `tm-btn-lg` | `56px` | `px-[22px]` | sticky CTA, bottom sheet primary |
| `tm-btn-xl` | `64px` | `px-6` | 결제/가입 최종 CTA |
| `tm-btn-icon` | `44px` | square | nav, close, filter, share |

Variant:

- `tm-btn-primary`: `#3182f6`, 주요 진행 액션
- `tm-btn-secondary`: blue-50 surface, 보조 진행 액션
- `tm-btn-neutral`: grey-100, 중립 액션
- `tm-btn-outline`: white + full border, 낮은 강조
- `tm-btn-ghost`: background 없음, 보조 도구
- `tm-btn-danger`: 파괴적 액션

State:

- hover: 색상만 한 단계 변경
- pressed: `scale(.98)`
- disabled: `opacity .42`, active transform 제거
- focus: `2px #3182f6` ring
- 긴 문구: `white-space: normal`, 2줄 허용

## Controls

- `tm-chip`: `36px`, pill, nowrap, tap scale `.97`
- `tm-chip-sm`: `30px`, 보조 filter
- `tm-input`: `48px`, radius `12px`, full border
- `tm-list-row`: `14px 20px`, title은 wrap 허용
- `tm-card`: radius `16px`, full border, restrained hover only

## Motion

| Motion | Transform | Timing | Usage |
|---|---|---|---|
| Tap | `scale(.98)` | `120ms / out-quart` | button, chip, card |
| Enter | `translateY(8px) + opacity` | `280ms / out-quint` | list, card, empty |
| Sheet | `translateY(20px) + opacity` | `280ms / out-expo` | bottom sheet |
| Skeleton | shimmer | `1400ms` | loading placeholder |
| Reduced motion | `0.01ms` | OS preference | motion 최소화 |

`width`, `height`, `padding`, `margin` 같은 layout property는 애니메이션하지 않는다.

## Tailwind Source Files

- `sports-platform/project/tailwind.teameet.config.js`
- `sports-platform/project/tailwind.teameet.css`
- `sports-platform/project/lib/tokens.jsx`
- `sports-platform/project/lib/signatures.jsx`

Production route로 옮길 때는 hard-coded px/color 대신 위 class와 token을 사용한다.

## QA 기준

`fix24`부터 text clipping 검수는 leaf text 기준으로 본다.

- parent container의 `overflow: hidden`은 false positive가 많다.
- 실제 텍스트 leaf node의 `scrollWidth > clientWidth` 또는 `scrollHeight > clientHeight`를 우선 본다.
- 의도적 ellipsis는 개발 핸드오프용 prototype에서는 최소화한다.
- mobile/tablet/desktop 보드는 모두 `min-width: 0`, `word-break: keep-all`, `overflow-wrap: break-word` 기준을 적용한다.
