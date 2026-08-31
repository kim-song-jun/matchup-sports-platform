# V1 Tournaments API

## Read Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments` | optional user | `TournamentListQueryDto` | public tournament list page |
| `GET` | `/api/v1/tournaments/:tournamentId` | optional user | path id | public tournament detail |
| `GET` | `/api/v1/tournaments/campaigns/:slug` | public | lowercase kebab slug | published campaign + safe tournament facts |

Tournament list/detail reads are public. Clients may call them without a stored v1 session; authenticated-only state such as the caller's registrations must use the registration endpoints below and should only be queried after login. Public read endpoints expose only tournaments with `open`, `closed`, `in_progress`, or `completed` status and `deletedAt = null`. Registration, roster, and admin tournament routes remain authenticated.

Public list/detail items include `campaignSlug` only while the related campaign is `published`; otherwise the field is `null`. The slug endpoint also requires a published campaign and a non-deleted tournament in `open`, `closed`, `in_progress`, or `completed`. Its tournament projection contains display facts, rules/refund policy, active sponsors, confirmed count, and public confirmed/waitlisted team summaries. It never returns bank account fields, player/contact PII, creator/admin identity, or deleted-row metadata.

After bracket publication, each public `groups[].standings[]` row includes nullable `teamLogoUrl` from the registered team's current profile. Tournament detail and bracket clients render it through the shared team-avatar fallback contract, so a missing or failed image remains distinguishable without replacing valid saved logos.

## Individual awards

`GET /api/v1/admin/tournaments/:tournamentId/awards` returns the saved award list, and `PUT` to the same path replaces it atomically. Each admin item contains `awardType`, `awardLabel`, nullable `iconKey`, `recipientName`, nullable `recipientUserId`, nullable `teamName`, nullable `note`, and optional `sortOrder` on writes. New writes require a UUID `recipientUserId`; the nullable admin read shape only accommodates historical rows that could not be linked without ambiguity. `iconKey` accepts `trophy`, `crown`, `goal`, `shield`, `glove`, `handshake`, `sparkles`, `medal`, or `star`; unknown values are rejected by DTO validation. Public `GET /api/v1/tournaments/:id` keeps the display snapshot but deliberately omits `recipientUserId`, so a public award cannot bypass the user's record-consent gate to reveal account linkage. Existing rows with `iconKey=null` retain the legacy `awardType`-based icon mapping in the Web client.

Award mutations require a mutation-capable active admin. The submitted `recipientUserId`, `recipientName`, and optional `teamName` must resolve to the same active player row under a confirmed registration. The server persists the roster's canonical real-name and team snapshots rather than trusting arbitrary identity text. The mutation replaces awards and writes its admin audit record in one transaction. Schema migration remains additive-only; the post-migrate `tournament-award-recipient-backfill.cli.ts` links historical rows only when tournament/team/name matching produces exactly one distinct user. It is idempotent, supports `--dry-run`, and leaves ambiguous rows null for manual reselection.

Published `fixtures[]` also includes nullable `homeTeamId`, `homeTeamLogoUrl`, `awayTeamId`, and `awayTeamLogoUrl`. Bracket match cards use these identity fields for saved team logos and reserve the generated fallback only for missing, undecided, or failed images.

Each published fixture carries two distinct status fields, and public surfaces must not confuse them:

- `status` — the raw `V1TournamentFixture.status` column. The enum has four values (`scheduled | in_progress | completed | cancelled`), but only two are ever written: `scheduled` at bracket creation and `completed` when a result is officialized. **No writer advances it to `in_progress` or `cancelled`**, so it stays `scheduled` for the entire duration of a live match. Treat it as "has this fixture's result been decided", never as "is this match live".
- `liveStatus` — required, one of `scheduled | live | ended | cancelled`. Derived by `publicFixtureStatus()` (`PublicFixtureStatus`), which prefers the authoritative `V1Game.state` and falls back to the column only when no game row exists yet. This is the same vocabulary and the same function that `GET /api/v1/tournaments/:id/schedule` and `GET /api/v1/tournaments/:id/matches/:fixtureId` already return, so all three public reads agree. **Every live-state decision — LIVE badges, bracket/stepper progress, spectator polling gates — must read `liveStatus`.**

## Tournament staff runtime boundary

