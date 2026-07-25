---
"v1_api": minor
"v1_web": minor
---

Add account recovery by phone: find the email you signed up with, and reset your password. `/auth/password-reset` was a placeholder that only explained the situation — there was no recovery API at all — so the "비밀번호 찾기" link on the email login screen now leads to a working `/auth/find-account` with both flows behind one phone verification. Recovery reuses the existing public OTP endpoints rather than adding a second SMS path, and the phone-ownership proof token now carries a purpose so a token minted while signing up cannot be replayed to reset an existing account's password; signup tokens keep their exact old payload shape so signups already in flight survive the deploy. Only a masked email is ever returned, and accounts that signed up through Kakao are told to log in with Kakao instead of being offered a password they never had. Email-based recovery is not part of this — the app still has no email delivery — so it will follow once SES is wired up.
