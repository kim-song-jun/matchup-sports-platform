---
'v1_web': patch
---

정규 리그 시즌 대회(`kind: regular_league`)의 "시상·리뷰" 화면에서 개인 기록
(득점·도움 랭킹) 섹션이 API 404 에러 카드로 뜨던 것을 고칩니다.

`GET /tournaments/:id/player-records`는 리그 시즌을 의도적으로 막아 둔
엔드포인트입니다(`test/tournaments/tournament-surface-kind.integration-spec.ts`
계약 — 리그 거울 행은 대회 축 게임이 없어, 리그 축 데이터를 채우는 브리지 없이
게이트만 열면 에러 대신 빈 화면을 보여주는 것뿐이라 순서가 뒤바뀝니다).

화면이 애초에 리그 시즌 대회에서는 이 API를 호출하지 않도록 `PlayerRecordsSection`
렌더링 자체를 막습니다.
