import { http, HttpResponse } from 'msw';

/**
 * 로그인한 계정의 이메일 인증 계약의 공유 핸들러 — `docs/api/domains/auth.md` "Verifying the signed-in account's email".
 * 상태를 들고 있지 않아 테스트 간 오염이 없다. 인증번호가 확정 결과를 고르고, 발송 실패·쿨다운은 테스트가 `server.use` 로 덮는다.
 *
 *  - `POST /verification/email/request`: 본문 없이 계정 이메일로 보낸다. 항상 성공 모양을 돌려준다.
 *  - `POST /verification/email/confirm`: 본문은 서버 DTO(`ConfirmVerificationDto`)와 같이 6자리 문자열 하나. 어기면 400.
 */
const api = '*/api/v1';
const NOW = '2026-11-08T00:00:00.000Z';

export const EMAIL_VERIFY_MSW = {
  maskedTarget: 'me***@example.com',
  codeExpiresInSeconds: 300,
  codes: {
    ok: '123456',
    wrong: '000000',
    expired: '111111',
    exhausted: '222222',
    targetChanged: '333333',
    conflict: '444444',
  },
} as const;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(statusCode: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details: null, timestamp: NOW }, { status: statusCode });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.clone().json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function confirmOutcome(code: string) {
  switch (code) {
    case EMAIL_VERIFY_MSW.codes.ok:
      return ok({ verified: true, channel: 'email', verification: { emailVerified: true, phoneVerified: false } });
    case EMAIL_VERIFY_MSW.codes.expired:
      return fail(400, 'VERIFICATION_NO_PENDING', '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.');
    case EMAIL_VERIFY_MSW.codes.exhausted:
      return fail(400, 'VERIFICATION_TOO_MANY_ATTEMPTS', '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.');
    case EMAIL_VERIFY_MSW.codes.targetChanged:
      return fail(400, 'VERIFICATION_TARGET_CHANGED', '인증할 이메일이 변경됐어요. 인증번호를 다시 받아 주세요.');
    case EMAIL_VERIFY_MSW.codes.conflict:
      return fail(409, 'EMAIL_CONFLICT', '이미 다른 계정에서 사용 중인 이메일이에요.');
    default:
      return fail(400, 'VERIFICATION_CODE_MISMATCH', '인증번호가 올바르지 않아요.');
  }
}

export const v1VerificationEmailMswHandlers = [
  http.post(`${api}/verification/email/request`, () =>
    ok({
      sent: true,
      channel: 'email',
      target: EMAIL_VERIFY_MSW.maskedTarget,
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_MSW.codeExpiresInSeconds * 1000).toISOString(),
    }),
  ),
  http.post(`${api}/verification/email/confirm`, async ({ request }) => {
    const { code, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || typeof code !== 'string' || code.length !== 6) {
      return fail(400, 'VALIDATION_ERROR', '인증번호는 6자리예요.');
    }
    return confirmOutcome(code);
  }),
];
