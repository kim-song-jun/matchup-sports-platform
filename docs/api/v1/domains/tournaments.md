# V1 Tournaments API

## Public Read Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments` | public | `TournamentListQueryDto` | cursor page of public tournaments |
| `GET` | `/api/v1/tournaments/:id` | public | path id | public tournament detail |

Public read endpoints expose only tournaments with `open`, `closed`, `in_progress`, or `completed` status and `deletedAt = null`. Registration, roster, and admin tournament routes remain authenticated.

## Registration Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/tournaments/:tournamentId/registrations` | user, team manager+ | `CreateRegistrationDto` | registration in `draft` |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/my-registration` | user | path ids | caller's latest registration |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId` | user, team manager+ | path ids | registration detail |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/submit` | user, team manager+ | `SubmitRegistrationDto` | registration in `awaiting_payment` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/cancel-request` | user, team manager+ | `CancelRegistrationRequestDto` | `draft` becomes `cancelled`; active statuses become `cancel_requested` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/cancel-request/withdraw` | user, team manager+ | empty body | `cancel_requested` returns to its saved previous status |

`cancel-request` stores the status that existed before `cancel_requested`. `cancel-request/withdraw` is allowed only while the registration status is `cancel_requested`; it clears `cancelRequestedAt`, `cancelReason`, and the stored previous status after restoring the registration.

`POST /registrations` is resumable for the same tournament/team while the existing registration is still `draft`. This covers users leaving the apply flow before final submit; the endpoint returns the existing draft instead of `ALREADY_REGISTERED`.

For bank-transfer submissions, the user-facing `/tournaments/:id/my` surface must combine the registration/payment response with `GET /tournaments/:id` account fields. A `bank_transfer` payment in `ready` status still needs the tournament `bankName`, `bankAccount`, and `bankHolder` shown in the application detail, even though the registration already has a `payment` object.

## Roster Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, team manager+ | path ids | roster players and `belowMinimum` |
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
