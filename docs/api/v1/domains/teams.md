# V1 Teams API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/teams` | optional user | `TeamsQueryDto` | cursor list |
| `GET` | `/api/v1/teams/:teamId` | optional user | path id | team detail and CTA state |
| `POST` | `/api/v1/teams` | user | `MutateTeamDto` | created team with owner membership |
| `PATCH` | `/api/v1/teams/:teamId` | owner/manager | `UpdateTeamDto` | updated team |
| `GET` | `/api/v1/teams/:teamId/join-eligibility` | user | path id | join eligibility |
| `GET` | `/api/v1/teams/:teamId/members` | member/manager/owner by service rule | `role?`, `status?`, `cursor?`, `limit?` | member list |
| `POST` | `/api/v1/teams/:teamId/join-applications` | user | `{ message?: string | null }` | requested join application |
| `GET` | `/api/v1/teams/:teamId/join-applications` | owner/manager | `status?`, `cursor?`, `limit?` | join applications |
| `GET` | `/api/v1/me/teams` | user | `permission?` | current user's teams |
| `PATCH` | `/api/v1/team-memberships/:membershipId/role` | owner | `{ role: "manager" | "member" }` | updated membership |
| `POST` | `/api/v1/team-memberships/:membershipId/remove` | owner/manager | `{ reason?: string | null }` | removed membership |
| `POST` | `/api/v1/team-join-applications/:applicationId/withdraw` | applicant | `{ reason?: string | null }` | withdrawn application |
| `POST` | `/api/v1/team-join-applications/:applicationId/approve` | owner/manager | `{ note?: string | null }` | approved application and membership |
| `POST` | `/api/v1/team-join-applications/:applicationId/reject` | owner/manager | `{ reason?: string | null }` | rejected application |

## Member Response Contract

`GET /api/v1/teams/:teamId/members` returns every directory row visible under the team's member-list policy, including rows that cannot currently be used in tournament roster registration. Member-list visibility and private-profile visibility are separate decisions: permission to see the directory never implies permission to see every member's PII.

Each member item includes:

- `displayName`: UI display name, falling back to nickname/member label.
- `realName`: private nullable profile real-name source.
- `phone`: private nullable account phone source.
- `birthDate`: private nullable full birth-date source.
- `gender`: private nullable profile gender source, normalized to `male | female` when visible.

Private fields follow this response matrix:

| Viewer | `realName`, `phone`, full `birthDate`, `gender` |
|---|---|
| Anonymous or non-member | `null` for every returned row, even when `membersVisible=true` allows the directory itself to be read |
| Ordinary active member | visible only on the viewer's own `userId` row; `null` on every other member row |
| Active owner or manager | explicit roster-management response may include the stored values for every returned member row; an absent source value remains `null` |

`displayName`, `profileImageUrl`, role, status, and join metadata are directory/presentation fields and are not promoted to private roster data by this matrix. Clients must not infer a hidden `realName`, phone, birth date, or gender from display fields.

Tournament roster management is an owner/manager surface. Its client must keep rows with missing `realName`, `birthDate`, or `phone` visible, but disable selection and explain the missing fields. An ordinary member's self-only private data does not authorize that member to inspect or assemble other members' roster PII.

## DTO Highlights

`TeamsQueryDto` includes `cursor`, `limit`, `query`, `sportId`, `regionId`, `joinPolicy`, `sort`, and `view`.

`MutateTeamDto` requires:

- `sportId`
- `regionId`
- `name`, max 50
- `joinPolicy: "approval_required" | "closed"`

Optional fields include `logoUrl`, `coverImageUrl`, `introduction`, `activityAreaText`, `skillLevelText`, and `memberGoalCount`.

Structured activity profile fields:

- `activityDays: string[]` — `mon|tue|wed|thu|fri|sat|sun`
- `activityFrequency: string | null` — `weekly_1|weekly_2|weekly_3|weekly_4_plus|biweekly_1|irregular`
- `activityTimeSlots: string[]` — `morning|lunch|afternoon|evening|late_night`
- `activityTypes: string[]` — `regular_meetup|friendly_match|team_match|tournament_prep|training|free_participation|beginner_friendly|competitive`
- `activityMemo: string | null`

Team list, detail, and `/me/teams` responses include those fields plus `activitySummary` and `memberGoalCount`. `activityAreaText` remains as a compatibility/fallback field backed by the existing `activity_note` column.

Team list/detail and `/me/teams` `region` includes `{ regionId, name, parentName? }`; `regionName` is the display label (`parentName + name` for district regions).

`UpdateTeamDto` adds `version: string`.

## Route Fields

- `detailRoute` for create/my-team/team detail responses points to `/teams/:teamId`.
- `manageRoute` is only present for owner/manager viewers and points to `/teams/:teamId/members`; full team operations are exposed from the canonical `/teams/:teamId` detail UI.
- There is no v1 `/teams/:teamId/manage` route.

## State And Permissions

- Creating a team requires profile `realName`, phone, and gender; missing fields return `422 PROFILE_COMPLETION_REQUIRED`. Application and management endpoints are exempt.


- V1 has no open instant join. Team join is `approval_required` or `closed`.
- Team creator becomes owner.
- `memberGoalCount` is the team capacity. When `memberCount >= memberGoalCount`, join applications, join approvals, team invitations, and invitation acceptance fail with `TEAM_FULL`.
- Team capacity cannot be updated below the current `memberCount`.
- Owner is not changed through the general role API.
- Manager limit is enforced by service logic.
- Approving a join application or accepting a team invitation creates or restores an active member.
- New/reactivated membership starts team-chat visibility and writes one joined system message in the same transaction; the member does not need to open the chat room first.
- Inactive membership is retained as history. Removing a member updates the existing membership to `removed`, records `leftAt` and `removedByUserId`, and does not hard-delete the membership row. Records already stored in another team-owned domain, including tournament roster snapshots, are not deleted by this membership state change.
- The v1 member-management UI treats removal as a destructive action. Its confirmation modal requires the operator to enter the exact phrase `확인했습니다` before the final `내보내기` button is enabled and the remove mutation can run.

Primary tables:

- `v1_teams`
- `v1_team_profiles`
- `v1_team_memberships`
- `v1_team_join_applications`
- `v1_team_trust_scores`
- `v1_status_change_logs`
