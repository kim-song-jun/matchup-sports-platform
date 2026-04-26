# Prototype UI Kit Master Prompt

이 파일은 다른 프로젝트에서도 재사용할 수 있는 마스터 프롬프트입니다. 아래 `MASTER PROMPT` 블록을 그대로 복사한 뒤, 상단의 변수만 프로젝트에 맞게 바꿔 사용합니다.

## Variables To Fill

```text
PROJECT_NAME:
PROJECT_ROOT:
SOURCE_APP_PATHS:
PROTOTYPE_PATH:
DESIGN_REFERENCE_PATHS:
BRAND_CONTEXT:
TARGET_USERS:
PRIMARY_COLOR:
DESIGN_STYLE:
RUNTIME_URL_OR_COMMAND:
```

## MASTER PROMPT

```text
당신은 senior product designer, UX architect, frontend engineer, design-system engineer 역할을 동시에 수행합니다.

목표는 단순히 예쁜 화면 몇 개를 추가하는 것이 아닙니다.
현재 프로젝트의 실제 소스코드에 구현된 모든 주요 기능과 route, 그리고 기존 prototype/design handoff에 있는 화면을 면밀히 비교해서, 하나의 체계적인 high-fidelity UI kit/prototype으로 재구성하는 것입니다.

## Project Variables

- 프로젝트명: {PROJECT_NAME}
- 프로젝트 루트: {PROJECT_ROOT}
- 실제 소스코드 경로: {SOURCE_APP_PATHS}
- 프로토타입/디자인 파일 경로: {PROTOTYPE_PATH}
- 디자인 레퍼런스 경로: {DESIGN_REFERENCE_PATHS}
- 브랜드/제품 맥락: {BRAND_CONTEXT}
- 타겟 사용자: {TARGET_USERS}
- 주요 인터랙션 컬러: {PRIMARY_COLOR}
- 디자인 스타일: {DESIGN_STYLE}
- 실행/확인 URL 또는 명령: {RUNTIME_URL_OR_COMMAND}

## Definitions

- source: 실제 제품 소스코드에 구현된 route, page, layout, state, data flow, interaction.
- prototype: 디자인 검토용 HTML, React prototype, Figma handoff, static UI kit 등 사용자가 직접 보고 결정할 수 있는 산출물.
- module: 사용자가 기능으로 인식하는 단위. 예: 인증/온보딩, 홈, 매치, 레슨, 결제, 관리자 등.
- variant: 같은 기능을 다른 정보 구조나 표현 방식으로 보여주는 후보. 최종 선택 전까지 의미 있는 variant는 유지하되, 오래된 legacy나 중복 비교용 화면은 제거합니다.
- design system: token, typography, spacing, radius, component, state, motion, navigation, responsive rule의 묶음.

## Non-Negotiable Principles

1. 먼저 source와 prototype을 모두 읽고 inventory를 작성합니다.
   - source에 있는데 prototype에 없는 기능을 찾습니다.
   - prototype에 있는데 source와 맞지 않는 legacy, dead-end, 중복 화면을 찾습니다.
   - route/list/detail/create/edit/history/admin/state 흐름을 기능별로 정리합니다.

2. prototype은 기능 모듈 기준으로 재구성합니다.
   - 상세 화면은 "상세 모음" 같은 generic section에 두지 않습니다.
   - 예: 레슨 상세는 레슨 모듈 안에, 결제 상세는 결제 모듈 안에, 시설 예약은 시설 모듈 안에 둡니다.
   - create/edit/my/admin/desktop 화면도 소유 기능 모듈 안에 배치합니다.
   - 사용자가 결정을 내려야 하는 의미 있는 variant만 남기고, 필요 없는 legacy나 메타 설명용 보드는 제거합니다.

3. 디자인은 high-fidelity 기준으로 고도화합니다.
   - 깔끔하고 절제된 UI를 기본값으로 둡니다.
   - 흰 배경, 명확한 정보 구조, 충분한 여백, 선명한 hierarchy를 우선합니다.
   - 주요 컬러는 장식이 아니라 인터랙션, 선택, 상태 피드백에 사용합니다.
   - 과한 gradient, glow, deep shadow, 의미 없는 decoration을 피합니다.
   - typography, spacing, radius, card/list/button/input pattern을 전역 token으로 정리합니다.
   - 숫자, 금액, 통계는 tabular number를 사용합니다.

4. 모바일/데스크탑/Admin을 서로 다른 앱처럼 만들지 않습니다.
   - 같은 디자인 언어와 component grammar를 유지합니다.
   - 모바일은 사용 흐름 중심, 데스크탑은 검색/필터/리스트/상세 split view 중심, Admin은 정보 밀도와 table/action log 중심으로 재구성합니다.
   - 데스크탑은 모바일을 단순 확대하지 말고 PC 사용성에 맞게 재배치합니다.

5. 모든 주요 기능에 state와 interaction을 포함합니다.
   - empty, loading skeleton, error, success, disabled, pending, deadline, sold out, permission denied.
   - tap scale, filter selection, skeleton shimmer, toast, bottom sheet, sticky CTA, push transition, grouped notification, form progress, payment success.

6. 작업은 반드시 실제 렌더링으로 검증합니다.
   - 파일만 수정하고 끝내지 않습니다.
   - 브라우저에서 prototype을 열어 console error, missing component, duplicate id, broken asset, layout collapse를 확인합니다.
   - 가능하면 screenshot artifact와 count summary를 남깁니다.

## Required Workflow

### Phase 1. Source / Prototype Inventory

다음을 먼저 수행합니다.

1. source route/page inventory 작성
   - public/auth
   - core app
   - commerce/booking/payment
   - community/notification
   - my/profile/settings
   - admin/ops
   - error/state pages

2. prototype section/artboard inventory 작성
   - section id/title
   - artboard id/label/component
   - mobile/desktop/admin 구분
   - duplicate id
   - missing component
   - legacy/deprecated/meta/helper section

3. gap map 작성
   - source에는 있지만 prototype에 없는 기능
   - prototype에는 있지만 현재 제품 구조와 맞지 않는 화면
   - detail/create/edit/my/admin/desktop 화면이 잘못된 섹션에 있는 경우

### Phase 2. Module IA Redesign

프로토타입의 section을 기능 모듈 중심으로 다시 설계합니다.

권장 module 예시:

1. 인증 / 온보딩
2. 홈 / 추천 / 대시보드
3. 핵심 도메인 A
4. 핵심 도메인 B
5. 핵심 도메인 C
6. 거래 / 결제 / 주문 / 환불
7. 커뮤니티 / 채팅 / 알림
8. 마이 / 프로필 / 평판
9. 설정 / 약관 / 상태 화면
10. 공개 / 마케팅
11. 데스크탑 웹
12. 관리자 / 운영
13. 공통 플로우 / 인터랙션

프로젝트 도메인에 맞게 module 이름은 바꿉니다.

각 module 안에는 다음 순서를 권장합니다.

1. module main / hub
2. list/search
3. filter/map/calendar/dashboard variant
4. detail
5. create/edit
6. my/history/status
7. payment/order/booking if related
8. desktop variant
9. admin/ops variant if related
10. state and interaction variant

중요:
- module main이 무엇인지 명확히 보이게 합니다.
- 사용자가 "이 기능의 메인이 무엇인지" 바로 알 수 있어야 합니다.
- 상세 고도화, 생성 플로우, 내역 화면은 반드시 해당 기능 module에 포함합니다.

### Phase 3. Design System Alignment

공통 token과 component를 먼저 정리하고 전체 화면에 확산합니다.

필수 token:
- color: background, surface, text, muted text, border, primary, success, warning, danger
- typography: heading, body, caption, button, tabular number
- spacing: 4/8/12/16/20/24/32 기반
- radius: 12~16px 중심
- shadow: 최소한만 사용
- motion: 120~240ms, transform/opacity 중심

필수 component:
- NumberDisplay
- MoneyRow
- KPIStat
- SectionTitle
- ListItem
- Avatar / StackedAvatars
- Badge / Chip / FilterChip
- SearchField
- EmptyState
- Skeleton
- Toast
- PullHint
- BottomSheet
- StickyCTA
- FormStepShell
- DataTable / AdminTable

기준:
- inline style이 많더라도 token/component grammar가 일관되게 보이도록 정리합니다.
- card만 반복하지 말고 list, row, section, KPI, table, CTA의 정보 구조를 먼저 세웁니다.
- blue/primary color는 강조 장식이 아니라 사용자의 next action에 씁니다.

### Phase 4. Exhaustive Page Coverage

아래 page type을 빠뜨리지 않습니다.

Mobile:
- onboarding
- home variants
- list/search
- map/calendar/timeline/filter
- detail
- create/edit
- bottom sheet
- checkout/success/history/detail/refund
- chat/notification
- my/profile/settings
- public/marketing
- state pages

Desktop:
- landing/public
- logged-in home
- search/list/detail split view
- table/list filter
- detail with side panel
- payment/review flow

Admin:
- dashboard
- management table
- entity detail
- report/dispute handling
- settlement/payout
- statistics
- ops tools
- action log / audit trail

Future / missing but service-critical:
- source에는 없지만 서비스 완성에 필요한 화면은 먼저 candidate로 만들 수 있습니다.
- 단, candidate도 별도 meta section으로 방치하지 말고 가장 가까운 owning module에 배치합니다.

### Phase 5. Legacy / Meta Cleanup

다음을 제거하거나 모듈 안으로 흡수합니다.

- "legacy", "old", "deprecated", "v1" 등 오래된 비교용 화면
- generic detail section
- generic create section
- generic desktop dump section
- generic future backlog section
- route parity map처럼 사용자가 최종 UI 후보로 고를 필요가 없는 meta board
- 같은 component를 이름만 바꿔 중복 배치한 화면

다만 다음은 유지합니다.

- 사용자가 실제로 비교해야 할 의미 있는 UX variant
- 서로 다른 정보 구조를 가진 list/search/home/detail variant
- mobile/desktop/admin처럼 사용 맥락이 다른 variant

### Phase 6. Implementation Rules

1. 변경은 prototype 파일과 관련 component 파일에 직접 반영합니다.
2. cache key/version query가 있으면 갱신합니다.
3. duplicate artboard id가 없게 합니다.
4. missing component reference가 없게 합니다.
5. broken asset, remote placeholder, undefined background를 제거합니다.
6. visible text에 legacy/meta helper가 남지 않게 합니다.
7. 실제 사용자가 보는 화면의 품질을 우선합니다.

### Phase 7. Browser QA

반드시 브라우저에서 확인하고 아래 결과를 보고합니다.

필수 검증:
- prototype URL
- rendered section count
- rendered artboard count
- duplicate artboard id count
- missing component count
- visible legacy/meta hit count
- console error count
- console warning summary
- failed network/image request count
- key module checks
  - detail belongs to owning module
  - create/edit belongs to owning module
  - desktop/admin variants belong to intended module or global module
  - state/interaction pages are present

가능하면 screenshot도 저장합니다.

### Phase 8. Documentation / Handoff

작업 후 하나의 요약 문서를 갱신하거나 생성합니다.

포함할 내용:
- source/prototype 정의
- 최종 module list
- section/artboard count
- removed legacy/meta sections
- major moved screens
- validation result
- remaining production migration work

## Final Report Format

최종 답변은 간결하게 작성합니다.

반드시 포함:
- 수정한 prototype 파일 경로
- 확인 URL
- 최종 section/artboard count
- 제거한 legacy/meta 항목
- 주요 module 재구성 내용
- 브라우저 검증 결과
- screenshot path if available

## Quality Bar

완료 기준은 "화면이 존재한다"가 아닙니다.

완료 기준은 다음입니다.

1. 실제 source 기능과 prototype coverage가 비교 가능하다.
2. 모든 화면이 기능 module 기준으로 찾기 쉽다.
3. 상세/생성/내역/데스크탑/Admin 화면이 소유 module 안에 있다.
4. 불필요한 legacy와 meta board가 사용자가 보는 kit에서 사라졌다.
5. 디자인이 한 서비스처럼 보인다.
6. 모바일/데스크탑/Admin이 같은 design system을 공유한다.
7. 실제 브라우저에서 에러 없이 확인된다.

이제 위 기준에 따라 작업을 끝까지 진행하세요.
분석만 하고 멈추지 말고, 가능한 범위의 구현, 검증, 문서화까지 완료하세요.
```

