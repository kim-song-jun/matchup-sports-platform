---
"v1_web": minor
---

Add the web UI for team-match leagues (시리즈): admins can now open a
round-robin league from `/admin/team-match-series/new` (name, sport, region,
period, and at least two participating teams), generate the full fixture
list from the league's detail page (`/admin/team-match-series/:seriesId`),
and edit each fixture's date/time and venue inline in the fixture table. A
"리그" tab was added to the admin nav next to "팀매치".

Anyone can view a league's public standings and player rankings at
`/team-match-series/:seriesId` — a live table (points, goal difference,
goals for/against) plus scorer/assist leaderboards, with fixtures still
awaiting an official result surfaced as a separate "확인 중" notice instead
of being silently excluded.
