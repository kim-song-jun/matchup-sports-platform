---
"v1_api": patch
"v1_web": patch
---

배포에 쓰는 nginx 이미지를 보안 수정 버전(1.30.7 stable)으로 고정했어요. 이미지 태그와 digest를 함께 적고, 배포 보안 검사가 고정이 풀리거나 수정 전 버전으로 내려가면 막아요. 운영 nginx 설정에 `server_tokens off` 를 더해 응답 헤더에 nginx 버전이 보이지 않게 했어요.
