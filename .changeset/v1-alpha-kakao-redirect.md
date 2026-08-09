---
"v1_web": patch
---

alpha 배포가 카카오 로그인에 **alpha 전용 콜백**(`ALPHA_KAKAO_REDIRECT_URI`)을 쓰게 되돌린다.

`deploy-alpha.yml`이 웹 이미지 build-arg 에서 prod 와 같은 `secrets.KAKAO_REDIRECT_URI` 를
쓰고 있어, alpha 에서 카카오 로그인을 하면 인가 URL 에 prod 콜백(`teameet.co.kr/callback/kakao`)이
박혀 인증 후 프로덕션으로 튕겼다 — alpha 에서 카카오 로그인 완주가 불가능했다.

이 분리는 원래 `c135ebe6`(2026-07-23, "alpha 카카오 로그인 redirect_uri를 프로덕션과 분리")로
정확히 이 목적의 시크릿 `ALPHA_KAKAO_REDIRECT_URI` 를 만들며 해결됐는데, 이후 alpha 배포를
매니페스트/SSM 방식으로 바꾼 리팩터에서 **배선만 끊겼다**(시크릿 자체는 GitHub 에 그대로 살아
있음 — `gh secret list` 로 2026-07-23 생성 확인). 한 줄로 되돌린다. 새 시크릿 등록 불필요.

**운영자 확인 필요**: 카카오 개발자 콘솔의 기존 앱(prod 와 동일 `KAKAO_CLIENT_ID`)에
`https://alpha.teameet.co.kr/callback/kakao` 가 Redirect URI 로 등록돼 있는지 확인(없으면 추가,
기존 prod URI 는 유지). 새 앱/새 client_id 는 불필요.
