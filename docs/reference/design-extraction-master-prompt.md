# Design Extraction Master Prompt (generic)

> 어떤 웹 / 모바일 / 데스크탑 SaaS 프로젝트에서든 **module × viewport × state × components/assets** 4축 그리드로 디자인을 결정적으로 뽑아내고, 개발자가 즉시 착수 가능한 prototype + production primitive까지 만들기 위한 마스터 프롬프트.

이 프롬프트는 단일 LLM 또는 Claude/GPT 같은 코딩 에이전트에 직접 전달해 사용한다. placeholder는 프로젝트별 컨텍스트로 치환한다.

---

## Required inputs (반드시 채워서 시작)

```yaml
PROJECT_NAME: "..."             # 예: "Teameet", "Acme SaaS"
PROJECT_KIND: "web | mobile | desktop | hybrid"
PROJECT_LANG: "ko | en | ja | ..."
SOURCE_ROOT: "<repo absolute path>"
SOURCE_ROUTES_GLOB: "<route file glob>"   # 예: apps/web/src/app/**/page.tsx
SOURCE_TOKEN_FILE: "<css/scss/json>"      # 예: apps/web/src/app/globals.css
PROTOTYPE_ROOT: "<prototype dir>"          # 신규 prototype 보관 경로
PROTOTYPE_DEV_URL: "http://127.0.0.1:<port>/<entry>"
BRAND_PRIMARY: "#XXXXXX"                   # 단일 accent
TYPE_FONT: "Pretendard | Inter | ..."
THEME_MODE: "light-only | dark-only | both"  # 결정 기록
DARK_EXCEPTION_SCOPE: "..."               # 예: 'admin sidebar only', 'none'
MODULE_LIST:                                # M01~M{N} 정의
  - id: M01
    name: "..."
    routes: [...]
    desc: "..."
  # ...
ID_SCHEMA: "m{NN}-{viewport}-{kind}[-{state|asset|sub}]"
VIEWPORTS:
  mb: 375    # mobile 폭
  tb: 768    # tablet 폭
  dt: 1280   # desktop 폭
```

---

## Phase 0 — Reconnaissance (정찰)

목적: 프로젝트의 ground truth 수집.

1. `SOURCE_ROUTES_GLOB`로 모든 route 파일을 inventory한다. 결과: route 개수, 그룹별 분포.
2. `SOURCE_TOKEN_FILE`을 읽어 기존 색상 / 간격 / 타이포 / 모션 토큰을 추출한다.
3. 기존 layout / navigation / shell 컴포넌트를 식별한다 (bottom nav, sidebar, top bar 등).
4. 기존 design system primitive를 그렙한다 (Button / Card / Input / Skeleton / Toast / EmptyState).
5. 결과를 `RECON_REPORT.md`로 정리한다.

산출물: `<prototype-system>/RECON_REPORT.md` — route count / token map / shell list / primitive list.

---

## Phase 1 — ID Schema Spec

목적: 모든 prototype 보드에 결정적 식별자 부여.

1. `<prototype-system>/PROTOTYPE_ID_SCHEMA.md`를 작성한다.
2. Schema: `m{NN}-{viewport}-{kind}[-{state|asset|sub}]`
3. enum 정의:
   - **viewport**: `mb` (mobile) / `tb` (tablet) / `dt` (desktop). 폭은 `VIEWPORTS` 참고.
   - **kind**: `main` / `list` / `detail` / `create` / `edit` / `state` / `flow` / `components` / `assets` / `motion`.
   - **state** (kind=state일 때 4번째 segment 필수): `loading` / `empty` / `error` / `success` / `disabled` / `pending` / `sold-out` / `permission` / `deadline`. 프로젝트 도메인에 따라 추가 enum 가능.
   - **asset** (kind=assets의 sub): `tokens` / `components` / `icons` / `colors` / `type`.
4. **Obligation grid** — 각 module × viewport마다 의무/조건부 보드:

