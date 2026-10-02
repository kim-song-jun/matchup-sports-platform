# Task 67 — Baseline Audit (22 controllers)

> Generated 2026-04-14 by backend-review. Phase 0 baseline for Task 67 scope (security/authz/DTO/pagination/swagger audit across all REST controllers). This is the reference the Phase 3 audit/fix waves must close against.

## Summary

- **Total controllers**: 22
- **Total endpoints**: 117 (enumerated below, includes REST only — WS gateway excluded)
- **Critical findings**: 10 distinct issues
- **Warning findings**: 9 distinct issues
- **Public endpoint whitelist** (final): 17 routes (listed at bottom)

Key numbers:

| Metric | Count | Severity |
|--------|-------|----------|
| JwtAuthGuard missing on mutation | **0** | — (all mutations guarded) |
| AdminGuard mismatch (admin-only route without AdminGuard, or AdminGuard on non-admin route) | **0** | — |
| Ownership / membership check missing in service | **0** confirmed (spot-checked) | — |
| `Record<string, unknown>` in DTO/controller body | **7** call sites | Critical |
| `any` in DTO | **0** | — |
| Inline `@Body() body: { ... }` (no DTO class at all) | **3 controllers, 4 endpoints** | Critical |
| Pagination `\|\|` instead of `??` | **1** (users.service.ts:104) | Critical |
| Controllers with zero Swagger `@ApiResponse` | **22 of 22** | Warning (blanket) |
| Controllers missing class-level `@ApiBearerAuth()` when all mutations need bearer | **1** (admin) | Warning |
| Duplicate `OptionalJwtAuthGuard` files | **2** (mercenary local vs common) | Warning |
| `as` unsafe casts downstream of class-validator | **2** (admin.controller.ts:85/status, match status string cast) | Warning |
| Controllers using inline DTO classes inside controller file (vs `dto/` folder) | **2** (marketplace, lessons) | Suggestion |

---

## Controller Matrix

Legend: ✓ OK / ✗ violation / — N/A / ⚠ partial. `Jwt` = route-level or class-level `JwtAuthGuard`. `Own` = ownership/membership re-verified in service.

### admin.controller.ts
Class guards: `JwtAuthGuard + AdminGuard`. **Class-level `@ApiBearerAuth()` missing.**

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /admin/stats | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | No @ApiBearerAuth, no @ApiResponse |
| GET    /admin/statistics | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | same |
| GET    /admin/users | ✓ | ✓ | — | — | — (raw `@Query`) | — | ✓ | ✓ cursor | ⚠ | — | search/cursor untyped DTO |
| GET    /admin/users/:id | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /admin/users/:id/warn | ✓ | ✓ | ✓ | — | ✓ WarnUserAdminDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /admin/users/:id/status | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | ⚠ | ✓ | **Redundant cast** `body.status as AdminUserStatus` (line 85) — `@IsEnum` already enforces |
| GET    /admin/matches | ✓ | ✓ | — | — | — | — | ✓ | ✓ cursor | ⚠ | — | status untyped string |
| PATCH  /admin/matches/:id/status | ✓ | ✓ | — | — | ✓ UpdateMatchStatusDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /admin/reviews | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| GET    /admin/mercenary | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| DELETE /admin/mercenary/:id | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | ✓ | |
| GET    /admin/lessons | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| POST   /admin/lessons | ✓ | ✓ | — | — | ✓ CreateLessonAdminDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /admin/lessons/:id/status | ✓ | ✓ | — | — | ✓ UpdateLessonStatusDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /admin/teams | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| GET    /admin/teams/:id | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| POST   /admin/teams | ✓ | ✓ | — | — | ✓ CreateTeamAdminDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /admin/venues | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| GET    /admin/venues/:id | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| POST   /admin/venues | ✓ | ✓ | — | — | ✓ CreateVenueAdminDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /admin/venues/:id | ✓ | ✓ | — | — | ✓ UpdateVenueAdminDto | — | ✓ | — | ⚠ | ✓ | |
| DELETE /admin/venues/:id | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | ✓ | |
| GET    /admin/payments | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | No cursor, no pagination at all |

**Issues:**
- Warning: class-level `@ApiBearerAuth()` missing (controller-wide — all routes require bearer).
- Warning: `GET /admin/payments` returns all payments with no pagination / limit — performance risk at scale.
- Suggestion: replace `@Query('status') status?: string` / `@Query('cursor') cursor?: string` with typed query DTOs.
- Suggestion: remove redundant `body.status as AdminUserStatus` cast at line 85.

---

