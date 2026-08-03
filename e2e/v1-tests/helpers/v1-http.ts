import type { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Raw HTTP helper for v1 E2E specs that need to assert actual status codes /
 * response bodies (not just rendered UI), reusing the SAME dev-auth header
 * mechanism `helpers/auth.ts`'s `loginAs()` injects via localStorage for
 * page-driven tests: `x-v1-user-email` (see `apps/v1_api/src/auth/v1-auth.guard.ts`
 * -> `resolveV1RequestIdentity`). `page.request` already carries the
 * Playwright `baseURL` (http://localhost:3013) and goes through the Next.js
 * `/api/:path*` rewrite to `v1_api`, exactly like `ui-visual-contracts.spec.ts`'s
 * existing `page.request.get('/v1/home', ...)` usage — no new proxy/base
 * needed.
 *
 * Every v1_api success response is wrapped by `TransformInterceptor` as
 * `{ status: 'success', data, timestamp }`; every error response is the raw
 * `{ code, message, ... }` body `HttpExceptionFilter` writes (NOT wrapped).
 * `apiCall()` returns `{ status, body }` where `body` is that raw JSON so
 * callers branch on `status` and either read `body.data` (success) or
 * `body.code` (error) themselves — this mirrors production client behavior
 * instead of hiding the envelope shape from the test.
 */

export type ApiResult<T = unknown> = {
  readonly status: number;
  readonly body: T;
  readonly response: APIResponse;
};

export type SuccessEnvelope<T> = { status: 'success'; data: T; timestamp: string };
export type ErrorEnvelope = { code: string; message: string; [key: string]: unknown };

export function authHeaders(email: string | null): Record<string, string> {
  return email === null ? {} : { 'x-v1-user-email': email };
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Generates a matching pair used across this repo's command endpoints:
 * an `Idempotency-Key` header AND a body `clientCommandId` field. Several
 * command boundaries (`GamesService.withCommand`,
 * `TournamentResultReviewService.withResultCommand`) reject a header/body
 * mismatch with `COMMAND_IDEMPOTENCY_KEY_MISMATCH` — using the identical
 * value for both up front avoids that entirely and keeps every command call
 * site in this test suite uniform.
 */
export function commandId(): string {
  return randomUUID();
}

export async function apiGet<T = unknown>(
  request: APIRequestContext,
  url: string,
  opts: { email?: string | null; params?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const response = await request.get(url, {
    headers: authHeaders(opts.email ?? null),
    params: opts.params,
  });
  return finish<T>(response);
}

export async function apiPost<T = unknown>(
  request: APIRequestContext,
  url: string,
  opts: { email?: string | null; data?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const headers = authHeaders(opts.email ?? null);
  if (opts.idempotencyKey !== undefined) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }
  const response = await request.post(url, { headers, data: opts.data ?? {} });
  return finish<T>(response);
}

export async function apiPut<T = unknown>(
  request: APIRequestContext,
  url: string,
  opts: { email?: string | null; data?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const headers = authHeaders(opts.email ?? null);
  if (opts.idempotencyKey !== undefined) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }
  const response = await request.put(url, { headers, data: opts.data ?? {} });
  return finish<T>(response);
}

export async function apiPatch<T = unknown>(
  request: APIRequestContext,
  url: string,
  opts: { email?: string | null; data?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const headers = authHeaders(opts.email ?? null);
  if (opts.idempotencyKey !== undefined) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }
  const response = await request.patch(url, { headers, data: opts.data ?? {} });
  return finish<T>(response);
}

async function finish<T>(response: APIResponse): Promise<ApiResult<T>> {
  const status = response.status();
  const text = await response.text();
  let body: T;
  try {
    body = text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
  } catch {
    throw new Error(`Non-JSON response (status ${status}) from ${response.url()}: ${text.slice(0, 500)}`);
  }
  return { status, body, response };
}

/** Unwraps a `{status:'success',data,...}` envelope and fails loudly (not silently) if a caller
 *  gets this on an error response — that would mean the assertion order in the test is wrong. */
export function unwrap<T>(result: ApiResult<unknown>): T {
  const body = result.body as SuccessEnvelope<T>;
  if (result.status >= 400 || body === undefined || body === null || !('data' in body)) {
    throw new Error(
      `Expected a success envelope but got status=${result.status} body=${JSON.stringify(result.body)}`,
    );
  }
  return body.data;
}
