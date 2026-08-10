---
"v1_web": minor
---

Show the kickoff time and venue on the public tournament schedule, and keep the time badge visible on bracket cards that are already live or finished.

A schedule row rendered only `조별 A · 8/7 (금) · 예정` — no time, no venue — even though the response already carried `venue` and `fieldName`. For a tournament running three matches a day across two pitches, that row could not tell anyone when or where to show up. Rows now render `M/D (요일) HH:MM` via a new shared `formatTournamentDateTimeShort` helper plus a venue/field line.

On the bracket, the time badge was gated behind `!isDone && !isLive`, so the LIVE badge and the penalty-score badge each displaced it. Badges now sit in a flex row so the time stays alongside them. When a card carries only one badge — the most common "예정" state — it keeps rendering as the original full-width block strip rather than shrinking to a content-width pill; that also repairs the same pre-existing regression on LIVE-only and PK-only cards.
