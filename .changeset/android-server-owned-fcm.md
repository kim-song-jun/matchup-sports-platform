---
"v1_api": patch
---

Android 알림 발송을 Firebase Admin SDK에서 Teameet API의 FCM HTTP v1 직접 호출로 전환했습니다. 서비스 계정 OAuth 토큰을 안전하게 갱신하고, 로그아웃 뒤에도 기기 알림 동의를 유지해 다음 로그인에서 자동 재등록합니다.
