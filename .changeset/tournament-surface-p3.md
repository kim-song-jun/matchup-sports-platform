---
'v1_api': patch
---

남은 대회 단건 조회 23곳을 표면 헬퍼로 이관 — 원시 호출 baseline 0

리그를 의도적으로 허용하는 자리(설정 축)는 baseline 주석이 아니라 호출부의
`ALL_COMPETITION_KINDS` 로 코드에 명시한다. 이제 `v1Tournament` 단건 조회는
전부 `findTournamentOnSurface(OrThrow)` 를 거치고, 새 원시 호출은 CI 가 막는다.

행이 없을 때 던지지 않고 조용히 기본값으로 가는 자리 3곳을
`docs/ops/read-swap-preflight.md` 에 목록으로 남긴다 — 화면 전환이 리그를 그 경로로
보내면 에러 없이 기능이 사라지는 자리다.
