---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함 — #298·#302·#305·#307 이 엔드포인트·
notFound 위치·force-dynamic 가설로 모두 실패했다. 이번엔 그 추가 장치(force-dynamic, generateMetadata 내
notFound throw)를 걷어내고 schedule 페이지를 **정상 404 인 형제 라우트(results/bracket/awards/reviews)와
구조적으로 동일**하게 되돌린다: force-dynamic 없음 + generateMetadata 는 없는 대회에서 noindex 메타 반환
(throw 안 함) + 존재 게이트는 페이지 컴포넌트 notFound() 하나. 200→404 실제 해소는 프로덕션 런타임
동작이라 배포 후 alpha 재측정으로 확정한다.

함께: 런타임·환경 의존 동작은 로컬 포렌식 대신 alpha 배포로 검증하라는 운영 지침을 CLAUDE.md·AGENTS.md
에 추가(2026-08-09 로컬 좀비 서버 오염 실사고 반영).
