---
'v1_api': patch
---

승부차기를 새로 기록할 때 킥 수를 필수로 요구한다 (alpha 실측 결함 차단).

2026-08-18 alpha 실측: 킥 수 없이 `POST /games/:id/commands/end` 에
`penalties: { home: 1, away: 0 }` 만 실어 보내면 **HTTP 201 로 통과**했고, 원정이 한 번도
차지 않은 승부차기가 공식 결과가 되어 공개 관전자 화면(`scoreStatus: "official"`)까지
퍼졌다. 화면의 가드는 프런트에만 있어 이 경로를 전혀 막지 못했다.

`end` 레인에서 `penalties` 를 받으면 `takenHome`/`takenAway` 를 필수로 만든다
(없으면 422 `TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED`). 총점 두 개만으로는
"각 5킥 1:0"(정상)과 "홈 1킥 · 원정 0킥"(비정상)이 같은 값이라 서버가 구분할 수 없기
때문이다. 복구 레인은 면제한다 — 킥 수가 생기기 전에 저장된 리비전에는 그 값이 없어,
요구하면 옛 결과의 복구가 영구히 막힌다.
