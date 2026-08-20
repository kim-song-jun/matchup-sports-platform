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
| `GET /users/:id/records` | `cursor?`, `limit?`, `season? (YYYY)` | `{ userId, nickname, summary, tournamentAwards[], items[], nextCursor }` |

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

Lineup revisions are immutable snapshots. The public match projection selects
the highest `V1GameLineup.revision` independently for each side and exposes
only participants whose `lineupId` belongs to that latest snapshot; repeated
draft saves therefore never append older saved lineups to the visible roster.

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

**Issue #377 -- fixture/field-scoped staff bypass (`getMatch` only).**
`GET /tournaments/:id/matches/:fixtureId` additionally accepts the caller's
optional identity (`OptionalV1AuthGuard`/`@CurrentUser()`, still no
`Idempotency-Key`/`expectedVersion` -- this stays a pure read). When a
logged-in caller is authorized via `TournamentStaffAccessService.assertAccess`
for `{ tournamentId, fixtureId, fieldId }` -- this fixture's *own* field, the
exact resource shape `TournamentFixtureLineupService.authorizeAndResolveGameId`
already uses for the ops lineup routes, never a `tournamentId`-only check --
`buildLineup`/`buildEvents`/`buildMvp` treat every participant on that one
response as eligible regardless of `isParticipantPubliclyEligible`. A
`FIELD_OPERATOR` assigned to a different field, or to a different fixture via
`fixtureScopes`, is not authorized for this resource and gets the identical
`WITHHELD_IDENTITY_LABEL`-driving `null` an anonymous visitor gets -- never a
403; an anonymous caller or an authenticated caller with no staff assignment
at all also both fall through to that same unauthorized/anonymous path. The
bypass only widens *which* names the consent gate would otherwise redact --
it never fabricates a name for a participant absent from the game's own
roster (`participant?.displayNameSnapshot ?? null` still applies). This
exception is scoped to `getMatch`'s single-fixture response only; `getSchedule`'s
scorer summary is unaffected and still applies the consent gate to every
caller, staff included.

### `resultState` (per match/schedule entry)

`pending` (no official revision yet, or one is mid-review) | `official`
(current revision is `OFFICIAL`, `supersedesId` is null) | `corrected`
(current revision is `OFFICIAL`, `supersedesId` is not null) | `void`
(current revision is `VOID`). The match view also exposes an ordered
`history[]` of every `OFFICIAL`/`VOID` revision the game has ever had
(revision number, state, `officialAt`, staff `reason`, whether it was a
correction) -- this contains no participant identity, so it is shown under
every non-hidden visibility mode.

### Lane 1 addition -- live score/clock for an in-progress fixture (2026-08)

Root cause found and fixed: for a `TOURNAMENT_FIXTURE` game,
`GamesService.deriveTournamentRevision` creates `V1GameResultRevision` (the
only thing `currentOfficialRevision.score` ever reads) exactly once, the
instant the game reaches `ENDED`. So every public read here returned
`score: null` for the *entire duration a fixture was actually being played*
-- silently breaking the frozen matrix's own "`live` exposes policy-eligible
lineup/score/events" row (`docs/api/domains/games.md` D-06) for precisely the
state a spectator most wants the score for, even though the operations
console showed the real score the whole time (it reads its own captured
event list directly, never `currentOfficialRevision`).

Fix: `score`/`scoreStatus`/a new `clock` field fall back to a live
projection, computed only when there is no official revision yet:

- `score` -- a GOAL-event tally (`tallyLiveScore`, `public-live-score.ts`),
  gated to **`mode === 'live'` and `status === 'live'` only** -- the same
  restriction `official_only` already implied ("official numeric only") is
  preserved unchanged; `status_only` still never gets a score. `scoreStatus`
  reports `'live'` whenever this tally is used.
- `clock` -- `{ periodNumber, elapsedMs, isPaused } | null`
  (`resolveLiveClock`, `public-clock.ts`), the pause-aware elapsed time of
  whichever `V1GamePeriod` row is currently `LIVE`, gated the same way as
  `score` above. `null` before kickoff, during a between-periods break, or
  once the game has ended.
- `periodBreak` -- `'halftime' | 'regulation_ended' | null`
  (`resolvePeriodBreak`, `public-clock.ts`), gated identically to `clock`
  above. Disambiguates *why* `clock` is `null` while the fixture is still
  `status === 'live'`: `'halftime'` (a `V1GamePeriod` row is `HALFTIME`) or
  `'regulation_ended'` (every period is `ENDED` but `V1Game.state` has not
  reached `ENDED` yet -- pending official confirmation or a penalty
  shootout). `null` whenever `clock !== null` (redundant otherwise) or the
  visibility mode withholds live detail. Mirrors the operations console's
  own `halftimePeriod`/`regulationEnded` derivation and its exact spectator
  wording ("하프타임"/"정규 시간 종료") so the two surfaces never disagree.

