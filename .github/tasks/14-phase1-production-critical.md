# 14 — Phase 1: Production Critical

## Context

MatchUp is pre-production. Four features are required before launch: match edit/cancel API hardening, image upload pipeline, Toss Payments real integration, and OAuth social login. Current codebase already has partial implementations (PATCH /matches/:id exists, payment service has TODO stubs, OAuth handler throws `not yet implemented`).

## Goal

Deliver production-ready implementations for items 1-1 through 1-4 with full test coverage, no new tech debt, and clear env-gated behavior for external services (Toss, OAuth providers).

---

## 1-3. Match Edit/Cancel/Close API

### Context
`PATCH /matches/:id` already exists with full status transition logic (`resolveHostManagedStatus`). `POST /matches/:id/complete` delegates to `update()`. Controller has all routes wired. `MatchStatus` Prisma enum: `recruiting | full | in_progress | completed | cancelled`. The service-level type alias duplicates this — tech debt to resolve.

### Decision
No new endpoints needed. Existing `PATCH /matches/:id` with `UpdateMatchDto.status` handles cancel (`cancelled`) and close (`completed`). Add `match_updated` to `NotificationType` enum for edit notifications to participants.

### Consequences
- Prisma schema change: add `match_updated` to `NotificationType` enum
- Service: remove local `type MatchStatus` alias (line 114), import from `@prisma/client` directly
- Service: add participant notification on non-status field changes (title, date, venue, fee changes)
- Frontend `MatchStatus` type in `apps/web/src/types/api.ts` line 14: add `'in_progress'` (currently missing, causes type drift)
- Tests: update `apps/api/src/matches/matches.service.spec.ts` mock for new notification type

### File Changes

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `match_updated` to `NotificationType` |
| `apps/api/src/matches/matches.service.ts` | Remove local MatchStatus type alias; import from Prisma; add edit notification |
| `apps/api/src/matches/matches.service.spec.ts` | Update mocks for new notification |
| `apps/web/src/types/api.ts:14` | Add `'in_progress'` to MatchStatus union |
| `apps/web/src/app/(main)/matches/[id]/edit/page.tsx` | No change needed (already functional) |

---

## 1-4. Image Upload Pipeline

### Context
No `uploads` module exists. `sharp` is NOT installed (only `@nestjs/platform-express` is present). `@capacitor/camera` is NOT in web package.json. Match model has `imageUrl` field. User model has `profileImageUrl`.

### Decision
- Phase 1: local disk storage (`uploads/` directory) with `multer` + `sharp` for resize/webp conversion
- S3 deferred to Phase 2 (no AWS credentials yet; trigger: when deploy target moves to EC2/ECS)
- New module: `apps/api/src/uploads/`
- Endpoints: `POST /uploads/image` (multipart, JwtAuthGuard) returns `{ url: string }`
- sharp processing: resize to max 1200px width, webp output, strip EXIF
- Static serving: NestJS `ServeStaticModule` for `/uploads/*`

### Consequences
- Install: `sharp`, `@types/multer` in `apps/api`
- New files: `uploads.module.ts`, `uploads.controller.ts`, `uploads.service.ts`, `uploads.service.spec.ts`
- New frontend component: `apps/web/src/components/ui/image-upload.tsx`
- Edit page integration: replace "이미지 업로드 수정은 아직 지원하지 않아요" with actual uploader
- Security: file type validation (MIME whitelist: image/jpeg, image/png, image/webp), max 5MB, filename sanitization

### File Changes

| File | Change |
|------|--------|
| `apps/api/package.json` | Add `sharp`, `@types/multer` |
| `apps/api/src/uploads/uploads.module.ts` | NEW — module with MulterModule |
| `apps/api/src/uploads/uploads.controller.ts` | NEW — POST /uploads/image |
| `apps/api/src/uploads/uploads.service.ts` | NEW — sharp resize + webp + EXIF strip |
| `apps/api/src/uploads/uploads.service.spec.ts` | NEW — unit tests |
| `apps/api/src/app.module.ts` | Register UploadsModule + ServeStaticModule |
| `apps/web/src/components/ui/image-upload.tsx` | NEW — drag-drop + preview component |
| `apps/web/src/app/(main)/matches/[id]/edit/page.tsx` | Integrate image-upload component |

### DTO

```typescript
// Response from POST /uploads/image
interface UploadImageResponse {
  url: string;       // e.g. "/uploads/images/abc123.webp"
  width: number;
  height: number;
}
```

---

## 1-1. Toss Payments Real Integration

### Context
`PaymentsService` has 3 TODO comments at lines 131, 135, 179. Service structure is solid: prepare creates DB record with orderId, confirm updates status, refund resets participant. `paymentKey` field exists in schema. Missing: actual Toss API HTTP calls.

