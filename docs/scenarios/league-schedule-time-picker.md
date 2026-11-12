# League registered time choices
Status: Local contract checks passed; alpha browser pending.

Persona: platform ops; support reads only. Route: /admin/league-matches/:leagueId/schedule.

1. Open time assignment on desktop; verify the side panel, existing game starts and preset counts.
2. Add a KST datetime. Reload; verify the unassigned time remains.
3. Assign one game. Verify board/list and edit modal use the same start, with court/place/team/title preserved.
4. In edit modal select a registered time, save, reopen, then use direct datetime input.
5. Collapse/reopen a time; count remains and candidate controls are hidden when collapsed.
6. Verify same time/court warning; multiple courts at one time remain supported.
7. Reject save (409), then fail a post-save refresh; distinguish the two errors and preserve actual server data.
8. Verify support has no add/assignment controls; tournament director has no league API access.
9. Verify missing/wrong-kind resources, invalid DTO and duplicate instant behavior.
10. At 1440/768/390 capture before/after, console/network, focus, sheet scroll and pending-close behavior.

Evidence: local MSW request/response workflow 7 cases and existing tournament regression 5 cases passed; API unit 12 cases passed. API/Web type checks and Web pattern checks passed. No alpha after evidence: this branch is not deployed. No local Next server started. Docker unavailable, so DB integration not executed.
