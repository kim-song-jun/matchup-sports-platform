---
'v1_api': patch
---

내 후기 대기 목록에 대회 표면 종류 조건 추가

`listMyPendingReviews` 는 `status: 'confirmed'` 를 쓰는 19곳 중 유일하게 `tournamentId`
스코프가 없는 쿼리다. 지금까지 리그가 안 보였던 건 `tournament.status = 'completed'`
덕인데(백필 리그는 draft, 어드민 changeStatus 가 리그를 막는다) 그건 다른 파일의 가드에
기댄 것이다. 여기서 종류를 직접 건다.
