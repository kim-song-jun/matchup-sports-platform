---
"v1_api": minor
"v1_web": minor
---

Creating a league no longer requires picking a sport before searching for
teams, and the bulk fixture-generation form now suggests venues the
participating teams have actually used before.

**Team picking (`/admin/team-match-series/new`)**: the team search box is
always active, regardless of whether a sport is selected yet. Search results
show each team's sport alongside its region so teams from different sports
stay distinguishable. Picking the first team auto-fills and locks the sport
select to that team's sport ("자동 설정됨 · 변경하려면 선택한 팀을 모두 지우세요");
clearing every picked team unlocks it again. Once a sport is set, teams from
a different sport still show up in search (never hidden) but appear greyed
out with an inline reason ("이 리그는 O 종목이라 X 팀은 선택할 수 없어요") and can't
be clicked in — consistent with not silently hiding why an action is blocked.

`EntityPicker` gained two small, backward-compatible additions to support
this: per-item `disabled`/`disabledReason`, and a `showResultsWithoutQuery`
flag so server-search mode can also show default candidates on focus before
any text is typed (local mode already did this).

**Venue suggestions (`/admin/team-match-series/:seriesId`, bulk generation
form)**: `GET /admin/team-match-series/:seriesId` now returns `recentVenues`
— up to 5 distinct place names the participating teams have actually played
at before (from any team match, any series), most recent first. The admin
screen renders them as tap-to-fill chips next to the "기본 장소" input. The
field is omitted once a league already has fixtures (the form isn't shown
then) and is absent from the public series detail endpoint.
