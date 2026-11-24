---
"v1_api": patch
---

nginx 가 모든 요청에 `Connection: upgrade` 를 붙이던 것을 고쳤어요. 이제 웹소켓 업그레이드 요청에만 붙이고 일반 요청은 헤더를 비워요. 웹·API upstream 에는 연결 재사용(keepalive)을 명시했고, 대기 시간은 Node 기본 keep-alive(5초)보다 짧은 4초로 맞춰 서버가 먼저 닫은 연결로 요청이 가는 일을 막아요. 화면과 API 응답은 그대로예요.
