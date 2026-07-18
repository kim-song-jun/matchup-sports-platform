# V1 Global Contract

## Runtime

- Local API origin: `http://localhost:8121`
- Prefix: `/api/v1`
- Swagger: `http://localhost:8121/docs`
- JSON content type: `application/json`
- CORS: credentials enabled; production origin comes from `FRONTEND_URL`

## Envelope

All successful responses are wrapped by `TransformInterceptor`:

```json
{
  "status": "success",
  "data": {},
  "timestamp": "2026-05-18T00:00:00.000Z"
}
```

All exceptions are wrapped by `AllExceptionsFilter`:

```json
{
  "status": "error",
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Invalid request",
  "details": null,
  "timestamp": "2026-05-18T00:00:00.000Z"
}
```

If an exception does not provide `code`, the filter currently emits `INTERNAL_ERROR`.

## Validation

Global `ValidationPipe` settings:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`
- `enableImplicitConversion: true`

Frontend submit payloads must remove UI-only fields before calling the API. Unknown body/query fields can produce `400`.

## Authentication

Production authentication uses the signed `teameet_v1_session` HttpOnly cookie issued by successful email registration/login and Kakao authentication responses. The cookie is `Secure` in production, `SameSite=Lax`, scoped to `/api/v1`, and expires after seven days. Guards validate its HMAC signature and expiry, then reload the current account status before installing `request.v1User`.

Temporary persona headers remain development/test-only:

- `x-v1-user-id`
- `x-v1-user-email`

Production Web does not send these identity headers, nginx strips them, and both guards ignore them even if supplied. `V1AuthGuard` requires a valid signed session in production. `OptionalV1AuthGuard` allows guests and hydrates a user only when a valid signed session is present. Development/test may use either the signed cookie or the temporary persona headers.

Common auth errors:

- `401 UNAUTHENTICATED`
- `403 PERMISSION_DENIED`
- `403 SIGNUP_INCOMPLETE` for authenticated Kakao sessions that still require social terms or profile completion

## Pagination

Cursor-list DTOs use:

- `cursor?: string`
- `limit?: number`
- list limits are usually `1..50`, except chat messages allow `1..100`

List responses should be treated as cursor-based result objects. Frontend code should not assume offset pagination.

## Common Error Codes

Observed service/guard codes:

- `UNAUTHENTICATED`
- `PERMISSION_DENIED`
- `SIGNUP_INCOMPLETE`
- `PROFILE_COMPLETION_REQUIRED` (422 for gated creator endpoints; inspect `details.missingFields` and `details.next.route`)
- `VALIDATION_FAILED`
- `NOT_FOUND`
- `NOT_FOUND_OR_ARCHIVED`
- `ALREADY_PROCESSED`
- `INTERNAL_ERROR`

State-changing callers must handle stale or duplicate action responses as either `ALREADY_PROCESSED` or a domain-specific validation/permission error.

## Idempotency Status

The frozen v1 checklist requires idempotency for duplicate mutations. Current controllers do not yet read an `Idempotency-Key` header and common idempotency helpers are still pending. Until helpers exist, frontend should still prevent duplicate submits and treat `ALREADY_PROCESSED` as converged state where appropriate.

## Deferred Boundaries

V1 intentionally has no payment, refund, dispute, support ticket, DM, file attachment, venue operator, lesson, marketplace, or tournament success API. UI must not simulate successful transactions or support outcomes for these surfaces.