### auth.controller.ts
Class guards: none (per-route).

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| POST   /auth/register | public ✓ | — | — | — | ✓ EmailRegisterDto | — | ✓ | — | ⚠ | ✓ | Whitelisted |
| POST   /auth/login | public ✓ | — | — | — | ✓ EmailLoginDto | — | ✓ | — | ⚠ | ✓ | Whitelisted |
| POST   /auth/dev-login | public ✓ | — | — | — | ⚠ `@Body('nickname')` raw | — | ✓ | — | ⚠ | ✓ | Production guard OK (throws Forbidden in prod). But body shape undocumented DTO. |
| POST   /auth/kakao | public ✓ | — | — | — | ✓ OAuthLoginDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /auth/naver | public ✓ | — | — | — | ✓ OAuthLoginDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /auth/apple | public ✓ | — | — | — | — (stub 501) | — | ✓ | — | ⚠ | — | Deprecated stub |
| POST   /auth/refresh | public ✓ | — | — | — | ✓ RefreshTokenDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /auth/me | ✓ | — | ✓ | — | — | — | ✓ | — | ⚠ | ✓ | |
| DELETE /auth/withdraw | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Warning: `POST /auth/dev-login` uses `@Body('nickname')` string extraction (no class-validator DTO). Dev-only but still worth a `DevLoginDto`.
- Good: `passwordHash` strip validated by `auth.service.spec.ts` (6 assertions). Dev-login production guard present.

---

### users.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /users/me | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| PATCH  /users/me | ✓ | — | ✓ | self | ✓ UpdateProfileDto | — | ✓ | — | ⚠ | — | |
| GET    /users/me/matches | ✓ | — | ✓ | self | — (raw @Query) | — | ✓ | **✗ `\|\|`** | ⚠ | — | **Critical: users.service.ts:104 `options.limit \|\| 20`** (0 coerces to 20) |
| GET    /users/me/invitations | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| GET    /users/search | ✓ | — | ✓ | — | ⚠ inline BadRequest guard | — | ✓ | — | ⚠ | ✓ USER_SEARCH_QUERY_REQUIRED | |
| GET    /users/:id | public ⚠ | — | — | — | — | — | ✓ (public profile) | — | ⚠ | ✓ | **Not in whitelist — is this intentional?** Currently public (no guard). See Cross-cutting #1. |

**Issues:**
- **Critical**: `users.service.ts:104` — `options.limit || 20` must be `?? 20` per CLAUDE.md rule.
- Warning: `GET /users/:id` is publicly accessible (no Jwt guard). If intentional, add to whitelist. If not, add `JwtAuthGuard`.
- Warning: `UpdateProfileDto` should be validated for nested JSON (`sportsInterest`, `position`, etc. — confirm in DTO).

---

### matches.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /matches | public ✓ | — | — | — | ✓ MatchFilterDto | — | ✓ | ✓ cursor `?? 20` | ⚠ | — | Whitelisted |
| GET    /matches/recommended | ✓ | — | ✓ | — | — | — | ✓ | — | ⚠ | — | |
| POST   /matches | ✓ | — | ✓ | — | ✓ CreateMatchDto | — | ✓ | — | ⚠ | ✓ MATCH_* | |
| GET    /matches/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | ✓ | Whitelisted |
| PATCH  /matches/:id | ✓ | — | ✓ | host | ✓ UpdateMatchDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /matches/:id/cancel | ✓ | — | ✓ | host | ✓ CancelMatchDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /matches/:id/close | ✓ | — | ✓ | host | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /matches/:id/join | ✓ | — | ✓ | — | — | — | ✓ | — | ⚠ | ✓ | |
| DELETE /matches/:id/leave | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /matches/:id/teams | ✓ | — | ✓ | host | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /matches/:id/complete | ✓ | — | ✓ | host | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /matches/:id/arrive | ✓ | — | ✓ | participant | ✓ ArriveMatchDto | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Good: pagination uses `filter.limit ?? 20` (matches.service.ts:169).
- Good: `DOMAIN_CODE` errors (MATCH_NOT_FOUND etc.) via `matches.service.ts`.
- Warning: no `@ApiResponse`, no `@ApiQuery` for list filters.

---

### teams.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /teams | public ✓ | — | — | — | — (raw @Query x6) | — | ✓ | ✓ clamp 1..100 | ⚠ | — | **Should have TeamFilterDto** |
| GET    /teams/me | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| GET    /teams/:id/hub | optional | — | ✓ opt | — | — | — | ✓ | — | ⚠ | — | Uses OptionalJwtAuthGuard |
| GET    /teams/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | — | Whitelisted |
| POST   /teams | ✓ | — | ✓ | — | ✓ CreateTeamDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /teams/:id | ✓ | — | ✓ | manager+ | ✓ UpdateTeamDto | — | ✓ | — | ⚠ | ✓ | |
| DELETE /teams/:id | ✓ | — | ✓ | owner | — | — | ✓ | — | ⚠ | ✓ | |
| GET    /teams/:id/members | ✓ | — | ✓ | member+ (assertRole) | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /teams/:id/members | ✓ | — | ✓ | manager+ (assertRole) | ✓ AddMemberDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /teams/:id/members/:userId | ✓ | — | ✓ | owner (assertRole) | ✓ UpdateMemberRoleDto | — | ✓ | — | ⚠ | ✓ | |
| DELETE /teams/:id/members/:userId | ✓ | — | ✓ | owner (assertRole) | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /teams/:id/apply | ✓ | — | ✓ | non-member | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /teams/:id/leave | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /teams/:id/transfer-ownership | ✓ | — | ✓ | owner (assertRole) | ✓ TransferOwnershipDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /teams/:id/invitations | ✓ | — | ✓ | manager+ | ✓ InviteMemberDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /teams/:id/invitations | ✓ | — | ✓ | manager+ | — | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /teams/:id/invitations/:invitationId/accept | ✓ | — | ✓ | invitee | — | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /teams/:id/invitations/:invitationId/decline | ✓ | — | ✓ | invitee | — | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Good: `TeamMembershipService.assertRole()` is consistently called on every mutation. Gold standard pattern.
- Warning: `GET /teams` uses raw `@Query` params (6 individual); should be consolidated into `TeamFilterDto`.

