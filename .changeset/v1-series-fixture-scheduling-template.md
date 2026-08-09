---
"v1_api": minor
"v1_web": minor
---

League fixture generation can now be filled in bulk with a weekday, kickoff
time, and default venue instead of every fixture landing at midnight with
"장소 미정" (place TBD) and needing a manual edit.

`POST /admin/team-match-series/:seriesId/fixtures` accepts an optional
`schedule: { dayOfWeek, time }` (KST weekday 0–6 and `HH:mm`) and an optional
`placeName`. When supplied, every generated fixture starts at the first
occurrence of that weekday/time on or after the league's start date and
repeats weekly, and all fixtures get the given venue. Omitting both keeps the
exact previous behavior (start date's own timestamp, "장소 미정") — existing
callers are unaffected.

The admin league fixtures screen
(`/admin/team-match-series/:seriesId`) adds 요일/시각/기본 장소 inputs next
to the existing 주차 수 field when generating a league's fixtures for the
first time. The per-row 일시/구장 inputs in the fixture table are unchanged,
so any week that needs a different time or venue can still be corrected
individually after bulk generation.