| Kind | mobile | tablet | desktop |
|---|---|---|---|
| main | 의무 | 의무 | 의무 |
| list / detail / create / edit | 모듈에 해당 시 의무 | 의무 | 의무 |
| state-{loading/empty/error} | 의무 (mb), conditional (tb·dt) |
| state-{success/disabled/pending/sold-out/permission/deadline} | 해당 시 의무 (mb), conditional (tb·dt) |
| components | 의무 | 의무 | 의무 |
| assets | 의무 | 의무 | 의무 |
| motion | 의무 (mb), conditional (tb·dt) |

5. 기존 보드 매핑 규칙:
   - **삭제 0건** — variant는 보존.
   - 기존 보드의 ID에 새 schema alias를 caption으로 추가.

6. 네이밍 규칙: 소문자 + 하이픈, viewport는 정확히 `mb/tb/dt`, state/asset enum 외 자유 단어 금지.

7. Linter regex (audit script에 사용):
```js
const ID_REGEX = /^m(0[1-9]|1[0-9])-(mb|tb|dt)-(main|list|detail|create|edit|state|flow|components|assets|motion)(-([a-z][a-z0-9-]*))?$/;
```

산출물: `PROTOTYPE_ID_SCHEMA.md`.

---

## Phase 2 — POC (2 modules)

목적: schema 실효성 검증 + 후속 wave 작업의 reference.

1. `MODULE_LIST`에서 가장 단순한 2 모듈 선택 (보통 `M01 인증` + `M02 홈`).
2. 각 모듈마다 풀 grid 보드 작성:
   - 의무 보드 12~16개 (main mb/tb/dt + state mb 5종 + components mb/tb/dt + assets mb/tb/dt + motion mb)
3. 한 모듈당 1 jsx 또는 1 component file:
```
<prototype-root>/lib/screens-grid-m01.<ext>
<prototype-root>/lib/screens-grid-m02.<ext>
```
4. 각 보드는 다음 규칙을 엄수한다:
   - **토큰만 사용** — `var(--*)` CSS 변수 또는 design system class. raw `#hex` 금지 (소셜 브랜드 컬러 등 명시적 예외만 허용).
   - **타이포 클래스** — `tm-text-*` 또는 동등 design system class. raw `fontSize: N` 금지.
   - **간격 4-multiple** — 4, 8, 12, 16, 20, 24, 32, 40 중심. 1/2 px (hairline / focus offset)는 허용.
   - **공유 컴포넌트 재사용** — 인라인 마크업 전에 기존 design system primitive 확인.
   - **44x44 터치 타겟** — 인터랙티브 요소 의무.
   - **a11y** — `aria-label` (icon button), `role` (modal/dialog/progressbar), focus ring, 컬러+텍스트 병행.
5. POC 통과 조건:
   - ID schema violations = 0
   - 모든 보드 렌더 무결성 (mount error 0)
   - design system 안티패턴 0 (한쪽 색상 보더 카드 강조 등)

산출물: 2 jsx files, `PROTOTYPE_INVENTORY.md` (모듈 매핑 + 의무 grid 매트릭스).

---

## Phase 3 — Wave Expansion (병렬)

목적: 나머지 N-2 모듈을 wave별로 분할 + 병렬 처리.

1. wave 분할 (예시 — 19 모듈인 경우):

| Wave | 모듈 | 신규 보드 (예상) |
|---|---|---|
| A | M03·M04·M05 | ~30 |
| B | M06·M07·M08·M09 | ~40 |
| C | M10·M11·M12·M13 | ~40 |
| D | M14·M15·M16 | ~30 |
| E | M17·M18·M19 | ~25 |

2. 각 wave는 **모듈당 1 에이전트로 병렬 dispatch**한다 (8~17 동시).
3. 각 에이전트 프롬프트 템플릿:

