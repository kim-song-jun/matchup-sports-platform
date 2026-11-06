import { http, HttpResponse } from 'msw';
import type { V1EmailChangeRequestResult, V1EmailChangeVerifyResult } from '@/types/api';
import { v1ProfileFixture } from './fixtures';

/**
 * 계정 이메일 변경 계약의 공유 핸들러 — `docs/api/domains/users.md` "계정 이메일 변경". 시나리오는 보내는 값(주소·인증번호·토큰)으로
 * 고른다. 상태를 들고 있지 않아 테스트 간 오염이 없다.
 *
 *  - `POST /me/email-change/request`: 주소가 시나리오를 정한다. 본문은 서버 DTO(`EmailChangeRequestDto`)와 같은 형식·허용 필드를 따르고 어기면 400.
 *  - `POST /me/email-change/verify`: 인증번호가 시나리오를 정한다(`EmailChangeVerifyDto`: 숫자 6자리).
 *  - `PATCH /me/profile`: 이 파일은 이메일 변경 규칙만 흉내 낸다. 지금 쓰는 주소(`currentEmail`)나 이메일을 건드리지 않는 저장은 토큰 없이 성공하고,
 *    다른 주소는 그 주소의 토큰이 있을 때만 성공한다. 토큰이 없거나 다른 주소의 것이면 400 `EMAIL_CHANGE_PROOF_REQUIRED`
 *    (증명 검사가 충돌 확인보다 먼저다). 이메일을 지우는 저장(`email: null`)은 토큰이 필요 없다. 본문은 `UpdateProfileDto` 와 같은 허용 필드를 따른다.
 */
const api = '*/api/v1';
const NOW = '2026-11-06T00:00:00.000Z';

export const EMAIL_CHANGE_MSW = {
  /** `PATCH /me/profile` 이 "지금 쓰는 주소"로 보는 값. */
  currentEmail: 'current-email@example.com',
  emails: {
    ok: 'new-email@example.com',
    taken: 'taken-email@example.com',
    recentLoginRequired: 'stale-email@example.com',
    cooldown: 'cooldown-email@example.com',
    mailUnavailable: 'no-mail-email@example.com',
  },
  codes: {
    ok: '123456',
    wrong: '000000',
    expired: '111111',
    exhausted: '222222',
  },
  /** 토큰은 주소에 묶인다: `ok` 는 `emails.ok`, `taken` 은 저장 사이 다른 계정이 가져간 `emails.taken` 의 증명이다. */
  tokens: {
    ok: 'msw-email-change-token-ok-0123456789',
    taken: 'msw-email-change-token-taken-0123456789',
  },
  codeExpiresInSeconds: 300,
  resendAvailableInSeconds: 30,
  tokenExpiresInSeconds: 600,
  maxAgeSeconds: 30 * 60,
} as const;

const PROFILE_FIELDS = new Set([
  'realName', 'displayName', 'nickname', 'email', 'emailChangeToken', 'bio', 'phoneProofToken', 'profileImageUrl', 'phone', 'birthDate', 'gender',
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(statusCode: number, code: string, message: string, details: Record<string, unknown> | null = null) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details, timestamp: NOW }, { status: statusCode });
}

