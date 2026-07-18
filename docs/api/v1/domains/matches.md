# V1 Matches API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/matches` | optional user | `MatchesQueryDto` | cursor list |
| `GET` | `/api/v1/me/matches` | user | `MyMatchesQueryDto` | current user's joined or created match list |
| `POST` | `/api/v1/matches` | user | `MutateMatchDto` | created match |
| `GET` | `/api/v1/matches/:matchId/edit` | user host | path id | editable match payload |
| `GET` | `/api/v1/matches/:matchId` | optional user | path id | match detail and CTA state |
| `GET` | `/api/v1/matches/:matchId/application-eligibility` | user | path id | eligibility result |
| `POST` | `/api/v1/matches/:matchId/applications` | user | `{ message?: string | null }` | application |
| `GET` | `/api/v1/matches/:matchId/applications` | user host | `status?`, `cursor?`, `limit?` | applicant list |
| `PATCH` | `/api/v1/matches/:matchId` | user host | `UpdateMatchDto` | updated match |
| `POST` | `/api/v1/matches/:matchId/cancel` | user host | `{ reason?: string | null }` | cancelled match |
| `POST` | `/api/v1/match-applications/:applicationId/withdraw` | user applicant | `{ reason?: string | null }` | withdrawn application |
| `POST` | `/api/v1/match-applications/:applicationId/approve` | user host | `{ note?: string | null }` | approved application and participant |
| `POST` | `/api/v1/match-applications/:applicationId/reject` | user host | `{ reason?: string | null }` | rejected application |

## Query DTO

`MatchesQueryDto`:

- `cursor?: string`
- `limit?: number`, 1-50
- `query?: string`, max 50
- `sportId?: uuid`
- `regionId?: uuid`
- `status?: "recruiting" | "closed" | "completed" | "cancelled" | "expired"`
- `sort?: "recommended" | "latest" | "starts_at" | "deadline"`
- `view?: "card" | "compact"`

`MyMatchesQueryDto`:

- `cursor?: string`
- `limit?: number`, 1-50
- `mode?: "joined" | "created"`

## Mutation DTO

`MutateMatchDto`:

- `sportId: uuid`
- `regionId?: uuid | null`
- `title: string`, max 80
- `description?: string | null`, max 2000
- `imageUrl?: string | null`
- `startsAt: ISO date`
- `endsAt?: ISO date | null`
- `deadlineAt?: ISO date | null`
- `capacity: number`, 2-100
- `manualPlaceName: string`, max 120
- `addressText?: string | null`, max 200
- `rulesText?: string | null`, max 2000

`UpdateMatchDto` adds `version: string`.

## State And Permissions

- Creating a match requires profile `realName`, phone, and gender; missing fields return `422 PROFILE_COMPLETION_REQUIRED`. Application and management endpoints are exempt.


- Create publishes a `recruiting` match and creates/keeps the host participant contract.
- Detail `participantCount` includes the host participant. `participantsPreview` is limited to the host on the detail surface.
- `deadlineAt` is persisted and returned on list/detail/edit responses. Once it passes, application eligibility returns `DEADLINE_PASSED` and the display state is treated as closed for CTA purposes.
- Apply creates a `requested` application. There is no payment or checkout step.
- Host approval creates or activates a participant and updates capacity-derived CTA state.
- Approval locks and re-reads the match before capacity and status checks, then conditionally moves only a still-`requested` application to `approved`. Withdrawal uses the same expected-status transition, so concurrent approval, withdrawal, and cancellation cannot leave an active participant attached to a contradictory terminal state.
- Withdraw/reject/cancel preserve history through application/status rows.
- Host-only manage actions must reject non-host users.

Primary tables:

- `v1_matches`
- `v1_match_applications`
- `v1_match_participants`
- `v1_status_change_logs`
