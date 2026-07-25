---
"v1_api": minor
---

SMS OTP 발송처를 SMS_PROVIDER 환경변수로 Solapi(기본)와 가비아(Gabia) 중 선택할 수 있게 한다. 가비아용 GabiaSmsSender 어댑터 추가(OAuth client_credentials 토큰 캐시+재발급, HTTP 200 응답 내 code 필드로 성공/실패 판정). 미설정 시 기존과 동일하게 Solapi로 동작(back-compat). 신규 환경변수: SMS_PROVIDER, GABIA_SMS_ID, GABIA_API_KEY, GABIA_SENDER_NUMBER.