None of these fields is a new privacy tier: all are derived purely from data
the `live` mode already exposes elsewhere on the same response (`events[]`
already lists every GOAL; a running tally of the same GOALs reveals nothing
new; `periodBreak` reads the same `V1GamePeriod.state` column `clock` already
reads). `GET /tournaments/:id/schedule` batches this into a single extra
`V1GameEvent` query per page (grouped by `gameId`, only for fixtures whose
game is currently `LIVE`/`PAUSED`) rather than one query per fixture --
`PublicTournamentRecordsService.loadLiveScores`.

The frontend (`apps/v1_web/src/components/public-game-records/**`) polls
`GET /tournaments/:id/schedule` and `GET /tournaments/:id/matches/:fixtureId`
on a fixed interval *only* while the currently-loaded page has at least one
`status === 'live'` entry (`use-public-game-records.ts`). A public,
potentially-hundreds-of-viewers surface deliberately does not reuse the
operations console's authenticated realtime socket/takeover channel
(`apps/v1_api/src/realtime/realtime.gateway.ts`) -- that channel is scoped to
one authorized operator per game, not an unauthenticated fan-out audience,
and standing up a new public broadcast channel is out of this lane's scope.
Load model (stated accurately -- an earlier draft of this section claimed
polling load was independent of spectator count, which is wrong):
`react-query`'s cache lives in each viewer's browser and does not dedupe
requests across viewers, so server load is roughly
(spectators on a page holding a live fixture) x (1 / poll interval) and
**does** scale with viewers. What the design bounds is when that cost is
paid: a page with no live fixture never polls, and each viewer is floored at
a 10s interval (2026-08: relaxed from the original 8s, after a minute-scale
interval was tried and rejected -- this surface is what a spectator follows a
live game on, so score changes and period transitions must land while the game
is still on that play, and a stale summary defeats the feature). Past what
that supports, the next step is a shared cache (CDN/edge or server-side) or a
real public broadcast channel -- not a shorter interval.

### 승부차기(penalties) 표면화 -- 공개 일정/경기 상세 (2026-08)

`score` 는 `{ home, away, penalties: { home, away } | null }` 이다. `penalties` 는
결선(knockout)이 정규시간 동점으로 끝나 승부차기까지 간 경기에만 채워지고, 그 외에는
**키를 유지한 채 `null`** 이다(키 자체가 사라지는 경우는 없어, 소비처가 "키 없음"과
"값 null" 두 경우를 갈라 다룰 필요가 없다). 라이브 집계 스코어(`tallyLiveScore`)에는
승부차기 킥이 `V1GameEvent` 로 기록되지 않으므로 `scoreStatus: 'live'` 인 응답의
`penalties` 는 항상 `null` 이다.

`v1_game_result_revisions.score` 는 느슨한 JSON 이고 **승부차기 필드 이름이 저장
형태마다 다르다** -- 라이브 종료 경로가 쓰는 평평한 형태는 `penalties`(복수),
레거시 데이터의 중첩 형태는
`penalty`(단수). `parseScore` 는 정규 스코어와 마찬가지로 **양쪽을 모두 읽어**
위의 한 가지 모양으로 정규화한다(`tournaments/tournament-fixture-official-result.ts`
의 `parseTournamentFixtureOfficialScore` 와 같은 기준). 한쪽만 읽으면 그 형태로
저장된 경기에서만 승부차기가 조용히 사라진다 -- 이 저장소에서 반복된 함정이라
두 형태 모두 스펙으로 못박혀 있다.

프런트는 정규시간 스코어를 절대 승부차기 숫자로 덮지 않는다. 스코어라인
(`1 : 1`) 아래에 보조 텍스트("승부차기 4-3")로만 붙이고
(`components/public-game-records/penalty-scoreline.tsx`), 승부차기가 없는 경기에는
아무것도 렌더하지 않는다.

### Scorer timeline/summary addition -- spectator-facing goal identity (2026-08)

Two additions so a spectator (not just the participating teams) can see who
scored, both server-resolved so the frontend never has to reconstruct
identity/side itself:

