---
"v1_api": patch
---

alpha 배포마다 재시딩되는 QA 대회 시더가 자기 자신의 고정 대회 ID를 삭제하기 전에, 그 대회의 대진에 연결된 Game 그래프를 먼저 정리하도록 고쳤다. `fixture-game-backfill`을 운영에서 돌린 뒤로 `v1_games_tournament_fixture_id_fkey`(의도적으로 `Restrict`) 위반으로 매 alpha 배포가 실패하던 문제를 해결한다. Game의 결과가 DRAFT에 머물러 있으면 참가자·에스컬레이션·결정까지 함께 정리하고, DRAFT를 벗어나 OFFICIAL까지 확정된 Game이나 append-only인 팀 기록(V1TeamRecordFact)이 이미 붙은 Game은 여전히(그리고 앞으로도) 삭제할 수 없다 — 그 경우 시더는 아무것도 지우지 않고 명확한 에러로 실패한다.
