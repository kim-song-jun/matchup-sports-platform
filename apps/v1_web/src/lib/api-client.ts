import type { ApiEnvelope, ApiErrorBody } from '@/types/api';

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export class V1ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'V1ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }
}

const defaultBaseUrl = '/api/v1';

export function getV1ApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (!configured) return defaultBaseUrl;
  return configured.endsWith('/api/v1') ? configured : `${configured.replace(/\/$/, '')}/api/v1`;
}

export function getV1DevAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};

  const userId = window.localStorage.getItem('teameet.v1.userId');
  const userEmail = window.localStorage.getItem('teameet.v1.userEmail');

  return {
    ...(userId ? { 'x-v1-user-id': userId } : {}),
    ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
  };
}

export async function v1Api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getV1ApiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...getV1DevAuthHeaders(),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.status === 'error') {
    throw new V1ApiError(
      body ?? {
        status: 'error',
        statusCode: response.status,
        code: 'NETWORK_OR_PARSE_ERROR',
        message: response.statusText || 'Request failed',
        timestamp: new Date().toISOString(),
      },
    );
  }

  return (body as ApiEnvelope<T>).data;
}

export function v1Get<T>(path: string, query?: QueryParams) {
  return v1Api<T>(withQuery(path, query), { method: 'GET' });
}

export function v1Post<T>(path: string, body?: unknown, init?: RequestInit) {
  return v1Api<T>(path, { ...init, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export function v1Patch<T>(path: string, body?: unknown, init?: RequestInit) {
  return v1Api<T>(path, { ...init, method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
}

function withQuery(path: string, query?: QueryParams) {
  if (!query) return path;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined) params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}
