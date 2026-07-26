---
"v1_api": patch
"v1_web": patch
---

alpha 배포 SSM 명령에 `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`/`KAKAO_REDIRECT_URI` GitHub Secret을 `GA_MEASUREMENT_ID`와 동일한 방식으로 전달한다. `deploy-alpha.sh`는 이미 이 변수들을 읽고 있었지만 `deploy-alpha.yml`이 전달하지 않아 alpha 인스턴스의 `deploy/.env`(운영자 관리 대상, 자동 동기화 없음)에 실제 카카오 값이 채워진 적이 없었고, 그 결과 alpha 로그인 화면의 카카오 버튼이 "준비 중"으로 계속 비활성화돼 있었다.
