import { http, HttpResponse } from 'msw';
import type { V1RevokeOtherSessionsResult, V1UnlinkLoginMethodResult } from '@/types/api';

/**
 * 로그인 수단 해제·다른 기기 로그아웃 계약의 공유 핸들러. 보내는 provider 가 시나리오를 정한다 — 상태를 들고 있지 않아
 * 테스트 간 오염이 없다. 고정된 계정(팀밋 카카오 + 이메일 로그인)을 기준으로 한다.
 *
 *  - `POST /auth/identities/unlink`: LOGIN_METHOD_MSW.provider.removable(kakao)은 성공이고 남은 수단은 `['email']`,
 *    `missing`(apple)은 404 LOGIN_METHOD_NOT_FOUND, `last`(email)는 409 LAST_LOGIN_METHOD. 본문은 서버 DTO
 *    (`UnlinkLoginMethodDto`)와 같이 `provider` 하나만, 셋 중 하나여야 하고 어기면 400.
 *    30분이 지난 세션(403 RECENT_LOGIN_REQUIRED)은 값으로 고를 수 없어 테스트가 `server.use` 로 덮어쓴다.
 *  - `POST /auth/sessions/revoke-others`: 항상 성공(`{ revoked: true }`).
 */
const api = '*/api/v1';
const NOW = '2026-11-06T00:00:00.000Z';

export const LOGIN_METHOD_MSW = {
  provider: {
    removable: 'kakao',
    missing: 'apple',
    last: 'email',
  },
  remainingAfterRemoval: ['email'],
} as const;

const PROVIDERS: readonly string[] = ['kakao', 'apple', 'email'];

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(statusCode: number, code: string, message: string, details: Record<string, unknown> | null = null) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details, timestamp: NOW }, { status: statusCode });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.clone().json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export const v1AuthLoginMethodMswHandlers = [
  http.post(`${api}/auth/identities/unlink`, async ({ request }) => {
    const { provider, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || typeof provider !== 'string' || !PROVIDERS.includes(provider)) {
      return fail(400, 'VALIDATION_ERROR', '해제할 로그인 수단을 골라 주세요.');
    }
    switch (provider) {
      case LOGIN_METHOD_MSW.provider.removable: {
        const result: V1UnlinkLoginMethodResult = { provider, authProviders: [...LOGIN_METHOD_MSW.remainingAfterRemoval] };
        return ok(result);
      }
      case LOGIN_METHOD_MSW.provider.last:
        return fail(409, 'LAST_LOGIN_METHOD', '마지막 남은 로그인 수단은 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.');
      default:
        return fail(404, 'LOGIN_METHOD_NOT_FOUND', '연결돼 있지 않은 로그인 수단이에요.');
    }
  }),
  http.post(`${api}/auth/sessions/revoke-others`, () => ok<V1RevokeOtherSessionsResult>({ revoked: true })),
];
