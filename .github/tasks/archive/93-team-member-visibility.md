# 93 Team Member Visibility

## Scope
- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`

## Requirements
- Team member status access is only available to active team members.
- Non-members must see the member status box as disabled and must not be able to fetch the member list.
- Team owners and managers can toggle whether regular members may view member status from team management/edit.
- New teams are created with member status visibility disabled.
- Team member management uses two direct tabs: members and join requests.
- Member rows use a single management button, with role shown instead of an active-status column.
- Final actions require a confirmation step.
- Owners can delegate ownership only to managers.

## Acceptance Criteria
- Given a non-member views team detail, when the member status box is rendered, then it is disabled and does not link to the members page.
- Given a non-member calls `GET /api/v1/teams/:teamId/members`, when the request is made, then the API returns a permission error.
- Given an owner or manager edits a team, when member visibility is toggled, then the team detail contract reflects the new value.
- Given a team is created, when no visibility setting is submitted, then member visibility remains disabled.
- Given a member row is managed, when the row is opened, then actions appear under a single management button.
- Given a manager row is managed by the owner, when delegation is selected and confirmed, then ownership is transferred to that manager.
- Given a member/request action is selected, when the confirmation is declined, then no mutation is sent.

## Progress Snapshot
- 2026-06-09: Task opened for v1 team member visibility setting.
- 2026-06-09: Added `v1_teams.members_visible`, update-only toggle, member-list permission gate, team detail disabled state, and MSW detail fixture sync. Automated validation is blocked by the local dependency install state.
- 2026-06-09: Added member/request tabs, single management action menus, confirmation prompts, and owner delegation to managers.
