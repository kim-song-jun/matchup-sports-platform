# V1 Tournaments API

## Roster Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, team manager+ | path ids | roster players and `belowMinimum` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, team manager+ | `AddPlayerDto` | created or restored player |
| `DELETE` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | path ids | removed player |

## Player Add Contract

`POST /players` only accepts an active member of the registration team.

The service reads the selected member's profile and phone from the team membership user record. A member can be added only when all required source fields exist:

- `profile.displayName` as real name
- `profile.birthDate`
- `user.phone`

If any required source field is missing, the API rejects the request with `400 PLAYER_REQUIRED_PROFILE_MISSING`.

The stored roster snapshot uses the server-side member profile values for `realName` and `birthDateSnapshot`; clients must not treat editable form values as the source of truth.
