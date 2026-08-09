---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함의 실제 원인 격리(2026-08-09 alpha
실측): page.tsx 코드(#312, 형제와 코드-동일해도 200)·라우트 경로(#314, schedule-view 로 옮겨도 200) 둘
다 원인이 아니었고, 유일하게 남은 차이인 **SchedulePageClient 클라이언트 컴포넌트의 import 그래프**가 이
서버 컴포넌트 번들에 정적으로 들어오면서 notFound() 응답을 200 으로 커밋되게 만들었다(형제 results 의
클라이언트는 그렇지 않다). `next/dynamic` 으로 SchedulePageClient 를 lazy-load 해 그 그래프를 페이지의
초기 서버 렌더 경로에서 분리한다 — 존재하는 대회는 그대로 SSR 렌더되고, notFound 경로는 그 그래프를
건드리지 않는다. 함께 #314(schedule-view rename + rewrite)는 원복한다(경로 가설 기각). 200→404 실제 해소는
프로덕션 런타임이라 배포 후 alpha 재측정으로 확정.
