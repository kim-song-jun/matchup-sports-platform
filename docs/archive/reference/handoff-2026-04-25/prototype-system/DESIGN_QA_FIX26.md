# Design QA Fix26

## 기준

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix26`
- Prototype file: `sports-platform/project/Teameet Design.html`
- Mode: light-only
- Admin exception: desktop/sidebar panel only uses dark surface
- Rendered sections: `31`
- Rendered artboards: `321`

## 이번 검수 범위

`fix26`은 개발 착수용 handoff를 추가한 라운드다.

- `00l · 개발 핸드오프` 신규 섹션 추가
- `dev-token-map`: prototype token과 실제 앱 token migration 기준
- `dev-component-map`: production component extraction 순서와 props draft
- `dev-page-waves`: route ownership, page migration wave, future scope 분리
- `dev-qa-gates`: prototype QA와 production migration QA 분리
- 에이전트 감사 결과를 token/component/page/QA gate에 반영

## 자동 검수 결과

```json
{
  "pass": true,
  "sectionCount": 31,
  "artboardCount": 321,
  "has00k": true,
  "has00l": true,
  "devHandoffBoards": 4,
  "duplicateSlots": 0,
  "darkSlots": 0,
  "tmButtonCount": 308,
  "tmChipCount": 524,
  "tmPressableCount": 611,
  "pageErrors": 0,
  "unexpectedConsole": 0,
  "suspiciousCount": 0,
  "screenshots": 6
}
```

## Screenshot Artifacts

- `output/playwright/teameet-design-fix26-dev-token-map.png`
- `output/playwright/teameet-design-fix26-dev-component-map.png`
- `output/playwright/teameet-design-fix26-dev-page-waves.png`
- `output/playwright/teameet-design-fix26-dev-qa-gates.png`
- `output/playwright/teameet-design-fix26-system-handoff.png`
- `output/playwright/teameet-design-fix26-documentation-hub.png`

## QA Artifact

- `output/playwright/teameet-design-fix26-full-qa.json`

## 개발 착수 전 남은 결정

1. Bottom nav canonical contract
   - prototype: `home / matches / lessons / marketplace / my`
   - source: `home / matches / teams / marketplace / more`
2. Route ownership manifest
   - 실제 `apps/web/src/app`의 101개 page route를 `01~18/19` module에 고정
3. Token naming
   - prototype `grey-*`를 production `gray-*`로 수렴
   - `blue600` 값 차이 결정
4. Component extraction
   - `NumberDisplay`, `MoneyRow`, `MetricStat`, `FilterChip`, `StatBar` 우선
5. Future scope 분리
   - `/rentals/*`, `/sports`, `/profile/edit`, `/venues/[id]/schedule`, `/admin/tournaments`, `/admin/reports`, `/my`
