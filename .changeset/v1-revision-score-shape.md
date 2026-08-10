---
"v1_api": patch
---

공개 경로가 결과 리비전의 두 가지 `score` JSON 형태를 모두 읽게 한다.

`v1_game_result_revisions.score` 에는 서로 호환되지 않는 두 형태가 공존한다 — 실시간 결과 확정 경로는 평평한 `{home, away}` 를, 레거시 결과 백필은 `{regulation: {home, away}, penalty, goals, incomplete, provenance}` 를 같은 컬럼에 쓴다. 리더가 평평한 형태만 인식해, 백필로 넘어온 완료 경기가 전부 `scoreStatus: 'unavailable'` 로 보였다(알파 실측 21경기).

저장된 값을 마이그레이션으로 통일하는 대신 리더가 양쪽을 받아주게 했다 — 이미 두 형태가 공존하는 이력 데이터라 이쪽이 안전하다. 통일은 별도 과제로 남긴다. `regulation` 이 명시적으로 null 인 경우(스코어 미기록)는 점수를 지어내지 않는다.