```
{PROJECT_NAME} {MODULE_ID} ({MODULE_NAME}) viewport grid 보드를 작성합니다. **production code 변경 절대 금지** — prototype 1 파일만 신규 작성.

## 작성할 파일
{PROTOTYPE_ROOT}/lib/screens-grid-{module-id-lower}.{ext}

## Reference (반드시 참조)
1. {PROTOTYPE_ROOT}/lib/screens-grid-m02.{ext}  # POC 패턴
2. {SOURCE_TOKEN_FILE}
3. <prototype-system>/PROTOTYPE_ID_SCHEMA.md

## 모듈 컨텍스트
- Source routes: {ROUTE_LIST}
- 핵심 화면: {KEY_SCREENS}
- 핵심 컴포넌트: {KEY_COMPONENTS}
- 핵심 토큰: {KEY_TOKENS}

## 의무 보드 (N개)
{BOARD_LIST}  # 예: m{NN}-mb-main, m{NN}-tb-main, ..., m{NN}-mb-state-loading, ...

## 코드 규칙 (엄수)
- tm-text-* class only — raw fontSize 금지
- var(--*) token only — raw #hex 금지 (소셜 브랜드 예외만)
- 4-multiple spacing
- 공유 컴포넌트 재사용 (Phone / Card / Badge / Chip / Icon / ListItem / SectionTitle)
- Object.assign(window, {...}) export

## 끝맺음
export 컴포넌트 이름 + 보드 수만 1줄 보고. 추가 설명 금지.

## DO NOT touch
{LIST_OF_OTHER_FILES}
```

4. **충돌 방지**:
   - 각 에이전트는 자기 jsx 파일만 작성 (LEAF). HTML 등 SHARED 파일 금지.
   - 에이전트 프롬프트에 `DO NOT touch <파일목록>` 명시.
   - 같은 이름의 helper(`ComponentSwatch`, `AssetSwatch` 등)는 모듈별 prefix.
5. 통합은 **메인 에이전트가 wave 종료 후 직렬로** 처리한다.

산출물: N-2 jsx files.

---

## Phase 4 — Integration

목적: wave 결과를 단일 prototype에 마운트.

1. `<prototype entry>`에 N-2 신규 jsx import 추가.
2. 각 모듈에 대해 `<DCSection id="m{NN}-grid">` + N개 `<DCArtboard>` 추가. board ID는 schema 따름.
3. **이름 충돌 점검**:
   - 각 jsx 파일에서 `Object.assign(window, {...})` export 검사.
   - 글로벌 reference로 사용하는 helper(`ComponentSwatch`, `MoneyRow` 등)는 첫 정의 모듈에서 alias 등록 (`window.ComponentSwatch = M01ComponentSwatch`).
   - 같은 이름 const 두 번 선언 시 babel standalone 오류 — 발견 즉시 prefix rename (perl/sed codemod).
4. cache key bump (`?v=fix{N+1}`).
5. headless QA 실행:

```js
// scripts/qa/<prototype>-fix{N+1}-full-qa.mjs
import { chromium } from 'playwright';
const URL = '<PROTOTYPE_DEV_URL>?v=fix{N+1}';
// ... checks: sectionCount, artboardCount, idSchemaViolations, duplicateSlots, pageErrors, unexpectedConsole
```

6. 통과 기준:
   - sections / artboards 카운트 정상
   - ID schema violations = 0
   - duplicateSlots = 0
   - pageErrors = 0
   - unexpectedConsole = 0 (babel standalone warning은 whitelist)

산출물: 통합된 entry file + QA artifact JSON + 대표 스크린샷.

---

## Phase 5 — Token Sweep Codemod (안전 자동화)

목적: prototype + (옵션) production source의 raw value를 token으로 일괄 정리.

1. **codemod 스크립트** (`scripts/qa/<prototype>-token-sweep.mjs`):

