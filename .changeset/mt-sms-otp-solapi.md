---
"v1_api": minor
"v1_web": minor
---

휴대폰 본인인증을 옥토모 무료 MO(polling)에서 솔라피(SOLAPI) MT SMS OTP로 전환한다. 서버가 6자리 인증번호를 발송(SmsSender 어댑터)하고 사용자가 입력하는 표준 방식으로, 옥토모 반영 지연으로 인증이 완료되지 않던 문제를 해소한다. 옥토모 클라이언트·폴링·QR/딥링크 코드와 OCTOMO_* 배선을 완전히 제거하고 SOLAPI_*(3값)로 교체했다. `V1PhoneVerificationChallenge`를 codeHash 스키마로 재정의(마이그레이션 동반). 휴대폰 인증은 fail-closed로, SOLAPI 시크릿 미설정 시 `V1_VERIFICATION_DEV_ECHO=true`인 개발/CI에서만 dev-echo(devCode 응답)로 동작하고 그 외에는 issue가 503(`SMS_NOT_CONFIGURED`)로 실패해 가입이 막힌다.
