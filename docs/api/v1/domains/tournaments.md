# V1 Tournaments API

## Read Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments` | optional user | `TournamentListQueryDto` | public tournament list page |
| `GET` | `/api/v1/tournaments/:tournamentId` | optional user | path id | public tournament detail |

Tournament list/detail reads are public. Clients may call them without a stored v1 session; authenticated-only state such as the caller's registrations must use the registration endpoints below and should only be queried after login.

## Admin Tournament Creation

Admin-created tournaments require `teamCount` per tournament. The API does not treat an omitted team count as unlimited; missing `teamCount` is rejected with `400 TOURNAMENT_TEAM_COUNT_REQUIRED`. Public capacity, registration blocking, and progress bars must use the saved tournament `teamCount`, not a hard-coded default.

Admin-facing prize entry is text-first. `prizeSummary` is the public "상품 및 상금" display string and clients must render that text as entered instead of deriving `총 N원` or `최대 N원` copy from `prizePool`. `prizeBreakdown` remains the comma/dot/newline-delimited breakdown string that public detail renders as separate chips below the main prize card.

## Registration Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/tournaments/:tournamentId/registrations` | user, team manager+ | `CreateRegistrationDto` | registration in `draft` |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/my-registration` | user | path ids | caller's latest registration |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/my-registration?scope=teams` | user, active team member | path ids | registrations for teams the caller belongs to |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/my-registrations` | user, active team member | path ids | registrations for teams the caller belongs to |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId` | user, active team member | path ids | registration detail |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/submit` | user, team manager+ | `SubmitRegistrationDto` | registration in `awaiting_payment` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/cancel-request` | user, team manager+ | `CancelRegistrationRequestDto` | `draft` becomes `cancelled`; active statuses become `cancel_requested` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/cancel-request/withdraw` | user, team manager+ | empty body | `cancel_requested` returns to its saved previous status |

`cancel-request` stores the status that existed before `cancel_requested`. `cancel-request/withdraw` is allowed only while the registration status is `cancel_requested`; it clears `cancelRequestedAt`, `cancelReason`, and the stored previous status after restoring the registration.

`POST /registrations` is resumable for the same tournament/team while the existing registration is still `draft`. This covers users leaving the apply flow before final submit; the endpoint returns the existing draft instead of `ALREADY_REGISTERED`.

Registration uniqueness is `tournamentId + teamId`. If the database still has an older user-scoped or tournament-scoped unique index, creating another team registration may fail with `409 TOURNAMENT_REGISTRATION_UNIQUE_SCOPE_MISMATCH`; apply the v1 tournament registration team-unique migration before treating the API as ready.

Tournament registration ownership is team-scoped, not user-singleton. A user can belong to multiple teams, so `my-registrations` is the canonical frontend entry point for "내 신청 보기"; it returns every registration for the tournament where the caller has active membership on the registered team. `my-registration?scope=teams` remains an equivalent compatibility route, and plain `my-registration` remains for backward compatibility with one caller-created registration. Create, submit, cancel, and roster mutations remain owner/manager-only.

For bank-transfer submissions, the user-facing `/tournaments/:id/my` surface must combine the registration/payment response with `GET /tournaments/:id` account fields. A `bank_transfer` payment in `ready` status still needs the tournament `bankName`, `bankAccount`, and `bankHolder` shown in the application detail, even though the registration already has a `payment` object.

Public tournament list/detail responses include both `confirmedCount` and `pendingPaymentCount`. `pendingPaymentCount` counts registrations in payment-stage statuses (`awaiting_payment`, `payment_checking`, `paid`) so clients can show predicted capacity as confirmed + payment-pending teams. `POST /registrations` and `POST /registrations/:registrationId/submit` reject with `409 TOURNAMENT_CAPACITY_FULL` when confirmed + payment-stage registrations already reaches `teamCount`; draft registrations do not reserve capacity.

## Roster Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, active team member | path ids | roster players and `belowMinimum` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, team manager+ | `AddPlayerDto` | created or restored player |
| `PATCH` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | `UpdatePlayerEligibilityDto` | updated player |
| `DELETE` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | path ids | removed player |

## Player Add Contract

`POST /players` only accepts an active member of the registration team.

The service reads the selected member's profile and phone from the team membership user record. A member can be added only when all required source fields exist:

- `profile.displayName` as real name
- `profile.birthDate`
- `user.phone`

If any required source field is missing, the API rejects the request with `400 PLAYER_REQUIRED_PROFILE_MISSING`.

The stored roster snapshot uses the server-side member profile values for `realName` and `birthDateSnapshot`; clients must not treat editable form values as the source of truth.

`PATCH /players/:playerId` is available only before `rosterLockedAt`. It lets team managers correct the player's `eligibilityStatus` only. The already stored roster snapshots (`realName`, `birthDateSnapshot`) are not refreshed by eligibility edits, and the current member profile/phone is not revalidated on this path.