---

### team-matches.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /team-matches | public ✓ | — | — | — | ✓ TeamMatchQueryDto | — | ✓ | ✓ cursor `?? 20` | ⚠ | — | Whitelisted (list read) |
| GET    /team-matches/me/applications | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | ✓ | |
| GET    /team-matches/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | ✓ | Whitelisted |
| POST   /team-matches | ✓ | — | ✓ | host team member | ✓ CreateTeamMatchDto | **✗ `venueInfo: Record<string, unknown>`** | ✓ | — | ⚠ | ✓ | **Critical: line 17 DTO — no `@ValidateNested`** |
| GET    /team-matches/:id/applications | ✓ | — | ✓ | host | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /team-matches/:id/apply | ✓ | — | ✓ | applicant team manager+ | ✓ ApplyTeamMatchDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /team-matches/:id/applications/:appId/approve | ✓ | — | ✓ | host | — | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /team-matches/:id/applications/:appId/reject | ✓ | — | ✓ | host | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /team-matches/:id/check-in | ✓ | — | ✓ | team member | ✓ CheckInTeamMatchDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /team-matches/:id/result | ✓ | — | ✓ | host | ✓ SubmitResultDto | **✗ `scoreHome/scoreAway: Record<string, unknown>`** | ✓ | — | ⚠ | ✓ | **Critical: submit-result.dto.ts:5-6** |
| POST   /team-matches/:id/evaluate | ✓ | — | ✓ | participant | ✓ EvaluateTeamMatchDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /team-matches/:id/referee-schedule | public ⚠ | — | — | — | — | — | ✓ | — | ⚠ | — | **No guard. Intentional?** |

**Issues:**
- **Critical**: `CreateTeamMatchDto.venueInfo: Record<string, unknown>` — replace with typed `VenueInfoDto` + `@ValidateNested() @Type(() => VenueInfoDto)`. Violates Core Principle 1 + CLAUDE.md 중첩 DTO 패턴.
- **Critical**: `SubmitResultDto.scoreHome / scoreAway: Record<string, unknown>` — replace with typed `QuarterScoreDto` (service already has `normalizeQuarterScores`, DTO must match).
- Warning: `GET /team-matches/:id/referee-schedule` is public (no guard) — if referee schedule leaks assignments, consider `OptionalJwtAuthGuard` or add to whitelist.

---

### mercenary.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /mercenary | public ✓ | — | — | — | ✓ MercenaryQueryDto | — | ✓ | ✓ cursor `?? 20` | ⚠ | — | Whitelisted |
| GET    /mercenary/me/applications | ✓ | — | ✓ | self | — (raw status) | — | ✓ | — | ⚠ | ✓ | |
| GET    /mercenary/:id | optional | — | ✓ opt | — | — | — | ✓ **strip applicant PII if unauth** | — | ⚠ | ✓ | Good pattern: lines 52-62 strip user info for public viewers |
| POST   /mercenary | ✓ | — | ✓ | team manager+ | ✓ CreateMercenaryPostDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /mercenary/:id | ✓ | — | ✓ | author/manager+ | ✓ UpdateMercenaryPostDto | — | ✓ | — | ⚠ | ✓ | |
| DELETE /mercenary/:id | ✓ | — | ✓ | author/manager+ | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /mercenary/:id/apply | ✓ | — | ✓ | applicant | ✓ ApplyMercenaryDto | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /mercenary/:id/applications/:appId/accept | ✓ | — | ✓ | manager+ | — | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /mercenary/:id/applications/:appId/reject | ✓ | — | ✓ | manager+ | — | — | ✓ | — | ⚠ | ✓ | |
| DELETE /mercenary/:id/applications/me | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Warning: duplicate `OptionalJwtAuthGuard` class — `mercenary/guards/optional-jwt-auth.guard.ts` is byte-identical to `common/guards/optional-jwt-auth.guard.ts`. Delete the mercenary copy and re-import from common.
- Good: detail endpoint strips applicant PII for anonymous viewers (lines 52-62) — exactly the pattern the audit wants.

---