Task 7 wires the scoped tournament-staff access, guard, and management services into
`TournamentsModule`. Active assignments are evaluated against tournament, fixture, and field/court
scope; expired, revoked, stale-version, or cross-scope authority fails with
`403 STAFF_SCOPE_DENIED`. Staff management mutations share the append-only operation audit writer,
and a committed revoke immediately disconnects the affected user's realtime sockets.

No tournament-staff HTTP endpoint is part of Task 7. Task 18 owns the future list, bootstrap,
grant, and revoke controllers/DTOs. Existing `/api/v1/admin/**` routes and their active-admin
authorization remain unchanged; a tournament assignment is never a global Admin grant.

## Tournament Campaign Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/tournaments/:tournamentId/campaign` | active admin; support read allowed | path id | campaign in any state |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/campaign/preview` | active admin; support read allowed | path id | public-safe campaign projection in its actual state |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/campaign` | owner/ops | `CreateTournamentCampaignDto` | created draft campaign |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/campaign` | owner/ops | `UpdateTournamentCampaignDto` | edited campaign |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/campaign/status` | owner/ops | `ChangeTournamentCampaignStatusDto` | updated campaign or idempotent status result |

Each tournament has at most one persistent `V1TournamentCampaign`. Its slug is globally unique, 3–80 characters, and lowercase kebab-case. A draft slug may be corrected before first publication; after `publishedAt` is first set, the slug is permanently locked, including after moving back to draft or archiving. Archived rows and slugs are retained. There is no campaign delete endpoint and the migration performs no backfill. `archivedAt` is set when entering `archived` and cleared when returning to `draft`; the original `publishedAt` remains permanent.

Campaign content is one versioned JSON object. Version `1` accepts only `hero`, `intro`, `highlightsSectionTitle`, `highlights`, `faqSectionTitle`, and `faq`: hero title/summary/image, intro title/body, required editable highlights and FAQ section titles, up to 8 highlights, and up to 12 FAQ items. Both section titles are plain text with a 1–120 character bound. Images accept canonical local `/uploads/...` paths or normalized public HTTPS URLs; credentials, control/quote/backslash characters, traversal, and literal loopback/private/link-local hosts are rejected. Text and URL lengths are bounded by `TournamentCampaignContentDto`; missing required nested objects or section titles, whitespace-only text, unknown nested fields, raw HTML/CSS/JavaScript markers, and any version other than `1` are rejected by the global strict validation pipe. Stored JSON is revalidated on every admin/public read and invalid rows fail explicitly with `TOURNAMENT_CAMPAIGN_CONTENT_INVALID` instead of falling back.

The dedicated admin preview endpoint is not an alias for the public slug route. After active-admin authorization, including the read-only `support` role, it reads a campaign by tournament id without filtering out `draft` or `archived` status. Its response is `{ id, slug, status, content, publishedAt, updatedAt, tournament }`; `status` is the row's actual `draft | published | archived` value and `tournament` is generated by the same public-safe projection used by the published slug endpoint. The preview never adds bank account fields, player/contact PII, creator/admin identity, or deleted-row metadata. Preview access does not relax public visibility: `GET /tournaments/campaigns/:slug` remains published-only and returns `TOURNAMENT_CAMPAIGN_NOT_FOUND` for draft or archived campaigns.

The campaign tournament projection includes `confirmedCount`, `pendingPaymentCount`, and `registrationAvailability`. `pendingPaymentCount` counts capacity-holding `awaiting_payment`, `payment_checking`, and `paid` registrations without exposing those teams in `participantTeams`. `registrationAvailability` is server-derived as `available | deadline_passed | full | started | closed`, using the tournament status, scheduled start, registration deadline, and confirmed-plus-pending capacity. Campaign clients must expose the application CTA only for `available`; a stale `open` status cannot override a passed deadline, started event, or full capacity.

The Web campaign route is `/tournaments/campaigns/:slug` with no browser `/v1` prefix. Its server loader calls the API through `INTERNAL_API_ORIGIN`, maps only an upstream campaign `404` to Next.js `notFound()` so the browser response is a real HTTP 404, and surfaces non-404 upstream failures as load errors instead of a soft-404 or empty fallback.

