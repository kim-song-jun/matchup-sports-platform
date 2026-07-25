import type { ApiEnvelope, ApiErrorBody } from '@/types/api';
import { getStoredV1Session } from './session-storage';
import { reportClientError } from './client-error-reporter';

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export class V1ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(body: ApiErrorBody) {
    super(toErrorMessage(body.message));
    this.name = 'V1ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }
}

// 401(만료·미인증)과 5xx·네트워크 오류는 대응이 정반대다. 전자는 즉시 로그아웃 처리해야
// 하지만 후자는 서버가 잠시 밀린 것이라 재시도해야 한다. 이 구분을 각 화면이 따로 구현하다
// 놓치면, 세션이 멀쩡한데도 로그인이 풀린 것처럼 보인다.
export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof V1ApiError
    && (error.statusCode === 401 || error.code === 'UNAUTHENTICATED');
}

// React Query의 retry 옵션용. 401은 다시 물어도 답이 같으므로 즉시 포기하고, 그 외
// (rate limit 503·5xx·네트워크 단절)는 두 번까지 스스로 다시 시도해 일시 장애를 넘긴다.
export function retryUnlessUnauthenticated(failureCount: number, error: unknown): boolean {
  if (isUnauthenticatedError(error)) return false;
  return failureCount < 2;
}

function toErrorMessage(message: unknown) {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(', ');
  if (message && typeof message === 'object' && 'message' in message) {
    return toErrorMessage((message as { message: unknown }).message);
  }
  return 'Request failed';
}

function getDefaultBaseUrl() {
  return '/api/v1';
}

export function getV1ApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (!configured) return getDefaultBaseUrl();
  return configured.endsWith('/api/v1') ? configured : `${configured.replace(/\/$/, '')}/api/v1`;
}

export function getV1DevAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};

  const searchSessionHeader = {
    'x-v1-search-session-id': getV1SearchSessionId(),
  };
  if (process.env.NODE_ENV === 'production') return searchSessionHeader;

  const { userId, userEmail } = getStoredV1Session();
  return {
    ...(userId ? { 'x-v1-user-id': userId } : {}),
    ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
    ...searchSessionHeader,
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

  const body = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok || body?.status === 'error') {
    const errorBody: ApiErrorBody =
      body ?? {
        status: 'error',
        statusCode: response.status,
        code: 'NETWORK_OR_PARSE_ERROR',
        message: response.statusText || 'Request failed',
        timestamp: new Date().toISOString(),
      };
    const error = new V1ApiError(errorBody);
    reportClientError({
      message: error.message,
      level: error.statusCode >= 500 ? 'error' : 'warn',
      context: {
        path: path.split('?')[0],
        statusCode: error.statusCode,
        code: error.code,
        requestId: errorBody.requestId,
      },
    });
    throw error;
  }

  if (response.status === 204) return undefined as T;

  return (body as ApiEnvelope<T>).data;
}

export function v1Get<T>(path: string, query?: QueryParams) {
  return v1Api<T>(withQuery(path, query), { method: 'GET' });
}

export function v1Post<T>(path: string, body?: unknown, init?: RequestInit) {
  return v1Api<T>(path, { ...init, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export function v1Put<T>(path: string, body?: unknown, init?: RequestInit) {
  return v1Api<T>(path, { ...init, method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
}

export function v1Patch<T>(path: string, body?: unknown, init?: RequestInit) {
  return v1Api<T>(path, { ...init, method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
}

export function v1Delete<T>(path: string, body?: unknown, init?: RequestInit) {
  return v1Api<T>(path, { ...init, method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });
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

function getV1SearchSessionId() {
  const key = 'v1.search.session';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const next = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}
