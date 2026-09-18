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
| `POST` | `/api/v1/matches/:matchId/complete` | user host | empty body | completed match and participant count |
| `POST` | `/api/v1/matches/:matchId/cancel` | user host | `{ reason?: string | null }` | cancelled match |
| `POST` | `/api/v1/match-applications/:applicationId/withdraw` | user applicant | `{ reason?: string | null }` | withdrawn application |
| `POST` | `/api/v1/match-applications/:applicationId/approve` | user host | `{ note?: string | null }` | approved application and participant |
| `POST` | `/api/v1/match-applications/:applicationId/reject` | user host | `{ reason?: string | null }` | rejected application |
| `POST` | `/api/v1/match-participants/:participantId/cancel-approval` | user host | `{ reason: string }` | removed participant, cancelled_by_host application |
| `POST` | `/api/v1/match-participants/:participantId/mark-cancelled` | user host | `{ reason: string }` | no_show participant, cancelled_by_host application |

### Host participant actions

- Cancellation is available before `startsAt`; no-show handling is available from `startsAt` until completion.
- Only active non-host participants in recruiting/closed matches can be changed. Completed history is immutable.
- A trimmed reason of 1–500 characters is required. Invalid input returns 400, non-host callers 403,
  missing participants 404, and invalid/repeated transitions 409. No simulated success or idempotency key.
- Match-row locking serializes participant changes with completion/withdrawal. Participant and application
  changes plus both actor/reason audit entries commit atomically. Removed/no-show users are excluded from
  occupancy, chat access, completed activity and review eligibility.
- Host application lists include `participantId`, `participantStatus`, `canCancelApproval`, `canMarkCancelled`.
  The web uses these flags, collects a reason and confirms the action before submitting the participant ID;
  success invalidates v1 queries, failure keeps the reason and shows the server error.

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

Update and reopen lock the match row before validating current state. Updates recheck version and active
capacity under that lock; concurrent edits with the same version return one success and one 409.
Capacity reductions serialize with approvals. Started matches, including raw `closed`, are not editable.
Reopen cannot overwrite concurrent cancellation/completion and duplicate reopen does not duplicate logs.

## State And Permissions

- Creating a match requires profile `realName`, phone, and gender; missing fields return `422 PROFILE_COMPLETION_REQUIRED`. Application and management endpoints are exempt.


- Create publishes a `recruiting` match and creates/keeps the host participant contract.
- Detail `participantCount` includes the host participant. `participantsPreview` is limited to the host on the detail surface.
- `deadlineAt` is persisted and returned on list/detail/edit responses. Once it passes, application eligibility returns `DEADLINE_PASSED` and the display state is treated as closed for CTA purposes.
- Apply creates a `requested` application. There is no payment or checkout step.
- Host approval creates or activates a participant and updates capacity-derived CTA state.
- Detail returns `canComplete`, `canWithdraw`, and `completedAt`. A host can complete a
  `recruiting`/`closed` match only after `endsAt` (or `startsAt` when no end exists). Completion locks the
  match and atomically marks the match and all current active participants `completed`, expires remaining
  requested applications, and is retry-safe without double-counting profile activity. It records participation
  only; personal recruitment matches do not synthesize goals, assists, wins, or losses.
- Approval locks and re-reads the match before capacity and status checks, then conditionally moves only a still-`requested` application to `approved`. Withdrawal and rejection use the same expected-status transition, and resubmission only replaces the previously observed terminal state, so concurrent approval, withdrawal, rejection, resubmission, and cancellation cannot report contradictory success.
- An applicant may also withdraw an `approved` application before kickoff. The same locked transaction changes
  its active participant row to `cancelled`, restoring capacity and removing current chat/completion eligibility.
  Withdrawal after kickoff or in a terminal match returns `409 STATE_CONFLICT`.
- Withdraw/reject/cancel preserve history through application/status rows. The host applicant list accepts all
  application states as filters so the web UI can expose pending, confirmed, and full-history tabs.
- `GET /me/matches` is consumed with `pageInfo` cursor pagination; the web client accumulates pages instead of
  truncating personal history at the first 50 rows.
- Host-only manage actions must reject non-host users.

Primary tables:

- `v1_matches`
- `v1_match_applications`
- `v1_match_participants`
- `v1_status_change_logs`
