---
"v1_web": minor
---

Connect the admin console to the tournament-ops console properly, and settle on one way of showing an action the current user cannot take.

The `/tournament-ops/**` routes grew as a separate tree and were wired back to `/admin/**` only thinly afterwards. Four gaps followed: picking "결과 검토" on a specific fixture dropped you at the tournament-level console with no way to say which match you meant; the ops shell's return link always went to `/home`; the admin sidebar never mentioned the ops console at all, so you had to already be inside a tournament to learn it existed; and the live console sat two hops away with no direct link.

Result-review and corrections now accept `?fixtureId=` and open that fixture directly, telling you plainly when it is not on the list rather than silently showing nothing. The ops shell remembers which tournament you entered from and offers "대회 관리로 돌아가기". The admin sidebar gets a 대회 현장 운영 entry with a tournament picker, and bracket rows expose "운영 콘솔 열기" for scheduled and in-progress matches.

Permission-gated entry points were inconsistent: the admin quick links always rendered and failed on arrival, while the ops shell nav removed items entirely. Both now render disabled with `aria-disabled` and a reason ("스태프 배정이 필요해요."), so the capability is discoverable and the reason is actionable. Also fixes a WCAG 2.5.3 Label-in-Name mismatch where a link's accessible name said "…콘솔로 이동" while its visible text read "결과 검토하러 가기" — voice-control users could not activate it by reading what they saw.
