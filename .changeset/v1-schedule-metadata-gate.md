---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 여전히 HTTP 200 을 반환하던 것을 고친다(#298 후속).

#298 은 페이지 컴포넌트의 notFound 게이트를 형제와 같은 `/tournaments/:id` 로 맞췄지만,
**`generateMetadata` 는 여전히 하위 엔드포인트 `/tournaments/:id/schedule` 를 따로 불렀다.**
Next.js 는 generateMetadata 와 페이지를 동시 렌더하며 **동일 URL fetch 를 request-memoize(dedup)**
하는데, 형제 라우트(bracket 등)는 metadata·페이지가 둘 다 `/tournaments/:id` 를 불러 dedup 되어
notFound 와 metadata 가 동기로 resolve → 정확히 404 였다. schedule 만 두 fetch 가 서로 다른
URL 이라 dedup 되지 않았고, 그 resolve 타이밍 레이스 탓에 metadata 가 먼저 flush 되며 없는
대회에서도 200 이 커밋됐다(alpha 배포 후 실측: #298 만으로는 schedule 이 여전히 200).

generateMetadata 도 `/tournaments/:id` 로 맞춰 형제와 **구조적으로 동일**하게 만들었다(존재 판정·
제목 base 를 대회 상세에서 얻음, `${tournament.title} 경기 일정`). 실제 일정 데이터는
SchedulePageClient 가 클라이언트에서 가져오므로 메타데이터 단계에서 일정을 미리 부를 필요가 없다.

**검증 한계**: 200→404 의 실제 해소는 Next.js 서버 스트리밍 런타임 동작이라 유닛/tsc 로는 확정
못 한다 — #298 이 페이지만 맞춰선 안 통했던 전례가 있으므로, 이번엔 metadata·페이지 fetch 를
byte 수준으로 형제와 일치시킨 구조적 수정이지만 **배포 후 alpha 에서 5개 라우트 전부 404 인지
재측정으로 확정**해야 한다.
