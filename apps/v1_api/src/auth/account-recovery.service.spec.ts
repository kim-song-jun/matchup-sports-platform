import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailVerificationService } from '../verification/email-verification.service';
import { issueEmailProofToken } from '../verification/email-proof-token';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { verifyPassword } from './password-hash';
import { AccountRecoveryService, maskEmail } from './account-recovery.service';

const PHONE = '01012345678';
const EMAIL = 'runner@example.com';

function emailVerificationMock(overrides: Record<string, unknown> = {}) {
  return {
    issueChallenge: jest.fn().mockResolvedValue({ expiresAt: '2026-07-26T00:05:00.000Z' }),
    verifyCode: jest.fn().mockResolvedValue(true),
    issueProof: jest.fn().mockReturnValue('EMAIL-PROOF'),
    ...overrides,
  } as unknown as EmailVerificationService;
}

function prismaMock(user: unknown, update = jest.fn().mockResolvedValue({})) {
  return {
    v1User: { findFirst: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
    v1AuthIdentity: { update },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaService;
}

/** 이메일 경로는 "그 주소로 가입된 계정이 있는가"가 분기라, 조회 키에 반응하는 mock 이 필요하다. */
function prismaByEmail(users: Record<string, unknown>, update = jest.fn().mockResolvedValue({})) {
  return {
    v1User: {
      findFirst: jest.fn(async ({ where }: { where: { email?: string } }) => users[where.email ?? ''] ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    v1AuthIdentity: { update },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaService;
}

const loginSecurity = { forgetEmail: jest.fn().mockResolvedValue(undefined) };
const realtimeGateway = { forceDisconnectUser: jest.fn() };

function service(prisma: PrismaService, emailVerification = emailVerificationMock()) {
  return new AccountRecoveryService(prisma, emailVerification, loginSecurity as never, realtimeGateway);
}

const emailUser = {
  id: 'u1',
  email: EMAIL,
  authIdentities: [{ id: 'identity-1', provider: 'email', passwordHash: 'old-hash' }],
};

const kakaoOnlyUser = {
  id: 'u2',
  email: 'kakao@example.com',
  authIdentities: [{ id: 'identity-2', provider: 'kakao', passwordHash: null }],
};

describe('maskEmail', () => {
  it('앞 2자만 남기고 가린다', () => {
    expect(maskEmail('runner@example.com')).toBe('ru***@example.com');
  });

  it('로컬파트가 짧으면 아예 드러내지 않는다', () => {
    expect(maskEmail('ab@example.com')).toBe('***@example.com');
    expect(maskEmail('a@example.com')).toBe('***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('AccountRecoveryService — 증명 토큰 게이트', () => {
  const resetToken = () => issuePhoneProofToken(PHONE, 'password_reset');

  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  // 가입용 증명으로 남의 비밀번호를 바꿀 수 있으면 안 된다 — 이 테스트가 그 경계다.
  it('가입용(signup) 토큰은 계정 찾기·비밀번호 재설정에 통하지 않는다', async () => {
    const svc = service(prismaMock(emailUser));
    const signupToken = issuePhoneProofToken(PHONE);

    await expect(svc.findAccountByPhone({ phone: PHONE, proofToken: signupToken }))
      .rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
    await expect(
      svc.resetPasswordByPhone({ phone: PHONE, proofToken: signupToken, newPassword: 'newpassword1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('다른 번호로 발급된 토큰은 통하지 않는다', async () => {
    const svc = service(prismaMock(emailUser));
    const otherToken = issuePhoneProofToken('01099998888', 'password_reset');

    await expect(svc.findAccountByPhone({ phone: PHONE, proofToken: otherToken }))
      .rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
  });

  it('가입된 계정이 없으면 ACCOUNT_NOT_FOUND', async () => {
    const svc = service(prismaMock(null));

    await expect(svc.findAccountByPhone({ phone: PHONE, proofToken: resetToken() }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AccountRecoveryService — 계정 찾기', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('마스킹된 이메일과 로그인 수단을 돌려준다', async () => {
    const svc = service(prismaMock(emailUser));

    const result = await svc.findAccountByPhone({
      phone: PHONE,
      proofToken: issuePhoneProofToken(PHONE, 'password_reset'),
    });

    expect(result).toEqual({
      maskedEmail: 'ru***@example.com',
      providers: ['email'],
      hasPassword: true,
      withdrawalPendingUntil: null,
    });
    // 전체 주소가 새면 번호만 가진 쪽에 이메일을 넘겨주는 셈이 된다.
    expect(JSON.stringify(result)).not.toContain('runner@example.com');
  });
});

describe('AccountRecoveryService — 탈퇴 유예 중인 계정이 번호를 쥐고 있을 때', () => {
  const REQUESTED_AT = new Date('2026-10-01T00:00:00.000Z');

  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  /** 상태별로 번호를 쥔 계정을 돌려주고, 탈퇴 신청 기록은 사용자 id 로 찾아 주는 데이터베이스. */
  function prismaWithHolders(
    holders: { active?: unknown; withdrawal_pending?: unknown },
    requestedAt: Date | null = REQUESTED_AT,
  ) {
    const findFirst = jest.fn(async ({ where }: { where: { accountStatus: 'active' | 'withdrawal_pending' } }) =>
      holders[where.accountStatus] ?? null,
    );
    const statusLogFindFirst = jest.fn(async ({ where }: { where: { targetId: string } }) =>
      requestedAt && where.targetId === withdrawingUser.id ? { createdAt: requestedAt } : null,
    );
    const prisma = {
      v1User: { findFirst },
      v1StatusChangeLog: { findFirst: statusLogFindFirst },
    } as unknown as PrismaService;
    return { prisma, findFirst, statusLogFindFirst };
  }

  const withdrawingUser = {
    id: 'u-withdrawing',
    email: 'moved@example.com',
    authIdentities: [{ id: 'identity-3', provider: 'kakao', passwordHash: null }],
  };
  const proof = () => issuePhoneProofToken(PHONE, 'password_reset');

  it('번호를 증명한 뒤에는 같은 모양으로 답하고 유예가 끝나는 시각을 덧붙인다', async () => {
    const { prisma } = prismaWithHolders({ withdrawal_pending: withdrawingUser });

    const result = await service(prisma).findAccountByPhone({ phone: PHONE, proofToken: proof() });

    expect(result).toEqual({
      maskedEmail: 'mo***@example.com',
      providers: ['kakao'],
      hasPassword: false,
      withdrawalPendingUntil: '2026-10-31T00:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('moved@example.com');
  });

  it('탈퇴 신청 기록이 없으면 끝나는 시각은 null 이다', async () => {
    const { prisma } = prismaWithHolders({ withdrawal_pending: withdrawingUser }, null);

    await expect(service(prisma).findAccountByPhone({ phone: PHONE, proofToken: proof() })).resolves.toMatchObject({
      providers: ['kakao'],
      withdrawalPendingUntil: null,
    });
  });

  it('활성 계정과 탈퇴 유예 계정이 함께 걸리면 활성 계정을 보여 주고 유예는 말하지 않는다', async () => {
    const { prisma, statusLogFindFirst } = prismaWithHolders({
      active: emailUser,
      withdrawal_pending: withdrawingUser,
    });

    const result = await service(prisma).findAccountByPhone({ phone: PHONE, proofToken: proof() });

    expect(result).toMatchObject({ maskedEmail: 'ru***@example.com', providers: ['email'], withdrawalPendingUntil: null });
    expect(statusLogFindFirst).not.toHaveBeenCalled();
  });

  // 인증번호로 번호 주인임을 증명하기 전에는 이 번호를 쥔 계정이 있는지조차 읽지 않는다.
  it('증명이 틀리면 계정도 탈퇴 기록도 조회하지 않는다', async () => {
    const { prisma, findFirst, statusLogFindFirst } = prismaWithHolders({ withdrawal_pending: withdrawingUser });

    await expect(
      service(prisma).findAccountByPhone({ phone: PHONE, proofToken: issuePhoneProofToken(PHONE) }),
    ).rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
    expect(findFirst).not.toHaveBeenCalled();
    expect(statusLogFindFirst).not.toHaveBeenCalled();
  });

  it('번호를 쥔 계정이 없으면 여전히 ACCOUNT_NOT_FOUND', async () => {
    const { prisma } = prismaWithHolders({});

    await expect(service(prisma).findAccountByPhone({ phone: PHONE, proofToken: proof() })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('비밀번호 재설정(휴대폰)은 탈퇴 유예 계정을 찾지 않는다', async () => {
    const { prisma } = prismaWithHolders({ withdrawal_pending: withdrawingUser });

    await expect(
      service(prisma).resetPasswordByPhone({ phone: PHONE, proofToken: proof(), newPassword: 'brand-new-password' }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_NOT_FOUND' }, status: 404 });
  });
});

describe('AccountRecoveryService — 비밀번호 재설정(휴대폰)', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('현재 휴대폰 증명만으로 이메일 계정의 비밀번호를 바꾸지 않는다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const svc = service(prismaMock(emailUser, update));

    await expect(svc.resetPasswordByPhone({
      phone: PHONE,
      proofToken: issuePhoneProofToken(PHONE, 'password_reset'),
      newPassword: 'brand-new-password',
    })).rejects.toMatchObject({ response: { code: 'ACCOUNT_RECOVERY_REQUIRES_EMAIL' }, status: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it('현재 휴대폰 증명만으로 소셜 전용 계정의 비밀번호 경로를 열지 않는다', async () => {
    const update = jest.fn();
    const svc = service(prismaMock(kakaoOnlyUser, update));

    await expect(
      svc.resetPasswordByPhone({
        phone: PHONE,
        proofToken: issuePhoneProofToken(PHONE, 'password_reset'),
        newPassword: 'brand-new-password',
      }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_RECOVERY_REQUIRES_EMAIL' }, status: 409 });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AccountRecoveryService — 인증번호 메일 요청', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  /**
   * 이메일은 아무나 아무 주소로 시도할 수 있어, 응답이 갈리는 순간 그것이 곧 계정 조회기가 된다.
   * 이 테스트가 "가입 여부가 응답에 드러나지 않는다"는 계약의 경계다.
   */
  it('가입 여부와 무관하게 같은 응답을 돌려준다', async () => {
    const registered = emailVerificationMock();
    const unknown = emailVerificationMock();

    const hit = await service(prismaByEmail({ [EMAIL]: emailUser }), registered)
      .requestPasswordResetEmail({ email: EMAIL });
    const miss = await service(prismaByEmail({}), unknown)
      .requestPasswordResetEmail({ email: 'nobody@example.com' });

    expect(hit).toEqual(miss);
    expect(hit).toEqual({ sent: true, expiresAt: '2026-07-26T00:05:00.000Z' });
  });

  it('메일은 가입된 주소에만 실제로 보낸다', async () => {
    const registered = emailVerificationMock();
    const unknown = emailVerificationMock();

    await service(prismaByEmail({ [EMAIL]: emailUser }), registered)
      .requestPasswordResetEmail({ email: EMAIL });
    await service(prismaByEmail({}), unknown)
      .requestPasswordResetEmail({ email: 'nobody@example.com' });

    expect(registered.issueChallenge).toHaveBeenCalledWith(EMAIL, { deliver: true });
    expect(unknown.issueChallenge).toHaveBeenCalledWith('nobody@example.com', { deliver: false });
  });

  // 카카오 전용 계정에도 메일을 보내야, 사서함 주인임을 증명한 다음에 정확한 안내를 할 수 있다.
  it('카카오 전용 계정에도 메일을 보낸다', async () => {
    const emailVerification = emailVerificationMock();
    await service(prismaByEmail({ 'kakao@example.com': kakaoOnlyUser }), emailVerification)
      .requestPasswordResetEmail({ email: 'kakao@example.com' });

    expect(emailVerification.issueChallenge).toHaveBeenCalledWith(
      'kakao@example.com',
      { deliver: true },
    );
  });

  it('대소문자·공백을 정리한 주소로 조회하고 챌린지를 만든다', async () => {
    const prisma = prismaByEmail({ [EMAIL]: emailUser });
    const emailVerification = emailVerificationMock();

    await service(prisma, emailVerification).requestPasswordResetEmail({ email: '  Runner@Example.COM ' });

    expect(prisma.v1User.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: EMAIL, accountStatus: 'active' } }),
    );
    expect(emailVerification.issueChallenge).toHaveBeenCalledWith(EMAIL, { deliver: true });
  });

  it('대조에 성공하면 재설정 증명을 발급한다', async () => {
    const emailVerification = emailVerificationMock();
    const result = await service(prismaByEmail({}), emailVerification)
      .confirmPasswordResetEmail({ email: EMAIL, code: '123456' });

    expect(emailVerification.verifyCode).toHaveBeenCalledWith(EMAIL, '123456');
    expect(result).toEqual({ verified: true, proofToken: 'EMAIL-PROOF' });
  });
});

describe('AccountRecoveryService — 비밀번호 재설정(이메일)', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
    loginSecurity.forgetEmail.mockReset().mockResolvedValue(undefined);
  });

  /**
   * 이 기능의 보안 핵심 — 휴대폰 인증으로 받은 증명이 이메일 경로에 통하면, 번호만 아는 쪽이
   * 이메일 주인 행세를 하며 남의 비밀번호를 바꿀 수 있다.
   */
  it('휴대폰 증명은 이메일 경로에 통하지 않는다', async () => {
    const update = jest.fn();
    const svc = service(prismaByEmail({ [EMAIL]: emailUser }, update));

    for (const token of [issuePhoneProofToken(PHONE, 'password_reset'), issuePhoneProofToken(EMAIL, 'password_reset'), issuePhoneProofToken(PHONE)]) {
      await expect(
        svc.resetPasswordByEmail({ email: EMAIL, proofToken: token, newPassword: 'brand-new-password' }),
      ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
    }
    expect(update).not.toHaveBeenCalled();
    expect(loginSecurity.forgetEmail).not.toHaveBeenCalled();
  });

  it('다른 주소로 발급된 증명은 통하지 않는다', async () => {
    const update = jest.fn();
    const svc = service(prismaByEmail({ [EMAIL]: emailUser }, update));

    await expect(
      svc.resetPasswordByEmail({
        email: EMAIL,
        proofToken: issueEmailProofToken('other@example.com'),
        newPassword: 'brand-new-password',
      }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
    expect(update).not.toHaveBeenCalled();
  });

  it('이메일 증명이 맞으면 passwordHash 를 새 비밀번호로 바꾼다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const svc = service(prismaByEmail({ [EMAIL]: emailUser }, update));

    await svc.resetPasswordByEmail({
      email: EMAIL,
      proofToken: issueEmailProofToken(EMAIL),
      newPassword: 'brand-new-password',
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'identity-1' } }));
    const saved = update.mock.calls[0][0].data.passwordHash;
    expect(saved).not.toBe('brand-new-password');
    expect(await verifyPassword('brand-new-password', saved)).toBe(true);
  });

  it('재설정은 같은 트랜잭션에서 세션 번호를 올려, 그 전에 발급된 쿠키를 모든 기기에서 끊는다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = prismaByEmail({ [EMAIL]: emailUser }, update);

    await service(prisma).resetPasswordByEmail({ email: EMAIL, proofToken: issueEmailProofToken(EMAIL), newPassword: 'brand-new-password' });

    const handle = prisma as unknown as { v1User: { update: jest.Mock }; $transaction: jest.Mock };
    expect(handle.v1User.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { sessionEpoch: { increment: 1 } } });
    expect(handle.$transaction).toHaveBeenCalledTimes(1);
    expect(handle.$transaction.mock.calls[0][0]).toHaveLength(2);
    // Sockets only check the session at handshake, so the open ones are cut too.
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith('u1');
  });

  it('재설정에 성공하면 그 이메일의 로그인 제한(실패 기록·발송 횟수·챌린지)을 푼다', async () => {
    const svc = service(prismaByEmail({ [EMAIL]: emailUser }));

    await svc.resetPasswordByEmail({
      email: ` ${EMAIL.toUpperCase()} `,
      proofToken: issueEmailProofToken(EMAIL),
      newPassword: 'brand-new-password',
    });

    expect(loginSecurity.forgetEmail).toHaveBeenCalledTimes(1);
    expect(loginSecurity.forgetEmail).toHaveBeenCalledWith(EMAIL);
  });

  it('제한을 푸는 데 실패해도 이미 바뀐 비밀번호는 성공으로 돌려주고 실패는 로그에 남긴다', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loginSecurity.forgetEmail.mockRejectedValue(new Error('db down'));
    const update = jest.fn().mockResolvedValue({});
    const svc = service(prismaByEmail({ [EMAIL]: emailUser }, update));

    await expect(
      svc.resetPasswordByEmail({ email: EMAIL, proofToken: issueEmailProofToken(EMAIL), newPassword: 'brand-new-password' }),
    ).resolves.toEqual({ ok: true });

    expect(update).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('db down'));
    logError.mockRestore();
  });

  it('카카오 전용 계정은 비밀번호를 만들지 않고 안내로 되돌린다', async () => {
    const update = jest.fn();
    const svc = service(prismaByEmail({ 'kakao@example.com': kakaoOnlyUser }, update));

    await expect(
      svc.resetPasswordByEmail({
        email: 'kakao@example.com',
        proofToken: issueEmailProofToken('kakao@example.com'),
        newPassword: 'brand-new-password',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PASSWORD_LOGIN_UNAVAILABLE',
        message: '이 계정은 카카오 로그인으로 가입했어요. 카카오로 로그인해 주세요.',
        details: { providers: ['kakao'] },
      },
    });
    expect(update).not.toHaveBeenCalled();
    expect(loginSecurity.forgetEmail).not.toHaveBeenCalled();
  });

  // 애플·복수 소셜 계정에 "카카오" 를 안내하면 사용자가 없는 로그인 수단을 찾게 된다.
  it.each([
    [['apple'], 'Apple', 'Apple로 로그인해 주세요.'],
    [['kakao', 'apple'], '카카오·Apple', '카카오·Apple 중 하나로 로그인해 주세요.'],
  ])('소셜 전용 계정의 안내는 실제 로그인 수단(%j)을 따른다', async (providers, names, instruction) => {
    const socialUser = {
      id: 'u3',
      email: 'social@example.com',
      authIdentities: providers.map((provider, index) => ({ id: `identity-${index}`, provider, passwordHash: null })),
    };
    const svc = service(prismaByEmail({ 'social@example.com': socialUser }));

    const failure = await svc
      .resetPasswordByEmail({
        email: 'social@example.com',
        proofToken: issueEmailProofToken('social@example.com'),
        newPassword: 'brand-new-password',
      })
      .catch((error: unknown) => error as BadRequestException);
    const body = (failure as BadRequestException).getResponse() as { message: string; details: { providers: string[] } };

    expect(body.message).toBe(`이 계정은 ${names} 로그인으로 가입했어요. ${instruction}`);
    expect(body.details.providers).toEqual(providers);
    if (!providers.includes('kakao')) expect(body.message).not.toContain('카카오');
  });

  it('그 사이 계정이 사라졌으면 ACCOUNT_NOT_FOUND', async () => {
    const svc = service(prismaByEmail({}));

    await expect(
      svc.resetPasswordByEmail({
        email: EMAIL,
        proofToken: issueEmailProofToken(EMAIL),
        newPassword: 'brand-new-password',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
