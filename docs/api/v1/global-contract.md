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

## Development Auth

V1 currently uses temporary headers instead of the old app auth storage:

- `x-v1-user-id`
- `x-v1-user-email`

`V1AuthGuard` requires one of these headers and rejects deleted accounts. `OptionalV1AuthGuard` allows guests, hydrates a user when a valid header is present, and rejects deleted accounts.

Common auth errors:

- `401 UNAUTHENTICATED`
- `403 PERMISSION_DENIED`

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
