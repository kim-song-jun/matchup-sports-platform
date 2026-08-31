# Data safety declaration worksheet

This worksheet is an implementation audit, not a legal approval or a Play Console submission receipt.
Complete the final answers against the exact AAB and current subprocessors before closed testing.

| Play data type | Shipped use | Collected | Shared | Required / optional | Purpose and deletion |
| --- | --- | --- | --- | --- | --- |
| Name, email, phone, date of birth, gender | Account, identity and event participation | Yes | Confirm per active event/processors | Required for the applicable account or event flow | Account/service operation; deletion follows the privacy policy and statutory holds |
| User IDs | Account and authenticated API activity | Yes | No by default | Required | Authentication, security, abuse prevention; removed or de-identified under account deletion rules |
| Photos, videos and other files | Profile, team, inquiry and tournament uploads | On user action | Confirm for storage/processors | Optional except where a specific submitted flow requires evidence | User content/service operation; deleted with the owning record subject to retention rules |
| Approximate location | Nearby region and current-weather lookup | On user action | Yes, to Open-Meteo for weather; company API for region resolution | Optional | App functionality; Android requests only coarse location and remains usable after denial |
| Purchase/refund information | Tournament/payment/refund flows exposed by the web service | When used | Confirm active payment/banking processors | Flow-dependent | Transaction handling, accounting and legal retention |
| App interactions and diagnostics | Web/API access logs, error and security records | Yes | Confirm hosting/monitoring processors | Required for service/security | Analytics, reliability, fraud prevention; retention per privacy policy |
| Device or other IDs | App installation ID and FCM registration token | Only after notification opt-in | Google Firebase Cloud Messaging | Optional | Push delivery; revoked on opt-out/logout and removed on account deletion |
| Device information | App version and manufacturer/model in push registration | Only after notification opt-in | No by default beyond infrastructure processors | Optional | Compatibility and push registration lifecycle |

Implementation safeguards:

- TLS-only Android network policy; mixed content disabled.
- `ACCESS_COARSE_LOCATION` only. No fine, background, storage, contacts, camera, microphone, or
  advertising-ID permission is declared by the app.
- Notification permission is requested only after an in-app opt-in action.
- File access uses the Android system picker; the shell does not request broad storage access.
- Production FCM diagnostics omit tokens, routes, user identifiers, and message contents.
- Public privacy policy: `https://teameet.co.kr/terms?document=privacy`.
- Public account deletion: `https://teameet.co.kr/account-deletion`.

Before submission, legal/product must confirm every **Shared** cell, encryption-in-transit answer,
retention period, deletion behavior, processor, account-age declaration, and whether any SDK added after
this audit introduces another data category.
