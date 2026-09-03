# Data safety declaration worksheet

This worksheet is an implementation audit, not a legal approval or a Play Console submission receipt.
Complete the final answers against the exact AAB and current subprocessors before closed testing.

| Play data type | Shipped use | Collected | Shared | Required / optional | Purpose and deletion |
| --- | --- | --- | --- | --- | --- |
| Name, email, phone, date of birth, gender | Account, identity and event participation | Yes | Confirm per active event/processors | Required for the applicable account or event flow | Account/service operation; deletion follows the privacy policy and statutory holds |
| User IDs | Account and authenticated API activity | Yes | No by default | Required | Authentication, security, abuse prevention; removed or de-identified under account deletion rules |
| Photos, videos and other files | Profile, team, inquiry and tournament uploads | On user action | Confirm for storage/processors | Optional except where a specific submitted flow requires evidence | User content/service operation; profile references are cleared at final deletion, while physical objects and shared-entity uploads follow their owning entity's retention lifecycle |
| Approximate location | Nearby region and current-weather lookup | On user action | Confirm whether the active weather/region providers qualify as service providers or Play “sharing” | Optional | App functionality; Android requests only coarse location and remains usable after denial |
| Purchase/refund information | Tournament/payment/refund flows exposed by the web service | When used | Confirm active payment/banking processors | Flow-dependent | Transaction handling, accounting and legal retention |
| App interactions and diagnostics | Web/API access logs, error and security records | Yes | Confirm hosting/monitoring processors | Required for service/security | Analytics, reliability, fraud prevention; retention per privacy policy |
| Device or other IDs | App installation ID and Firebase Cloud Messaging (FCM) registration token | Only after notification opt-in | Confirm Firebase's Play classification and service-provider treatment | Optional | Push delivery; revoked on opt-out/logout, revoked immediately when withdrawal is requested, and deleted at final deletion |
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

Account-deletion lifecycle implemented by the service:

1. A signed-in user can request withdrawal in the app. The account is locked immediately, browser push
   subscriptions are deleted, and active Android/iOS push devices are revoked in the same transaction.
2. After the operator verifies that active team/match obligations are resolved, final deletion removes or
   de-identifies contact/authentication fields and basic profile attributes, and deletes saved regions,
   sport preferences, search history, verification tokens, and remaining push identifiers.
3. Completed match, payment/refund, dispute, abuse-prevention, and audit records may remain only for the
   stated service, legal, security, or accounting purpose and documented retention period.
4. Do not tell reviewers that every uploaded object is erased instantly. Physical object deletion and
   shared team/event uploads depend on their owning record and storage retention implementation.

Before submission, legal/product must confirm every **Shared** cell (including Play's service-provider
exemptions), encryption-in-transit answer, retention period, physical-object deletion behavior, processor,
account-age declaration, and whether any SDK added after this audit introduces another data category.
