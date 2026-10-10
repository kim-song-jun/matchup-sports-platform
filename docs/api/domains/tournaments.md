# V1 Tournaments API

## Read Endpoints

Publication of both regular tournaments and regular leagues is independently
controlled by `V1Tournament.isPublic` (default `true`). Unpublished competitions are
excluded from public tournament lists (every `kind`), direct detail, overall standings,
schedule, match detail, player records, public reviews and published campaigns
(`GET /tournaments/:id/announcements/me` returns `404 TOURNAMENT_NOT_FOUND` unless the
caller has an active registration; active participants keep their audience-scoped
announcements), and
their fixtures are excluded from public team/user records, profile activity counts
and the public game record. Admin operations remain available, and the gate does not
change lifecycle, registrations, fixtures or bracket publication.

`PATCH /api/v1/admin/tournaments/:tournamentId/visibility` accepts only
`{ "isPublic": boolean }` (same validation as the league endpoint — non-boolean JSON
values return `400`) and returns `{ tournamentId, isPublic }`. It requires an active
mutation administrator, is a no-op without audit when the value is unchanged, records
`tournament.visibility` in the admin audit otherwise, and returns
`409 TOURNAMENT_VERSION_CONFLICT` if a concurrent request changed the value first.
The admin tournament detail includes `isPublic`.
`GET /api/v1/admin/tournaments` accepts an optional `visibility=public|hidden` filter
(any other value returns `400`); it narrows the rows, `pageInfo` and the `summary` status
counts together, and omitting it keeps every row. `public` means published (`isPublic`) and
not `cancelled`; `hidden` is every other row (unpublished or cancelled), matching the row badge.
See [the league visibility contract](./league-matches.md#public-visibility).

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/tournaments` | optional user | `TournamentListQueryDto` | public tournament list page |
| `GET` | `/api/v1/tournaments/:tournamentId` | optional user | path id | public tournament detail |
| `GET` | `/api/v1/tournaments/:tournamentId/standings/overall` | optional user | path id | overall standings + progress + magic number |
| `GET` | `/api/v1/tournaments/campaigns/:slug` | public | lowercase kebab slug | published campaign + safe tournament facts |

Tournament list/detail reads are public. Clients may call them without a stored v1 session; authenticated-only state such as the caller's registrations must use the registration endpoints below and should only be queried after login. Public read endpoints expose only tournaments with `open`, `closed`, `in_progress`, or `completed` status and `deletedAt = null`. Registration, roster, and admin tournament routes remain authenticated.

Public list/detail items include `campaignSlug` only while the related campaign is `published`; otherwise the field is `null`. The slug endpoint also requires a published campaign and a non-deleted tournament in `open`, `closed`, `in_progress`, or `completed`. Its tournament projection contains display facts, rules/refund policy, active sponsors, confirmed count, and public confirmed/waitlisted team summaries. It never returns bank account fields, player/contact PII, creator/admin identity, or deleted-row metadata.

### Competition reviews

Public review lists, submission and pending-review lists share the unified
`V1Tournament` identity used by the public detail page: both `regular_tournament`
and `regular_league` are supported. Historical rows with `kind = null` retain
tournament compatibility. Other kinds are excluded from those lookups.

| Method | Path | Auth | Contract |
|---|---|---|---|
| `GET` | `/api/v1/tournaments/:tournamentId/reviews` | optional user | public visible reviews; `page`, `pageSize`, `search` |
| `POST` | `/api/v1/tournaments/:tournamentId/reviews` | user | submit a completed competition review |
| `GET` | `/api/v1/tournaments/:tournamentId/reviews/me` | user | caller-authored review or `null` |
| `GET` | `/api/v1/tournaments/:tournamentId/participant-check` | user | `{ isParticipant }` for review eligibility |
| `GET` | `/api/v1/tournaments/me/pending-reviews` | user | eligible public completed competitions the caller has not reviewed |

Public review lookup requires `isPublic = true` and `deletedAt = null`; private,
deleted, unknown and unsupported competitions return `404 TOURNAMENT_NOT_FOUND`
before review rows are queried. A valid competition with no visible reviews returns
`{ items: [], total: 0, page, pageSize }`. Defaults are `page = 1`, `pageSize = 10`,
with page size limited to 50. Reviews are newest first. Search is case-insensitive
over team name, comment and author nickname; hidden reviews are excluded from both
items and total. Public items contain only `id`, `authorId`, `authorNickname`,
`authorProfileImageUrl`, `teamName`, `rating`, `comment`, `photoUrls` and `createdAt`.

Submission accepts `rating` (integer 1–5), optional `comment` (at most 500 characters),
up to three uploaded image `photoUrls`, and optional `teamId`. It requires a
non-deleted supported competition in `completed` state, a `confirmed` registration,
and the caller's active `owner` or `manager` membership in an active, non-deleted team.
Incomplete competitions return `400 TOURNAMENT_NOT_COMPLETED`; ineligible callers
return `403 NOT_PARTICIPANT`. Participant-check uses the same registration/team
eligibility predicate; the client also checks completion and prior authorship before
offering submission. Publication controls public reads; eligible participants retain
the existing submission contract for non-public competitions.

Reviews are unique per competition and author (`400 ALREADY_REVIEWED`), so another
manager's review does not count as the caller's review. When more than one team is
eligible, omitted `teamId` returns `400 TEAM_SELECTION_REQUIRED` with eligible teams
in `details.teams`; an ineligible selection in that case returns `403 NOT_PARTICIPANT`.
Each photo must be an image in the caller's upload ledger, otherwise submission
returns `400 REVIEW_PHOTO_UPLOAD_NOT_FOUND`. Pending reviews include both supported
kinds, require `isPublic = true`, exclude deleted/incomplete competitions and
caller-authored reviews, and sort by scheduled end time (falling back to updated
time). The home/my pending card links to the public `/tournaments/:id/awards`
page, so unpublished tournaments and leagues are omitted to avoid a 404 destination.
Eligible participants retain direct submission access to unpublished competitions.

Admin review reads require an active administrator and include hidden rows with
`hiddenAt`/`hiddenReason`. Hide/unhide requires a mutation administrator, verifies
the review belongs to the requested competition, and records the change atomically
with its audit log. Support administrators remain read-only.

These shared admin review endpoints accept either kind's competition UUID without
requiring the tournament-only admin detail endpoint:

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v1/admin/tournaments/:tournamentId/reviews` | active `owner`, `ops` or `support` administrator |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/reviews/:reviewId/hide` | active `owner` or `ops` administrator |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/reviews/:reviewId/unhide` | active `owner` or `ops` administrator |

Publication does not limit admin review reads or moderation. A review outside the
requested competition returns `404 REVIEW_NOT_FOUND` for hide/unhide without a
mutation or audit record. The common review audit actions are
`tournament.review_hide` and `tournament.review_unhide`, with target type
`tournament_review`; both record the acting admin and before/after moderation values.

Public detail applies the D-06 visibility matrix (see `docs/api/domains/public-records.md`) to both result lanes, but the two lanes drop and keep rows differently:

- `fixtures[]` (tournament lane): a `hidden` fixture **is omitted entirely** -- there is no row with a null result. A `status_only` fixture **keeps its row** ("lifecycle only") with `result: null`.
- `leagueFixtures[]` (league schedule lane): **no row is ever omitted**, because week labels and the "next match" pointer derive from this array's length and order. A `hidden` or `status_only` fixture keeps its row with null scores and `scoreHidden: true`.

`scoreHidden` means "confirmed but withheld", so it is `true` only when an official result exists. A fixture that has not been played yet reports `scoreHidden: false` -- it is not hidden, it simply has no result.

Each `leagueFixtures[]` row also carries `gameState` (`SCHEDULED|LIVE|PAUSED|ENDED|CANCELLED`): `null` when the fixture has no game or its effective visibility is `hidden` (the match detail is a 404 there), otherwise the game's state even under `status_only`. Screens read it before the kickoff time so a match that started early is not shown as upcoming (Task 180 W4-V13).

`PUBLIC_LIVE=off` demotes a `live` policy to `official_only`, which is not a gated state -- confirmed results stay visible while the kill-switch is off. Staff bypass is unchanged. Standings and overall aggregates are not gated.

After bracket publication, each public `groups[].standings[]` row includes nullable `teamLogoUrl` from the registered team's current profile. Tournament detail and bracket clients render it through the shared team-avatar fallback contract, so a missing or failed image remains distinguishable without replacing valid saved logos.

### Overall standings — two competition kinds, two row shapes

`v1_tournaments` holds both single tournaments (`kind = regular_tournament`) and the mirror rows of
regular league seasons (`kind = regular_league`, whose id equals the league id). This endpoint serves
both, but a mirror row has no groups and no tournament fixtures — those are created only on the
tournament axis — so its standings are computed from the league axis instead. The response envelope is
identical; the fields below differ:

| Field | Regular tournament | Regular league | Why |
|---|---|---|---|
| `registrationId` | present | **absent** | league standings are computed on the league axis (`v1_league_teams`), which does not carry a registration id — see the note below |
| `teamId` | absent | **present** | the team id is the row's identity on the league axis |
| `fairPlayPoints` | present | **absent** | the league standings engine has no fair-play criterion at all — there is no input slot for penalty points (`league-vs-competition-standings.spec.ts`, case ④). `0` would read as "no penalties", so the field is omitted rather than zero-filled |
| `magicNumber` | computed | `null` | the magic number is tied to the tournament axis's remaining-fixture count; the league equivalent is a separate decision and is not invented here |
| `recalculatedAt` | last recalculation | `null` | league standings are computed per request, not persisted |

The handler reads no caller identity, so the response carries no viewer-dependent fields; the
optional-auth guard is inherited from the controller.

> **`registrationId` about the mirror row — a correction.** An earlier version of this table said
> *"a league has no entry-registration concept"*. That is **not true**: a mirror row does carry
> `v1_tournament_registrations` (measured on alpha — a 2-team league season had two `confirmed`
> registrations whose team ids matched the league's teams exactly, and the detail response's
> `participantTeams` is built from them). The accurate reason is narrower: the **standings
> computation** runs on the league axis and never has a registration id in hand. The field is
> omitted because that code path cannot produce it, not because the concept is absent.

Clients must key each row on **whichever identity field is present** (`registrationId ?? teamId`);
exactly one of the two is always populated, and treating either as required breaks the other kind.

For a league, `progress` counts only fixtures that can still be played: cancelled and voided fixtures
are excluded from `played`, `remaining`, **and `total`**. Counting a fixture that will never be played
as "remaining" would keep progress permanently below 100%.

## Individual awards

`GET /api/v1/admin/tournaments/:tournamentId/awards` returns the saved award list, and `PUT` to the same path replaces it atomically. Each admin item contains `awardType`, `awardLabel`, nullable `iconKey`, `recipientName`, nullable `recipientUserId`, nullable `teamName`, nullable `note`, and optional `sortOrder` on writes. New writes require a UUID `recipientUserId`; the nullable admin read shape only accommodates historical rows that could not be linked without ambiguity. `iconKey` accepts `trophy`, `crown`, `goal`, `shield`, `glove`, `handshake`, `sparkles`, `medal`, or `star`; unknown values are rejected by DTO validation. Public `GET /api/v1/tournaments/:id` keeps the display snapshot but deliberately omits `recipientUserId`, so a public award cannot bypass the user's record-consent gate to reveal account linkage. Existing rows with `iconKey=null` retain the legacy `awardType`-based icon mapping in the Web client.

Award mutations require a mutation-capable active admin. The submitted `recipientUserId` (with optional `teamName` as a tie-breaker when the same user appears on more than one roster) must resolve to exactly one active player row under a confirmed registration. `recipientName` is not an identity key — recommendation chips send the account display name, which may differ from the roster real name — so the server persists the roster's canonical real-name and team snapshots rather than trusting the submitted text. The mutation replaces awards and writes its admin audit record in one transaction. Schema migration remains additive-only; the post-migrate `tournament-award-recipient-backfill.cli.ts` links historical rows only when tournament/team/name matching produces exactly one distinct user. It is idempotent, supports `--dry-run`, and leaves ambiguous rows null for manual reselection.

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

## Admin tournament status transitions (2026-10-09)

`POST /admin/tournaments/:id/status` `{ status, reason? }` follows this table (`TOURNAMENT_TRANSITIONS` in `tournaments-admin.service.ts`):

| from | to |
|---|---|
| draft | open, cancelled |
| open | closed, cancelled |
| closed | open, in_progress, cancelled |
| in_progress | completed, cancelled |
| completed | **in_progress** (revert completion) |
| cancelled | **draft** (restore) |

- The two reverse transitions require a non-blank `reason` (`400 TOURNAMENT_STATUS_REASON_REQUIRED`); it is stored on the `tournament.status` admin action log and the status change log.
- Everything else, including `in_progress -> open|closed`, still returns `409 TOURNAMENT_STATUS_TRANSITION_INVALID`.
- Reverting completion changes only `status`. Awards, standings and reviews are derived from `status === 'completed'`, so they are hidden again until the tournament is completed again. Review-request notifications are sent on the first completion only (a prior `completed` status log suppresses re-sending).
- A restored draft is not publicly listed or readable (draft/cancelled return 404 to consumers) until it is opened again, which re-runs the paid-tournament payment-instruction check.

## Admin Tournament Creation

Admin-created tournaments require `teamCount` per tournament. The API does not treat an omitted team count as unlimited; missing `teamCount` is rejected with `400 TOURNAMENT_TEAM_COUNT_REQUIRED`. Public capacity, registration blocking, and progress bars must use the saved tournament `teamCount`, not a hard-coded default.

경기 시간(피리어드): `GET /api/v1/admin/competition-configs/lineup-size-options?sportId=` 응답의 `defaultPeriods`(`[{ label, durationMinutes }]`, 연장 제외)가 종목 기본값이다 — 축구 전반 45·후반 45, 풋살 20·20, 미지원 종목 `[]`. 생성 마법사는 이 값을 채워 두고 전·후반 또는 단판(피리어드 1개)으로 고칠 수 있게 하며, 고친 경우에만 대회 생성/수정 직후 `PATCH /api/v1/admin/tournaments/:tournamentId/periods`(피리어드 설정)로 저장한다. 생성 API 자체는 종목 기본 피리어드로 만든다.

초안 재저장: `PATCH /api/v1/admin/tournaments/:tournamentId`에 출전 인원·교체 정책을 다시 보내거나 변경해도 현재 고정된 설정의 피리어드·이벤트·결과·순위·공개 정책은 유지한다. 별도 이름으로 등록한 설정도 현재 종목/이름 계열에서 동일 버전을 재사용하고, 실제 라인업 변경은 같은 계열의 다른 섹션을 보존한 불변 새 버전으로 처리한다. 기존 v1 설정에서 `lineup.positions/formations` 키가 없으면 버전 쓰기도 부재를 유지한다(읽기 응답은 `[]`로 정규화). 명시적으로 잘못된 포지션/대형 목록의 검증은 그대로 적용한다. 생성 마법사는 피리어드 PATCH 성공 전에는 공개 확인·접수 시작을 허용하지 않는다. 실패 시 초안 ID와 입력을 유지하며 같은 초안에서 재시도한다.

출전 인원·교체 설정만 보내는 PATCH도 제목 등 다른 필드가 필요하지 않다. 동일 설정 재저장에도 원자적 CAS와 감사 로그를 적용하고 새 `updatedAt`을 반환한다. 후속 요청은 이 버전을 사용해야 하며 이전 버전은 `409 TOURNAMENT_VERSION_CONFLICT`로 거절한다.

종목 변경: `PATCH /api/v1/admin/tournaments/:tournamentId`에 현재와 다른 `sportId`를 보내면 같은 CAS 트랜잭션에서 `competitionConfigVersionId`를 새 종목의 기본 규정 버전(생성과 같은 경로, 규정을 쓰지 않는 종목은 `null`)으로 다시 연결하고, 감사 로그(`tournament.update`)의 before/after에 `sportId`·`competitionConfigVersionId`를 남긴다. 직전에 고친 경기 시간·출전 인원은 새 종목 기본값으로 돌아간다. 대진이 하나라도 있거나 상태가 `in_progress`/`completed`이면 `409 TOURNAMENT_SPORT_LOCKED`(변경 없음). 같은 종목 재전송은 pin을 건드리지 않는다. 출전 인원·교체 필드와 함께 보내면 `400 TOURNAMENT_LINEUP_SIZE_SPORT_CHANGE_CONFLICT`이므로 종목을 먼저 저장한 뒤 설정한다.

생성 마법사의 전체 폼 재시도에는 변경하지 않은 `sportId`도 포함할 수 있다. 동일 종목의 초안 재저장은 정상 저장하며, 실제 종목 변경은 존재 여부 검증 후 처리한다. 종목 ID는 원자적 CAS `updateMany`에 scalar FK로 전달한다(중첩 relation `connect`는 이 연산에서 지원하지 않는다). 전체 폼 재저장도 사용자 지정 피리어드와 최신 버전·감사로그 계약을 유지한다.

경기 종료 시각 기본값: 대회·리그 대진을 만들거나 일정을 옮길 때 종료 시각(`endAt`)을 받지 않았으면 **시작 + 그 경기가 쓰는 경기 설정의 정규 시간**(연장 제외 피리어드 합계 — 전·후반이면 둘의 합, 단판이면 그 한 피리어드)으로 채운다. 길이를 아는 경기를 옮기면 기존 길이를 그대로 옮긴다. 피리어드 길이를 모르는 레거시 설정(`{ count }`)이면 지어내지 않고 `null` 로 둔다.

종료 시각이 없는 기존 대진을 장소·번호만 PATCH해 기본 종료가 보충되는 경우에도 같은 트랜잭션에서 양 팀 캘린더의 종료 시각을 함께 갱신한다. 시작 시각 변경 여부와 무관하게 경기와 팀 일정의 시간 계약을 유지한다.

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
active `competitionConfigVersionId` to the fixture and creates exactly one `TEAM_MATCH`
Game with HOME/AWAY side snapshots and the registered participant snapshots. A missing or
inactive pin fails with `409 COMPETITION_CONFIG_REQUIRED` and rolls back both fixture and Game.
The deterministic fixture command is derived from tournament, round, fixture number, and leg;
an occupied coordinate with the same payload returns its current canonical fixture, while a changed payload at that coordinate returns
`409 COMMAND_IDEMPOTENCY_PAYLOAD_REUSE`.

| Method | Path | DTO | Result |
|---|---|---|---|
| `POST` | `/api/v1/admin/tournaments/:tournamentId/fixtures` | `CreateFixtureDto` | active admin fixture/Game source creation or the explicit pin/idempotency conflict above. `fixtureNumber` is optional: when omitted the server assigns the tournament-wide max (archived fixtures included) + 1 inside the creation transaction, under the same `league-fixture-generation` lock, and the durable command id uses the assigned number. A sent number keeps the existing idempotency behaviour. |
| `PATCH` | `/api/v1/admin/fixtures/:fixtureId` | `UpdateFixtureDto` | fixture metadata including optional positive integer `fixtureNumber`; duplicate round/leg number returns `409 FIXTURE_NUMBER_CONFLICT`. See [대진 번호 수정](#대진-번호-수정-2026-10-05). |

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

Tournament schedule stores a start datetime in `scheduledAt` and an optional end datetime in `scheduledEndAt`. Admin create/update rejects `scheduledEndAt` when it is earlier than the final `scheduledAt` with `400 TOURNAMENT_SCHEDULE_RANGE_INVALID`. `rosterDeadlineAt` is optional (`null` = no roster deadline; rosters stay editable while the tournament is roster-mutable). When both deadlines are set, admin create/update rejects a `rosterDeadlineAt` earlier than `registrationDeadlineAt` with `400 ROSTER_DEADLINE_BEFORE_REGISTRATION_DEADLINE` (equal is allowed). Update checks the merged values only when the request touches either deadline, so editing other fields of an existing tournament is not blocked. Public list/detail/admin responses include both fields; clients render a single date when `scheduledEndAt` is empty or the same calendar label, and a range when it spans multiple dates.

Tournament gender classification uses the enum `genderCategory = mixed | male | female`. Existing tournaments may retain `null` as an honest “unclassified” state until an operator chooses a category. The four nullable mixed-roster bounds are `genderMinMale`, `genderMaxMale`, `genderMinFemale`, and `genderMaxFemale`. Bounds are stored only for `mixed`; changing a tournament to `male` or `female` clears them. Create/update rejects a minimum above its matching maximum, a combined minimum above `maxPlayers`, or an individual maximum above `maxPlayers` with `400 TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID`. Public list items expose the category, while public/admin detail responses expose the category and all four bounds.

The admin creation surface is a four-step controlled wizard: basic information, schedule/location, participation requirements, then prize/rules/promotion. It uses native `datetime-local` inputs, suggests registration deadline D-3 23:59 until the operator manually edits it, leaves the roster deadline empty by default (an empty value is sent as `null`), and preserves every field while navigating between steps. Tournament edit reuses the same date, cover, prize-breakdown, and promotion-card components. On update, clearing an optional schedule, venue, bank, rules, or refund field sends `null` and persists the cleared state instead of silently omitting the field.

Admin-facing prize entry is text-first. `prizeSummary` is the public "상품 및 상금" display string and clients must render that text as entered instead of deriving `총 N원` or `최대 N원` copy from `prizePool`. `prizeBreakdown` remains the comma/dot/newline-delimited breakdown string that public detail renders as separate chips below the main prize card.

Tournament promo cards are separate from prize fields and from the normal tournament edit surface. Admin update/create accepts independent home promo fields (`promoHomeEnabled`, `promoHomeTitle`, `promoHomeSubtitle`, `promoHomeImageUrl`, `promoHomeBadgeText`, `promoHomeDateText`, `promoHomeTeamsText`, `promoHomeLocationText`, `promoHomePrizeText`, `promoHomePriority`) and list promo fields (`promoListEnabled`, `promoListTitle`, `promoListSubtitle`, `promoListImageUrl`, `promoListBadgeText`, `promoListDateText`, `promoListTeamsText`, `promoListLocationText`, `promoListPrizeText`, `promoListPriority`); public list/detail responses include the same fields. `promoHomeEnabled` controls the home "오늘의 추천" tournament cards and `promoListEnabled` controls the tournament-list carousel. The home section shows only promos that accept registration right now (the registration gate — status, deadline, capacity — is open and `scheduledAt` has not passed); closed promos are dropped instead of staying as "모집 마감" cards. The same section also adds, without a promo toggle, the open regular league with the nearest registration deadline (`GET /tournaments?kind=league&status=open`, same gate) and the nearest recruiting friendly team match (`GET /team-matches?status=recruiting&kind=friendly&sort=recommended&limit=1`). Clients expose every enabled open tournament in descending priority order, with the earliest `createdAt` first for ties. When a published `campaignSlug` exists, both promo surfaces link to `/tournaments/campaigns/:slug`; otherwise they link to the normal tournament detail. Promo images are uploaded through the shared upload endpoint first, then the returned URL is saved in the corresponding promo image field.

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

## Entry fee configured flag

The list (`GET /api/v1/tournaments`) and detail (`GET /api/v1/tournaments/:tournamentId`) responses include `entryFeeConfigured: boolean`. For regular leagues it is `entryFeeConfiguredAt != null` — `false` means the fee has not been set yet and clients must not show `entryFee: 0` as "무료". For regular tournaments it is always `true`. `entryFee` keeps its numeric type, and bank account fields are not part of either response. Registration screens read the amount from the registration's own `payment.amount` (the snapshot at submit time), not from the tournament's current `entryFee`.

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

`cancel-request` stores the status that existed before `cancel_requested`. It is rejected with `409 TOURNAMENT_ENDED` (registration unchanged) when the tournament or league is `completed` or `cancelled` — terminal states have nothing left to cancel; this applies to `draft` registrations too. Other non-cancellable registration statuses keep returning `409 REGISTRATION_NOT_CANCELLABLE`. `cancel-request/withdraw` is allowed only while the registration status is `cancel_requested`; it clears `cancelRequestedAt`, `cancelReason`, and the stored previous status after restoring the registration.

`cancel-request/withdraw` re-reads the tournament under a row lock before restoring the registration, so it can reject after the outer checks passed. **Three** conflicts are possible there:

| code | when | what the client should do |
|---|---|---|
| `409 TOURNAMENT_STATE_CHANGED` | the tournament is no longer reachable on the tournament surface at that moment (deleted, or its kind moved off the surface) | refresh and retry — **not** a dead link |
| `409 TOURNAMENT_ALREADY_CANCELLED` | the tournament was cancelled meanwhile | refresh; the withdrawal can never succeed now |
| `409 TOURNAMENT_CAPACITY_FULL` | the status being restored holds a capacity slot and the other capacity-holding registrations already fill `teamCount` | refresh; retrying only helps if someone else frees a slot |

The first two mean *the tournament changed while the request was in flight* — not *the tournament does not exist*, which is a `404 TOURNAMENT_NOT_FOUND` from the entry check. The third is different in kind: the tournament is fine, but **someone else took the slot this registration gave up**, so a withdrawal must not push the tournament over its limit. Retrying without a freed slot returns the same `409`.

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
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, active team member (owner/manager, and a member's own row, also get personal info) | path ids | roster players (each with `personalInfoVisible`) and `belowMinimum` — see Roster Read Contract |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players` | user, team manager+ | `AddPlayerDto` | created or restored player |
| `PATCH` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | `UpdatePlayerEligibilityDto` | updated player |
| `DELETE` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/players/:playerId` | user, team manager+ | path ids | removed player |
| `GET` | `/api/v1/admin/registrations/:registrationId/players` | active admin | path id | admin roster detail including gender snapshot, current phone, `isTeamCaptain`, captain-first ordering, and minimum check |
| `GET` | `/api/v1/admin/registrations/:registrationId/players/export` | active admin | path id | `{ filename, csv }` team roster export — columns `realName,birthDate,gender,eligibility,nickname,jerseyNumber,phone` (`phone` hyphenated `010-1234-5678` so Excel keeps the leading 0; blank when unset or the account is deleted); audit `player.export` (targetType `tournament_registration`, row count only) |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/players/export` | active admin | path id (tournament or league) | `{ filename, csv }` full roster for Excel, split into **team blocks**: 3 summary lines (title · KST download time · team/player counts), then per registration (except `draft`/`cancelled`, registration order) a blank line + `[n] 팀명 · 신청 상태 · N명|명단 미등록` title row + Korean header `순번,등번호,이름,생년월일,성별,선출 여부,닉네임,비고,전화번호` + player rows (jersey asc, nulls last; Korean labels for status/gender/eligibility; `팀장` in 비고; 전화번호 formatted like the team export, blank when unset/deleted). Filename `<title>_전체명단_<YYYYMMDD>.csv`; audit `player.export` (targetType `tournament`, row count only); `404 TOURNAMENT_NOT_FOUND` |
| `PATCH` | `/api/v1/admin/players/:playerId/eligibility` | owner/ops admin | `UpdatePlayerEligibilityDto` | updated eligibility and audit log |

## Player Add Contract

`POST /players` only accepts an active member of the registration team.

The service reads the selected member's profile and phone from the team membership user record. A member can be added only when all required source fields exist:

- `profile.displayName` as real name
- `profile.birthDate`
- `user.phone`

If any required source field is missing, the API rejects the request with `400 PLAYER_REQUIRED_PROFILE_MISSING`. The message names exactly the missing fields and where they are filled (for example `이 팀원의 프로필에 생년월일·휴대폰 번호가 없어 선수로 등록할 수 없어요. 팀원이 마이 > 프로필 수정에서 입력하면 등록할 수 있어요.`), and the candidate list reason is `<fields> 미입력`. `PLAYER_PHONE_NOT_VERIFIED` likewise tells the member to finish phone verification in profile edit.

The stored roster snapshot uses the server-side member profile values for `realName`, `birthDateSnapshot`, and nullable `genderSnapshot`; clients must not treat editable form values as the source of truth. Gender accepts the profile contract values `male` and `female`. A `mixed` tournament requires a profile gender when a player is added; missing gender is rejected with `400 PLAYER_REQUIRED_PROFILE_MISSING`. Legacy or non-mixed roster snapshots may still be `null` and are shown as `미등록`.

`POST /api/v1/admin/registrations/:registrationId/roster-lock` locks the registration row and validates a mixed tournament's active-player `genderSnapshot` counts in the same serializable transaction. A violated minimum or maximum returns `409 TOURNAMENT_GENDER_QUOTA_NOT_MET` with `details.male` and `details.female`, each containing `count`, `min`, `max`, and `ok`; the roster remains unlocked. Male/female tournament categories are labels only and do not enforce a player-gender match.

## Roster Read Contract

`GET /tournaments/:tournamentId/registrations/:registrationId/players` is open to every active member of the registration team, but what each row carries depends on the caller's team role. The rule is evaluated per row and each player carries `personalInfoVisible` (there is no top-level flag):

| Caller | Row | `realName` / `birthDateSnapshot` / `genderSnapshot` | `eligibilityNote` | `personalInfoVisible` |
|---|---|---|---|---|
| team `owner`, team `manager` | every row | stored snapshot values | stored value | `true` |
| team `member` | the caller's own row | stored snapshot values | `null` | `true` |
| team `member` | any other row | `null` (keys stay in the response) | `null` | `false` |

The own-row exception matches `GET /teams/:teamId/members`, which also shows a member their own details. `eligibilityNote` is the admin review memo, so a member never gets it, even on their own row. Every caller gets `nickname` (the profile nickname, `null` when the profile is gone — never replaced with the real name), `jerseyNumber`, `userId`, `eligibilityStatus`, `addedAt` and `removedAt` on every row. Clients must use the row's `personalInfoVisible`, not a `null` birth date, to tell "hidden" from "not entered". The caller's role is read with an active membership of an active, non-deleted registration team; a non-member, a former (`left`/`removed`) manager, or a manager of a suspended/deleted team gets `403 PERMISSION_DENIED` and no roster is read.

Endpoints that return a team's real names or birth dates and who can call them: `POST`/`PATCH`/`DELETE` under the same prefix are team manager+ only; every `/admin/...` player endpoint (list, export, tournament export, eligible-players, eligibility, add, remove) requires an active admin; `GET /teams/:teamId/members` already returns `realName`, `phone`, `birthDate`, `gender` as `null` to a plain member (except their own row). The public tournament detail roster carries `jerseyNumber` and `nickname` only.

Admin roster reads use the dedicated `/admin/registrations/:registrationId/players` endpoint. They must not reuse the team-member endpoint because active admins are not necessarily members of the registered team. Owner, ops, and support admins may read the roster; eligibility mutation remains owner/ops-only.

The admin-only roster response also joins the player's current `user.phone` as nullable `phone` for operational contact. This is not a roster-time snapshot and is not exposed by the team-member roster endpoint.

The admin response derives `isTeamCaptain` from the registration team's canonical `ownerUserId`. When that owner is present in the submitted roster, the response places them first; other players retain their existing `addedAt` order. The admin modal renders a `팀장` badge next to that player.

`PATCH /players/:playerId` is available only before `rosterLockedAt`. It lets team managers correct the player's `eligibilityStatus` only. The already stored roster snapshots (`realName`, `birthDateSnapshot`, `genderSnapshot`) are not refreshed by eligibility edits, and the current member profile/phone is not revalidated on this path.

All team roster mutations lock the registration row and re-read `rosterLockedAt`, registration status, tournament roster deadline, and `rosterDeadlineOverrideAt` inside the same transaction as the player write. A concurrent admin lock or deadline-override revocation wins before a later player mutation can commit.


## 12강·8강 수동 결선 (2026-10-04)

- `CreateGroupDto.phase`: `group | round16 | round12 | quarter | semi | final | third_place`.
- `POST /admin/tournaments/:id/group-teams`의 `isBye?: boolean`은 명시적인 12강 부전승이다. 생략하면 false. 다른 단계에서 true는 `BYE_PHASE_INVALID`(400).
- 12강은 최대 12팀·부전승 최대 4팀이며 초과는 `ROUND12_CAPACITY`(409). 기존 12강 경기에 배정된 팀의 부전승 지정 및 부전승팀을 같은 단계 경기로 추가/수정하면 `BYE_TEAM_HAS_MATCH`(409).
- 관리자/공개 `groups[].groupTeams[].isBye`는 저장된 명시적 부전승을 전달한다. 공개 여부와 팀 신원 공개 게이트는 기존 정책을 유지한다.
- 관리자 자동 생성은 12팀/부전승 4팀 편성 시 나머지 8팀의 4경기를 생성한다. 부전승에는 TeamMatch/Game/점수를 만들지 않는다. 8강 슬롯은 기존처럼 관리자가 직접 배정한다.
- 예선 종료 자동 생성·부전승팀 자동 8강 배정·신규 진출 연결 API는 이번 계약에 포함하지 않는다.

### 경기별 진출 연결 (12강·8강·4강)

- `PATCH /admin/fixtures/:fixtureId/bracket-sources`: 인증 + mutation admin 필요. `{ homeSourceFixtureId?: UUID | null, awaySourceFixtureId?: UUID | null }`. 생략한 쪽은 유지, null은 해제. 결과 `{ fixtureId, bracketSources }`. 감사 action은 `tournament.bracket.sources.update`.
- source는 같은 대회의 바로 이전 group.phase: round16 또는 round12 → quarter → semi → final(16강과 12강은 둘 다 8강의 앞 단계, 한 대회에 함께 쓰지 않는다). third_place는 semi의 LOSER. 다른 단계·같은 소스를 양쪽에 쓰면 400 `BRACKET_SOURCE_PHASE_INVALID`/`BRACKET_SOURCE_INVALID`.
- 연결 자리는 팀이 미정이어야 함(409 `BRACKET_SOURCE_SLOT_ASSIGNED`). 하나의 source+outcome은 하나의 target만 허용(409 `BRACKET_SOURCE_ALREADY_LINKED`). 현재/기존/신규 source 모두 Game SCHEDULED + TeamMatch matched + official revision 없음 + 1차전이어야 함(409 `BRACKET_SOURCE_LOCKED`).
- 참가팀 변경은 연결된 자리에 409 `BRACKET_SOURCE_SLOT_LINKED`; 먼저 연결 해제 후 직접 배정. 경기 삭제는 시작 전만 허용하며 미정 다음 경기 연결은 해제하고 배정/시작된 다음 경기가 있으면 거절한다.
- 결과 확정 후 팀 배정은 기존 canonical advancement projection의 책임. 새 endpoint는 기록/점수를 만들거나 이미 끝난 경기의 결과를 추정하지 않음.
- 공개 상세 `fixtures[].bracketSources`와 관리자 bracket fixture에 `[{ fixtureId, outcome: WINNER|LOSER, side: HOME|AWAY }]`를 반환. 대진표 비공개 게이트와 source 삭제 필터 유지. 공개되지 않은 대회에는 fixture 및 연결 전체를 노출하지 않음.
- 부전승 선은 round12 groupTeam.isBye + quarter 슬롯의 같은 registrationId로 렌더. 별도 경기·가짜 승점 없음. 연결이 없는 수동 대진은 번호 순서로 추정하지 않음.


### 진출 연결 동시성 보호 (2026-10-05)

- 연결 PATCH는 잠금 전에 동일 대회·이전 단계 출처를 검증하고, 결과 확정과 동일하게 출처 Game → 대상 Game 순서로 잠급니다. 단계 사이에는 UUID순 잠금을 사용하지 않습니다.
- 명단 재계산은 Game UUID순으로 잠그되 `NOWAIT`를 사용합니다. 출처→대상 순서의 결과 확정·대진 PATCH가 Game을 점유하면 명단 트랜잭션 전체를 롤백하고 `COMMAND_CONCURRENCY_CONFLICT`(409)를 반환합니다. 결과 명단 워커는 기존 outbox 재시도로 돌아가며, 양 경로가 서로의 Game을 기다리는 교착을 만들지 않습니다.
- 팀 변경 PATCH의 `BRACKET_SOURCE_SLOT_LINKED`(409)는 대상 Game/Details 잠금 후 최신 배정 ID와 비교합니다. 최초 조회 뒤 결과 확정으로 승자가 배정된 자리를 과거 `null`로 덮어쓸 수 없습니다. 현재 배정과 같은 ID를 보내거나 장소·일정만 바꾸는 요청은 허용됩니다.
- 공개 3·4위전의 미정 슬롯도 저장된 LOSER 출처를 `4강 N경기 패자`로 표시합니다.
### 라운드별 부전승 직접 등록 (2026-10-05)

- `POST /admin/tournaments/:tournamentId/byes`: 인증 + mutation admin. 입력 `{ groupId: UUID, registrationId?: UUID | null, byeId?: UUID, sortOrder: integer(0..7) }`, 반환은 groupTeam. 감사 action `tournament.bracket.bye.save`.
- 그룹 phase로 12강·8강·4강을 구분한다. 팀 미정은 registrationId 생략/null로 저장하며, 팀을 선택하면 해당 대회의 confirmed 등록이어야 한다. 홈·어웨이 또는 경기 생성 없이 저장한다. byeId를 보내면 해당 조의 기존 부전승 id와 위치를 유지하며 팀 배정/미정 전환/위치 수정을 저장한다. byeId 생략 시 새 자리 생성 또는 기존 일반 배정을 변환한다.
- 템플릿이 만든 12강 BYE 자리(`V1TournamentSlot kind=BYE`, position 1~4 ↔ sortOrder 0·3·4·7)에 연결된 부전승은 같은 위치에서 팀을 바꾸거나 `registrationId: null` 로 비우는 요청을 자리 배정 트랜잭션(`assignSlotInTx`)에 위임한다 — 자리 `registrationId`·부전승 행·8강 홈 사이드가 함께 바뀌고 응답 형태는 그대로다. 위치를 옮기는 요청, 그리고 `DELETE /admin/group-teams/:id` 로 연결된 부전승 행을 지우는 요청은 `409 SLOT_LINKED`(삭제는 위치 자체를 없애 자리↔위치 대응을 깨므로 위임하지 않고 거절하며, 비우기는 수정 요청이 맡는다). 자리에 연결되지 않은 부전승은 기존 동작 그대로다.
- 12강 정원 12팀/부전승 4팀, 8강 정원 8팀/부전승 4팀, 4강 정원 4팀/부전승 2팀. 초과 `409 BYE_CAPACITY`; group/final/third_place는 `400 BYE_PHASE_INVALID`. 16강은 부전승이 없어 `400 BYE_PHASE_INVALID`(group/final/third_place 와 같다).
- 다른 조의 같은 단계 부전승 중복 `409 BYE_ALREADY_IN_ROUND`; 같은 단계 경기 참가 중인 팀 `409 BYE_TEAM_HAS_MATCH`. 기존 경기 생성/수정도 해당 단계 부전승팀을 거절한다.
- 4강 위치는 0..3이며 초과는 `400 BYE_POSITION_INVALID`. 중복 위치는 `409 BYE_POSITION_OCCUPIED`, 다른 조/없는 byeId는 `404 BYE_NOT_FOUND`. 이전 명단 순번이 위치 범위를 벗어난 기존 부전승은 읽기 렌더링에서 경기 사이 위치로 호환하고 DB 값은 변경하지 않는다.
- 부전승 groupTeam의 `sortOrder`는 해당 열의 일반 경기와 부전승을 합친 0부터의 삽입 위치다. UI에서는 1부터 표시한다. 예시 이미지의 12강은 위치 1·4·5·8에 부전승을 놓을 수 있다. 기존 일반 팀의 sortOrder 의미는 유지한다.
- 저장된 경기 진출 연결과 다음 단계 실제 registrationId 자리 배정이 있으면 HOME/AWAY 가지를 우선한다. 부전승은 12강→8강, 8강→4강, 4강→결승으로 표시하며 미연결 항목도 지정 위치에서 표시한다. 결과에 따라 다음 경기 팀은 운영자가 직접 배정할 수 있고 이 API는 자동 배정하지 않는다.
- 기존 `POST .../group-teams`의 isBye 입력은 12강 전용 호환 경로를 유지한다. 신규 직접 입력 UI는 위 byes 경로를 사용한다.

### 시작 전 대진 삭제 (2026-10-05)

- `DELETE /admin/fixtures/:fixtureId`: V1AuthGuard + mutation admin. tournament draft/open/closed, TeamMatch matched, Game SCHEDULED, 결과 리비전 없음일 때 `{ deleted: true }`.
- Game은 CANCELLED, 공개 정책 STATUS_ONLY, TeamMatch는 archived/deletedAt으로 숨긴다. Game·감사·스태프 이력을 물리 삭제하지 않는다. 일정/용병 모집은 취소한다.
- 원래 라운드/번호는 관리자 감사에 남기고 Details는 group/parent를 해제하고 round를 <originalRound>:deleted:<fixtureId>로 보관해 같은 대진 번호 재등록 및 빈 조 삭제를 허용한다.
- 대회/경기 시작 `409 FIXTURE_ALREADY_STARTED`, 결과 `409 FIXTURE_HAS_RESULT`(경기 수정 PATCH 는 아래 `FIXTURE_RESULT_MUST_BE_VOIDED` 로 바뀜), 연결된 다음 경기 팀 배정/시작 `409 FIXTURE_DOWNSTREAM_ASSIGNED`, 하위 경기 `409 FIXTURE_HAS_CHILDREN`. 미정 다음 경기 연결은 원자적으로 해제한다.
- TBD 부전승은 Game/TeamMatch를 만들지 않으며 `DELETE /admin/group-teams/:id`로 자리 삭제. 미정 자리는 별도 V1TournamentByeSlot에 저장하고 응답에서 registrationId=null, isBye=true로 표시한다. 기존 GroupTeam의 필수 등록 계약은 유지한다. 팀 배정/미정 전환은 같은 id를 유지하며 두 저장소 사이에서 원자적으로 이동한다. 공개 신원/대진 게이트 유지.

### 대진 번호 수정 (2026-10-05)

- `PATCH /api/v1/admin/fixtures/:fixtureId`는 기존 일정·장소·팀 필드와 함께 `fixtureNumber?: number`를 받는다. 인증 및 mutation admin 검증을 유지한다.
- 번호는 JSON 숫자 정수 1..2147483647이다. 생략하면 유지하며 null/문자열/boolean/0/소수/범위 초과는 400이다.
- 같은 대회·round·legNumber의 다른 경기와 번호가 겹치면 `409 FIXTURE_NUMBER_CONFLICT`다. 조가 달라도 같은 round/leg에서는 번호를 공유하지 않는다. 변경은 기존 생성 잠금 및 DB 유일성으로 보호하며 실패 시 전체 트랜잭션을 되돌린다.
- 응답의 fixtureNumber, TeamMatch 제목, 연결된 팀 일정 제목에 새 번호가 반영된다. 번호가 출전정지 경기 순서에 영향을 주므로 관련 팀의 시작 전 명단 재계산 이벤트를 남긴다. 일정 상태는 번호 변경만으로 되살리지 않는다.
- 경기 UUID, 팀 배정, 진출 edge, parent ID 및 Game 결과/리비전은 유지한다. 결과 확정 경기에서도 번호만 수정할 수 있으며 팀 변경의 기존 결과 잠금은 유지한다. 감사 `tournament.bracket.fixture.update`에 변경 전·후 번호를 기록한다.
- 번호 이동 후 비워진 옛 좌표에서 새 경기 생성은 다음 creation generation을 사용한다. 이전 멱등 기록 및 경기 UUID를 덮어쓰거나 옛 경기를 replay하지 않는다. 기존 좌표의 동일 요청 재시도 계약은 유지한다.
- 관리자 경기 수정 모달에서 현재 번호를 채우고 실제 API로 저장한다. 오류 시 입력/모달 유지, 성공 후 관리자 및 공개 상세 캐시를 갱신한다. 기존 프론트 MSW에는 이 PATCH 핸들러가 없으며 번호가 없는 기존 수정 payload는 계속 유효하다.

### 조별리그 경기와 조 편성 정합 (2026-10-08)

- 조 순위는 조 편성(`groups[].groupTeams`)을 기준으로 계산·표시한다. 순위 행(`V1TournamentStanding`)은 결과 확정 뒤 재계산 때 만들어진다. 순위 행이 하나도 없는 조는 공개 일정·기록 API(`public-tournament-records.service.ts`)가 편성 팀으로 0값 `baselineStandings`를 서버에서 내리고, 웹 대진 페이지도 `groupTeams`로 같은 0값 기준선을 만든다. 순위 행이 있는 조는 행만 내려서, 새로 편성된 팀은 재계산 전까지 표에서 빠진다.
- 조별+결선(`format = group_knockout`, `kind ≠ regular_league`) 대회의 공개 상세는 대진표가 공개된 뒤 조별 공개 순위표 요약을 싣는다. `groups[].standings[].sharedRank: number | null` 은 정본 §5 동점 처리를 다 쓰고도 갈리지 않은 팀에만 값이 있다(그 동률 묶음 팀들의 저장 `position` 중 최솟값 — 묶음 전원이 같은 값, "공동 n위"). `groups[].qualification: { advancingRegistrationIds: string[]; undecided: boolean } | null` 은 진출 팀이다: 이 조 팀이 결선 경기(조별 단계가 아닌 비취소·비보관·비삭제 경기)에 이미 배정돼 있으면 그 팀들이 진출 팀이고(어드민이 동률 자리에 직접 고른 결과를 따른다) `undecided` 는 배정 수가 `advanceCount` 보다 적고 진출선에 동률이 걸렸을 때만 `true`, 아무도 배정되지 않았으면 순위로 정해진 팀만 싣고 동률로 안 정해진 자리가 있으면 `undecided = true`. 일부만 배정된 동안에는 배정된 팀만 싣는다(순위로 이미 확정된 나머지 팀도 자리를 채울 때까지 진출로 칠하지 않는다). `advanceCount` 가 조 팀 수 이상이면 조 전체가 진출이고 `undecided = false`. 조 경기가 덜 끝났거나 순위표가 낡았거나 `advanceCount` 가 null 이면 `qualification = null`, `sharedRank` 는 null. 어드민 미리보기와 같은 판정(`group-rank-preview.ts`)에서 나오며, 팀 식별 정보가 아니라 구조 정보라 모집 중 마스킹 대상이 아니다.
- `POST /admin/tournaments/:id/fixtures`(그리고 팀을 바꾸는 `PATCH /admin/fixtures/:id`)는 `phase = group` 조 안의 경기에 들어가는 팀이 그 조에 편성돼 있지 않으면 같은 트랜잭션에서 편성한다. `sortOrder`는 조의 현재 최댓값 + 1이고 이미 편성된 팀은 건드리지 않는다. 결선 단계(`round12`~`third_place`) 조와 조 없는 경기는 편성을 바꾸지 않는다. 감사 `tournament.bracket.group_team.create`(`afterJson.auto = "fixture"`). 자동 편성으로 새 편성이 생겼고 그 조에 순위 행이 이미 있으면 같은 트랜잭션에서 `recalculateStandings`와 같은 계산(조별 + 통합)을 돌리고 감사 `tournament.bracket.standings.recalculate_auto`를 남긴다. 순위 행이 없는 조는 재계산하지 않는다.
- **한 팀 한 조 (2026-10-10, 결정 4)**: 위 자동 편성은 그 팀이 **같은 대회의 다른 `phase = group` 조에 이미 편성돼 있지 않을 때만** 일어난다. 이 조에 없는 신청이 다른 조별 조에 있으면 `POST /admin/tournaments/:id/fixtures`·`PATCH /admin/fixtures/:id`·`POST /admin/tournaments/:id/group-teams` 는 `409 TEAM_IN_OTHER_GROUP`("다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.")로 거절하고 아무것도 쓰지 않는다(상대 팀 자동 편성 포함). 응답 `details` 에 겹친 `registrationId` 와 들어가려던 `groupId` 가 담긴다. 자리 배정(`PUT /admin/tournament-slots/:slotId/assignment`·배치 변경·무작위 채우기)도 같은 코드로 거절하되, 맞바꾸기 도중의 일시적 겹침을 허용하려고 **트랜잭션 끝에서 이전 팀의 편성을 푼 뒤 이번 요청이 새로 만든 편성만** 검사한다(거절되면 자리 변경 전체가 롤백). 이미 이 조에도 편성된 팀은 다른 조와 겹쳐 있어도 허용하고(이미 겹친 데이터는 그대로), 결선 단계 조·조 없는 경기는 이 검사를 하지 않는다. 다른 조로 옮기려면 먼저 `DELETE /admin/group-teams/:id` 로 옛 조 편성을 뺀다(그 조에 경기가 남아 있으면 `GROUP_TEAM_HAS_FIXTURES`).
- `DELETE /admin/group-teams/:id`는 `phase = group` 조에서 삭제되지 않은 경기가 남아 있는 팀이면 `409 GROUP_TEAM_HAS_FIXTURES`로 거부한다. 경기가 없는 팀, 결선 단계 조와 미정 부전승 자리는 기존대로 해제된다.
- 공개 상세 `leagueFixtures[]`는 여전히 `kind = regular_league`에서만 채워진다. 리그 방식 일반 대회(`format = league`)의 일정은 `fixtures[]`로 그린다.

### 대진 자리(slot) 응답 (2026-10-09, 어드민 대진 그림 편집기 PR-1a)

- 새 표 `v1_tournament_slots`(`V1TournamentSlot`)는 팀이 들어갈 칸의 정본이다. 대회·정규 리그가 같은 표를 쓴다(`kind`: `ENTRY`·`BYE`·`GROUP_RANK`). `V1TeamMatch.homeSlotId`·`awaySlotId` 가 경기와 자리를 잇는다. 이 PR 은 스키마와 응답만 더하고 자리를 만드는 엔드포인트는 후속 PR 이다.
- `GET /admin/tournaments/:tournamentId/bracket` 최상위에 `slots[]` 가 추가된다: `{ id, kind, groupId, sourceGroupId, position, label, registrationId, teamName }`. `label` 은 저장하지 않고 읽을 때 계산한다 — 조별 그룹의 `ENTRY` "A조 1번", 결선 그룹·정규 리그의 `ENTRY` "1번 자리", `BYE` "부전승 1", `GROUP_RANK` "A조 1위". 빈 자리는 `registrationId`·`teamName` 이 null.
- 같은 응답의 `fixtures[]` 에 `homeSlotId`·`awaySlotId`(자리 없는 기존 경기는 null)와 `game` 이 추가된다: `{ id, state, version, hasLiveRecords, hasOfficialResult, latestRevision: { id, state, score, entryMethod } | null }`. `hasLiveRecords` 는 게임 이벤트가 1건 이상이다(빠른 결과를 못 쓰는 조건과 같다). `hasOfficialResult` 는 공식 결과 포인터(`currentOfficialRevision`)가 `OFFICIAL` 이다(진행 중인 정정 초안이 있어도 true — 시작된 경기 팀 교체 거절 조건과 같다). `latestRevision` 은 상태와 무관한 가장 최근 리비전(DRAFT·SUBMITTED·CHANGE_REQUESTED·OFFICIAL·VOID)이고 `score` 는 `{ home, away, penalties? }`, 읽을 수 없는 값이면 null. `entryMethod` 는 `reason` 이 `[quick-result]` 로 시작하면 `quick`, 앞 리비전을 대체한 것이면 `correction`, 그 밖은 `console` 이다. 정정·무효에 필요한 리비전 상세(참가자·eventsHash·goalEvents)는 싣지 않는다 — 결과 리비전 API 로 읽는다.
- 공개 상세 `fixtures[]` 에 `homeSlotLabel`·`awaySlotLabel` 이 추가된다. **그 사이드에 팀이 없고 자리가 연결돼 있을 때만** 값이 있고 그 밖에는 null 이다(팀이 있으면 팀 이름이 나온다). `homeTeamName`·`awayTeamName` 의 `'TBD'` 규칙은 바뀌지 않는다. 공개 일정 `GET /tournaments/:id/schedule` 의 `items[]`·`unscheduled[]` 항목에도 같은 두 필드가 같은 규칙으로 추가된다(리그 경기는 항상 null). 경기 단건 상세(`/matches/:fixtureId`)에는 라벨이 없다.
- `PATCH /admin/fixtures/:fixtureId` 는 자리에 연결된 사이드의 팀을 현재 값과 다르게 바꾸거나 비우려 하면 `409 SLOT_LINKED` 를 돌려준다. 같은 값을 보내거나 보내지 않은 쪽, 자리에 연결되지 않은 쪽은 그대로 바꿀 수 있다.
- `PATCH /admin/fixtures/:fixtureId` 는 **시작된 경기의 팀도 바꾼다**(2026-10-09, `docs/design/competition-canonical-flow.md` §4). 게임이 `SCHEDULED` 가 아니어도(진행 중·일시정지·종료됐지만 공식 결과 없음·결과가 `VOID` 로 돌려진 경기) 공식 결과가 없으면(제출됐지만 미확정인 `DRAFT`·`SUBMITTED`·`CHANGE_REQUESTED` 결과 포함) 교체되고, 이때 body 의 `teamChangeReason`(1~200자, 공백 제외)이 필수다(없으면 `400 TEAM_CHANGE_REASON_REQUIRED`). 시작 전 경기는 `teamChangeReason` 을 무시한다. 한 트랜잭션에서 ① 바뀐 사이드의 옛 팀 이벤트(그 사이드의 득점·자책골·카드·반칙·교체와 취소 이벤트, 그 사이드 선수가 참조된 이벤트 — 옛 팀 선수의 자책골은 상대 득점이었어도 함께)를 삭제하고 상대 팀 이벤트·피리어드/시계 이벤트는 남기며 점수는 남은 이벤트로 다시 센다, ②′ 미확정 결과 리비전은 사유와 함께 `VOID` 로 폐기하고(`CHANGE_REQUESTED` 는 불변이라 `VOID` 후속만 추가) `currentOfficialRevisionId` 를 결과 없는 `VOID` 리비전으로 옮긴다(공식 무효와 같은 상태 — 이후 `VOID_REENTRY` 정정으로 새 팀 기준 결과를 다시 입력, 폐기된 리비전은 공개 결과·순위·기록에 집계되지 않음), ② 옛 라인업을 무효화하고 새 팀 참가 명단으로 다시 계산하는 후속 이벤트(`COMPETITION_ROSTER_RESYNC` 의 `startedGameSide`, 바뀐 사이드만)를 남기고, ③ 게임 `version` 을 올려 열려 있던 콘솔의 `expectedVersion` 이 낡게 한다(`VERSION_CONFLICT`). 감사 `tournament.bracket.fixture.started_team_change`(`reason`=사유, `beforeJson.{gameState,score}`, `afterJson.{sides[].removedEventCount,removedEventCount,score,discardedRevisions[]{id,state}}`). 응답은 기존 경기 필드에 `startedTeamChange: { removedEventCount, score } | null` 을 더한다(시작 전 교체·팀 미변경이면 null). 거절: 공식 결과 `409 FIXTURE_RESULT_MUST_BE_VOIDED`(결과를 먼저 무효로 돌린 뒤 교체, 자동 무효화 없음), 취소된 경기 `409 FIXTURE_CANCELLED`, 진출 연결 자리 `409 BRACKET_SOURCE_SLOT_LINKED`/`SLOT_LINKED`. 같은 가드를 쓰는 다른 호출자(리그 대진 재조정·자리 배정)는 시작된 경기에서 여전히 `409 FIXTURE_HAS_RESULT` 다. 정규 리그(`kind=regular_league`)의 사이드 배정 가드는 범위 밖이다.
- `DELETE /admin/fixtures/:fixtureId` 는 경기를 숨기면서 `homeSlotId`·`awaySlotId` 도 같이 비운다. `DELETE /admin/groups/:groupId` 는 조에 속한 자리(`slots`)나 그 조를 원천으로 삼는 순위 자리(`rankSlots`)가 남아 있으면 `409 GROUP_HAS_SLOTS` 로 막는다(검사 순서: `GROUP_HAS_TEAMS` → `GROUP_HAS_FIXTURES` → `GROUP_HAS_SLOTS`).

### 대진 템플릿과 자리 배정 (2026-10-08)

모두 `V1AuthGuard` + `getMutationAdmin`(support 어드민 403). 대회 레인은 `league-fixture-generation:{tournamentId}` advisory lock, 정규 리그 레인은 `v1_tournaments` 행 `FOR UPDATE` + 보류 판정 — 이번 범위에서 정규 리그 자리는 만들어지지 않는다.

- `POST /admin/tournaments/:tournamentId/bracket/template` — 본문 `{ kind: 'knockout' | 'group_knockout' | 'league', … , replaceExisting?: boolean }`. `knockout`: `size` 4·8·12·16, `thirdPlace`. `league`(리그 방식 대회): `teamCount` 3~20, `legs` 1·2. 한 트랜잭션(45초)에서 조·자리·빈 경기(팀 미정)·승자/패자 연결을 만든다. 응답 `{ groups, slots, fixtures, edges }`.
  - 12강은 ENTRY 자리 8 + BYE 자리 4(position 1~4 ↔ `V1TournamentByeSlot.sortOrder` 0·3·4·7), 8강 i번 홈 = BYE 자리 i · 어웨이 = 12강 i번 WINNER 연결.
  - 16강은 ENTRY 자리 16(16강 8경기, 2i-1·2i 번 승자 → 8강 i 번 홈·어웨이), BYE 자리·ByeSlot 없음. 조 이름·round 는 '16강'(phase round16).
  - `GET /admin/tournaments/:id/bracket`·공개 상세의 `groups[]` 는 `phase` enum 순서(조별 → 16강 → 12강 → 8강 → 4강 → 결승 → 3·4위전)로 나온다.
  - 오류: 422 `BRACKET_TEMPLATE_UNSUPPORTED`(범위 밖·필수 필드 누락·`group_knockout` 은 아직 미지원)·`BRACKET_TEMPLATE_FORMAT_MISMATCH`·`BRACKET_TEMPLATE_TOO_LARGE`(경기 240 초과), 409 `COMPETITION_CONFIG_REQUIRED`·`BRACKET_NOT_EMPTY`(비삭제 경기·조·자리가 있음)·`BRACKET_LOCKED`(`replaceExisting` 인데 시작·결과가 있는 경기가 있음).
  - `replaceExisting`: 모든 경기가 시작 전·결과 없음일 때만. 하류 경기부터 소프트 삭제 → 자리 → GroupTeam·Standing·ByeSlot → 조 순으로 지우고 새로 만든다(경기 번호는 1부터 다시, 생성 키는 소프트 삭제 이력 수를 반영).
- `PUT /admin/tournament-slots/:slotId/assignment` — 본문 `{ registrationId: uuid | null }`(null = 비우기). 응답 `{ slot: { id, kind, groupId, sourceGroupId, position, label, registrationId, teamName }, affectedTeamMatchIds }`.
  - 그 자리를 쓰는 경기(`deletedAt IS NULL AND status <> 'cancelled'`) 전부에 사이드를 반영한다. `phase = group` 조에서는 조 편성(`V1TournamentGroupTeam`)을 만들고, 교체·비우기 때 그 조의 다른 경기에 더 이상 없는 이전 팀의 편성·순위 행을 지운 뒤 순위를 다시 계산한다. 새로 만든 편성이 같은 대회의 다른 `phase = group` 조 편성과 겹치면 `409 TEAM_IN_OTHER_GROUP` — 위 한 팀 한 조 문단. BYE 자리는 `ByeSlot` ↔ `GroupTeam(isBye)` 를 전환한다(`createBye` 와 같은 의미).
  - 오류: 404 `SLOT_NOT_FOUND`, 422 `SLOT_REGISTRATION_INVALID`(다른 대회·미확정 등록), 409 `SLOT_TEAM_ALREADY_PLACED`(ENTRY·BYE 교차 포함)·`SLOT_LOCKED`(자리를 쓰는 경기 중 시작·결과 있음).
- `POST /admin/tournaments/:tournamentId/slots/random-fill` — 본문 없음. 잠금 안에서 다시 읽은 빈 ENTRY·BYE 자리에, 아직 어느 자리에도 없는 확정 등록을 서버가 무작위로 배정한다(남는 쪽은 그대로). 응답 `{ assignments: [{ slotId, registrationId }] }`.
- `PATCH /admin/fixtures/:id` 로 자리에 연결된 사이드의 팀을 바꾸면 409 `SLOT_LINKED`(일정·장소·번호 수정은 그대로).
- `POST /admin/tournaments/:tournamentId/league/fixtures/generate` 의 `replaceExisting` 가 자리에 연결된 경기를 덮어쓰려 하면 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` — 템플릿 교체를 쓴다.
- `PATCH /admin/registrations/:registrationId/cancel`(참가 취소 요청 승인 포함)은 확정이었던 팀의 자리를 비운다. 자리를 쓰는 경기 중 시작된 것이 있으면 자리를 그대로 두고 등록만 취소한다. 팀이 보낸 취소 요청(`cancel_requested`)은 자리를 비우지 않는다 — 운영자가 승인할 때 비운다.

### 조별+결선 템플릿과 순위대로 채우기 (2026-10)

- `POST /admin/tournaments/:tournamentId/bracket/template` 에 `kind: 'group_knockout'` 이 추가됐다: `{ kind, groupCount: 2..8, teamsPerGroup: 3..6, advancePerGroup: 1|2, legs: 1|2, thirdPlace: boolean, replaceExisting? }`. 대회 `format` 이 `group_knockout` 이어야 한다(아니면 422 `BRACKET_TEMPLATE_FORMAT_MISMATCH`). 결선 크기 `groupCount × advancePerGroup` 는 2·4·8·16 만 가능하고(그 밖은 422 `BRACKET_TEMPLATE_UNSUPPORTED`) 결승 한 경기뿐(2조×1팀)이면 `thirdPlace` 를 켤 수 없다(422 같은 코드). 계획 경기 수가 240 을 넘으면 422 `BRACKET_TEMPLATE_TOO_LARGE`.
- 만들어지는 것: 조 `A조…`(`advanceCount` = advancePerGroup) · 조마다 ENTRY 자리와 라운드로빈 빈 경기(`league_r{n}`, 회전 `legs`) · 결선 그룹(16강/8강/4강/결승/3위 결정전 — 16강은 8조×2 일 때만, 결승 다음이 3위 결정전)과 빈 경기 · 결선 첫 라운드 사이드에 GROUP_RANK 자리(교차 대진: 2조×1 A1–B1 / 2조×2 A1–B2·B1–A2 / 4조×1 A1–D1·B1–C1 / 4조×2 A1–B2·C1–D2·B1–A2·D1–C2 / 8조×1 A1–H1·D1–E1·B1–G1·C1–F1 / 8조×2 16강 A1–B2·C1–D2·E1–F2·G1–H2·B1–A2·D1–C2·F1–E2·H1–G2) · 이후 라운드 WINNER 연결(3·4위전은 4강 LOSER).
- `GET /admin/tournaments/:tournamentId/slots/standings-preview`: 어드민(support 포함). 응답 `{ slots: [{ slotId, label, state: 'ready'|'tied'|'group_incomplete', candidateRegistrationId, candidateTeamName, tiedRegistrationIds, currentRegistrationId }] }`, 올라올 조 순서 → 순위 순. 조의 비삭제·비취소 경기가 전부 OFFICIAL 이고 조 순위표가 그 결과를 반영했을 때만 `ready`/`tied`. 정본 §5 동점 처리(승점 → 득실 → 다득점 → 맞대결 → 적은 실점)를 다 쓰고도 갈리지 않은 완전 동률 구간에 그 순위가 걸리면 `tied`(`tiedRegistrationIds` = 동률 팀 전체, 후보 없음). 대회 설정 규칙의 저장 순위와 §5 가 어긋나는 자리도 `tied`. 정규 리그 id 는 404 `TOURNAMENT_NOT_FOUND`.
- `POST /admin/tournaments/:tournamentId/slots/fill-from-standings` `{ overrides?: [{ slotId, registrationId }] }`(최대 16개, uuid): mutation admin. 응답 `{ assignments: [{ slotId, registrationId }], skipped: [{ slotId, reason: 'tied'|'group_incomplete' }] }`. `ready` 자리 + override 를 한 트랜잭션에서 배정한다 — 바뀔 자리를 먼저 모두 비운 뒤 넣어 A1↔A2 맞바꾸기가 유일 제약에 걸리지 않는다. override 허용 범위: `tied` 자리는 `tiedRegistrationIds` 안의 팀, `ready` 자리는 그 조 소속 팀, `group_incomplete` 자리는 불가(422 `SLOT_REGISTRATION_INVALID`). 같은 팀이 두 자리에 배정되면 409 `SLOT_TEAM_ALREADY_PLACED`, 결선 경기가 시작된 자리가 바뀌어야 하면 409 `SLOT_LOCKED`(이미 맞게 들어 있는 자리는 건드리지 않는다). 시작 전이면 다시 채울 수 있다. 감사 `tournament.slots.fill_from_standings`.

### Venue snapshot (Task 20261070)

- Admin create/update accept `venue` + `venueAddress`, `venueLatitude`, `venueLongitude`, `venueProvider`, `venueProviderId`; responses add `venueAddress`, `venueProvider`, `venueProviderId` next to `venue`, `latitude`, `longitude`. The server no longer geocodes `venue`.
- PATCH: when the `venue` key is present the whole snapshot is replaced (a name-only PATCH clears coordinates and provider).
- Bracket fixtures: `venue` + the same five `venue*` fields on create/update fixture DTOs map to the fixture's `place*` columns; fixtures created without a venue inherit the tournament's snapshot. Fixture responses keep `venue` and add `place: V1PlaceView | null`.

## Public list default order (2026-10-10)

`GET /tournaments` orders by status group (recruiting, recruitment closed, in progress, finished), then date, then `id` ascending as the tie-breaker. "Recruitment closed" is the status the card shows: stored `closed`, plus a stored-`open` tournament whose `registrationDeadlineAt` has passed or whose capacity (confirmed + awaiting_payment/payment_checking/paid registrations vs `teamCount`) is full; regular leagues have no capacity and keep their stored status. The server is the only place this order is defined; clients render `items[]` as received. The order, the cursor comparison and the `page` offset are all computed in the database (one `ORDER BY` over the status group, the group's date key and `id`), so request cost depends on the page size, not on how many tournaments exist. A `cursor` is an opaque token (`pageInfo.nextCursor`) that carries the sort key its row had on the page that issued it, so a row that turns into 모집 마감 mid-scroll does not make the next page skip rows; a token the list did not issue returns an empty page. `page=1` together with a `cursor` follows the cursor; `total` is counted only for `page` requests.

1. `open` (a regular league's `draft` "upcoming" is grouped here) - `scheduledAt` ascending
2. `closed` - `scheduledAt` ascending
3. `in_progress` - `scheduledAt` ascending
4. `completed` - most recently finished first (`scheduledEndAt` descending, falling back to `scheduledAt`)

Rows without a date sort last inside their group. `cursor` is still the id of the last row of the previous page and `page` is an offset into the same order, so pages never skip or repeat a row. A `cursor` that no longer matches a visible row returns an empty page. Passing `status` narrows to one group; the group's ordering above still applies. The visible set is unchanged (`draft`/`cancelled` tournaments stay hidden).