Status transitions are `draft -> published | archived`, `published -> draft | archived`, and `archived -> draft`. Repeating the current status is an idempotent no-op. Every status request requires a non-empty audit `reason`. Publishing additionally requires the related tournament to be non-deleted and in a public status. Update/status reads, compare-and-swap writes, and admin audit logs run in serializable transactions; stale concurrent mutations return `TOURNAMENT_CAMPAIGN_CONCURRENT_UPDATE`. Empty or identical PATCH requests return `TOURNAMENT_CAMPAIGN_NO_CHANGES`. Other contract errors are `TOURNAMENT_CAMPAIGN_NOT_FOUND`, `TOURNAMENT_CAMPAIGN_EXISTS`, `TOURNAMENT_CAMPAIGN_SLUG_TAKEN`, `TOURNAMENT_CAMPAIGN_SLUG_LOCKED`, and `NOT_PUBLISHABLE`.

Campaign admin routes inherit `V1AuthGuard`. Production accepts only the signed HttpOnly v1 session, reloads current account status, ignores caller-controlled `x-v1-user-*` headers, and fails startup without a strong session secret. Development/test may retain persona headers for local QA only.

## Admin Tournament Creation

Admin-created tournaments require `teamCount` per tournament. The API does not treat an omitted team count as unlimited; missing `teamCount` is rejected with `400 TOURNAMENT_TEAM_COUNT_REQUIRED`. Public capacity, registration blocking, and progress bars must use the saved tournament `teamCount`, not a hard-coded default.

## Competition Configuration

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/competition-configs` | active admin; support read allowed | optional `sportCode`, `version` | deterministic version list |
| `POST` | `/api/v1/admin/competition-configs` | owner/ops | `CreateCompetitionConfigDto` | new named config at version `1` |
| `GET` | `/api/v1/admin/competition-configs/:configId/versions` | active admin; support read allowed | path id | versions for the source config's sport/name |
| `POST` | `/api/v1/admin/competition-configs/:configId/versions` | owner/ops | `CreateCompetitionConfigVersionDto` | next immutable version |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/competition-config` | owner/ops | `ChangeTournamentCompetitionConfigDto` | preview or confirmed pin change |

Every persisted tournament, tournament fixture, and team match stores a non-null `competitionConfigVersionId`. Inserts resolve the preset from the persisted `sportId` in the database transaction; reads never infer a config. Canonical v1 presets are `football-v1` for sport codes `soccer` or `football`, and `futsal-v1` for `futsal`. A missing sport fails with `COMPETITION_CONFIG_SPORT_REQUIRED`; any other sport fails with `COMPETITION_CONFIG_SPORT_UNSUPPORTED`. Migration backfill checks every tournament and team match before updating any row and aborts its single transaction on the first unsupported or missing source.

The v1 config document fixes periods, supported events, lineup/substitution bounds, tournament and ordinary-match scorer policy, zero-or-one MVP, visibility states, points, and this exact standings tie-break order: points, head-to-head, goal difference, goals for, fair play, seeded draw. Seeded draw uses SHA-256 over `tournamentId + ":" + configVersionId + ":" + sortedRegistrationIds`; no registration insertion order or random runtime value is used. Invalid documents fail with `COMPETITION_CONFIG_INVALID`.

Config rows are append-only once referenced by a game, tournament, team match, or fixture. Updating or deleting a used row fails with `COMPETITION_CONFIG_VERSION_IN_USE`; operators create a new version instead. A tournament config change uses `expectedVersion` equal to the current tournament `updatedAt` ISO timestamp. If completed fixtures or standings exist, the first request returns `confirmationRequired=true`, `impact`, and the selected config's `previewHash` without changing data. The confirming request must repeat the current `expectedVersion`, set `confirmRecalculation=true`, and return the same `previewHash`. Scheduled fixtures move to the new pin; completed fixtures keep their historical pin. Standings recalculation reads the tournament's persisted config and returns the applied config version id.

Paid tournaments (`entryFee > 0`) require `bankName`, `bankAccount`, and `bankHolder`. Create/update rejects incomplete payment instructions with `400 TOURNAMENT_PAYMENT_INSTRUCTIONS_REQUIRED`, and a draft cannot transition to `open` until the same invariant is satisfied. The four-step Web wizard validates this before submission so applicants are never placed on a payment-expiry clock without usable transfer instructions.

## Task 6 fixture Game and result gate

