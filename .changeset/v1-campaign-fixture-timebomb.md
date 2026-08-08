---
"v1_web": patch
---

Stop the tournament campaign test fixtures from expiring, which turned dev CI red on a date rollover with no code change behind it.

Both campaign fixtures pinned `registrationDeadlineAt` to the absolute instant `2026-08-08T00:00:00.000Z`. Once that instant passed, `campaign('open')` no longer rendered as open: the "함께 뛸 팀을 기다리고 있어요" region and the "참가 신청하기" link disappeared, and two assertions in `tournament-campaign-template.test.tsx` started failing for every branch at once. The same fixtures also pinned `scheduledAt` to `2026-08-15`, so a second, identical failure was already scheduled for a week later.

The dates are now derived from the run time — deadline at +7d, kickoff at +14d — so an `open` fixture is genuinely open whenever the suite runs. The test that exercises the deadline transition itself is unaffected: it already overrides the deadline explicitly and drives the clock with fake timers.