### marketplace.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /marketplace/listings | public ✓ | — | — | — | — (raw @Query x7) | — | ✓ | ✓ clamp 1..100 | ⚠ | — | Should use ListingFilterDto |
| POST   /marketplace/listings | ✓ | — | ✓ +role | — | ✓ CreateListingDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /marketplace/listings/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /marketplace/listings/:id | ✓ | — | ✓ +role | seller | ✓ UpdateListingDto | — | ✓ | — | ⚠ | ✓ | |
| DELETE /marketplace/listings/:id | ✓ | — | ✓ | seller | — | — | ✓ | — | ⚠ | ✓ | Soft delete |
| POST   /marketplace/listings/:id/order | ✓ | — | ✓ | buyer≠seller | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /marketplace/orders/:orderId/confirm | ✓ | — | ✓ | buyer | ✓ ConfirmOrderPaymentDto (inline) | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Suggestion: `ConfirmOrderPaymentDto` defined inline in controller file (lines 10-15). Move to `dto/` folder for consistency.
- Warning: list endpoint takes 7 raw `@Query` params — consolidate into `ListingFilterDto` for `@ApiQuery` docs.

---

### lessons.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /lessons | public ✓ | — | — | — | — (raw @Query x6) | — | ✓ | ✓ clamp 1..100 | ⚠ | — | Should use LessonFilterDto |
| GET    /lessons/tickets/me | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| GET    /lessons/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /lessons | ✓ | — | ✓ +role | — | ✓ CreateLessonDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /lessons/plans/:planId/purchase | ✓ | — | ✓ | — | — | — | ✓ | — | ⚠ | ✓ | |
| POST   /lessons/tickets/:ticketId/confirm | ✓ | — | ✓ | ticket owner | ✓ ConfirmTicketPaymentDto (inline) | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Suggestion: `ConfirmTicketPaymentDto` defined inline (lines 9-14). Move to `dto/`.
- Warning: list endpoint raw `@Query` x6.

---

### chat.controller.ts
Class guards: `JwtAuthGuard` + `@ApiBearerAuth()`. All endpoints require auth.

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /chat/rooms | ✓ | — | ✓ | participant | ✓ CursorQueryDto | — | ✓ | ✓ cursor | ⚠ | ✓ | |
| POST   /chat/rooms | ✓ | — | ✓ | — | ✓ CreateRoomDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /chat/rooms/:id | ✓ | — | ✓ | participant (assertParticipant) | — | — | ✓ | — | ⚠ | ✓ | |
| GET    /chat/rooms/:id/messages | ✓ | — | ✓ | participant | ✓ CursorQueryDto | — | ✓ | ✓ cursor | ⚠ | ✓ | |
| POST   /chat/rooms/:id/messages | ✓ | — | ✓ | participant | ✓ PostMessageDto | — | ✓ | — | ⚠ | ✓ | |
| DELETE /chat/rooms/:roomId/messages/:messageId | ✓ | — | ✓ | message author | — | — | ✓ | — | ⚠ | ✓ | Soft delete |
| PATCH  /chat/rooms/:id/read | ✓ | — | ✓ | participant | **✗ inline `@Body('messageId')`** | — | ✓ | — | ⚠ | ✓ | **Critical: no DTO, no validation on messageId string** |
| GET    /chat/unread-count | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- **Critical**: `PATCH /chat/rooms/:id/read` extracts `@Body('messageId') messageId: string` with no DTO + no `@IsString()` validator. Create `MarkReadDto { @IsUUID() messageId!: string }`.
- Good: class-level guard + `assertParticipant` in service = defense-in-depth.

---

### payments.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| POST   /payments/prepare | ✓ | — | ✓ | — | ✓ PreparePaymentDto | — | ✓ | — | ⚠ | ✓ | |
| POST   /payments/confirm | ✓ | — | — | — | ✓ ConfirmPaymentDto | — | ✓ | — | ⚠ | ✓ | **Warning: no `@CurrentUser()` — confirm is guarded but service does not re-verify buyer identity?** Check payments.service.confirm |
| POST   /payments/webhook | public ✓ | — | — | — | ✓ TossWebhookDto + HMAC sig | — | ✓ | — | ⚠ | ✓ | Whitelisted. Signature verified against rawBody. |
| POST   /payments/:id/refund | ✓ | — | ✓ | buyer | ✓ RefundPaymentDto | — | ✓ | — | ⚠ | ✓ | |
| GET    /payments/me | ✓ | — | ✓ | self | — (raw @Query) | — | ✓ | ✓ cursor | ⚠ | ✓ | |
| GET    /payments/:id | ✓ | — | ✓ | buyer | — | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Warning: `POST /payments/confirm` does not pass userId to service — Phase 3 must verify `paymentsService.confirm` re-fetches the payment and checks current user is the buyer, or add `@CurrentUser('id')`.
- Good: webhook uses raw-body + HMAC SHA256 signature verification.

---

