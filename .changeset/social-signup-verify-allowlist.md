---
"v1_api": patch
---

카카오 소셜 회원가입이 프로필 입력 단계에서 403(`SIGNUP_INCOMPLETE`, "Social signup must be completed before accessing this resource")으로 원천 봉쇄되던 문제를 수정한다. 옥토모 카카오 hard-block으로 소셜 프로필 화면에 추가된 authed 휴대폰 인증 카드가 호출하는 `/verification/phone/request`·`/verification/phone/confirm`과 닉네임 중복확인(`/auth/check-nickname`)이 `social_profile_required` 단계 allowlist에서 빠져 있어, 번호 입력 즉시 인증 API가 차단됐다. 소셜 프로필 완성에 필요한 최소 경로만 allowlist에 추가하고(단계 격리 유지: 약관 단계에서는 불허), 회귀 테스트를 더한다.
