# Design QA Fix27

## 기준

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix27`
- Prototype file: `sports-platform/project/Teameet Design.html`
- Mode: light-only
- Admin exception: desktop/sidebar panel only uses dark surface
- Rendered sections: `32`
- Rendered artboards: `326`

## 이번 검수 범위

`fix27`은 개발 착수 결정 4종을 prototype에 보드로 고정한 라운드다.

- `00m · 개발 핸드오프 II — Routes / Nav / Tokens / Components` 신규 섹션 추가
- `dev-route-manifest`: 101개 source route ↔ prototype 모듈 매핑
- `dev-bottom-nav`: source canonical 5탭 (`home/matches/teams/marketplace/more`) 결정
- `dev-token-alignment`: blue-600 / grey→gray / type / control / motion 정렬
- `dev-component-extraction`: NumberDisplay → FilterChip → MoneyRow → StatBar → MetricStat 추출 순서
- `dev-page-priority`: 91개 매핑 route를 wave 2~5로 분배, future scope 7건 분리

## 자동 검수 결과

```json
{
  "pass": true,
  "sectionCount": 32,
  "artboardCount": 326,
  "has00k": true,
  "has00l": true,
  "has00m": true,
  "devHandoff1Boards": 4,
  "devHandoff2Boards": 5,
  "duplicateSlots": 0,
  "darkSlots": 0,
  "tmButtonCount": 308,
  "tmChipCount": 524,
  "tmPressableCount": 611,
  "pageErrors": 0,
  "unexpectedConsole": 0,
  "suspiciousCount": 0,
  "screenshots": 5
}
```

## Screenshot Artifacts

- `output/playwright/teameet-design-fix27-dev-route-manifest.png`
- `output/playwright/teameet-design-fix27-dev-bottom-nav.png`
- `output/playwright/teameet-design-fix27-dev-token-alignment.png`
- `output/playwright/teameet-design-fix27-dev-component-extraction.png`
- `output/playwright/teameet-design-fix27-dev-page-priority.png`

## QA Artifact

- `output/playwright/teameet-design-fix27-full-qa.json`

## QA Script

- `scripts/qa/teameet-design-fix27-full-qa.mjs` (Playwright 1.58.2 + chromium headless)

## Section / Artboard Diff (fix26 → fix27)

| Item | fix26 | fix27 | Δ |
|---|---|---|---|
| sections | 31 | 32 | +1 (`00m · 개발 핸드오프 II`) |
| artboards | 321 | 326 | +5 (manifest / nav / token / component / priority) |
| `00l` boards | 4 | 4 | -- |
| `00m` boards | 0 | 5 | +5 |
| `tm-btn` | 308 | 308 | -- |
| `tm-chip` | 524 | 524 | -- |
| `tm-pressable` | 611 | 611 | -- |
| dark slots | 0 | 0 | -- |
| duplicate slots | 0 | 0 | -- |

## 결정 요약

1. **Bottom nav canonical = source 5 tab** (`home/matches/teams/marketplace/more`).
2. **Blue scale**: prototype `blue-600 #2272eb` → source `#1B64DA`로 흡수. blue-200/400, blue-alpha-08/10은 source에 신규 추가.
3. **Grey→Gray rename**: prototype 토큰을 일괄 `gray-*`로 rename하되, gray-150 (`#EAEDF0`)은 source에 신규 추가.
4. **Control tokens**: `--control-sm/md/lg/xl/icon`을 source globals.css에 추가.
5. **Component extraction order**: NumberDisplay → FilterChip → MoneyRow → StatBar → MetricStat. 각 1 PR + 첫 caller migration.

## 보존된 것 (사용자 지시)

- 기존 variant artboard 모두 살아 있음 — 326개 중 부족한 것 없음.
- light-only 기준 유지 — `darkSlots = 0`.
- Admin sidebar dark panel 예외 유지.
- production 코드 변경 없음 — prototype만 갱신.

## 후속 작업 (production-side)

- [ ] globals.css 보강 PR — blue-200/400, gray-150, control-*, ease-out-*, semantic-50 추가.
- [ ] NumberDisplay primitive PR + 첫 caller migration (`/admin/statistics`).
- [ ] FilterChip primitive PR + 첫 caller migration (`/marketplace`).
- [ ] MoneyRow primitive PR + 첫 caller migration (`/payments/[id]`).
- [ ] StatBar primitive PR + 첫 caller migration (`/team-matches/[id]/evaluate`).
- [ ] MetricStat primitive PR + KpiCard 내부 정렬 + admin 회귀 smoke.