`POST /api/v1/admin/tournaments/:tournamentId/fixtures` uses `CreateFixtureDto` and requires an
authenticated mutation-capable admin. In its source transaction, it copies the tournament's
active `competitionConfigVersionId` to the fixture and creates exactly one `TOURNAMENT_FIXTURE`
Game with HOME/AWAY side snapshots and the registered participant snapshots. A missing or
inactive pin fails with `409 COMPETITION_CONFIG_REQUIRED` and rolls back both fixture and Game.
The deterministic fixture command is derived from tournament, round, fixture number, and leg;
the same payload replays the original fixture, while a changed payload with that key returns
`409 COMMAND_IDEMPOTENCY_PAYLOAD_REUSE`.

| Method | Path | DTO | Result |
|---|---|---|---|
| `POST` | `/api/v1/admin/tournaments/:tournamentId/fixtures` | `CreateFixtureDto` | active admin fixture/Game source creation or the explicit pin/idempotency conflict above. |

The legacy generic result paths remain registered only to reject unsafe writes:

| Method | Path | DTO | Result |
|---|---|---|---|
| `POST` | `/api/v1/admin/fixtures/:fixtureId/result` | `RecordResultDto` | authenticated admin reaches the handler and receives `409 TOURNAMENT_RESULT_DERIVED_ONLY`; it creates no legacy result, Game revision, or event. |
| `DELETE` | `/api/v1/admin/fixtures/:fixtureId/result` | none | authenticated admin reaches the handler and receives `409 TOURNAMENT_RESULT_DERIVED_ONLY`; it deletes nothing. |

Tournament results are produced through the corresponding Game command/result-revision flow:
the normal tournament `end` command derives and submits the revision atomically, and generic
fixture result writes cannot bypass that append-only history. Fixture/scorer examples used by
tests are deterministic non-verified fixtures, never real tournament standings or player proof.

Admin create/update accepts `rulesText` up to 10,000 characters. `refundPolicyText` remains a separate field with a 2,000-character limit.

Tournament schedule stores a start datetime in `scheduledAt` and an optional end datetime in `scheduledEndAt`. Admin create/update rejects `scheduledEndAt` when it is earlier than the final `scheduledAt` with `400 TOURNAMENT_SCHEDULE_RANGE_INVALID`. Public list/detail/admin responses include both fields; clients render a single date when `scheduledEndAt` is empty or the same calendar label, and a range when it spans multiple dates.

Tournament gender classification uses the enum `genderCategory = mixed | male | female`. Existing tournaments may retain `null` as an honest “unclassified” state until an operator chooses a category. The four nullable mixed-roster bounds are `genderMinMale`, `genderMaxMale`, `genderMinFemale`, and `genderMaxFemale`. Bounds are stored only for `mixed`; changing a tournament to `male` or `female` clears them. Create/update rejects a minimum above its matching maximum, a combined minimum above `maxPlayers`, or an individual maximum above `maxPlayers` with `400 TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID`. Public list items expose the category, while public/admin detail responses expose the category and all four bounds.

The admin creation surface is a four-step controlled wizard: basic information, schedule/location, participation requirements, then prize/rules/promotion. It uses native `datetime-local` inputs, suggests registration deadline D-3 23:59 and roster deadline D-7 23:59 until the operator manually edits each value, and preserves every field while navigating between steps. Tournament edit reuses the same date, cover, prize-breakdown, and promotion-card components. On update, clearing an optional schedule, venue, bank, rules, or refund field sends `null` and persists the cleared state instead of silently omitting the field.

Admin-facing prize entry is text-first. `prizeSummary` is the public "상품 및 상금" display string and clients must render that text as entered instead of deriving `총 N원` or `최대 N원` copy from `prizePool`. `prizeBreakdown` remains the comma/dot/newline-delimited breakdown string that public detail renders as separate chips below the main prize card.

Tournament promo cards are separate from prize fields and from the normal tournament edit surface. Admin update/create accepts independent home promo fields (`promoHomeEnabled`, `promoHomeTitle`, `promoHomeSubtitle`, `promoHomeImageUrl`, `promoHomeBadgeText`, `promoHomeDateText`, `promoHomeTeamsText`, `promoHomeLocationText`, `promoHomePrizeText`, `promoHomePriority`) and list promo fields (`promoListEnabled`, `promoListTitle`, `promoListSubtitle`, `promoListImageUrl`, `promoListBadgeText`, `promoListDateText`, `promoListTeamsText`, `promoListLocationText`, `promoListPrizeText`, `promoListPriority`); public list/detail responses include the same fields. `promoHomeEnabled` controls the home "오늘의 추천" tournament cards and `promoListEnabled` controls the tournament-list carousel. Clients expose every enabled open tournament in descending priority order, with the earliest `createdAt` first for ties. When a published `campaignSlug` exists, both promo surfaces link to `/tournaments/campaigns/:slug`; otherwise they link to the normal tournament detail. Promo images are uploaded through the shared upload endpoint first, then the returned URL is saved in the corresponding promo image field.

