# Tailwind Token System Fix23

## 목적

`Teameet Design.html?v=20260425-fix23`부터 프로토타입은 light-only 기준으로 운용한다. 다크모드 비교 보드는 일단 제거했고, 예외적으로 Admin desktop의 좌측 sidebar만 어두운 패널을 허용한다.

이 문서는 정적 HTML 프로토타입의 CSS 변수와 실제 앱의 Tailwind theme가 같은 수치를 쓰도록 고정하는 기준이다.

## 기준 파일

- Prototype HTML: `sports-platform/project/Teameet Design.html`
- Prototype tokens: `sports-platform/project/lib/tokens.jsx`
- Tailwind handoff config: `sports-platform/project/tailwind.teameet.config.js`
- Canvas board: `00j · 화면 카탈로그 / Tailwind 토큰 시스템`

## Token Scale

| Group | 기준 | 사용 범위 |
|---|---|---|
| Color | `blue-500 = #3182f6` | CTA, 선택, focus, link 같은 interaction 전용 |
| Grey | `grey-50~900` | white surface 분리, border, disabled, caption |
| Semantic | red/green/orange/yellow/teal/purple | 상태 의미가 있는 badge, alert, progress에만 사용 |
| Spacing | 4px step | `4/8/12/16/20/24/32` 중심, section gap은 `24~32` |
| Radius | `12~16px` | button, input, card, list surface |
| Shell radius | `28~30px` | 모바일 frame/shell 전용 |
| Type | Pretendard | weight는 `400/600/700` 중심 |
| Number | `tabular-nums` | KPI, 금액, 시간, 카운트, 테이블 숫자 |
| Shadow | minimal | 일반 카드 deep shadow 금지, border/list separation 우선 |

## Breakpoints

| Name | Width | Layout rule |
|---|---:|---|
| `mobile` | 375px | 단일 컬럼, sticky CTA, bottom nav |
| `tablet` | 768px | 2컬럼 또는 list + aside, chip wrap 허용 |
| `desktop` | 1024px | 좌측 filter + 우측 result, 중앙 content width |
| `wide` | 1280px | admin/table/search split, 고밀도 표 |

## Copy Fit Rules

- grid/flex 자식은 `min-w-0`을 기본으로 둔다.
- 긴 한글 문구는 `break-keep` 기준으로 단어 단위 줄바꿈을 우선한다.
- CTA는 고정 높이 안에서 2줄까지 허용한다.
- 리스트 subtitle은 1~2줄 clamp 기준으로 통일한다.
- 숫자/금액/통계는 항상 tabular number를 쓴다.
- 모바일 카드 내부에서 3컬럼 이상을 만들 때 label은 짧게 쓰고 value를 우선한다.

## Admin Exception

소비자 화면과 데스크탑 웹은 흰색 base를 유지한다. Admin desktop은 좌측 sidebar만 `#111827` 계열 dark panel을 쓴다.

- Sidebar background: `#111827`
- Active background: `rgba(49,130,246,.18)`
- Active text: `#93c5fd`
- Inactive text: `#e5e7eb`
- Main workspace: white/grey light surface 유지

## 적용 순서

1. Prototype에서 `tokens.jsx`와 `tailwind.teameet.config.js` 수치가 맞는지 확인한다.
2. 새 화면은 먼저 `00j · 화면 카탈로그`의 token/responsive 보드를 기준으로 배치한다.
3. production route로 옮길 때 hard-coded px/color 대신 Tailwind token class를 사용한다.
4. 예외 색상이나 spacing이 필요하면 HTML에 직접 추가하지 말고 token scale부터 갱신한다.
