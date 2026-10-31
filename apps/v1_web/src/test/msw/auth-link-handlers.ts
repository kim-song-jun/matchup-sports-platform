import { http, HttpResponse } from 'msw';
import type {
  V1LinkableProvider,
  V1LinkEmailCompleteResult,
  V1LinkEmailRequestResult,
  V1LinkEmailVerifyResult,
  V1LinkSocialResult,
} from '@/types/api';
import { sessionLoginResponse } from './auth-step-up-handlers';

/**
 * 계정 연결·충돌 안내·탈퇴 철회 계약의 공유 핸들러. 시나리오는 보내는 값(코드·토큰·이메일)으로 고른다 —
 * 상태를 들고 있지 않아 테스트 간 오염이 없다.
 *
 *  - `POST /auth/link/kakao|apple`: LINK_MSW.credentials 의 값이 시나리오를 정한다. 모르는 값은 401 UNAUTHENTICATED
 *    (제공자 토큰 검증 실패). 본문은 서버 DTO(`LinkKakaoDto`, `AppleLoginDto`)와 같은 길이 제한·허용 필드를 따르고, 어기면 400.
 *  - `POST /auth/kakao`·`/auth/kakao/token`·`/auth/apple`: LINK_MSW.loginConflicts 의 값이면 `details.next` 가 붙은
 *    409, 그 외에는 세션.
 *  - 위 409 의 `details` 에는 `linkToken`·`linkTokenExpiresInSeconds` 가 실린다. `POST /auth/link/pending` 은
 *    PENDING_LINK_MSW.tokens 의 값으로 시나리오를 고르고(토큰은 20~2048자), 모르는 토큰은 400 SOCIAL_LINK_TOKEN_INVALID.
 *  - 가입 중인 소셜 계정의 PHONE_CONFLICT: 번호 소유를 증명한 뒤에만 알려 준다. `POST /verification/phone/confirm` 이
 *    PHONE_CONFLICT_MSW.codes 의 코드로, `POST /auth/social-profile` 이 PHONE_CONFLICT_MSW.phones 의 번호로 같은 `details` 를
 *    가진 409 를 낸다. 같은 번호의 `request` 는 일반 요청처럼 성공한다.
 *  - 활성 계정(`/my/phone-verify`)은 PHONE_CONFLICT_MSW.activeAccountPhone 으로 `request` 에서 바로 409 이고 `details` 가 없다.
 *  - `POST /auth/login`: WITHDRAWAL_MSW.email 만 가로챈다(비밀번호가 맞으면 철회 토큰이 실린 403, 틀리면 일반 401).
 *    다른 이메일은 다음 핸들러로 넘긴다.
 *  - `POST /auth/withdrawal/cancel`: WITHDRAWAL_MSW.tokens 가 시나리오를 정한다(토큰은 20~512자, 서버 DTO와 같다).
 *  - `POST /auth/link/email/request|verify|complete`: 소셜 계정에 이메일 로그인을 더하는 세 단계. EMAIL_LINK_MSW 의 주소·인증번호·토큰이
 *    시나리오를 정한다. 본문은 서버 DTO(`LinkEmailRequestDto`·`LinkEmailVerifyDto`·`LinkEmailCompleteDto`)와 같은 형식·허용 필드를 따르고 어기면 400.
 */
const api = '*/api/v1';
const NOW = '2026-10-31T00:00:00.000Z';

export const LINK_MSW = {
  // 카카오 accessToken 은 10자, 애플 identityToken 은 20자 이상이어야 서버 DTO를 통과한다.
  credentials: {
    ok: 'msw-link-credential-ok',
    alreadyLinked: 'msw-link-credential-already-linked',
    mergedPending: 'msw-link-credential-merged-pending',
    providerExists: 'msw-link-credential-provider-exists',
    providerInUse: 'msw-link-credential-provider-in-use',
    recentLoginRequired: 'msw-link-credential-recent-login-required',
    signupIncomplete: 'msw-link-credential-signup-incomplete',
  },
  loginConflicts: {
    unverifiedEmail: 'msw-login-conflict-unverified-email',
    contactConflict: 'msw-login-conflict-contact',
    accountProof: 'msw-login-conflict-account-proof',
  },
  maxAgeSeconds: 30 * 60,
  signupIncompleteRoute: '/signup/social',
} as const;

