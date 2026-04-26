# Tailwind Token System Fix24

## 목적

`fix24`는 `fix23`의 light-only token 기준을 유지하면서, 개발팀 구현에 필요한 component class와 motion token을 추가한다.

## 기준 파일

- Prototype HTML: `sports-platform/project/Teameet Design.html`
- Prototype runtime CSS: `sports-platform/project/lib/tokens.jsx`
- Signature components: `sports-platform/project/lib/signatures.jsx`
- Tailwind config: `sports-platform/project/tailwind.teameet.config.js`
- Tailwind source CSS: `sports-platform/project/tailwind.teameet.css`
- Canvas board: `00k · 디자인 시스템 Foundation`

## Tailwind Class Contract

| Family | Classes |
|---|---|
| Typography | `tm-text-display`, `tm-text-title`, `tm-text-heading`, `tm-text-subhead`, `tm-text-body-lg`, `tm-text-body`, `tm-text-label`, `tm-text-caption`, `tm-text-micro` |
| Number | `tm-tabular`, 기존 `tab-num` |
| Button | `tm-btn`, `tm-btn-sm`, `tm-btn-md`, `tm-btn-lg`, `tm-btn-xl`, `tm-btn-icon`, `tm-btn-primary`, `tm-btn-secondary`, `tm-btn-neutral`, `tm-btn-outline`, `tm-btn-ghost`, `tm-btn-danger` |
| Chip | `tm-chip`, `tm-chip-sm`, `tm-chip-active` |
| Surface | `tm-card`, `tm-card-interactive`, `tm-surface-muted`, `tm-list-row` |
| Input | `tm-input` |
| Motion | `tm-pressable`, `tm-animate-enter`, `tm-animate-sheet` |
| Admin | `tm-admin-sidebar` |

## Token Scale

| Group | 기준 | 사용 범위 |
|---|---|---|
| Color | `blue-500 = #3182f6` | CTA, 선택, focus, link 같은 interaction 전용 |
| Grey | `grey-50~900` | white surface 분리, border, disabled, caption |
| Spacing | 4px step | `4/8/12/16/20/24/32` 중심 |
| Radius | `12~16px` | button, input, card, list surface |
| Type | Pretendard | weight는 `400/600/700` 중심 |
| Button | `40/48/56/64px` | sm/md/lg/xl |
| Motion | `120/180/280ms` | tap/base/sheet-enter |
| Shadow | minimal | card deep shadow 금지 |

## Admin Exception

소비자 화면과 데스크탑 웹은 흰색 base를 유지한다. Admin desktop은 좌측 sidebar만 `#111827` 계열 dark panel을 쓴다.

- Sidebar background: `#111827`
- Active background: `rgba(49,130,246,.18)`
- Active text: `#93c5fd`
- Inactive text: `#e5e7eb`
- Main workspace: white/grey light surface 유지

## Do / Do Not

Do:

- `className="tm-btn tm-btn-md tm-btn-primary"`
- `className="tm-text-body tm-tabular"`
- `className="grid minmax(0,1fr) min-w-0"`
- `duration-fast/base/slow + ease-out-quart`

Do not:

- `style={{ height: 47, padding: ... }}`
- blue background for decoration
- one-side colored border
- layout property animation
