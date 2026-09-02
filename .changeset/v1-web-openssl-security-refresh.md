---
"v1_web": patch
---

프로덕션 web 이미지의 OpenSSL 런타임 라이브러리를 최신 보안 패치본으로 올려요.

`node:22-alpine` 베이스가 Alpine 보안 저장소보다 뒤처져 있어서, 빌드된 web 이미지에 알려진 CRITICAL CVE가 실려 나갔어요. ECR 스캔 게이트가 그걸 잡아 **프로덕션 배포가 막혀 있었습니다**(`teameet-prod-v1-web critical=1 high=7`).

같은 문제를 API 이미지에서 먼저 고쳤는데(`v1-api`), 스캔 게이트는 **두 이미지를 모두** 검사합니다 — API만 고치자 이번엔 web에서 똑같이 걸렸어요. 이제 두 Dockerfile이 같은 방식으로 OpenSSL을 갱신합니다.

화면 동작은 바뀌지 않아요.