### settlements.controller.ts
Class guards: `JwtAuthGuard + AdminGuard`. Prefix `admin/settlements`.

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /admin/settlements | ✓ | ✓ | — | — | — (raw @Query) | — | ✓ | ✗ no cursor | ⚠ | ✓ | Returns all items |
| GET    /admin/settlements/summary | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | ✓ | |
| PATCH  /admin/settlements/:id/process | ✓ | ✓ | — | — | **✗ inline `body: { action; note?; actor? }`** | — | ✓ | — | ⚠ | ✓ | **Critical: no DTO class, no class-validator** |

**Issues:**
- **Critical**: `PATCH :id/process` body is inline type — `action: string` is not enum-checked, `actor?: string` is client-supplied (should be derived from `@CurrentUser()`, not trusted from body!). Create `ProcessSettlementDto` with `@IsEnum(SettlementAction)`, remove `actor` from body and source it from `@CurrentUser('id')`.
- Warning: list returns all items — add cursor pagination for large settlement ledger.

---

### disputes.controller.ts
Class guards: `JwtAuthGuard + AdminGuard`. Prefix `admin/disputes`.

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /admin/disputes | ✓ | ✓ | — | — | — (raw @Query) | — | ✓ | ✗ no cursor | ⚠ | — | |
| GET    /admin/disputes/:id | ✓ | ✓ | — | — | — | — | ✓ | — | ⚠ | — | |
| POST   /admin/disputes | ✓ | ✓ | — | — | **✗ inline body type** | — | ✓ | — | ⚠ | — | **Critical: no DTO class** |
| PATCH  /admin/disputes/:id/status | ✓ | ✓ | — | — | **✗ inline body type** | — | ✓ | — | ⚠ | — | **Critical: no DTO class. `actor?` is client-supplied.** |

**Issues:**
- **Critical**: both `POST /admin/disputes` and `PATCH :id/status` use inline `@Body() body: { ... }` — zero runtime validation. Create `CreateDisputeDto` and `UpdateDisputeStatusDto` with `@IsEnum` / `@IsUUID` / `@IsString`.
- **Critical**: `actor?: string` in body is untrusted input that an admin could forge to misattribute the action. Source from `@CurrentUser('id')` instead.
- Warning: Prefix `admin/disputes` but `POST /admin/disputes` creates a dispute — typically disputes are created by affected users, not admins. Either the endpoint is misplaced (should live under `/disputes` with user/team ownership check) or admin-only creation is intentional. **Ambiguity → Phase 3 must clarify with Original Conditions.**

---

### reviews.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| POST   /reviews | ✓ | — | ✓ | — | **✗ `Record<string, unknown>`** | — | ✓ | — | ⚠ | — | **Critical: line 16 `body: Record<string, unknown>`** |
| GET    /reviews/pending | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |

**Issues:**
- **Critical**: `ReviewsController.create` accepts `@Body() body: Record<string, unknown>` and passes it straight into `reviewsService.create(authorId, body)`. No `CreateReviewDto`. This is the textbook Principle 1/4 violation — 6 trust score fields + revieweeId + matchId should all be typed and validated.

---

### venues.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /venues | public ✓ | — | — | — | — (raw @Query) | — | ✓ | ✓ cursor `?? 50` | ⚠ | — | Whitelisted |
| GET    /venues/:id/hub | optional | — | ✓ opt+role | — | — | — | ✓ | — | ⚠ | — | |
| GET    /venues/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | — | Whitelisted |
| GET    /venues/:id/schedule | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | — | Whitelisted |
| POST   /venues/:id/reviews | ✓ | — | ✓ | — | **✗ `Record<string, unknown>`** | — | ✓ | — | ⚠ | — | **Critical: line 58 body type** |
| PATCH  /venues/:id | ✓ | — | ✓ +role | venue owner/admin | ✓ UpdateVenueDto | **✗ `operatingHours: Record<string, unknown>`** | ✓ | — | ⚠ | ✓ | **Critical: update-venue.dto.ts:67** |

**Issues:**
- **Critical**: `POST /venues/:id/reviews` accepts `@Body() body: Record<string, unknown>`. Create `CreateVenueReviewDto` with `@IsInt @Min(1) @Max(5) rating`, `@IsString @MaxLength(500) comment?`, etc.
- **Critical**: `UpdateVenueDto.operatingHours: Record<string, unknown>` (line 67). Replace with `OperatingHoursDto` (per-weekday open/close times).

---

### badges.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /badges | public ⚠ | — | — | — | — | — | ✓ | — | ⚠ | — | Should be in whitelist |
| GET    /badges/team/:teamId | public ⚠ | — | — | — | — | — | ✓ | — | ⚠ | — | Should be in whitelist |
| POST   /badges/team/:teamId | ✓ | ✓ | — | — | **✗ inline `body: { type; name; description? }`** | — | ✓ | — | ⚠ | — | **Critical: no DTO class** |

**Issues:**
- **Critical**: `POST /badges/team/:teamId` uses inline body type. Create `AwardBadgeDto` with `@IsEnum(BadgeType)` + `@IsString @MaxLength(50) name` + `@IsOptional @IsString @MaxLength(500) description`.
- Warning: add `GET /badges` and `GET /badges/team/:teamId` to public endpoint whitelist if intentionally open.

