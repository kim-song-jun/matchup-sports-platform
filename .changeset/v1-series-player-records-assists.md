---
"v1_api": patch
"v1_web": patch
---

리그(team-match-series) 공개 개인 기록 `GET /team-match-series/:seriesId/player-records`에
어시스트 순위를 되살린다. 이 필드는 어시스트 기록(T1, `V1GameResultParticipant.assists`)이
아직 스키마에 없던 시점에 별도 트랙(T4)에서 임시로 빠졌던 것으로, 두 트랙이 `dev`에 합쳐진
지금은 득점 집계와 동일한 방식(공개 동의 여부 확인 후 사용자별 합산 → 내림차순 정렬 → 상위
30명)으로 어시스트도 함께 집계해 응답에 포함한다. 프론트엔드 `V1SeriesPlayerRecordsResponse.assists`도
optional에서 필수로 되돌리고, `records?.assists ?? []` 같은 방어 코드를 제거했다.
