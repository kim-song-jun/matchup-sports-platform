---
"v1_api": minor
"v1_web": minor
---

Add password reset by email, the follow-up that account recovery by phone left open once SES was wired up. The "비밀번호 재설정" tab now lets you choose between 휴대폰 and 이메일; picking 이메일 sends a six-digit code to the address you signed up with and, once you enter it, lets you set a new password. The existing email verification endpoints sit behind the auth guard and could not be used while logged out, so recovery gets its own public OTP under `/auth/recovery/email/*`, storing challenges in a new `v1_email_verification_challenges` table because the logged-in verification token requires a user id.

The proof this flow issues cannot be swapped with the phone one. Both are signed with the same secret, so the email payload carries an `email:` channel label ahead of the purpose, and the signing/expiry/comparison logic both channels share now lives in one place rather than being copied per channel. The email endpoint also never lets the caller pick the purpose — the server pins it to password reset.

An email address can be tried by anyone, so the request step gives the same answer either way: a challenge is created whether or not the address belongs to an account, and only a registered address actually receives mail. Nobody can guess a code that was never sent, so a wrong guess and an unregistered address fail identically, and the screen says "가입된 이메일이면 인증번호를 보내드려요" rather than confirming anything. Kakao-only accounts still get their mail and are told to log in with Kakao — but only after they have proven they own the mailbox, since saying so up front would leak that the account exists.