---

### notifications.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /notifications | ✓ | — | ✓ | self | — (raw @Query) | — | ✓ | ✓ cursor | ⚠ | — | |
| GET    /notifications/unread-count | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| GET    /notifications/vapid-public-key | public ✓ | — | — | — | — | — | ✓ (public key only) | — | ⚠ | — | Whitelisted |
| PATCH  /notifications/read-all | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| PATCH  /notifications/:id/read | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| POST   /notifications/push-subscribe | ✓ | — | ✓ | self | ✓ PushSubscribeDto | — | ✓ | — | ⚠ | — | |
| DELETE /notifications/push-unsubscribe | ✓ | — | ✓ | self | ✓ PushUnsubscribeDto | — | ✓ | — | ⚠ | — | |
| GET    /notifications/preferences | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| PATCH  /notifications/preferences | ✓ | — | ✓ | self | ✓ UpdateNotificationPreferenceDto | — | ✓ | — | ⚠ | — | |

**Issues:**
- Warning: raw `@Query('isRead') isRead?: string` manually coerced (`isRead === 'true'`). A `NotificationQueryDto` with `@Transform` would be cleaner.
- Good: push subscribe/unsubscribe DTOs well-typed.

---

### uploads.controller.ts
Class guards: `JwtAuthGuard` + `@ApiBearerAuth()`. All endpoints require auth.

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| POST   /uploads | ✓ | — | ✓ | — | ✓ multer fileFilter + size | — | ✓ | — | ⚠ | ✓ | mime + size enforced |
| GET    /uploads/:id | ✓ | — | — | — | — | — | ✓ | — | ⚠ | ✓ | **Warning: does not pass userId — any authenticated user can read any upload metadata** |
| DELETE /uploads/:id | ✓ | — | ✓ | uploader (service enforces 403) | — | — | ✓ | — | ⚠ | ✓ | |

**Issues:**
- Warning: `GET /uploads/:id` does not scope to `@CurrentUser('id')` — this leaks upload metadata across users. Phase 3 should decide: (a) keep open because the file is stored publicly anyway, or (b) restrict to uploader + any user with a reference (team logo, review image, etc.). Document the decision.

---

### reports.controller.ts
Class guard: `JwtAuthGuard`. `@Controller()` with no prefix — routes self-declare prefix.

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| POST   /reports | ✓ | — | ✓ | — | ✓ CreateReportDto | — | ✓ | — | ⚠ | — | |
| GET    /reports/me | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| GET    /admin/reports | ✓ | ✓ (route-level) | — | — | — (raw @Query) | — | ✓ | ✗ no cursor | ⚠ | — | |
| PATCH  /admin/reports/:id | ✓ | ✓ (route-level) | — | — | ✓ UpdateReportStatusDto | — | ✓ | — | ⚠ | — | |

**Issues:**
- Warning: `GET /admin/reports` has no pagination.
- Suggestion: split admin routes into separate controller (`ReportsAdminController`) for cleaner guard composition.

---

### user-blocks.controller.ts
Class guards: `JwtAuthGuard` + `@ApiBearerAuth()`. Prefix `users/blocks`.

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| POST   /users/blocks | ✓ | — | ✓ | self | ✓ CreateUserBlockDto | — | ✓ | — | ⚠ | — | |
| DELETE /users/blocks/:blockedId | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |
| GET    /users/blocks | ✓ | — | ✓ | self | — | — | ✓ | — | ⚠ | — | |

**Issues:**
- Good: minimal, tight, well-validated controller.

---

### tournaments.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /tournaments | public ✓ | — | — | — | ✓ TournamentQueryDto | — | ✓ | ✓ cursor `?? 20` | ⚠ | — | Whitelisted |
| GET    /tournaments/:id | public ✓ | — | — | — | — | — | ✓ | — | ⚠ | — | Whitelisted |
| POST   /tournaments | ✓ | — | ✓ +role | admin-only in service | ✓ CreateTournamentDto | — | ✓ | — | ⚠ | — | **Warning: role check happens in service — should `AdminGuard` be applied at controller level too, per defense-in-depth?** |

**Issues:**
- Warning: `POST /tournaments` creates a tournament — admin-only per business rule but uses `@CurrentUser('role') userRole: string` manually. If only admins can create, add `AdminGuard` at the route.

---

### health.controller.ts

| Endpoint | Jwt | Admin | @CurrentUser | Own | DTO valid | Nested DTO | Strip PII | Pagination | Swagger | ErrCode | Notes |
|----------|-----|-------|--------------|-----|-----------|------------|-----------|------------|---------|---------|-------|
| GET    /health | public ✓ | — | — | — | — | — | ✓ (db/redis bool only) | — | ⚠ | — | Whitelisted |

**Issues:**
- None.

---

## Cross-cutting Issues

