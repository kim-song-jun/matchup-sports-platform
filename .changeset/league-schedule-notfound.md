---
'v1_web': patch
---

정규 리그가 `/tournaments/:id/schedule` 에 도달해 **색인 가능한 에러 화면**이 되던 것을 막는다.

통합 축으로 상세 API 가 리그를 허용하면서 리그가 이 페이지의 게이트를 통과했는데, 클라이언트가
부르는 `/tournaments/:id/schedule` 은 리그에서 404 라 "경기 정보를 찾을 수 없어요" 만 그렸다.
`noindex` 도 없어 색인될 수 있었다.

- 게이트에서 `kind === 'regular_league'` 를 `notFound()` 로 막는다
- `generateMetadata` 도 리그면 직접 noindex 를 준다 (이 라우트는 notFound 여도 HTTP 200 이라
  상태코드로는 못 막는다 — 알려진 프레임워크 quirk)
- `format === 'league'` 인 **리그 방식 대회**는 진짜 대회라 그대로 통과한다
