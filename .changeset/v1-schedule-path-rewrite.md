---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함 — page.tsx 를 정상 404 인 형제와
코드-동일하게 만들어도 alpha 에서 200 이 유지됨이 확정됐다(#298·#302·#305·#307·#312, 5회 배포). 즉 결함은
`schedule` **라우트 경로 자체**에 묶여 있다. 이 라우트를 `schedule-view` 세그먼트로 옮기고, 공개 URL
`/tournaments/:id/schedule` 은 next.config rewrite 로 그 라우트에 연결한다 — 라우트가 다른 세그먼트로
바뀌면 형제처럼 정상 404 가 되고, 사용자 URL 은 `/schedule` 그대로 유지된다. 200→404 실제 해소는
프로덕션 런타임이라 배포 후 alpha 재측정으로 확정한다.
