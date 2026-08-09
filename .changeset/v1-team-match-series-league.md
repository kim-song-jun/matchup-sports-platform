---
"v1_api": minor
---

Add team-match leagues (시리즈): admins can open a round-robin league across
teams and generate a full fixture list in one call, and anyone can see the
league's standings and top scorers/assist-makers once official results start
coming in.

`POST /admin/team-match-series` opens a league for a sport/region with a set
of teams (at least two distinct active teams, enforced as a 422
`SERIES_TEAM_INVALID` domain rule rather than DTO validation, so it works the
same whether the team list was too short or just deduped down to one).
`POST /admin/team-match-series/:seriesId/fixtures` generates every fixture at
once via a deterministic round-robin schedule with balanced home/away
assignment, creating each one through the same game-aggregate path a regular
team match uses (so results, lineups, and result review all work
identically) — calling it twice on the same league is rejected with 409
`SERIES_FIXTURES_EXIST` rather than silently duplicating fixtures.
`PATCH .../fixtures/:teamMatchId` lets admins adjust a single fixture's time
or venue; mismatching the fixture to the wrong league in the URL is rejected
as 404 rather than silently reaching across leagues.

`GET /team-match-series/:seriesId(/standings|/player-records)` is public
(same pattern as existing public team-record endpoints). Standings only
count officially-confirmed results — fixtures without an official result yet
show up separately as "pending" rather than being scored as 0-0 — and ties
break by points, then goal difference, then goals for, then head-to-head.
Player goal/assist totals respect the same public-consent eligibility rule
as career records elsewhere.

League fixtures also get a shorter, dedicated result-review escalation: 12
hours of no response (instead of the usual 24h reminder / 48h escalation)
notifies both teams and every platform admin, and those escalations now also
show up in the admin's global escalation queue (previously that queue only
ever surfaced tournament-fixture escalations).
