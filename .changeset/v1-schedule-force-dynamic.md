---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함을 렌더 모드 레벨에서 마저 고친다
(#298·#302·#305 후속).

#305 까지 notFound() 를 페이지·generateMetadata 양쪽에서 던졌는데도 schedule 만 200 이 유지됐다
(2026-08-09 alpha 실측: not-found UI·robots noindex 는 정상, 상태코드만 200). 형제(results 등)는 동일한
페이지 게이트 코드로 404 였으므로, 차이는 notFound() 배치가 아니라 **이 세그먼트의 렌더 모드**로 좁혀졌다
— schedule 세그먼트가 빌드타임에 부분적으로 static 최적화되며 notFound() 렌더가 static 200 으로 구워진
것으로 판단된다.

`export const dynamic = 'force-dynamic'` 로 이 라우트를 요청마다 동적 렌더로 강제해 static 최적화를
배제한다. 그러면 notFound() 가 항상 런타임에 평가되어 404 가 커밋된다. 실 일정 데이터는 클라이언트가
가져오므로 정적 이점을 포기해도 손해가 없다. 200→404 실제 해소는 서버 런타임 동작이라 배포 후 alpha 에서
5개 not-found 라우트 전부 404 인지 재측정으로 확정한다.
