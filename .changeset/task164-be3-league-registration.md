---
'v1_api': minor
---

정규 리그 참가 신청을 대회 신청 스택으로 연다 (Task 164 BE-3, D7).

- 등록 스택 조회 8곳을 `ALL_COMPETITION_KINDS` 로 넓혀 리그 거울이 신청·확정 경로에 보이게 한다. 이전엔 리그 id 로 신청하면 404 였다.
- 정원은 리그에서 끈다. `V1Tournament.teamCount` 가 이름과 달리 정원 역할을 하는데 리그 거울엔 스키마 기본값 8 이 박혀 있어, 그대로 두면 9번째 팀부터 신청과 어드민 확정이 409 로 막힌다. `capacityLimitOf` 한 곳으로 다섯 자리를 지나게 했다.
- `POST /admin/league-matches/:leagueId/open-registration` — 거울에 `status='open'` + `registrationDeadlineAt`. 리그 축 `state` 는 `draft` 로 남는다.
- 로스터를 만드는 다섯 경로(리그 생성·팀 추가·시즌 시드·승계·신청 확정)가 전부 짝이 되는 `confirmed` 등록을 만든다. 승계는 `entrySource='promoted'`.