- `GET /tournaments/:id/matches/:fixtureId` `events[]` now also carries
  `side: 'home' | 'away'` (resolved from `V1GameSide.sideKey`, not left as
  the opaque `sideId`) and `participantName`/`jerseyNumber` (same source and
  same consent gate as a lineup slot's `displayNameSnapshot`/`jerseyNumber`).
  Both are **deliberately independent of the lineup-publish gate**
  (`lineup`/`isLineupPublished`, D-02): that gate exists to stop a pre-match
  squad list leaking before kickoff, but a goal/card event can only ever
  exist once the match has started, so showing who scored is never a
  pre-match leak -- a consumer must not fall back to cross-referencing
  `lineup` by `participantId` to resolve a name or side, since that silently
  breaks in the one case (`lineup === null`) this decoupling exists to cover.
  CARD events additionally carry `cardColor: 'YELLOW' | 'RED' | null`, parsed
  from the immutable event `payload.card`. `null` is reserved for non-card
  events or malformed historical payloads; consumers must not present it as
  a yellow card.
- `GET /tournaments/:id/schedule` `items[]`/`unscheduled[]` gained
  `scorers: { side, participantName, jerseyNumber, period, clockMs }[]` -- a
  goal-only summary for the schedule card, same identity/consent rule as
  above. `period` is the stored game period (`1` first half, `2` second half,
  `null` only for malformed/historical data) and lets consumers group halves
  before sorting by `clockMs`. Unlike the Lane 1 live-score/clock fields, this is **not** gated by
  the `PUBLIC_LIVE` flag: `official_only` fixtures (the common case once a
  tournament has finished) must show their scorers regardless of that flag,
  since only the `LIVE` policy is ever demoted by it
  (`effectivePublicVisibilityMode`). Batched per page the same way
  `loadLiveScores` batches the live tally (`PublicTournamentRecordsService.loadScorers`)
  -- one extra `V1GameEvent` query for every fixture on the page that has a
  game, never one query per fixture. `status_only` fixtures always get `[]`
  (that mode hides events/scores entirely).

### Known scope trims (documented, not silently dropped)

- The schedule list only cursor-paginates fixtures that already have a
  `scheduledAt`; fixtures still `TBD` (bracket slot exists, no kickoff time
  assigned yet) are returned separately and unpaginated under `unscheduled`,
  to avoid a fragile nulls-last cursor comparator.
- `nextMatch` on the match view is a simple "next fixture where either of
  these two teams next appears" lookup, not a bracket-aware "next round"
  projection.

### Official goal timeline and minute display (2026-08-19)

When an official result exists, schedules, match detail, and team records
prefer currentOfficialRevision.goalEvents. Corrected scorer, own-goal type,
order, and minute therefore replace the raw append-only goal projection only
after officialization. A null snapshot from an older revision falls back to
active GOAL and OWN_GOAL events.

Public record time uses a ceiling minute without seconds. An event captured at
2:04 is displayed as 3′. Own goals count toward the credited team score and
are labelled separately, but never count as the culprit's personal goal or
the tournament scorer ranking. Schedule, match-detail, and team-record event
rows place the own-goal participant under the participant's actual team, not
under the team credited with the score.

### Participant identity linkage and personal records (2026-08-20)

Personal activity records are derived from official game revisions; they are
not maintained as a second per-user statistics table. A participant is visible
to that derivation only after a current participant-to-user identity link exists.

`GamesService.createFromSourceInTransaction` now treats a source roster slot
with a persisted `userId` the same way as a later lineup save: in the game
creation transaction it appends a `ROSTER_ASSERTED` identity-link event and
upserts the matching current link. Guest slots without a `userId` remain
unlinked. This prevents source-created tournament games from becoming official
while their real lineup users still have empty `/users/:id/records` responses.

Historic repair is deliberately scoped to one tournament and is dry-run by
default:

```powershell
pnpm --filter v1_api exec ts-node --transpile-only src/games/migration/participant-identity-link-backfill.cli.ts --tournament-id <uuid>
pnpm --filter v1_api exec ts-node --transpile-only src/games/migration/participant-identity-link-backfill.cli.ts --tournament-id <uuid> --apply
```

The repair considers only participants from current official revisions with a
persisted `userId`, no current link, and no prior identity-link event history.
Rejected, revoked, or otherwise historically adjudicated links are therefore
never recreated by this command. Applied rows use the system actor
`GAME_BACKFILL`, and rerunning the command is idempotent.

### Match MVP and tournament awards (2026-08-20)

The user-record summary separates four user-facing metrics: `appearances`,
`goals`, `matchMvpCount`, and `tournamentAwardCount`. Match MVP is derived
only from the current official result revision's `mvpParticipantId`.
`mvpCount` remains as a temporary compatibility alias with the same value as
`matchMvpCount`; new clients must use the explicit field.

`tournamentAwards[]` is a separate list backed by
`V1TournamentAward.recipientUserId`. Each item contains `id`,
`tournamentId`, `tournamentTitle`, `awardType`, the tournament-defined
`awardLabel`, nullable `iconKey`, `teamName`, `note`, and `awardedAt`.
Clients display `awardLabel` verbatim because award categories vary by
tournament; they must not collapse tournament awards into match MVP.

Self-view returns linked tournament awards regardless of public-record consent,
matching the existing self-view game-record bypass. Other viewers receive the
linked award list only while the target user's record consent is `GRANTED`;
the response still omits `consentGranted` for non-owners.