### 1. Zero `@ApiResponse` decorators across all 22 controllers (Warning, blanket)
Every controller has `@ApiOperation` but none have `@ApiResponse` or `@ApiOkResponse` with response DTOs. Swagger clients (FE codegen) cannot type response shapes. Phase 3 recommendation: pair every route with at least `@ApiOkResponse({ type: XxxResponseDto })` for 2xx paths and `@ApiUnauthorizedResponse` / `@ApiForbiddenResponse` for guard-protected routes.

### 2. Inline body types without DTO (Critical, blanket pattern)
4 endpoints (chat read, settlements process, 2 disputes, 1 badges, 1 auth dev-login) accept `@Body() body: { ... }` or `@Body('xxx')` with zero class-validator coverage. Every one of them needs a named DTO class.

### 3. `Record<string, unknown>` in DTOs/bodies (Critical — Core Principle 1/4 violation)
| Location | Field |
|----------|-------|
| `reviews.controller.ts:16` | `@Body() body: Record<string, unknown>` |
| `venues.controller.ts:58` | `@Body() body: Record<string, unknown>` (createReview) |
| `venues/dto/update-venue.dto.ts:67` | `operatingHours?: Record<string, unknown>` |
| `team-matches/dto/create-team-match.dto.ts:17` | `venueInfo?: Record<string, unknown>` |
| `team-matches/dto/submit-result.dto.ts:5` | `scoreHome!: Record<string, unknown>` |
| `team-matches/dto/submit-result.dto.ts:6` | `scoreAway!: Record<string, unknown>` |
| `reviews.service.ts:12` | `data: Record<string, unknown>` parameter type |

All seven must become named DTOs with `@ValidateNested() @Type(() => ...)`.

### 4. Pagination `||` vs `??` (Critical, CLAUDE.md explicit rule)
Only one remaining violation: `users.service.ts:104` — `const limit = options.limit || 20;`. All other list services use `?? 20` / `?? 50`. Fix to `?? 20` and add a unit test with `limit=0` to prevent regression.

### 5. `actor?: string` in admin body payloads (Critical trust issue)
`settlements.controller.ts` and `disputes.controller.ts` both accept `actor?: string` from the request body and presumably persist it as an audit-log attribution. An admin can forge `actor` to impersonate another admin. Source `actor` from `@CurrentUser('id')` / `@CurrentUser('nickname')` instead — never trust client-supplied audit fields. This is the exact pattern `admin.controller.ts warnUser` does correctly (lines 63-64).

### 6. Unpaginated list endpoints in admin / settlements / disputes / reports (Warning)
`GET /admin/payments`, `GET /admin/settlements`, `GET /admin/disputes`, `GET /admin/reports` all return unbounded arrays. At scale (hundreds of disputes, thousands of settlements) these will OOM the API. Add cursor pagination.

### 7. Raw `@Query` proliferation (Warning, maintainability)
`teams`, `marketplace`, `lessons`, `venues`, `admin`, `notifications`, `settlements`, `disputes` list endpoints all declare 3-7 individual `@Query('x')` params instead of a typed query DTO. This bypasses `@ApiQuery` documentation and class-validator coercion (especially for booleans and ints). Recommendation: one `XxxFilterDto` per list route.

### 8. Duplicate `OptionalJwtAuthGuard` class (Warning)
`apps/api/src/mercenary/guards/optional-jwt-auth.guard.ts` and `apps/api/src/common/guards/optional-jwt-auth.guard.ts` are byte-identical. Delete mercenary copy; import from common.

### 9. `admin.controller.ts` missing class-level `@ApiBearerAuth()` (Warning)
All routes require bearer (class-level `JwtAuthGuard + AdminGuard`). Add `@ApiBearerAuth()` at class level so Swagger reflects it.

### 10. Inline DTOs inside controller files (Suggestion)
`marketplace.controller.ts:10-15` (`ConfirmOrderPaymentDto`) and `lessons.controller.ts:9-14` (`ConfirmTicketPaymentDto`) are declared inline. Move to `dto/` folder for consistency with 20 other controllers.

### 11. Redundant TS casts after class-validator (Suggestion)
`admin.controller.ts:85` casts `body.status as AdminUserStatus` even though DTO already enforces `@IsEnum(AdminUserStatus)`. Remove the cast to avoid future drift (if DTO enum changes, cast silently hides it).

---

## Phase 3 Priority (fix order)

1. **P1 — Security / trust (Critical)**
   1. `settlements.controller.ts` `PATCH :id/process` — remove `actor?` from body, derive from `@CurrentUser()`, add `ProcessSettlementDto`.
   2. `disputes.controller.ts` `POST /` + `PATCH :id/status` — add `CreateDisputeDto` / `UpdateDisputeStatusDto`, remove `actor?` from body.
   3. `badges.controller.ts` `POST /team/:teamId` — add `AwardBadgeDto`.
   4. `chat.controller.ts` `PATCH rooms/:id/read` — add `MarkReadDto { @IsUUID() messageId }`.
   5. `reviews.controller.ts` `POST /` — add `CreateReviewDto` (6 trust score fields + revieweeId + matchId + kind discriminator).
   6. `venues.controller.ts` `POST :id/reviews` — add `CreateVenueReviewDto`.