### Decision
- Add `TossPaymentsClient` (private helper class within payments module) using `axios`
- Env-gated: `TOSS_SECRET_KEY` absent → log warning, skip HTTP call, return mock success (same behavior as WebPushService pattern)
- Toss API: `POST https://api.tosspayments.com/v1/payments/confirm` (confirm), `POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel` (refund)
- Webhook endpoint: `POST /payments/webhook` (Toss callback) — verify via `Toss-Signature` header
- Replace `Record<string, unknown>` DTOs with typed classes (tech debt)

### Consequences
- `axios` already in web; add to `apps/api` dependencies
- Schema: add `failedReason String?` to Payment model (for Toss error messages)
- Security: webhook signature verification, TOSS_SECRET_KEY in env only

### File Changes

| File | Change |
|------|--------|
| `apps/api/package.json` | Add `axios` |
| `apps/api/prisma/schema.prisma` | Add `failedReason` to Payment model |
| `apps/api/src/payments/toss-payments.client.ts` | NEW — HTTP client for Toss API |
| `apps/api/src/payments/payments.service.ts` | Replace TODOs with TossPaymentsClient calls; type DTOs |
| `apps/api/src/payments/dto/payment.dto.ts` | NEW — PreparePaymentDto, ConfirmPaymentDto, RefundPaymentDto |
| `apps/api/src/payments/payments.controller.ts` | Add webhook endpoint; use typed DTOs |
| `apps/api/src/payments/payments.module.ts` | Register TossPaymentsClient provider |
| `apps/api/src/payments/payments.service.spec.ts` | Update mocks for TossPaymentsClient |
| `apps/web/src/lib/payment-ui.ts` | No change (already handles all statuses) |

### DTO Signatures

```typescript
class PreparePaymentDto {
  @IsString() participantId: string;
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsString() method?: string;
}

class ConfirmPaymentDto {
  @IsString() paymentKey: string;
  @IsString() orderId: string;
  @IsInt() amount: number;
}

class RefundPaymentDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
}
```

---

## 1-2. OAuth Social Login (Kakao/Naver/Apple)

### Context
`AuthService.oauthLogin()` throws `not yet implemented`. `passport-jwt` installed but no `passport-kakao`/`passport-naver`. User model has `oauthProvider` (enum: kakao/naver/apple/email) and `oauthId` fields. Dev-login creates users with `oauthProvider: 'kakao'`.

### Decision
- Direct REST API calls (not passport strategies) — simpler, fewer dependencies, matches mobile (Capacitor) flow
- Flow: Frontend redirects to provider → callback with `code` → `POST /auth/{provider}` with `{ code, redirectUri }` → backend exchanges code for token → gets profile → upsert user → return JWT
- Env-gated: `KAKAO_CLIENT_ID` / `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` / `APPLE_CLIENT_ID` absent → throw descriptive error
- Apple: JWT-based client_secret generation (requires private key file)

### Consequences
- No new npm dependencies (uses existing axios or built-in fetch)
- Add `axios` to api (same as 1-1)

### File Changes

| File | Change |
|------|--------|
| `apps/api/src/auth/oauth/kakao.strategy.ts` | NEW — KakaoOAuthClient (REST, not passport) |
| `apps/api/src/auth/oauth/naver.strategy.ts` | NEW — NaverOAuthClient |
| `apps/api/src/auth/oauth/apple.strategy.ts` | NEW — AppleOAuthClient |
| `apps/api/src/auth/auth.service.ts` | Replace `oauthLogin()` throw with real implementation |
| `apps/api/src/auth/auth.controller.ts` | Wire provider-specific endpoints (already exist in routes) |
| `apps/api/src/auth/auth.module.ts` | Register OAuth clients |
| `apps/api/src/auth/auth.service.spec.ts` | NEW/update — mock OAuth clients |
| `apps/web/src/app/(auth)/login/page.tsx` | Add OAuth redirect buttons (Kakao/Naver/Apple) |
| `apps/web/src/app/(auth)/callback/page.tsx` | NEW — OAuth callback handler |

---

## Parallel Work Breakdown

### Phase A (fully parallel — no shared files)

| Unit | Agent | Files Owned |
|------|-------|-------------|
| **BE-uploads** | backend-api-dev | `apps/api/src/uploads/*` (all new) |
| **BE-oauth** | backend-integration-dev | `apps/api/src/auth/oauth/*` (all new), `auth.service.ts` |
| **FE-image-upload** | frontend-ui-dev | `apps/web/src/components/ui/image-upload.tsx` (new) |
| **FE-oauth-ui** | frontend-ui-dev | `apps/web/src/app/(auth)/callback/page.tsx` (new), login page |

### Phase B (sequential — shared file edits)

