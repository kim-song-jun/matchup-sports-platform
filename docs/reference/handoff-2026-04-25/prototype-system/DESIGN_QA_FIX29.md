# Design QA Fix29

## 기준

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix29`
- Prototype file: `sports-platform/project/Teameet Design.html`
- Mode: light-only
- Admin exception: desktop/sidebar panel only uses dark surface
- Rendered sections: `35`
- Rendered artboards: `359`

## 이번 검수 범위

`fix29`는 **viewport-aware ID schema 도입 + M01·M02 풀 grid POC** 라운드.

- `PROTOTYPE_ID_SCHEMA_FIX29.md` — 모든 보드 결정적 ID `m{NN}-{viewport}-{kind}[-{state|asset}]` 정의
- `PROTOTYPE_INVENTORY_FIX29.md` — 19 모듈 매핑 + obligation matrix
- 신규 섹션 2개:
  - `m01-grid · M01 인증·온보딩 viewport grid POC` — 13 보드
  - `m02-grid · M02 홈·추천 viewport grid POC` — 15 보드
- 신규 jsx 2개: `screens-grid-m01.jsx`, `screens-grid-m02.jsx`
- ID schema linter: audit script에 `idSchemaViolations` 필드 추가

## 자동 검수 결과

```json
{
  "url": "http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix29",
  "pass": true,
  "sections": 35,
  "artboards": 359,
  "m01Boards": 13,
  "m02Boards": 15,
  "idSchemaViolations": 0,
  "pageErrors": 0,
  "unexpectedConsole": 0,
  "screenshots": 13,
  "duplicateSlots": 0
}
```

## Audit 재측정

```json
{
  "color":      { "rate": 0.9256, "tokenHits": 5114, "rawHex": 411 },
  "spacing":    { "rate": 0.7020, "compliant": 4730, "rawNon4": 2008 },
  "typography": { "rate": 0.4276, "tmTextClass": 206, "rawFontSize": 2680, "fsTokenMatch": 1796 }
}
```

- typography class adoption **41.6% → 42.8%** (M01/M02 grid에서 tm-text-* 적극 사용으로 +143건)
- color **92.9% → 92.6%** (소셜 브랜드 컬러 raw 등 +31 hex)
- spacing **69.7% → 70.2%** (+0.5pp)

## Section / Artboard Diff (fix28 → fix29)

| Item | fix28 | fix29 | Δ |
|---|---|---|---|
| sections | 33 | 35 | +2 (`m01-grid`, `m02-grid`) |
| artboards | 331 | 359 | +28 (M01 13 + M02 15) |
| ID schema 보드 (m{NN}-*) | 0 | 28 | +28 |
| ID schema violations | -- | 0 | -- |
| pageErrors | 0 | 0 | -- |

## Screenshot Artifacts (대표 13개)

- M01: `teameet-design-fix29-m01-mb-main.png`, `m01-tb-main.png`, `m01-dt-main.png`, `m01-mb-state-error.png`, `m01-mb-components.png`, `m01-mb-assets.png`
- M02: `teameet-design-fix29-m02-mb-main.png`, `m02-tb-main.png`, `m02-dt-main.png`, `m02-mb-state-empty.png`, `m02-mb-state-loading.png`, `m02-mb-components.png`, `m02-mb-assets.png`

## QA Artifact

- `output/playwright/teameet-design-fix29-full-qa.json`
- `output/playwright/teameet-design-fix29-audit.json`

## QA Script

- `scripts/qa/teameet-design-fix29-full-qa.mjs` — fix29 prototype 무결성 + ID schema validation
- `scripts/qa/teameet-design-prototype-audit.mjs` — color/spacing/typography compliance + viewport coverage

## M01·M02 풀 grid 보드 목록

### M01 인증·온보딩 (13)

| ID | kind | viewport |
|---|---|---|
| `m01-mb-main` | main | mobile (375) |
| `m01-tb-main` | main | tablet (768) |
| `m01-dt-main` | main | desktop (1280) |
| `m01-mb-state-loading` | state · loading | mobile |
| `m01-mb-state-error` | state · error | mobile |
| `m01-mb-state-permission` | state · permission | mobile |
| `m01-mb-components` | components | mobile |
| `m01-tb-components` | components | tablet |
| `m01-dt-components` | components | desktop |
| `m01-mb-assets` | assets | mobile |
| `m01-tb-assets` | assets | tablet |
| `m01-dt-assets` | assets | desktop |
| `m01-mb-motion` | motion | mobile |

### M02 홈·추천 (15)

| ID | kind | viewport |
|---|---|---|
| `m02-mb-main` | main | mobile |
| `m02-tb-main` | main | tablet |
| `m02-dt-main` | main | desktop (3-col workspace) |
| `m02-mb-state-loading` | state · loading | mobile |
| `m02-mb-state-empty` | state · empty | mobile |
| `m02-mb-state-error` | state · error | mobile |
| `m02-mb-state-permission` | state · permission | mobile |
| `m02-mb-state-pending` | state · pending (stale rec) | mobile |
| `m02-mb-components` | components | mobile |
| `m02-tb-components` | components | tablet |
| `m02-dt-components` | components | desktop |
| `m02-mb-assets` | assets | mobile |
| `m02-tb-assets` | assets | tablet |
| `m02-dt-assets` | assets | desktop |
| `m02-mb-motion` | motion | mobile |

## 결정 요약

- **ID schema 채택**: `m{NN}-{viewport}-{kind}[-{state|asset}]`. 19 모듈 × 3 viewport × kind/state로 결정적 식별.
- **POC 모듈**: M01 + M02. 28 신규 보드. ID schema violation 0건 → schema 자체는 작동 검증 완료.
- **기존 보드 보존**: `auth-onboarding`, `home-discovery` 섹션 + 기존 보드 모두 유지. 새 grid 섹션은 별도 추가.
- **후속 wave 계획**: M03~M19에 같은 패턴 적용. wave A (M03·M04·M05) 우선.

## 후속 Wave 진입 조건

POC (M01·M02) 통과 확인:

- [x] ID schema violations = 0
- [x] 28 신규 보드 모두 렌더 무결성
- [x] tablet/desktop 보드가 mobile과 시각적 다른 IA 입증 (M02 dt-main = 3-col workspace, M01 dt-main = split hero)
- [x] components/assets 보드가 module별 사용 토큰/컴포넌트를 결정적으로 보여줌
- [ ] 사용자 OK → wave A (M03·M04·M05) 진입

## 후속 Wave 작업 분할

| Wave | 대상 모듈 | 신규 보드 (예상) |
|---|---|---|
| **POC** (현재) | M01 + M02 | 28 ✓ |
| Wave A | M03·M04·M05 | ~30 |
| Wave B | M06·M07·M08·M09 | ~40 |
| Wave C | M10·M11·M12·M13 | ~40 |
| Wave D | M14·M15·M16 | ~30 |
| Wave E | M17·M18·M19 | ~25 |

전체 = ~193 신규 보드. fix29 = 359 → wave E 완료 시 ~552 보드.