```js
const HEX_TO_TOKEN = {
  '#FFFFFF': 'var(--static-white)',
  '#fff':    'var(--static-white)',
  '<BRAND_PRIMARY>': 'var(--<brand-primary-token>)',
  // ... 토큰 매핑 표 (RECON_REPORT.md 기반)
};

const SKIP_FILES = new Set(['<token def file>', '<demo/swatch file>']);
const SKIP_LINE_PATTERNS = [
  /^\s*\/\//,                              // 주석
  /<social brand color regex>/i,           // 소셜 브랜드 컬러 보존
  /<sport/category color fixture regex>/i, // 도메인 fixture 보존
];
```

2. **자동화 안전 변환만 수행** — 리스크 큰 자동화는 skip:
   - ✅ raw `#hex` → `var(--token)` (매핑 테이블 기반, 충분히 안전)
   - ⚠️ raw `fontSize: N` → `tm-text-{token}` class (시각 영향 있음 — 수동 또는 별도 wave)
   - ⚠️ raw spacing → 4-multiple round (디자인 의도 손상 위험 — 수동)
3. codemod 실행 후 prototype QA 재실행. 시각 회귀 0 확인.

산출물: codemod 스크립트 + audit 변화 (color compliance % 상승).

---

## Phase 6 — Production Primitive Extraction

목적: prototype 디자인을 production source의 재사용 가능 primitive로 추출.

1. **5 primitive** (프로젝트 도메인에 따라 조정):
   - `NumberDisplay` — value/unit/sub/size/tone/format/loading
   - `FilterChip` — active/count/size/variant/asLink
   - `MoneyRow` — label/amount/unit/description/strong/tone/rightSlot
   - `StatBar` — label/value/max/sub/tone/orientation
   - `MetricStat` — label/value/delta/deltaLabel/icon/tone/href

2. 각 primitive를 **별도 에이전트로 병렬 작성** (LEAF, 충돌 없음):
   - `apps/web/src/components/ui/<primitive>.tsx`
   - `apps/web/src/components/ui/__tests__/<primitive>.test.tsx` (5~6 테스트)
3. 각 primitive 프롬프트 템플릿:

```
production source의 `<path>/<primitive>.tsx`를 신규 작성합니다.

## Spec
{TS_INTERFACE}

## Size / Tone mapping
{TABLES}

## Behavior
- 의존: <기존 primitive list>
- a11y: <aria-* 명세>
- token: var(--*) only
- raw style 금지

## 추가 작성
1. <primitive>.tsx
2. __tests__/<primitive>.test.tsx (N tests):
   - 기본 렌더
   - prop X 검증
   - ...

## 검증
`npx tsc --noEmit && pnpm test -- <primitive>`

## DO NOT touch
다른 primitive 파일 (병렬 에이전트와 충돌 방지)
```

4. 기존 caller migration은 **별도 PR로 분리** (wave별로 1 PR per page family).
5. globals.css에 누락 토큰 보강 (control-* / ease-* / semantic-50 등).

산출물: N primitive `.tsx` + tests, globals.css 토큰 보강.

---

## Phase 7 — Final Audit + Docs

목적: 정량 + 정성 게이트 통과 확인 + 핸드오프 문서.

