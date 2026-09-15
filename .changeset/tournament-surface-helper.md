---
'v1_api': patch
---

대회 단건 조회에 공용 표면 헬퍼 도입 + 원시 호출 래칫

`findTournamentOnSurface(OrThrow)` 하나로 대회 단건 조회의 종류 조건을 통일한다.
허용 종류가 필수 인자라 호출부가 생각 없이 지나갈 수 없고, 호출부 `where` 는 `AND` 로
감싸 기존 `OR` 을 덮지 않는다. 원시 `v1Tournament.findUnique/findFirst` 호출 수는
파일별 baseline(49 → 43)으로 묶어 CI 에서 늘지 못하게 한다 — 줄었는데 baseline 이
그대로여도 실패한다.

`assertLeagueGroupShape` 가 `format` 만 보던 것을 `kind` 도 함께 보도록 고친다.
통합 백필은 `format` 을 쓰지 않아 스키마 기본값 `group_knockout` 이 들어가므로,
정규 리그 시즌에서 이 가드는 지금까지 예외 없이 no-op 이었다. `kind = null`(마이그레이션
이전 행)은 리그로 취급하지 않는다.