/** 충돌 409 가 주는 연결 토큰. `kakao`·`apple` 은 각 제공자 충돌 응답에 실리는 기본 토큰이고, 나머지는 결과별 시나리오다. */
export const PENDING_LINK_MSW = {
  expiresInSeconds: 30 * 60,
  tokens: {
    kakao: 'msw-pending-link-token-kakao',
    apple: 'msw-pending-link-token-apple',
    kakaoMerged: 'msw-pending-link-token-kakao-merged',
    kakaoAlready: 'msw-pending-link-token-kakao-already',
    providerInUse: 'msw-pending-link-token-in-use',
    providerExists: 'msw-pending-link-token-exists',
    recentLoginRequired: 'msw-pending-link-token-recent-login',
    signupIncomplete: 'msw-pending-link-token-signup-incomplete',
    accountMismatch: 'msw-pending-link-token-account-mismatch',
  },
} as const;

/**
 * 가입 중인 소셜 계정이 다른 계정이 쓰는 번호를 쓰려 할 때의 충돌. 번호(social-profile)나 코드(confirm)로 제공자를 고른다.
 * 서버는 그 계정에 연결 가능한 소셜 로그인이 있을 때만 `details` 를 싣는다.
 * `activeAccountPhone` 은 이미 가입을 마친 계정이 번호를 바꾸다 겪는 충돌이라 연결 안내가 없다.
 */
export const PHONE_CONFLICT_MSW = {
  phones: { kakao: '01099990001', apple: '01099990002' },
  codes: { kakao: '999991', apple: '999992' },
  activeAccountPhone: '01099990003',
} as const;

/**
 * 이메일 로그인 추가. 주소(request)·인증번호(verify)·토큰(complete)이 각 단계의 시나리오를 고른다.
 * 모르는 값은 성공이 아니라 실패다: 주소는 `ok` 만 메일이 나가고, 코드는 `ok` 만 맞고, 토큰은 `ok`·`taken` 만 서버가 서명한 값이다.
 */
export const EMAIL_LINK_MSW = {
  emails: {
    ok: 'new-login@example.com',
    taken: 'taken-login@example.com',
    alreadyHasEmailLogin: 'has-login@example.com',
    recentLoginRequired: 'stale-login@example.com',
    cooldown: 'cooldown-login@example.com',
  },
  codes: {
    ok: '123456',
    wrong: '000000',
    expired: '111111',
    exhausted: '222222',
  },
  tokens: {
    ok: 'msw-email-link-token-ok-0123456789',
    taken: 'msw-email-link-token-taken-0123456789',
  },
  codeExpiresInSeconds: 300,
  resendAvailableInSeconds: 30,
  tokenExpiresInSeconds: 600,
} as const;

/** 비밀번호 없이 카카오로만 가입한 계정 — 이메일 본인 확인 뒤 재설정을 시도하면 PASSWORD_LOGIN_UNAVAILABLE 이 온다. */
export const PASSWORD_UNAVAILABLE_MSW = {
  email: 'kakao-only@example.com',
  providers: ['kakao'],
} as const;

export const WITHDRAWAL_MSW = {
  email: 'withdrawn@example.com',
  password: 'withdrawn-password',
  expiresInSeconds: 600,
  tokens: {
    valid: 'withdrawal-cancel-token-valid',
    expired: 'withdrawal-cancel-token-expired',
    processed: 'withdrawal-cancel-token-processed',
  },
} as const;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(statusCode: number, code: string, message: string, details: Record<string, unknown> | null = null) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details, timestamp: NOW }, { status: statusCode });
}

