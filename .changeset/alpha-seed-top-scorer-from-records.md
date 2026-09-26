---
"v1_api": patch
---

alpha QA 시드의 득점왕 수상 기록이 재배포마다 고정 값으로 되돌아가던 것을 고쳤다.
`seed-alpha-tournament-qa.ts`가 대회 득점왕을 `teams[2]`(박도윤, "대회 6골")로 항상
고정 삽입했는데, 같은 대회의 실제 공식 경기 기록은(공개 `GET /tournaments/:id/player-records`
기준) 1위가 12골이었다 — alpha에서 수동으로 정정해 둔 값이 다음 시드 재실행(=매 배포)에
덮어써지는 구조였다. 이제 시드가 그 공개 엔드포인트와 같은 소스(공식 리비전의
`V1GameResultParticipant`)·같은 동의 게이팅·같은 정렬 규칙으로 대회 득점 1위를 직접
집계해 득점왕(`recipientName`·`recipientUserId`·`teamName`·"대회 N골")을 채운다. 득점
기록이 0건이면 득점왕 항목 자체를 만들지 않는다. MVP·베스트 골키퍼는 이번 범위 밖이다.
