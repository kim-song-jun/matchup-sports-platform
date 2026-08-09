# Public records and consent contract

<!-- API_CONTRACT_SECTION_BEGIN:Public visibility output matrix -->
### Public visibility output matrix
| Mode | Bracket/status | Lineup | Score | Events | Records |
|---|---|---|---|---|---|
| `hidden` | hidden | hidden | hidden | hidden | hidden |
| `status_only` | lifecycle only | hidden | status without numeric score | hidden | official historical records only |
| `live` | visible | after authoritative `lineupAt` | live numeric | live consent-filtered | official records plus pending-projection marker |
| `official_only` | visible | official snapshot only | official numeric only | official event summary only | official records only |

<!-- API_CONTRACT_SECTION_END:Public visibility output matrix -->

<!-- API_CONTRACT_SECTION_BEGIN:Consent truth table -->
### Consent truth table
| Transition/state | Public career/history | Team aggregates | Cache and immutable snapshot |
|---|---|---|---|
| Unlinked guest | never creates a career page | included under pseudonymous participant ID | name snapshot retained operations/audit only |
| Two-party link attested at T1 without consent | pre/post-T1 hidden | retained | immutable link events record requestor and distinct attestor; null consent version |
| Consent vN granted at T2 | events at/after T2 become eligible; no pre-T2 backfill | retained | future snapshots capture vN; rebuild starts at T2 |
| Consent vN revoked at T3 | all identity-linked career rows, including pre-T3 rows, hide immediately; no future projection | retained and never publicly relinked | public cache purge ≤5s; snapshots/audit retain pseudonymous ID, vN, grant/revoke times |
| Regrant vN+1 at T4 | only events at/after T4 become eligible; hidden older rows stay hidden | retained | future snapshots capture vN+1; no automatic historical relink |
| Linked user later unlinked | public career rows hide immediately and future projection stops | retained | same as revoke; immutable operations snapshot remains pseudonymous |

<!-- API_CONTRACT_SECTION_END:Consent truth table -->

<!-- API_CONTRACT_SECTION_BEGIN:Consent lifecycle and retroactivity -->
### Consent lifecycle and retroactivity
- Consent is versioned per participant snapshot. Grant permits future public player projection; no consent keeps only team aggregates and operations-only identity.
- Revocation immediately hides player-identifying public DTO/HTML/metadata, purges public cache within the 5-second projection SLO, and removes all identity-linked career rows including pre-revocation history; regrant restores eligibility only for events at or after the new grant time.
- Historical team score/event aggregates and an internal pseudonymous participant snapshot remain for integrity and audit; they can never relink publicly. Audit retention preserves consent version, actor, timestamp, and policy basis.

<!-- API_CONTRACT_SECTION_END:Consent lifecycle and retroactivity -->

## Task 24 -- implementation

Backend lane: `apps/v1_api/src/games/public-records`. All four routes are
public (`OptionalV1AuthGuard`, no `Idempotency-Key`, no `expectedVersion` --
these are pure reads). Wired into the running app via a single
`imports: [PublicRecordsModule]` line in `tournaments.module.ts` (that file
is not a declared Task 127 output for any todo, matching the precedent
already set there by `TournamentResultReviewController`/`Service`); no other
existing file changed.

### Routes

| Method/path | Query | Response shape |
|---|---|---|
| `GET /tournaments/:id/schedule` | `cursor?`, `limit? (1-100, default 20)`, `round?`, `groupId?` | `{ tournamentId, tournamentTitle, bracketPublished, items[], unscheduled[], standings[], nextCursor }` |
| `GET /tournaments/:id/matches/:fixtureId` | -- | one match projection (see below) |
| `GET /teams/:id/records` | `cursor?`, `limit?`, `season? (YYYY)` | `{ teamId, teamName, teamLogoUrl, summary, items[] (including opponentTeamLogoUrl), nextCursor }` |
| `GET /users/:id/records` | `cursor?`, `limit?`, `season? (YYYY)` | `{ userId, nickname, summary, items[], nextCursor }` |

`cursor` is opaque (base64url JSON `{key,id}`); never construct it
client-side.

### Server-enforced visibility (matches the frozen output matrix exactly)

Each fixture/game independently resolves `hidden | status_only | live |
official_only` from `V1GameVisibilityPolicy.mode` + the `PUBLIC_LIVE`
operation flag (`effectivePublicVisibilityMode` in `public-visibility.ts`,
D-06: the flag can only ever demote `live` to `status_only`). A `hidden`
fixture is *never* listed in the schedule and its match route returns the
exact same `404 TOURNAMENT_MATCH_NOT_FOUND` as a genuinely nonexistent
fixture or an unpublished bracket -- a caller cannot distinguish "does not
exist" from "exists but hidden" from "tournament hasn't published its
bracket yet".

Lineup gating (D-02): `publicLineupAt` prefers the durable
`V1GameVisibilityPolicy.lineupAt` pin once the write side sets it, and
falls back to `fixture.scheduledAt - 60m` before that -- so the public
default fails closed (no lineup) even when nothing has explicitly published
it yet, without needing a scheduler.

### Consent-gated personal identity (D-03/D-11, `public-consent.ts`)

A participant's `displayNameSnapshot` is exposed in a lineup slot, a
goal/card event, or an MVP field **only** when
`isParticipantPubliclyEligible` passes for that exact participant row as of
the relevant instant (the game's `officialAt` once official, `now()` while
still live): a current identity link to a platform user must exist, and
that link's *latest* consent snapshot must be `GRANTED` with an
`effectiveAt` at or before that instant. Everywhere else (unlinked guest,
no consent snapshot yet, latest snapshot `REVOKED`, or a `GRANTED` snapshot
whose `effectiveAt` is later than the instant in question) the identity
field is `null`; the goal/card/lineup slot itself still appears (side, type,
minute, jersey number) -- only the *who* is redacted. This is the same rule
`GET /users/:id/records` uses to decide whether a `V1GameResultParticipant`
row contributes to that user's public career at all, so a match's public
lineup and that same participant's personal record page can never disagree
about whether they are nameable.

Every read additionally requires `game.currentOfficialRevisionId` to equal
the specific row's `revisionId` (team fact, result-participant, or cache
row) before counting it -- exactly the join the void-projection worker's own
comment documents, so a superseded (`corrected`) or voided result is never
double-counted or shown stale, and a voided game's team/player rows
disappear the instant the pointer swaps without any row being deleted.

### `resultState` (per match/schedule entry)

`pending` (no official revision yet, or one is mid-review) | `official`
(current revision is `OFFICIAL`, `supersedesId` is null) | `corrected`
(current revision is `OFFICIAL`, `supersedesId` is not null) | `void`
(current revision is `VOID`). The match view also exposes an ordered
`history[]` of every `OFFICIAL`/`VOID` revision the game has ever had
(revision number, state, `officialAt`, staff `reason`, whether it was a
correction) -- this contains no participant identity, so it is shown under
every non-hidden visibility mode.

### Known scope trims (documented, not silently dropped)

- The schedule list only cursor-paginates fixtures that already have a
  `scheduledAt`; fixtures still `TBD` (bracket slot exists, no kickoff time
  assigned yet) are returned separately and unpaginated under `unscheduled`,
  to avoid a fragile nulls-last cursor comparator.
- `nextMatch` on the match view is a simple "next fixture where either of
  these two teams next appears" lookup, not a bracket-aware "next round"
  projection.