// 본문을 복제해서 읽는다: /auth/login 은 다른 이메일을 다음 핸들러에 넘기는데, 소비된 본문은 다음 핸들러가 다시 읽지 못한다.
async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.clone().json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

const PROVIDER_LABELS: Record<V1LinkableProvider, string> = { kakao: '카카오', apple: 'Apple' };

/**
 * 로그인·가입 충돌 409 — 코드는 그대로 두고 `details` 로 다음 행동과 연결 토큰을 알린다.
 * 소셜 로그인 3종과 PHONE_CONFLICT 핸들러가 쓴다. `linkToken` 에 null 을 주면 토큰 없는 안내가 된다.
 */
export function signInThenLinkConflict(
  code: string,
  provider: V1LinkableProvider,
  linkToken: string | null = PENDING_LINK_MSW.tokens[provider],
) {
  return fail(409, code, `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인하면 ${PROVIDER_LABELS[provider]} 로그인이 자동으로 연결돼요.`, {
    next: 'sign_in_then_link',
    provider,
    ...(linkToken ? { linkToken, linkTokenExpiresInSeconds: PENDING_LINK_MSW.expiresInSeconds } : {}),
  });
}

// 토큰 시나리오는 연결 API 의 자격 시나리오와 같은 결과를 낸다.
const PENDING_SCENARIOS = new Map<string, { provider: V1LinkableProvider; credential: string }>(Object.entries({
  [PENDING_LINK_MSW.tokens.kakao]: { provider: 'kakao', credential: LINK_MSW.credentials.ok },
  [PENDING_LINK_MSW.tokens.apple]: { provider: 'apple', credential: LINK_MSW.credentials.ok },
  [PENDING_LINK_MSW.tokens.kakaoMerged]: { provider: 'kakao', credential: LINK_MSW.credentials.mergedPending },
  [PENDING_LINK_MSW.tokens.kakaoAlready]: { provider: 'kakao', credential: LINK_MSW.credentials.alreadyLinked },
  [PENDING_LINK_MSW.tokens.providerInUse]: { provider: 'kakao', credential: LINK_MSW.credentials.providerInUse },
  [PENDING_LINK_MSW.tokens.providerExists]: { provider: 'kakao', credential: LINK_MSW.credentials.providerExists },
  [PENDING_LINK_MSW.tokens.recentLoginRequired]: { provider: 'kakao', credential: LINK_MSW.credentials.recentLoginRequired },
  [PENDING_LINK_MSW.tokens.signupIncomplete]: { provider: 'kakao', credential: LINK_MSW.credentials.signupIncomplete },
}));

/** 소셜로만 가입한 계정의 비밀번호 재설정 거절 — 안내 문구는 계정이 실제로 가진 로그인 수단을 따른다. */
export function passwordLoginUnavailableResponse() {
  return fail(400, 'PASSWORD_LOGIN_UNAVAILABLE', '이 계정은 카카오 로그인으로 가입했어요. 카카오로 로그인해 주세요.', {
    providers: [...PASSWORD_UNAVAILABLE_MSW.providers],
  });
}