| Unit | Agent | Shared Files |
|------|-------|-------------|
| **Schema migration** | backend-data-dev | `schema.prisma` (sole editor) |
| **BE-payments** | backend-api-dev | `payments.service.ts`, `payments.controller.ts` |
| **BE-match-cleanup** | backend-api-dev | `matches.service.ts` (remove type alias, add notification) |
| **FE-type-sync** | frontend-data-dev | `apps/web/src/types/api.ts` |
| **App module registration** | backend-api-dev | `app.module.ts` (sole editor) |

### Execution Order

```
Phase A (parallel): BE-uploads ⟂ BE-oauth ⟂ FE-image-upload ⟂ FE-oauth-ui
    ↓
Phase B (sequential): Schema migration → BE-payments → BE-match-cleanup → App module → FE-type-sync
    ↓
Phase C (parallel): All spec/test updates ⟂ FE edit page integration
```

## Conflict-Risk Files (single-editor only)

| File | Designated Editor |
|------|------------------|
| `apps/api/prisma/schema.prisma` | backend-data-dev |
| `apps/api/src/app.module.ts` | backend-api-dev (Phase B) |
| `apps/web/src/types/api.ts` | frontend-data-dev |
| `apps/api/package.json` | backend-api-dev (Phase B) |
| `apps/web/src/test/msw/handlers.ts` | frontend-data-dev |

---

## Test Scenarios

### 1-3 Match Edit/Cancel

| Type | Scenario |
|------|----------|
| Happy | Host updates title → 200, participants get `match_updated` notification |
| Happy | Host sets status=cancelled → 200, participants get `match_cancelled` notification |
| Happy | Host sets status=completed on in_progress match → 200 |
| Edge | Non-host tries update → 403 |
| Edge | Update cancelled match → 400 |
| Edge | Set maxPlayers < currentPlayers → 400 |
| Error | Match not found → 404 |
| Mock | Add `match_updated` to NotificationType in spec mocks |

### 1-4 Image Upload

| Type | Scenario |
|------|----------|
| Happy | Upload JPEG → 200, returns webp URL |
| Edge | Upload 6MB file → 413 |
| Edge | Upload .exe disguised as .jpg → 400 (MIME check) |
| Error | No auth token → 401 |
| Mock | MSW handler for `POST /uploads/image` |

### 1-1 Payments

| Type | Scenario |
|------|----------|
| Happy | Prepare → confirm → payment.status=completed, participant.status=confirmed |
| Happy | Confirm → refund → payment.status=refunded |
| Edge | TOSS_SECRET_KEY absent → graceful mock mode |
| Edge | Double confirm → 400 |
| Edge | Refund non-completed payment → 400 |
| Error | Toss API 4xx → payment.status=failed, failedReason saved |
| Mock | TossPaymentsClient mock in spec; MSW handler for frontend |

### 1-2 OAuth

| Type | Scenario |
|------|----------|
| Happy | Kakao code exchange → new user created → JWT returned |
| Happy | Existing user login → JWT returned (no duplicate) |
| Edge | KAKAO_CLIENT_ID absent → 500 with descriptive error |
| Edge | Invalid code → 401 |
| Error | Provider API down → 502 |
| Mock | OAuth client mocks in auth.service.spec.ts |

---

## Tech Debt Resolved

| Item | Resolution |
|------|-----------|
| `matches.service.ts` line 114: local `type MatchStatus` duplicating Prisma enum | Import from `@prisma/client` |
| `payments.service.ts`: `Record<string, unknown>` params (lines 50, 134, 168) | Replace with typed DTOs |
| `api.ts` line 14: `MatchStatus` missing `'in_progress'` | Add to union type |
| `auth.service.ts` line 101-105: `oauthLogin` throw stub | Replace with real implementation |
| Edit page line 219-220: "이미지 업로드 수정은 아직 지원하지 않아요" | Replace with image-upload component |

---

## Security Notes

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Malicious file upload (RCE via image parser) | MIME whitelist (jpeg/png/webp only), sharp processes in isolated buffer, max 5MB |
| Payment amount tampering | Server-side amount verification against match.fee (already exists line 89) |
| Toss webhook spoofing | Verify `Toss-Signature` header with HMAC |
| OAuth token theft | Short-lived authorization codes, server-side exchange only, no tokens in URL params |
| Path traversal in upload filenames | UUID-based filenames only, no user-supplied paths |
| TOSS_SECRET_KEY exposure | Env-only, never in response payloads, `ConfigService.get()` access |

---

## Validation Gates

```bash
# After schema change
cd apps/api && npx prisma validate

# After backend changes
cd apps/api && pnpm test
cd apps/api && npx tsc --noEmit

# After frontend changes
cd apps/web && npx tsc --noEmit
cd apps/web && pnpm test
cd apps/web && pnpm lint

# Integration
cd apps/api && pnpm test:integration

# E2E (after all units pass)
cd e2e && npx playwright test
```
