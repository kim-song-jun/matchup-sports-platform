---
"v1_api": patch
"v1_web": patch
---

Apple 로그인 사용자가 탈퇴를 요청하면 Apple 쪽 로그인 연결도 함께 끊어요(App Store 심사지침 5.1.1(v)).

- iOS 앱이 Apple 로그인 시 받은 일회용 authorization code 를 웹을 거쳐 서버로 넘기고, 서버는 로그인
  직후 이를 refresh token 으로 교환해 암호화(AES-256-GCM)해 저장한다.
- `POST /api/v1/me/withdrawal-request` 가 커밋된 직후 Apple `/auth/revoke` 를 호출하고, 성공하면 저장한
  토큰을 지운다. 해지 실패는 탈퇴를 막지 않고 오류 로그로 남는다. 운영자 삭제는 남은 토큰을 지운다.
- Sign in with Apple 키(`APPLE_SIGN_IN_KEY_ID`·`APPLE_SIGN_IN_TEAM_ID`·`APPLE_SIGN_IN_PRIVATE_KEY`·
  `APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY`)가 없으면 교환·해지만 꺼지고(경고 1회) 로그인·탈퇴는 그대로 된다.
- 스키마: `v1_auth_identities.provider_refresh_token_ciphertext`(nullable) 추가.
