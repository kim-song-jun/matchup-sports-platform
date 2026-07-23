---
"v1_web": patch
"v1_api": patch
---

alpha 배포가 카카오 OAuth `redirect_uri`로 프로덕션 도메인(`https://teameet.co.kr/v1/callback/kakao`) 값을 그대로 재사용하던 문제를 고친다. `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`는 alpha와 프로덕션이 같은 Kakao 앱을 공유하므로 그대로 두되, `KAKAO_REDIRECT_URI`만 alpha 전용 GitHub Secret(`ALPHA_KAKAO_REDIRECT_URI` = `https://alpha.teameet.co.kr/callback/kakao`)으로 분리한다. 기존에는 카카오 인증 완료 후 alpha가 아닌 프로덕션 도메인으로 리다이렉트되어 OAuth state 검증이 항상 실패했다.

별도 조치 필요: 이 redirect_uri를 Kakao 개발자 콘솔의 허용된 Redirect URI 목록에 추가 등록해야 실제로 동작한다(코드/CI만으로는 해결 불가).