1. **정량 audit script** (`scripts/qa/<prototype>-audit.mjs`):
   - **Static pass** (grep on jsx):
     - color: `var(--*)` 토큰 hits ÷ (token + raw #hex)
     - spacing: 4-multiple + token hits ÷ 전체 spacing 발화
     - typography: `tm-text-*` class adoption ÷ (class + raw fontSize)
   - **Runtime pass** (Playwright DOM scan):
     - 19 모듈 × viewport 보드 카운트
     - DOM 측 raw hex 잔존
     - tm-btn / tm-chip / tm-pressable 카운트
2. **합격 게이트**:

| Metric | Pass | Conditional | Fail |
|---|---|---|---|
| Color compliance | ≥98% | 95-98% | <95% |
| Spacing compliance | ≥95% | 90-95% | <90% |
| Typography class adoption | ≥97% | 92-97% | <92% |
| Viewport coverage (functional 모듈) | 100% × 3 viewport | 의도된 single 허용 | missing |
| ID schema violations | 0 | -- | >0 |
| pageErrors / duplicate slots / unexpected console | 0 each | -- | >0 |

3. **사용자 4가지 검수 질문 답** (보고서 마지막 섹션):
   1. 디자인 시스템(색상/간격/타이핑) 준수 — 정량 + DOM/source 분리
   2. 모든 viewport 페이지 존재 — module × viewport matrix
   3. 각 페이지 디자인 시스템 준수 — 모듈별 compliance ranking
   4. 개발자 즉시 개발 가능 — readiness checklist (route manifest / nav / token / component / state coverage)

4. **prototype 자체에 audit summary 보드 마운트** (`00n · Prototype Audit Summary` 같은 reference section):
   - audit-summary (4 questions verdict)
   - audit-token-score (compliance bars)
   - audit-viewport-matrix
   - audit-module-heatmap
   - audit-readiness (12+ items)

5. **갱신 docs 목록**:
   - `<prototype-system>/README.md` — current prototype URL / sections / artboards / docs index
   - `<prototype-system>/PROTOTYPE_ID_SCHEMA.md`
   - `<prototype-system>/PROTOTYPE_INVENTORY.md`
   - `<prototype-system>/PROTOTYPE_AUDIT_FIX{N}.md`
   - `<prototype-system>/DESIGN_QA_FIX{N}.md` (각 라운드)
   - `<prototype-system>/ROUTE_OWNERSHIP_MANIFEST.md` (route ↔ module 매핑)
   - `<prototype-system>/BOTTOM_NAV_CONTRACT.md` (canonical nav)
   - `<prototype-system>/TOKEN_ALIGNMENT_PLAN.md` (prototype↔source 토큰 정렬 결정)
   - `<prototype-system>/COMPONENT_EXTRACTION_PLAN.md` (5 primitive props/callers/PR scope)

산출물: audit script + JSON artifact + 보고서 + 보드.

---

## Operating Rules (모든 phase에 적용)

1. **Variant 보존** — 기존 prototype 보드 삭제 0건. 새 보드는 독립 grid section에 추가.
2. **Production source 변경은 명시적 phase에서만** — Phase 6 외에는 production touch 금지.
3. **token > class > inline style** 우선순위.
4. **light-only 또는 light + 명시 dark exception** 한 가지 결정 후 일관 유지.
5. **wave 단위로 닫기** — wave 끝나면 통합 + QA + 문서 갱신 후 다음 wave.
6. **병렬 에이전트는 LEAF 파일만** — SHARED 파일은 메인이 직렬 처리.
7. **에이전트 결과는 가설** — 실제 변경 grep + tsc + QA로 검증.
8. **컴포넌트 생성 ≠ 통합** — 신규 컴포넌트는 caller 측 import + render까지 같은 PR로.
9. **불가능한 시나리오에 방어 코드 작성 금지** — 시스템 경계에서만 검증.
10. **task doc / inventory의 체크박스가 모두 ✅이기 전까지 phase 종료 금지**.

---

## Anti-patterns (감지 시 즉시 수정)

- 한쪽 색상 보더 카드 강조 (`border-l-4 border-blue-...`) → 전체 border + bg subtle
- `transition-all` → `transition-colors` / `transition-transform` / `transition-[width]`
- 컬러만으로 정보 전달 → 컬러 + 아이콘/텍스트/배지 병행
- 인터랙티브 요소 < 44x44px
- icon button 누락 `aria-label`
- modal 누락 `role="dialog"` + `aria-modal="true"` + ESC + focus trap
- placeholder만으로 라벨 대체 (label/htmlFor 누락)
- 같은 이름 글로벌 const 중복 선언 (babel standalone 충돌)
- 모듈에 자체 정의 helper(`ComponentSwatch` 등)를 prefix 없이 두기

---

## Failure modes + recovery

| 증상 | 진단 | 복구 |
|---|---|---|
| `X is not defined` (mount fail) | 글로벌 const 충돌 또는 export 이름 불일치 | perl/sed로 prefix rename + HTML caller 동기 |
| `Cannot read properties of undefined (toLocaleString)` | 같은 이름 컴포넌트가 다른 prop signature로 덮임 | 신규 컴포넌트를 모듈 prefix로 이름 변경 |
| sectionCount = 0 | React mount block (보통 SyntaxError) | 콘솔 에러 첫 줄 보고 그 jsx 파일 수정 |
| ID schema violations > 0 | typo 또는 새 enum 추가 미반영 | schema spec doc 업데이트 + audit 재실행 |
| color compliance 급락 | sweep codemod가 의도된 raw 값 (브랜드 컬러)도 변환 | SKIP_LINE_PATTERNS 보강 후 재실행 |
| duplicate slots > 0 | 같은 ID를 여러 곳에서 import | grep으로 중복 위치 찾고 한 곳만 남김 |

---

## Wave-by-wave 진행 cadence (참고)

```
Phase 0 — 정찰              (1~2시간)
Phase 1 — schema spec         (1~2시간)
Phase 2 — POC 2 모듈           (4~6시간)
Phase 3 — wave A (3 모듈, 병렬) (3~4시간)
Phase 4 — integration A        (1시간)
Phase 3 — wave B (4 모듈, 병렬) (3~4시간)
Phase 4 — integration B        (1시간)
... (wave C/D/E)
Phase 5 — token sweep          (1시간)
Phase 6 — primitive 추출 (5 병렬) (2~3시간)
Phase 7 — audit + docs         (2~3시간)
```

병렬 에이전트가 wave당 4~8명이면 single LLM이 dispatch + 통합 + QA를 모두 메인 컨텍스트에서 처리 가능.

---

## How to use this prompt

### 옵션 A — 단일 prompt로 LLM에 던지기

1. 위 placeholder를 모두 채운다.
2. 전체 텍스트를 LLM에게 전달.
3. LLM이 Phase 0부터 7까지 순차 진행. 각 phase 끝마다 결과 검토 + go/no-go.

### 옵션 B — Phase별 분할 prompt

각 Phase 헤더 + 관련 placeholder만 발췌해서 turn별로 LLM에 전달. 컨텍스트 절약.

### 옵션 C — 에이전트 + 마스터 통합

- **메인 (orchestrator) LLM**: 이 마스터 프롬프트로 운영.
- **서브 에이전트**: Phase 3·6의 병렬 작업을 위임. 각 에이전트에게는 본 프롬프트의 "에이전트 프롬프트 템플릿" 부분만 전달.

---

## 산출물 chain (전 단계 끝나면 이런 게 남는다)

```
<prototype-system>/
  README.md                              # current state + docs index
  RECON_REPORT.md                        # phase 0
  PROTOTYPE_ID_SCHEMA.md                 # phase 1
  PROTOTYPE_INVENTORY.md                 # phase 2 (wave 별 갱신)
  ROUTE_OWNERSHIP_MANIFEST.md            # 부수 결정
  BOTTOM_NAV_CONTRACT.md                 # 부수 결정
  TOKEN_ALIGNMENT_PLAN.md                # 부수 결정
  COMPONENT_EXTRACTION_PLAN.md           # phase 6 spec
  PROTOTYPE_AUDIT_FIX{N}.md              # phase 7 (라운드별)
  DESIGN_QA_FIX{N}.md                    # phase 7 (라운드별)

<prototype-root>/lib/
  screens-grid-m01.<ext> ~ m{N}.<ext>    # phase 2·3 산출물
  screens-audit.<ext>                    # phase 7 audit summary 보드

scripts/qa/
  <prototype>-fix{N}-full-qa.mjs         # phase 4·7 QA script
  <prototype>-audit.mjs                  # phase 7 audit script
  <prototype>-token-sweep.mjs            # phase 5 codemod

apps/<frontend>/src/components/ui/
  number-display.tsx + test
  filter-chip.tsx + test
  money-row.tsx + test
  stat-bar.tsx + test
  metric-stat.tsx + test
  ... (5+ primitive)

output/playwright/
  <prototype>-fix{N}-full-qa.json
  <prototype>-fix{N}-audit.json
  <prototype>-fix{N}-{board-id}.png      # 대표 스크린샷
```

---

## Verification gates (phase 종료 시 확인)

| Phase | Gate |
|---|---|
| 0 | RECON_REPORT 작성 + route count 정확 |
| 1 | ID_SCHEMA doc 작성 + regex 정의 |
| 2 | POC 2 모듈 보드 + ID violations=0 + 시각 검증 |
| 3 | wave 모듈 보드 모두 export + LEAF 파일 충돌 없음 |
| 4 | integration QA pass (sections/artboards/violations/duplicates/errors 모두 ✓) |
| 5 | token sweep 후 color compliance 상승 + 시각 회귀 0 |
| 6 | 5 primitive + tests + tsc/test 통과 + caller-ready |
| 7 | audit 게이트 (Pass ≥ 14 / 18 metric) + 4 질문 답변 + docs 갱신 |

---

## Adaptation notes (다른 프로젝트로 이식 시)

- **모바일 앱 (React Native / SwiftUI / Flutter)**: viewport는 `mb`만 활용 (tb/dt 생략) 또는 디바이스 타입(`iphone-se` / `iphone-pro` / `ipad`)으로 조정.
- **Desktop-only SaaS**: viewport는 `dt`만, mobile/tablet 의도적 0으로 명시. M17·M18 패턴 (admin/desktop dominant)이 그대로 적용.
- **데이터 시각화 heavy**: kind enum에 `chart` / `dashboard` 추가. assets enum에 `chart-tokens` 추가.
- **결제/거래 heavy**: state enum에 `escrow-held` / `dispute-filed` / `refunded` 추가. flow에 `checkout` / `refund` / `dispute` sub key.
- **다국어**: 각 모듈 assets 보드에 `i18n` sub asset (해요체/합니다체 일관성, 카피 길이 변형 — `ko-long` / `en-fallback`).
- **a11y 강조 프로젝트**: audit script에 `@axe-core/playwright` 통합. critical/serious 0 게이트 추가.
- **다크모드 지원 프로젝트**: `THEME_MODE: both`, dark exception scope 명확히. 보드마다 `mb-{kind}` + `mb-{kind}-dark` 변형. components/assets 보드도 light/dark 양쪽.

---

## Closing

이 프롬프트는 단일 산출물(`Teameet Design.html`처럼) 또는 멀티 파일 prototype에 모두 적용 가능하다. 핵심 가치는:

1. **결정적 식별자** — 개발자가 보드 ID 하나로 화면을 즉시 찾는다.
2. **의무 grid** — 누락 화면을 audit으로 탐지한다.
3. **Token-first** — 디자인 시스템 일관성을 자동 측정한다.
4. **Wave + 병렬** — 큰 prototype도 단일 LLM 컨텍스트로 가능.
5. **prototype → production primitive 다리** — 추출 plan + 5 primitive로 즉시 개발 가능.

이 prompt를 다른 프로젝트에 적용 시:
1. `Required inputs` 채우기.
2. `MODULE_LIST`를 그 프로젝트의 IA에 맞게 작성.
3. Phase 0부터 진행. 각 phase 끝에 사용자 확인.
4. wave 운영은 LLM/에이전트 capability에 맞게 조정.

성공 신호: **개발자가 prototype URL 하나로 "내일 시작 가능"이라고 판단**한다.
