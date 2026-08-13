import type { ApiEnvelope, ApiErrorBody } from '@/types/api';
import { getStoredV1Session } from './session-storage';
import { randomUuid } from './uuid';
import { reportClientError } from './client-error-reporter';
import {
  PHONE_VERIFICATION_REQUIRED_CODE,
  notifyPhoneVerificationRequired,
} from './phone-verification-required';

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

// React Query의 retry 옵션용. 서버가 잠시 밀린 경우(5xx·요청량 초과·네트워크 단절)만
// 두 번까지 다시 시도한다.
//
// 4xx는 같은 요청을 반복해도 답이 같으므로 재시도하지 않는다 — /auth/me만 해도 401(만료)
// 외에 403이 계정 정지·소셜 가입 미완·약관 재동의로 흔하게 나오는데, 이걸 재시도하면
// 사용자에게는 지수 백오프만큼 지연이 얹히고 서버에는 요청이 3배로 간다. rate limit을
// 고치려는 코드가 스스로 한도를 3배로 소모하는 셈이 된다.
export function retryTransientFailure(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  // 네트워크 단절은 응답 자체가 없어 V1ApiError로 감싸이지 않고 그대로 전파된다.
  if (!(error instanceof V1ApiError)) return true;
  return error.statusCode >= 500 || error.statusCode === 429;
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
    // 휴대폰 미인증 차단은 설계된 제품 상태이지 클라이언트 오류가 아니다. 리포터의 dedupe 는
    // 10초 창이라 미인증 사용자 수만큼 에러 로그가 실제로 쌓이고, 그러면 어드민 에러 뷰어에서
    // 진짜 장애가 이 잡음에 묻힌다 — 로그는 건너뛰고 안내 신호만 보낸다.
    const phoneVerificationRequired = error.code === PHONE_VERIFICATION_REQUIRED_CODE;
    if (!phoneVerificationRequired) {
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
    }
    // 미인증 계정이 쓰기를 시도한 경우 — 실패 토스트만 남기면 사용자는 이유를 알 수 없다.
    // 전역 모달이 인증 화면으로 안내하도록 여기서 한 번만 신호를 쏜다.
    if (phoneVerificationRequired) notifyPhoneVerificationRequired();
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

/**
 * multipart/form-data POST — 파일 업로드 전용. `v1Api` 와 달리 content-type 을 직접 지정하지
 * 않는다(브라우저가 boundary 를 붙여야 한다). 이미지 업로드 훅이 쓰던 지역 함수를 여기로
 * 옮겼다 — 경기 영상 업로드도 같은 처리가 필요해 두 벌로 갈라두지 않는다.
 */
export async function v1MultipartPost<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${getV1ApiBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      // intentionally no content-type — browser sets multipart boundary automatically
      ...getV1DevAuthHeaders(),
    },
    body: formData,
  });

  const body: ApiEnvelope<T> | ApiErrorBody | null = await response.json().catch(() => null);

  // `response.json()` can yield a non-object JSON primitive (e.g. a 200 with body "ok").
  // Guard `typeof === 'object'` before `'status' in body` — the `in` operator throws a
  // TypeError on primitives, which would turn upload error handling into a crash.
  if (!response.ok || (typeof body === 'object' && body !== null && 'status' in body && body.status === 'error')) {
    throw new V1ApiError(
      (body as ApiErrorBody) ?? {
        status: 'error' as const,
        statusCode: response.status,
        code: 'NETWORK_OR_PARSE_ERROR',
        message: response.statusText || '업로드에 실패했어요.',
        timestamp: new Date().toISOString(),
      },
    );
  }

  // 200이지만 정상 엔벨로프가 아닌 경우(빈 바디/HTML → null, 또는 "ok" 같은 JSON
  // primitive)를 모두 가드. data 필드를 가진 객체임을 확인한 뒤에만 .data 반환 —
  // primitive를 그대로 통과시키면 .data가 undefined로 호출부에서 크래시한다.
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new V1ApiError({
      status: 'error' as const,
      statusCode: response.status,
      code: 'NETWORK_OR_PARSE_ERROR',
      message: '업로드 응답을 해석하지 못했어요. 다시 시도해 주세요.',
      timestamp: new Date().toISOString(),
    });
  }
  return (body as ApiEnvelope<T>).data;
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

  const next = randomUuid();
  window.localStorage.setItem(key, next);
  return next;
}
