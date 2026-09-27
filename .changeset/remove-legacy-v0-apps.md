---
"v1_api": patch
---

배포되지 않던 이전 세대 앱(`apps/api`·`apps/web`)과 그 앱만 쓰던 로컬 개발·QA 도구를 저장소에서 걷어냈어요. 서비스 동작은 바뀌지 않아요.

로컬 `docker compose`·루트 `package.json`·`Makefile` 명령은 이제 v1 앱만 다루고, lockfile 도 두 v1 패키지 기준으로 다시 만들었어요. 옛 코드가 필요하면 `legacy-v0-final` 태그에서 꺼내 볼 수 있어요.
