import { http, HttpResponse } from 'msw';
import type { V1EmailLoginResult, V1LoginStepUpChallenge } from '@/types/api';
import { v1UserFixture } from './fixtures';

/**
 * 이메일 로그인 추가 인증(step-up) 계약의 공유 핸들러 — `POST /auth/login` 의 stepUp 분기와
 * `/auth/login/step-up/verify|resend`. 시나리오는 토큰으로 고른다(상태를 들고 있지 않아 테스트 간 오염이 없다).
 *
 *  - STEP_UP_MSW.email 로 로그인하면 비밀번호와 무관하게 같은 모양의 stepUp 응답이 온다.
 *  - verify: 올바른 코드 → 세션, 그 외 → 400 CODE_INVALID. expired 토큰 → 410, locked 토큰 → 429.
 *  - resend: 200. cooldown 토큰 → 429 RESEND_COOLDOWN, expired 토큰 → 410.
 */
const api = '*/api/v1';
const NOW = '2026-10-21T00:00:00.000Z';
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;

export const STEP_UP_MSW = {
  email: 'stepup@example.com',
  maskedEmail: 'st***@example.com',
  code: '123456',
  tokens: {
    valid: 'step-up-token-valid',
    expired: 'step-up-token-expired',
    locked: 'step-up-token-locked',
    cooldown: 'step-up-token-cooldown',
  },
} as const;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(statusCode: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details: null, timestamp: NOW }, { status: statusCode });
}

export function stepUpChallengeFixture(overrides: Partial<V1LoginStepUpChallenge> = {}): V1LoginStepUpChallenge {
  const now = Date.now();
  return {
    challengeToken: STEP_UP_MSW.tokens.valid,
    maskedEmail: STEP_UP_MSW.maskedEmail,
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
    resendAvailableAt: new Date(now + RESEND_COOLDOWN_MS).toISOString(),
    ...overrides,
  };
}

export function sessionLoginResponse() {
  return ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

export const v1AuthStepUpMswHandlers = [
  http.post(`${api}/auth/login`, async ({ request }) => {
    const { email } = await readJson(request);
    if (typeof email === 'string' && email.trim().toLowerCase() === STEP_UP_MSW.email) {
      return ok<V1EmailLoginResult>({ stepUp: stepUpChallengeFixture() });
    }
    return sessionLoginResponse();
  }),
  http.post(`${api}/auth/login/step-up/verify`, async ({ request }) => {
    const { challengeToken, code } = await readJson(request);
    if (challengeToken === STEP_UP_MSW.tokens.expired) {
      return fail(410, 'STEP_UP_EXPIRED', '인증 시간이 지났어요.');
    }
    if (challengeToken === STEP_UP_MSW.tokens.locked) {
      return fail(429, 'STEP_UP_TOO_MANY_ATTEMPTS', '인증번호를 너무 많이 틀렸어요.');
    }
    if (challengeToken === STEP_UP_MSW.tokens.valid && code === STEP_UP_MSW.code) return sessionLoginResponse();
    return fail(400, 'STEP_UP_CODE_INVALID', '인증번호가 맞지 않아요.');
  }),
  http.post(`${api}/auth/login/step-up/resend`, async ({ request }) => {
    const { challengeToken } = await readJson(request);
    if (challengeToken === STEP_UP_MSW.tokens.expired) {
      return fail(410, 'STEP_UP_EXPIRED', '인증 시간이 지났어요.');
    }
    if (challengeToken === STEP_UP_MSW.tokens.cooldown) {
      return fail(429, 'STEP_UP_RESEND_COOLDOWN', '잠시 후에 다시 받을 수 있어요.');
    }
    const { expiresAt, resendAvailableAt } = stepUpChallengeFixture();
    return ok({ expiresAt, resendAvailableAt });
  }),
];