## Admin Announcement Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/tournaments/:tournamentId/announcements` | active admin, read-only support allowed | path id | `{ items: V1AdminTournamentAnnouncement[] }` |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/announcements` | mutation-capable admin | `CreateAnnouncementDto` | created announcement |
| `PATCH` | `/api/v1/admin/announcements/:announcementId` | mutation-capable admin | `UpdateAnnouncementDto` | updated announcement |
| `PATCH` | `/api/v1/admin/announcements/:announcementId/publish` | mutation-capable admin | empty body | updated announcement plus `alreadyPublished` |
| `DELETE` | `/api/v1/admin/announcements/:announcementId` | mutation-capable admin | path id | `{ id, tournamentId, deleted: true }` |

`UpdateAnnouncementDto` edits `title`, `body`, and `audience`. `publish=true` publishes a draft or keeps a published row published; `publish=false` clears `publishedAt` and removes the announcement from public tournament detail. Update and delete write admin action logs with `targetType=tournament_announcement`.

Tournament announcement `audience` values are `public`, `all_registered`, `confirmed_only`, and `waitlist`. `public` means the announcement is visible on public tournament detail to logged-out users as soon as it is published. Public tournament detail (`GET /api/v1/tournaments/:tournamentId`) returns only announcements where `audience=public` and `publishedAt` is not null; team-scoped announcement values are retained for admin operations and targeted follow-up delivery.

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

`cancel-request/withdraw` re-reads the tournament under a row lock before restoring the registration, so it can reject after the outer checks passed. Two conflicts are possible there: `409 TOURNAMENT_STATE_CHANGED` when the tournament is no longer reachable on the tournament surface at that moment (deleted, or its kind moved off the surface), and `409 TOURNAMENT_ALREADY_CANCELLED` when the tournament was cancelled meanwhile. Both mean *the tournament changed while the request was in flight* — not *the tournament does not exist*, which is a `404 TOURNAMENT_NOT_FOUND` from the entry check. Clients should treat `TOURNAMENT_STATE_CHANGED` as "refresh and retry", not as a dead link.

`POST /registrations` is resumable for the same tournament/team while the existing registration is still `draft`. This covers users leaving the apply flow before final submit; the endpoint returns the existing draft instead of `ALREADY_REGISTERED`.

Registration create and submit both require the team's current `sportId` to match the tournament `sportId`. A mismatch is rejected with `409 TEAM_SPORT_MISMATCH`; clients must only offer same-sport teams as new registration candidates. Submit repeats the check so a saved draft cannot bypass a later team or tournament sport change.

Registration uniqueness is `tournamentId + teamId`. If the database still has an older user-scoped or tournament-scoped unique index, creating another team registration may fail with `409 TOURNAMENT_REGISTRATION_UNIQUE_SCOPE_MISMATCH`; apply the v1 tournament registration team-unique migration before treating the API as ready.

Tournament registration ownership is team-scoped, not user-singleton. A user can belong to multiple teams, so `my-registrations` is the canonical frontend entry point for "내 신청 보기"; it returns every registration for the tournament where the caller has active membership on the registered team. `my-registration?scope=teams` remains an equivalent compatibility route, and plain `my-registration` remains for backward compatibility with one caller-created registration. Create, submit, cancel, and roster mutations remain owner/manager-only.

`GET /tournaments/:id` is anonymous and never returns bank account fields. For a bank-transfer registration whose payment is still `ready`, the guarded registration response includes `paymentInstructions: { bankName, bankAccount, bankHolder }`. The field is `null` for drafts, PG payments, completed/cancelled/refunded payments, and registrations the caller cannot access. The apply and `/tournaments/:id/my` surfaces must render account details only from this authorized registration contract.

