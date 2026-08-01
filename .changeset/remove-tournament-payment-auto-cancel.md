---
'v1_api': minor
'v1_web': minor
---

Stop auto-cancelling tournament registrations that have not paid within two hours. The rule had no scheduler, so it only fired when someone happened to read the registration — one production registration submitted on 2026-07-18 was recorded as cancelled nine days later, the moment its team opened the page. Teams now keep their registration until an operator cancels it, and the payment-deadline countdown, the "cancelled after 2 hours" notices and the matching clause in the tournament policy are removed along with it.
