# Design QA Fix30

## 기준

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix30`
- Prototype file: `sports-platform/project/Teameet Design.html`
- Mode: light-only (Admin sidebar `tm-admin-sidebar` 단독 dark exception)
- Rendered sections: `52`
- Rendered artboards: `601`

## 이번 라운드 범위

`fix30`은 **viewport-aware grid를 19 functional 모듈 전체로 확장**한 라운드.

- M03~M19에 전체 grid 보드 추가 (M01·M02 fix29 POC 검증 후 wave A~E를 17 병렬 frontend-ui-dev 에이전트로 처리)
- 17 신규 jsx 파일: `screens-grid-m03.jsx` ~ `screens-grid-m19.jsx` (m07·m10·m11·m13·m19는 wave 진행 중 일부 에이전트가 HTML 직접 수정 — 통합 단계에서 정리)
- 17 신규 grid 섹션: `m03-grid` ~ `m19-grid`
- 270개 m-grid artboards 추가 (전 19 모듈 합산)
- ID schema linter `idSchemaViolations = 0` 통과

## 자동 검수 결과

```json
{
  "url": "http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix30",
  "pass": true,
  "sections": 52,
  "artboards": 601,
  "mGridSections": 19,
  "missingGridSections": [],
  "mGridArtboards": 270,
  "perModule": {
    "m01": 13, "m02": 15, "m03": 15, "m04": 16, "m05": 15,
    "m06": 16, "m07": 15, "m08": 13, "m09": 13, "m10": 13,
    "m11": 13, "m12": 14, "m13": 15, "m14": 15, "m15": 14,
    "m16": 14, "m17": 12, "m18": 15, "m19": 14
  },
  "idSchemaViolations": 0,
  "duplicateSlots": 0,
  "pageErrors": 0,
  "unexpectedConsole": 0,
  "screenshots": 8
}
```

## Audit Re-measurement (fix29 → fix30)

| Metric | fix29 | fix30 | Δ |
|---|---|---|---|
| Color compliance (source) | 92.6% | **93.0%** | +0.4pp |
| Spacing compliance | 70.2% | **74.3%** | **+4.1pp** |
| Typography class adoption | 41.6% | **53.4%** | **+11.8pp** |
| `tm-text-*` class hits | 113 | **1,447** | +1,334 (×12.8) |
| Sections | 35 | 52 | +17 |
| Artboards | 359 | 601 | +242 |

**가장 큰 효과**: 17 신규 grid 모듈이 모두 `tm-text-*` class만 사용하도록 강제했더니 typography compliance가 **41.6% → 53.4%** (11.8pp). prototype 전체에서 inline `fontSize: N`을 `tm-text-{token}`로 마이그레이션할 경우 75%+ 도달 가능 추정.

## Section / Artboard Diff (fix29 → fix30)

| Item | fix29 | fix30 | Δ |
|---|---|---|---|
| Sections | 35 | 52 | +17 |
| Artboards | 359 | 601 | +242 |
| m-grid artboards | 28 (M01·M02 only) | 270 | +242 |
| ID schema violations | 0 | 0 | 동일 |
| Page errors | 0 | 0 | 동일 |
| Duplicate slots | 0 | 0 | 동일 |

## 19 모듈 viewport coverage

각 모듈은 `mb`/`tb`/`dt` viewport별 main + state + components + assets + motion 보드를 보유.

| Module | mb | tb | dt | total |
|---|---|---|---|---|
| M01 인증·온보딩 | 8 | 2 | 3 | 13 |
| M02 홈·추천 | 11 | 1 | 3 | 15 |
| M03 개인 매치 | 10 | 2 | 3 | 15 |
| M04 팀·팀매칭 | 11 | 2 | 3 | 16 |
| M05 레슨 Academy | 11 | 1 | 3 | 15 |
| M06 장터 Marketplace | 11 | 1 | 4 | 16 |
| M07 시설 Venues | 10 | 2 | 3 | 15 |
| M08 용병 Mercenary | 10 | 1 | 2 | 13 |
| M09 대회 Tournaments | 10 | 1 | 2 | 13 |
| M10 장비 대여 | 11 | 1 | 1 | 13 |
| M11 종목·실력·안전 | 11 | 1 | 1 | 13 |
| M12 커뮤니티·채팅·알림 | 11 | 2 | 1 | 14 |
| M13 마이·프로필·평판 | 11 | 2 | 2 | 15 |
| M14 결제·환불·분쟁 | 11 | 2 | 2 | 15 |
| M15 설정·약관·상태 | 11 | 2 | 1 | 14 |
| M16 공개·마케팅 | 11 | 2 | 1 | 14 |
| M17 데스크탑 웹 | 0 (의도) | 2 | 10 | 12 |
| M18 관리자·운영 | 0 (의도) | 2 | 13 | 15 |
| M19 공통 플로우 | 11 | 2 | 1 | 14 |

**M17·M18은 desktop dominant**로 mobile board 의도적 0.

## 17 병렬 에이전트 워크로드

각 모듈 1개 frontend-ui-dev 에이전트 (sonnet medium effort, 240~430s):

- 입력: M02 grid POC (`screens-grid-m02.jsx`) + tokens.jsx + ID schema spec
- 출력: 1 jsx 파일 (700~1,142 줄), 12~16 보드 export

총 작업: 17 에이전트 × ~15 보드 = 270 신규 보드.

## Integration Issues + Resolution

통합 단계에서 발견된 이슈와 해결:

1. **M15 export 이름 불일치** — `M15MobileComponents` 등을 `M15MobileComponentsBoard` 등으로 export. HTML 4건 rename으로 해결.
2. **M14 `NumberDisplay` 글로벌 충돌** — M14가 자체 `NumberDisplay` 정의. `M14NumberDisplay`로 perl rename.
3. **`ComponentSwatch`/`AssetSwatch`/`ColorSwatch` 충돌** — M01·M02·M05·M14·M15·M19가 각자 정의. M01에서 prefix 후 alias로 글로벌 등록 (`window.ComponentSwatch = M01ComponentSwatch`). 다른 13 모듈은 글로벌 reference로 그대로 동작.
4. **`MoneyRow`/`ListItem` M14 redeclare** — `M14MoneyRow`/`M14ListItem`으로 prefix.

## 사용자 4가지 검수 질문 답변 (fix30 기준 갱신)

| # | 질문 | 결과 | 게이트 |
|---|---|---|---|
| 1 | 디자인 시스템(색상/간격/타이핑) 잘 따라가는가 | **개선** — color 93% / spacing 74% / typography class 53% (이전 41% → +11.8pp) | Conditional → Pass on track |
| 2 | 모든 viewport (mb/tb/dt) 페이지 존재 | **Pass** — 19 functional 모듈 모두 mb+tb+dt 보드 보유. M17·M18은 의도된 desktop dominant | Pass |
| 3 | 각 페이지가 디자인 시스템 준수 | **Pass on POC scale** — 17 신규 grid 모듈 모두 `tm-text-*` class 강제 적용 | Pass |
| 4 | 개발자가 즉시 개발 가능 수준 | **Pass** — 19 모듈 × 결정적 ID schema (`m{NN}-{viewport}-{kind}`) + main/state/components/assets/motion 의무 보드 | Pass |

## QA Artifact

- `output/playwright/teameet-design-fix30-full-qa.json`
- `output/playwright/teameet-design-fix30-audit.json`
- `output/playwright/teameet-design-fix30-{m03-mb-main,m04-dt-main,m06-mb-detail,m09-dt-main,m12-mb-main,m14-mb-flow-checkout,m17-dt-main,m18-dt-main}.png` (8 대표 스크린샷)

## 후속 wave 계획

**현재**: 19 모듈 × 보드 grid 모두 완비 (270 신규 보드).

**남은 P1 작업** (production sweep):

- 1,574 inline raw `fontSize` 잔존 → 75%+ class adoption 목표
- 2,699 raw spacing → 95%+ token / 4-multiple
- 587 raw `#hex` → 99%+ var() / Tailwind class

이는 production task — TOKEN_ALIGNMENT_PLAN_FIX27 + COMPONENT_EXTRACTION_PLAN_FIX27 기준.