Submission repeats the paid-tournament account invariant under the tournament row lock. A paid `bank_transfer` submission with missing bank details is rejected with `409 TOURNAMENT_PAYMENT_INSTRUCTIONS_MISSING` before the registration enters `awaiting_payment`, so the two-hour payment-expiry clock never starts without usable instructions.

`SubmitRegistrationDto.termsDocumentIds` is the accepted current managed-document UUID list. The service rejects stale IDs and missing required current documents before the registration transaction. In the same transaction as the legacy agreement booleans and payment row, it appends verified `web` consent events with registration/team/applicant provenance; unchecked optional documents become `not_accepted`. The four legacy boolean columns remain populated from the canonical tournament policy codes for compatibility.

Public tournament list/detail responses include both `confirmedCount` and `pendingPaymentCount`. `pendingPaymentCount` counts registrations in payment-stage statuses (`awaiting_payment`, `payment_checking`, `paid`) so clients can show predicted capacity as confirmed + payment-pending teams. `POST /registrations` and `POST /registrations/:registrationId/submit` reject with `409 TOURNAMENT_CAPACITY_FULL` when confirmed + payment-stage registrations already reaches `teamCount`; draft registrations do not reserve capacity.

## Roster Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, active team member | path ids | roster players and `belowMinimum` |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, team manager+ | `AddPlayerDto` | created or restored player |
| `PATCH` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | `UpdatePlayerEligibilityDto` | updated player |
| `DELETE` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | path ids | removed player |
| `GET` | `/api/v1/admin/registrations/:registrationId/players` | active admin | path id | admin roster detail including gender snapshot, current phone, `isTeamCaptain`, captain-first ordering, and minimum check |
| `GET` | `/api/v1/admin/registrations/:registrationId/players/export` | active admin | path id | CSV roster export including gender snapshot |
| `PATCH` | `/api/v1/admin/players/:playerId/eligibility` | owner/ops admin | `UpdatePlayerEligibilityDto` | updated eligibility and audit log |

## Player Add Contract

`POST /players` only accepts an active member of the registration team.

The service reads the selected member's profile and phone from the team membership user record. A member can be added only when all required source fields exist:

- `profile.displayName` as real name
- `profile.birthDate`
- `user.phone`

If any required source field is missing, the API rejects the request with `400 PLAYER_REQUIRED_PROFILE_MISSING`.

The stored roster snapshot uses the server-side member profile values for `realName`, `birthDateSnapshot`, and nullable `genderSnapshot`; clients must not treat editable form values as the source of truth. Gender accepts the profile contract values `male` and `female`. A `mixed` tournament requires a profile gender when a player is added; missing gender is rejected with `400 PLAYER_REQUIRED_PROFILE_MISSING`. Legacy or non-mixed roster snapshots may still be `null` and are shown as `미등록`.

`POST /api/v1/admin/registrations/:registrationId/roster-lock` locks the registration row and validates a mixed tournament's active-player `genderSnapshot` counts in the same serializable transaction. A violated minimum or maximum returns `409 TOURNAMENT_GENDER_QUOTA_NOT_MET` with `details.male` and `details.female`, each containing `count`, `min`, `max`, and `ok`; the roster remains unlocked. Male/female tournament categories are labels only and do not enforce a player-gender match.

Admin roster reads use the dedicated `/admin/registrations/:registrationId/players` endpoint. They must not reuse the team-member endpoint because active admins are not necessarily members of the registered team. Owner, ops, and support admins may read the roster; eligibility mutation remains owner/ops-only.

The admin-only roster response also joins the player's current `user.phone` as nullable `phone` for operational contact. This is not a roster-time snapshot and is not exposed by the team-member roster endpoint.

The admin response derives `isTeamCaptain` from the registration team's canonical `ownerUserId`. When that owner is present in the submitted roster, the response places them first; other players retain their existing `addedAt` order. The admin modal renders a `팀장` badge next to that player.

`PATCH /players/:playerId` is available only before `rosterLockedAt`. It lets team managers correct the player's `eligibilityStatus` only. The already stored roster snapshots (`realName`, `birthDateSnapshot`, `genderSnapshot`) are not refreshed by eligibility edits, and the current member profile/phone is not revalidated on this path.

All team roster mutations lock the registration row and re-read `rosterLockedAt`, registration status, tournament roster deadline, and `rosterDeadlineOverrideAt` inside the same transaction as the player write. A concurrent admin lock or deadline-override revocation wins before a later player mutation can commit.
