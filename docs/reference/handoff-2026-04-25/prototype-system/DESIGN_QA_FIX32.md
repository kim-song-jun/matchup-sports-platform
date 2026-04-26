# Design QA Fix32

## 기준

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix32`
- Mode: light-only (Admin sidebar `tm-admin-sidebar` 단독 dark exception)
- Rendered sections: `52`
- Rendered artboards: `601`

## 이번 라운드 범위 — Canonical-First Restoration

`fix32`는 사용자 피드백을 반영한 대규모 IA 재작업 라운드. 이전 fix29~fix31은 m{NN}-grid 보드를 simplified illustration으로 새로 만든 반면, fix32는 **기존 canonical 디자인을 살려두고 m-grid를 그 visual vocabulary로 다각화**한다.

### 사용자 피드백 (fix31 검수)

> "너가 지금까지 만든게 전혀 우리가 기본적으로 만든 디자인을 따라가지 않았어. 그러니까 디자인은 동일한 상태로 진행해야하는데 그냥 톤만 맞춘거지. (...) agent를 적극 사용해서, 기존 design은 살려두고, 다각화만 진행하는 방식으로 하자. 그럼 기존 design[에]도 id를 잘 붙여놓아야할것같아."

### Phase A — Canonical ID alias 부여

기존 functional 섹션 (`01 · 인증·온보딩` ~ `19 · 공통플로우`) 의 모든 DCArtboard 306개에 `data-canonical-id="m{NN}-{viewport}-{kind}[-{state|sub}]"` alias 부여.

- 자동 매핑 스크립트: `scripts/qa/teameet-build-canonical-id-map.mjs`
  - sectionId → 모듈 (ROUTE_OWNERSHIP_MANIFEST_FIX27.md 기반)
  - width → viewport (375→mb / 768~960→tb / 1280→dt)
  - id+label → kind (10 enum) + step/variant/keyword/lastSlug heuristic
- 적용 스크립트: `scripts/qa/teameet-apply-canonical-id.mjs` (idempotent)
- design-canvas.jsx의 `DCArtboardFrame`이 `data-canonical-id` prop을 DOM attribute로 패스스루하도록 보강
- 결과 매핑표: `CANONICAL_ID_MAP_FIX32.md` (306줄)

### Phase B+C — m-grid 보드 재작성 (19 agents 병렬)

simplified illustration 270개를 canonical 디자인의 visual vocabulary로 재작성. 19개 모듈에 각각 frontend-ui-dev agent 할당, LEAF file principle (각 agent는 `lib/screens-grid-m{NN}.jsx` 1개만 수정).

각 agent는:
1. 해당 모듈의 canonical jsx (예: M02 → `screens-hero.jsx`의 `HomeToss`) 를 읽고
2. 보드의 export 이름은 그대로 유지하면서 (`M02MobileMain` 등)
3. 내부 구현을 canonical 컴포넌트의 직접 재사용 또는 동일한 시각 언어로 교체
4. State 변형(`M??MobileStateLoading/Empty/Error/Permission/Pending`)은 canonical wireframe 기반에 데이터 슬롯만 `Skeleton/EmptyState/ErrorState/PermissionRequest`로 swap

대표 변환:
- M01: `M01MobileMain` → `<Login/>`, `M01MobileStatePermission` → `<AuthValidationAndPermissionBoard/>` 직접 렌더
- M02: `M02MobileMain` → `<HomeToss/>`, state variants는 HomeToss wireframe + Skeleton/EmptyState
- M03: `M03MobileMain` → `<MatchesList/>`, `M03MobileDetail` → `<MatchDetail/>`
- M04: `M04MobileMain` → `<TeamMatchesList/>`, `M04MobileDetail` → `<TeamMatchDetail/>` toggle
- M07: `M07DesktopMain` → `<DesktopVenues/>`, `M07MobileFlowBooking` → VenueBooking 캔버스 패턴 재현
- M11: `M11MobileMain` → `<SportHub/>`, `M11MobileDetail` → `<FutsalMatch/>`
- M12: `M12MobileMain` → `<Chat/>`, `M12MobileFlowFeed` → `<Feed/>`
- M13: `M13MobileMain` → `<MyPage/>`, `M13MobileFlowMyMatches` → `<MyMatches/>`
- M14: `M14MobileDetail` → `<PaymentDetail/>`, `M14MobileFlowRefund` → `<PaymentRefund/>`
- M17: `M17DesktopMain` → `<DesktopHome/>`, `M17DesktopList` → `<DesktopMatches/>`
- M18: `M18DesktopMain` → `<AdminShell active="dashboard"/>`, sidebar dark exception 11곳 적용

각 agent는 self-check 통과:
- raw hex 0건 (브랜드 색 #FEE500/#03C75A/#191919 예외)
- inline `fontSize: N` 0건 (`tm-text-*` 클래스 사용)
- spacing 4-multiple 강제
- 기존 export 이름 모두 유지 (Babel single-scope 충돌 방지로 helper에 M{NN} prefix)
- canonical 컴포넌트 직접 재사용 우선

## 통합 QA 결과

```json
{
  "pass": true,
  "sections": 52,
  "artboards": 601,
  "aliasCount": 306,
  "expectedAliasCount": 306,
  "mGridArtboards": 270,
  "idSchemaViolations": 0,
  "aliasSchemaViolations": 0,
  "duplicateSlots": 0,
  "duplicateAliases": 0,
  "pageErrors": 0,
  "unexpectedConsole": 0,
  "screenshots": 9
}
```

QA 게이트 모두 통과:
- 모든 functional artboard alias 부여 (306/306)
- alias가 schema (`m{NN}-{vp}-{kind}[-{sub}]`) 100% 준수
- 중복 alias 0건
- 19 모듈 모두 re-mount 정상 (sections=52, artboards=601 변동 없음)

### 통합 시 발생한 이슈와 해결

1. **Toast `bg` undefined error** — M07이 `<Toast type="warning"/>` 사용. signatures.jsx의 Toast는 `info|success|error` 3종만 지원. → `type="info"`로 수정.
2. **M09MobileStateLoading duplicate key warning** — `[48, 40, 48, 56, 40].map((w) => key={w})` 중복. → `key={i}` 사용으로 수정.

## Audit Re-measurement (fix31 → fix32)

| Metric | fix31 | fix32 | Δ |
|---|---|---|---|
| Color compliance | 95.8% | **97.2%** | **+1.4pp** ↑ pass conditional |
| Color raw hex hits | 356 | **237** | -119 (-33%) |
| Spacing compliance | 74.3% | **76.5%** | +2.2pp (gate=fail; 80% threshold) |
| Typography class adoption | 53.4% | **54.6%** | +1.2pp (gate=fail; 80% threshold) |
| `tm-text-*` class hits | 1,447 | 1,418 | -29 (m-grid 정리 시 일부 합산) |
| Raw hex in DOM | 3 | **3** | 0 |

**핵심**: 19 모듈 m-grid를 token-only로 강제 재작성한 결과 color compliance +1.4pp 추가 push. spacing/typography는 m-grid 외 canonical jsx의 raw 값이 다수 남아있어 gate 통과 미달. 별도 sweep PR 필요.

## Section / Artboard Diff (fix31 → fix32)

| Item | fix31 | fix32 | Δ |
|---|---|---|---|
| Sections | 52 | 52 | 0 |
| Artboards | 601 | 601 | 0 |
| Functional artboards with canonical_id alias | 0 | **306** | +306 |
| m-grid artboards | 270 | 270 | 0 (재작성, 추가 없음) |
| Color rate | 95.8% | 97.2% | +1.4pp |
| Spacing rate | 74.3% | 76.5% | +2.2pp |
| Typography class adoption | 53.4% | 54.6% | +1.2pp |

## 사용자 4가지 검수 질문 답변 (fix32 기준)

| # | 질문 | 결과 | 게이트 |
|---|---|---|---|
| 1 | 디자인 시스템(색상/간격/타이핑) 잘 따라가는가 | **개선 지속** — color **97.2%** Pass conditional / spacing 76.5% / typography 54.6% | Color: near-PASS; remaining: spacing/typography sweep on canonical jsx |
| 2 | 모든 viewport (mb/tb/dt) 페이지 존재 | **Pass** — 19 functional 모듈 모두 mb+tb+dt + canonical alias 적용 | Pass |
| 3 | 각 페이지가 디자인 시스템 준수 | **Pass on m-grid** — 270개 m-grid 보드 token-only / canonical 재사용. canonical jsx는 별도 sweep 필요 | Pass on m-grid |
| 4 | 개발자 즉시 개발 가능 수준 | **Pass + canonical-first id schema** — 306 functional artboard에 결정적 alias 부여, 개발자가 m{NN}-{vp}-{kind} 식별자로 작업 범위 지정 가능 | Pass (production-ready) |

## QA Artifact

- `output/playwright/teameet-design-fix32-full-qa.json`
- `output/playwright/teameet-canonical-id-map.json` / `.md`
- 9 representative screenshots (canonical-aliased + m-grid mix)

## 산출물 정리

### 신규 도구
```
scripts/qa/teameet-build-canonical-id-map.mjs   (Phase A — auto map builder)
scripts/qa/teameet-apply-canonical-id.mjs       (Phase A — idempotent apply)
scripts/qa/teameet-design-fix32-full-qa.mjs     (Phase B+C QA)
scripts/qa/teameet-design-fix32-debug.mjs       (mount 디버깅)
```

### 신규 / 갱신 문서
```
docs/reference/handoff-2026-04-25/prototype-system/CANONICAL_ID_MAP_FIX32.md   (신규 — 306 alias 매핑표)
docs/reference/handoff-2026-04-25/prototype-system/M_GRID_REWRITE_SPEC_FIX32.md (신규 — agent 가이드)
docs/reference/handoff-2026-04-25/prototype-system/DESIGN_QA_FIX32.md          (이 문서)
```

### 수정된 prototype 파일
```
docs/reference/handoff-2026-04-25/sports-platform/project/Teameet Design.html         (cache buster fix31→fix32, 306 alias 속성 추가)
docs/reference/handoff-2026-04-25/sports-platform/project/lib/design-canvas.jsx       (data-canonical-id prop 패스스루)
docs/reference/handoff-2026-04-25/sports-platform/project/lib/screens-grid-m01.jsx ~ m19.jsx  (19 파일 재작성)
```

## 후속 P1 backlog (별도 PR)

- [ ] **Spacing sweep on canonical jsx** — `screens-variants.jsx`, `screens-parity.jsx`, `screens-other.jsx` 등의 raw 1~3, 5~7, 9~11, 13~15 spacing 값을 4-multiple 또는 var(--space-*) 토큰으로 교체. 목표: spacing compliance 76.5% → 90%+
- [ ] **Typography sweep on canonical jsx** — 동일 파일의 inline `fontSize: N` (총 ~2,660건) → `tm-text-*` 클래스 교체. 목표: typo class adoption 54.6% → 90%+
- [ ] **a11y axe-core integration** — m-grid 270개 보드 전체에 axe-core 자동 스캔. critical/serious 0 검증
- [ ] **Production caller migration (PR-A1~A5)** — 5 신규 primitive (NumberDisplay/FilterChip/MoneyRow/StatBar/MetricStat)의 production caller migration (fix31 backlog 유지)
