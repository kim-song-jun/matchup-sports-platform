---
'v1_api': minor
'v1_web': minor
---

개인 기록에도 리그/대회/친선 구분을 넣는다 (Task 166 BE-4).

정본 §5. `GET /users/:id/records` 에 `?type=league|tournament|friendly` 필터와
`summary.byType` 4분면을 더하고, 개인 기록 화면에 팀 전적과 같은 4탭을 붙인다.

`type` 없이 부르면 **기존 필드는 값·모양 그대로**이고 `summary.byType` 같은 가산 필드만
더해지므로 기존 클라이언트는 무변경이다. 화면 어휘(탭·라벨·빈 상태)는 팀 전적과 공유한다.
