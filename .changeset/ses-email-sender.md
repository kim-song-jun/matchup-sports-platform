---
"v1_api": minor
---

Send verification emails through AWS SES instead of only logging them. The email channel of the verification dispatcher was a stub that logged the code and returned success, so email verification looked like it worked while nothing was ever delivered. A `SesEmailSender` now mirrors the existing SMS adapter contract — it is enabled only when both `SES_REGION` and `EMAIL_FROM` are set, credentials come from the instance role rather than the app, and a send failure surfaces as `EMAIL_SEND_FAILED` instead of being swallowed. Leaving the settings unset keeps the current log-stub behaviour, so deploying this changes nothing until the environment is configured. This also closes a hole in `devEchoActive`, which only checked the SMS adapter: with email configured but SMS not, the API would have sent a real email and echoed the same one-time code back in the response.