function invalidBody() {
  return fail(400, 'VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.clone().json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

// 서버 maskTarget 과 같다: 앞 2자만 남긴다.
function maskedEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

function requestOutcome(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  switch (email) {
    case EMAIL_CHANGE_MSW.currentEmail:
      return fail(400, 'EMAIL_UNCHANGED', '지금 쓰는 이메일과 같아요.');
    case EMAIL_CHANGE_MSW.emails.taken:
      return fail(409, 'EMAIL_CONFLICT', '이미 다른 계정에서 쓰는 이메일이에요.');
    case EMAIL_CHANGE_MSW.emails.recentLoginRequired:
      return fail(403, 'RECENT_LOGIN_REQUIRED', '이메일을 바꾸려면 다시 로그인해 주세요.', { maxAgeSeconds: EMAIL_CHANGE_MSW.maxAgeSeconds });
    case EMAIL_CHANGE_MSW.emails.mailUnavailable:
      return fail(503, 'EMAIL_SEND_UNAVAILABLE', '지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.');
    case EMAIL_CHANGE_MSW.emails.cooldown:
      return fail(400, 'VERIFICATION_RESEND_COOLDOWN', `잠시 후 다시 시도해 주세요. (${EMAIL_CHANGE_MSW.resendAvailableInSeconds}초 뒤에 다시 받을 수 있어요)`);
    default: {
      const result: V1EmailChangeRequestResult = {
        sent: true,
        maskedTarget: maskedEmail(email),
        expiresInSeconds: EMAIL_CHANGE_MSW.codeExpiresInSeconds,
        resendAvailableInSeconds: EMAIL_CHANGE_MSW.resendAvailableInSeconds,
        devCode: EMAIL_CHANGE_MSW.codes.ok,
      };
      return ok(result);
    }
  }
}

function verifyOutcome(code: string) {
  switch (code) {
    case EMAIL_CHANGE_MSW.codes.ok: {
      const result: V1EmailChangeVerifyResult = { emailChangeToken: EMAIL_CHANGE_MSW.tokens.ok, expiresInSeconds: EMAIL_CHANGE_MSW.tokenExpiresInSeconds };
      return ok(result);
    }
    case EMAIL_CHANGE_MSW.codes.expired:
      return fail(400, 'VERIFICATION_NO_PENDING', '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.');
    case EMAIL_CHANGE_MSW.codes.exhausted:
      return fail(400, 'VERIFICATION_TOO_MANY_ATTEMPTS', '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.');
    default:
      return fail(400, 'VERIFICATION_CODE_MISMATCH', '인증번호가 올바르지 않아요.');
  }
}

/** 토큰이 증명하는 주소. 모르는 토큰은 아무 주소도 증명하지 못한다. */
function emailProvenBy(token: unknown): string | null {
  if (token === EMAIL_CHANGE_MSW.tokens.ok) return EMAIL_CHANGE_MSW.emails.ok;
  if (token === EMAIL_CHANGE_MSW.tokens.taken) return EMAIL_CHANGE_MSW.emails.taken;
  return null;
}

export const v1EmailChangeMswHandlers = [
  // EmailChangeRequestDto: 이메일 하나. 주소 형식이 아니거나 254자를 넘으면 거절한다.
  http.post(`${api}/me/email-change/request`, async ({ request }) => {
    const { email, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email)) return invalidBody();
    return requestOutcome(email);
  }),
  // EmailChangeVerifyDto: 숫자 6자리.
  http.post(`${api}/me/email-change/verify`, async ({ request }) => {
    const { code, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalidBody();
    return verifyOutcome(code);
  }),
  // UpdateProfileDto 중 이메일 변경 규칙만. nickname 2~40자와 gender 는 필수다.
  http.patch(`${api}/me/profile`, async ({ request }) => {
    const body = await readJson(request);
    const { nickname, gender, email, emailChangeToken, realName } = body;
    if (Object.keys(body).some((key) => !PROFILE_FIELDS.has(key))) return invalidBody();
    if (typeof nickname !== 'string' || nickname.length < 2 || nickname.length > 40) return invalidBody();
    if (gender !== 'male' && gender !== 'female') return invalidBody();
    if (email !== undefined && email !== null && (typeof email !== 'string' || email.length > 320 || !EMAIL_PATTERN.test(email))) return invalidBody();
    if (emailChangeToken !== undefined && emailChangeToken !== null && (typeof emailChangeToken !== 'string' || emailChangeToken.length > 1024)) return invalidBody();

    const target = typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (target !== null && target !== EMAIL_CHANGE_MSW.currentEmail) {
      if (emailProvenBy(emailChangeToken) !== target) {
        return fail(400, 'EMAIL_CHANGE_PROOF_REQUIRED', '새 이메일로 받은 인증번호를 먼저 확인해 주세요.');
      }
      if (target === EMAIL_CHANGE_MSW.emails.taken) return fail(409, 'EMAIL_CONFLICT', '이미 다른 계정에서 쓰는 이메일이에요.');
    }
    return ok({
      profile: { ...v1ProfileFixture.profile, nickname, realName: typeof realName === 'string' ? realName : null, gender },
      updatedAt: NOW,
    });
  }),
];
