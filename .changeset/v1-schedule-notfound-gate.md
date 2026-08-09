---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 형제 라우트와 달리 HTTP 200 을 반환하던 것을 고친다.

alpha 실측(2026-08-09): 없는 대회 UUID 로 하위 라우트 5개를 열면 detail·bracket·results·reviews
는 정확히 404 인데 **schedule 만 200** 이었다(콘텐츠·title 은 정확한 not-found 였지만 상태 코드만
틀림). 코드 대조 결과 형제 4개는 `/tournaments/:id`(대회 존재)로 게이트하는데 schedule 하나만
하위 엔드포인트 `/tournaments/:id/schedule` 로 게이트하는 비대칭이 유일한 차이였다.

schedule 의 default export 게이트를 형제와 같은 base-tournament 방식으로 통일했다. 의미상으로도
맞다 — 대회가 존재하면 일정이 비어 있어도 페이지는 있어야 하고, 실제 일정 데이터는
SchedulePageClient 가 클라이언트에서 가져온다. `generateMetadata`(schedule 고유 title)는 상태
코드와 무관하므로 그대로 둔다.

`public-subroute-not-found.test.ts` 의 it.each 에 schedule 을 추가해 대회 부재 시 notFound() 호출을
계약으로 박제했다(기존엔 schedule 만 빠져 있었다).

**한계**: 상태 코드 200→404 의 실제 해소는 Next.js 런타임 스트리밍 동작이라 유닛 테스트로는
확정 못 한다 — 배포 후 alpha 에서 재측정 필요(#294 의 not-found title 수정과 함께).
