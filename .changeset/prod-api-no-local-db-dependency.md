---
"v1_api": patch
---

운영 배포의 API · 워커가 쓰지 않는 로컬 postgres 컨테이너의 건강 상태를 기다리지 않게 했어요. 운영 DB 는 RDS 라 그 컨테이너는 유휴 상태인데, 지금까지는 그 컨테이너가 unhealthy 면 전체 `up -d` 에서 API 가 뜨지 않았어요. DB 가 그 컨테이너인 alpha 는 오버레이에서 의존을 그대로 유지해요. 이 계약은 CI 의 compose 의존 검사가 지켜요.
