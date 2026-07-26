---
"v1_api": patch
---

로그아웃(`POST /auth/logout`)이 host-only(도메인 미지정) 세션 쿠키만 지우던 것을, `teameet.co.kr`/`.teameet.co.kr` 도메인으로 발급됐을 수 있는 과거 세션 쿠키까지 함께 지우도록 방어적으로 확장한다. alpha.teameet.co.kr에서 실사용 계정으로 재현한 결과 `POST /auth/logout`이 201을 반환한 직후에도 `GET /auth/me`가 여전히 인증된 사용자 정보를 반환했다 — 세션 TTL(7일) 안에 남아있는, 현재 코드가 발급하지 않는 도메인 속성의 잔존 쿠키가 로그아웃 후에도 유효하게 살아남는 것이 원인으로 추정된다.