function linkResult(provider: V1LinkableProvider, overrides: Partial<V1LinkSocialResult> = {}): V1LinkSocialResult {
  return { provider, alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', provider], ...overrides };
}

function linkOutcome(provider: V1LinkableProvider, credential: unknown) {
  switch (credential) {
    case LINK_MSW.credentials.ok:
      return ok(linkResult(provider));
    case LINK_MSW.credentials.alreadyLinked:
      return ok(linkResult(provider, { alreadyLinked: true }));
    case LINK_MSW.credentials.mergedPending:
      return ok(linkResult(provider, { mergedPendingAccount: true }));
    case LINK_MSW.credentials.providerExists:
      return fail(409, 'SOCIAL_LINK_PROVIDER_EXISTS', `이 계정에는 이미 다른 ${PROVIDER_LABELS[provider]} 계정이 연결돼 있어요.`);
    case LINK_MSW.credentials.providerInUse:
      return fail(409, 'SOCIAL_LINK_PROVIDER_IN_USE', '이미 다른 팀밋 계정에 연결된 로그인이에요. 그 계정으로 로그인해 주세요.');
    case LINK_MSW.credentials.recentLoginRequired:
      return fail(403, 'RECENT_LOGIN_REQUIRED', '보안을 위해 다시 로그인한 뒤 연결해 주세요.', { maxAgeSeconds: LINK_MSW.maxAgeSeconds });
    case LINK_MSW.credentials.signupIncomplete:
      return fail(403, 'SIGNUP_INCOMPLETE', '가입을 먼저 마무리해 주세요.', { next: { route: LINK_MSW.signupIncompleteRoute } });
    default:
      return fail(401, 'UNAUTHENTICATED', '인증 정보를 확인하지 못했어요.');
  }
}

function invalidLinkBody() {
  return fail(400, 'VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
}

function isBounded(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isAbsentOrBounded(value: unknown, min: number, max: number) {
  return value === undefined || isBounded(value, min, max);
}

function phoneConflictProvider(value: unknown, byProvider: Readonly<Record<V1LinkableProvider, string>>): V1LinkableProvider | null {
  if (value === byProvider.kakao) return 'kakao';
  if (value === byProvider.apple) return 'apple';
  return null;
}

function loginOutcome(provider: V1LinkableProvider, credential: unknown) {
  switch (credential) {
    case LINK_MSW.loginConflicts.unverifiedEmail:
      return signInThenLinkConflict('SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', provider);
    case LINK_MSW.loginConflicts.contactConflict:
      return signInThenLinkConflict('SOCIAL_LINK_CONTACT_CONFLICT', provider);
    case LINK_MSW.loginConflicts.accountProof:
      return signInThenLinkConflict('SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF', provider);
    default:
      return sessionLoginResponse();
  }
}

// 서버 maskTarget 과 같다: 앞 2자만 남긴다.
function maskedEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailLinkRequestOutcome(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  switch (email) {
    case EMAIL_LINK_MSW.emails.recentLoginRequired:
      return fail(403, 'RECENT_LOGIN_REQUIRED', '보안을 위해 다시 로그인한 뒤 연결해 주세요.', { maxAgeSeconds: LINK_MSW.maxAgeSeconds });
    case EMAIL_LINK_MSW.emails.alreadyHasEmailLogin:
      return fail(409, 'SOCIAL_LINK_PROVIDER_EXISTS', '이 계정에는 이미 이메일 로그인이 연결돼 있어요.');
    case EMAIL_LINK_MSW.emails.taken:
      return fail(409, 'EMAIL_CONFLICT', '이미 다른 계정에서 쓰는 이메일이에요.');
    case EMAIL_LINK_MSW.emails.cooldown:
      return fail(400, 'VERIFICATION_RESEND_COOLDOWN', `잠시 후 다시 시도해 주세요. (${EMAIL_LINK_MSW.resendAvailableInSeconds}초 뒤에 다시 받을 수 있어요)`);
    default: {
      const result: V1LinkEmailRequestResult = {
        sent: true,
        maskedTarget: maskedEmail(email),
        expiresInSeconds: EMAIL_LINK_MSW.codeExpiresInSeconds,
        resendAvailableInSeconds: EMAIL_LINK_MSW.resendAvailableInSeconds,
        devCode: EMAIL_LINK_MSW.codes.ok,
      };
      return ok(result);
    }
  }
}

function emailLinkVerifyOutcome(code: string) {
  switch (code) {
    case EMAIL_LINK_MSW.codes.ok: {
      const result: V1LinkEmailVerifyResult = { emailLinkToken: EMAIL_LINK_MSW.tokens.ok, expiresInSeconds: EMAIL_LINK_MSW.tokenExpiresInSeconds };
      return ok(result);
    }
    case EMAIL_LINK_MSW.codes.expired:
      return fail(400, 'VERIFICATION_NO_PENDING', '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.');
    case EMAIL_LINK_MSW.codes.exhausted:
      return fail(400, 'VERIFICATION_TOO_MANY_ATTEMPTS', '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.');
    default:
      return fail(400, 'VERIFICATION_CODE_MISMATCH', '인증번호가 올바르지 않아요.');
  }
}

function emailLinkCompleteOutcome(token: string) {
  switch (token) {
    case EMAIL_LINK_MSW.tokens.ok: {
      const result: V1LinkEmailCompleteResult = { linked: true, email: EMAIL_LINK_MSW.emails.ok };
      return ok(result);
    }
    case EMAIL_LINK_MSW.tokens.taken:
      return fail(409, 'EMAIL_CONFLICT', '이미 다른 계정에서 쓰는 이메일이에요.');
    default:
      return fail(400, 'EMAIL_LINK_TOKEN_INVALID', '이메일 인증이 만료됐거나 올바르지 않아요. 인증번호를 다시 받아 주세요.');
  }
}

export const v1AuthLinkMswHandlers = [
  // LinkKakaoDto: 웹은 code+redirectUri, 네이티브는 accessToken 하나. 둘을 섞거나 모르는 필드를 보내면 거절한다.
  http.post(`${api}/auth/link/kakao`, async ({ request }) => {
    const { code, redirectUri, accessToken, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0) return invalidLinkBody();
    if (accessToken !== undefined) {
      if (!isBounded(accessToken, 10, 4096) || code !== undefined || redirectUri !== undefined) return invalidLinkBody();
      return linkOutcome('kakao', accessToken);
    }
    if (!isBounded(code, 1, 2048) || !isBounded(redirectUri, 1, 2048)) return invalidLinkBody();
    return linkOutcome('kakao', code);
  }),
  // AppleLoginDto: 애플 로그인과 같은 본문. nonce 는 `/auth/apple/nonce` 에서 받은 값이다.
  http.post(`${api}/auth/link/apple`, async ({ request }) => {
    const { identityToken, nonce, fullName, authorizationCode, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0) return invalidLinkBody();
    if (!isBounded(identityToken, 20, 8192) || !isBounded(nonce, 8, 512)) return invalidLinkBody();
    if (!isAbsentOrBounded(fullName, 0, 80) || !isAbsentOrBounded(authorizationCode, 8, 2048)) return invalidLinkBody();
    return linkOutcome('apple', identityToken);
  }),

  // LinkPendingDto: 충돌 409 의 details.linkToken. 서버가 서명한 불투명 값이다.
  http.post(`${api}/auth/link/pending`, async ({ request }) => {
    const { linkToken, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || !isBounded(linkToken, 20, 2048)) return invalidLinkBody();
    if (linkToken === PENDING_LINK_MSW.tokens.accountMismatch) {
      return fail(409, 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH', '안내받은 계정과 다른 계정으로 로그인했어요. 설정 › 로그인 방법에서 직접 연결할 수 있어요.');
    }
    const scenario = PENDING_SCENARIOS.get(linkToken);
    if (!scenario) {
      return fail(400, 'SOCIAL_LINK_TOKEN_INVALID', '연결 정보가 만료됐거나 올바르지 않아요. 카카오·Apple 로그인을 처음부터 다시 시도해 주세요.');
    }
    return linkOutcome(scenario.provider, scenario.credential);
  }),

  // LinkEmailRequestDto: 이메일 하나. 주소 형식이 아니거나 254자를 넘으면 거절한다.
  http.post(`${api}/auth/link/email/request`, async ({ request }) => {
    const { email, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email)) return invalidLinkBody();
    return emailLinkRequestOutcome(email);
  }),
  // LinkEmailVerifyDto: 숫자 6자리.
  http.post(`${api}/auth/link/email/verify`, async ({ request }) => {
    const { code, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalidLinkBody();
    return emailLinkVerifyOutcome(code);
  }),
  // LinkEmailCompleteDto: 토큰(20~2048자) + 8자 이상 비밀번호 + 같은 값의 확인 칸. 주소는 토큰에 들어 있어 본문에 없다.
  http.post(`${api}/auth/link/email/complete`, async ({ request }) => {
    const { emailLinkToken, password, passwordConfirm, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || !isBounded(emailLinkToken, 20, 2048)) return invalidLinkBody();
    if (typeof password !== 'string' || password.length < 8 || passwordConfirm !== password) return invalidLinkBody();
    return emailLinkCompleteOutcome(emailLinkToken);
  }),

  http.post(`${api}/auth/kakao`, async ({ request }) => loginOutcome('kakao', (await readJson(request)).code)),
  http.post(`${api}/auth/kakao/token`, async ({ request }) => loginOutcome('kakao', (await readJson(request)).accessToken)),
  http.post(`${api}/auth/apple`, async ({ request }) => loginOutcome('apple', (await readJson(request)).identityToken)),

  // 휴대폰 중복. 가입 중인 소셜 계정은 인증번호를 맞춘 뒤(confirm)에야 알게 되고, 활성 계정은 요청 단계에서 바로 거절된다.
  http.post(`${api}/verification/phone/request`, async ({ request }) => {
    const { phone } = await readJson(request);
    if (phone === PHONE_CONFLICT_MSW.activeAccountPhone) {
      return fail(409, 'PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.');
    }
    return ok({ sent: true, channel: 'phone', expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), devCode: '123456' });
  }),
  http.post(`${api}/verification/phone/confirm`, async ({ request }) => {
    const { code } = await readJson(request);
    const conflict = phoneConflictProvider(code, PHONE_CONFLICT_MSW.codes);
    if (conflict) return signInThenLinkConflict('PHONE_CONFLICT', conflict);
    return ok({ verified: true, verification: { emailVerified: false, phoneVerified: true } });
  }),
  http.post(`${api}/auth/social-profile`, async ({ request }) => {
    const { phone } = await readJson(request);
    const conflict = phoneConflictProvider(phone, PHONE_CONFLICT_MSW.phones);
    if (conflict) return signInThenLinkConflict('PHONE_CONFLICT', conflict);
    return sessionLoginResponse();
  }),

  http.post(`${api}/auth/login`, async ({ request }) => {
    const { email, password } = await readJson(request);
    if (typeof email !== 'string' || email.trim().toLowerCase() !== WITHDRAWAL_MSW.email) return undefined;
    if (password !== WITHDRAWAL_MSW.password) {
      return fail(401, 'UNAUTHENTICATED', '이메일 또는 비밀번호가 올바르지 않아요.');
    }
    return fail(403, 'ACCOUNT_WITHDRAWAL_PENDING', '탈퇴 신청 중인 계정이에요.', {
      withdrawalCancelToken: WITHDRAWAL_MSW.tokens.valid,
      expiresInSeconds: WITHDRAWAL_MSW.expiresInSeconds,
    });
  }),
  http.post(`${api}/auth/withdrawal/cancel`, async ({ request }) => {
    const { token, ...rest } = await readJson(request);
    if (Object.keys(rest).length > 0 || !isBounded(token, 20, 512)) return invalidLinkBody();
    if (token === WITHDRAWAL_MSW.tokens.valid) return sessionLoginResponse();
    if (token === WITHDRAWAL_MSW.tokens.processed) {
      return fail(409, 'WITHDRAWAL_ALREADY_PROCESSED', '이미 탈퇴가 처리돼 계정을 되살릴 수 없어요.');
    }
    return fail(400, 'WITHDRAWAL_CANCEL_TOKEN_INVALID', '탈퇴 철회 시간이 지났어요. 다시 로그인해 주세요.');
  }),
];