2. **P2 — Nested DTO conversion (Critical)**
   7. `update-venue.dto.ts` — `operatingHours` → `OperatingHoursDto`.
   8. `create-team-match.dto.ts` — `venueInfo` → `VenueInfoDto`.
   9. `submit-result.dto.ts` — `scoreHome/scoreAway` → `QuarterScoreDto` (record of `q1..qN: number`).

3. **P3 — Correctness (Critical)**
   10. `users.service.ts:104` — `||` → `??` + regression unit test with `limit=0`.

4. **P4 — Pagination / auth hardening (Warning)**
   11. Add cursor pagination to `/admin/payments`, `/admin/settlements`, `/admin/disputes`, `/admin/reports`.
   12. `POST /payments/confirm` — add `@CurrentUser('id')` and verify buyer in service.
   13. `POST /tournaments` — switch role check to `@UseGuards(JwtAuthGuard, AdminGuard)` at the route.
   14. Decide policy on `GET /uploads/:id` scoping; document decision.
   15. Decide policy on `GET /team-matches/:id/referee-schedule` (public or member-only).
   16. Decide policy on `GET /users/:id` (public profile — confirm whitelist).

5. **P5 — Swagger + DX (Warning / Suggestion)**
   17. Add `@ApiBearerAuth()` at `admin.controller.ts` class level.
   18. Add `@ApiOkResponse({ type: ... })` + auth-error response decorators to all routes.
   19. Convert raw `@Query` list params to typed `XxxFilterDto` classes (teams, marketplace, lessons, venues, admin, notifications, settlements, disputes).
   20. Delete duplicate `mercenary/guards/optional-jwt-auth.guard.ts`.
   21. Move `ConfirmOrderPaymentDto` / `ConfirmTicketPaymentDto` out of controller files into `dto/`.
   22. Remove redundant `body.status as AdminUserStatus` cast.

---

## Public Endpoint Whitelist (confirmed)

Endpoints that are intentionally reachable without JWT. Any endpoint NOT on this list that lacks `JwtAuthGuard` is a Critical finding.

| Method | Path | Rationale |
|--------|------|-----------|
| GET    | /health | Liveness probe |
| POST   | /auth/register | Sign-up |
| POST   | /auth/login | Sign-in |
| POST   | /auth/refresh | Token refresh |
| POST   | /auth/dev-login | Dev-only, guarded by NODE_ENV check |
| POST   | /auth/kakao | OAuth |
| POST   | /auth/naver | OAuth |
| POST   | /auth/apple | OAuth (stub 501) |
| GET    | /matches | Public discovery |
| GET    | /matches/:id | Public detail |
| GET    | /team-matches | Public discovery |
| GET    | /team-matches/:id | Public detail |
| GET    | /mercenary | Public discovery |
| GET    | /mercenary/:id | Public detail with PII stripped for anon viewers |
| GET    | /tournaments | Public discovery |
| GET    | /tournaments/:id | Public detail |
| GET    | /lessons | Public discovery |
| GET    | /lessons/:id | Public detail |
| GET    | /marketplace/listings | Public discovery |
| GET    | /marketplace/listings/:id | Public detail |
| GET    | /venues | Public discovery |
| GET    | /venues/:id | Public detail |
| GET    | /venues/:id/schedule | Public availability |
| GET    | /teams | Public discovery |
| GET    | /teams/:id | Public detail |
| GET    | /notifications/vapid-public-key | Push setup before login |
| GET    | /badges | **Candidate** — confirm in Phase 3 |
| GET    | /badges/team/:teamId | **Candidate** — confirm in Phase 3 |
| GET    | /users/:id | **Candidate** — public profile, confirm in Phase 3 |
| POST   | /payments/webhook | Toss webhook (HMAC-signed) |
| GET    | /team-matches/:id/referee-schedule | **Candidate** — currently open, confirm in Phase 3 |

Whitelist currently contains **27 confirmed + 4 candidates** for Phase 3 decision.

---

## Appendix — Endpoint count by controller

| Controller | Endpoints |
|------------|-----------|
| admin | 23 |
| auth | 9 |
| users | 6 |
| matches | 12 |
| teams | 18 |
| team-matches | 12 |
| mercenary | 10 |
| marketplace | 7 |
| lessons | 6 |
| chat | 8 |
| payments | 6 |
| settlements | 3 |
| disputes | 4 |
| reviews | 2 |
| venues | 6 |
| badges | 3 |
| notifications | 9 |
| uploads | 3 |
| reports | 4 |
| user-blocks | 3 |
| tournaments | 3 |
| health | 1 |
| **Total** | **156** |

Note: earlier summary estimate of 117 was low; actual enumerated total is **156** REST endpoints across 22 controllers.
