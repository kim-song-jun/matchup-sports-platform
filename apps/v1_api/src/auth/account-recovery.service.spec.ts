import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    v1User: { findFirst: jest.fn().mockResolvedValue(user) },
    v1AuthIdentity: { update },
  } as unknown as PrismaService;
}

/** 이메일 경로는 "그 주소로 가입된 계정이 있는가"가 분기라, 조회 키에 반응하는 mock 이 필요하다. */
function prismaByEmail(users: Record<string, unknown>, update = jest.fn().mockResolvedValue({})) {
  return {
    v1User: {
      findFirst: jest.fn(async ({ where }: { where: { email?: string } }) => users[where.email ?? ''] ?? null),
    },
    v1AuthIdentity: { update },
  } as unknown as PrismaService;
}

function service(prisma: PrismaService, emailVerification = emailVerificationMock()) {
  return new AccountRecoveryService(prisma, emailVerification);
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
    });
    // 전체 주소가 새면 번호만 가진 쪽에 이메일을 넘겨주는 셈이 된다.
    expect(JSON.stringify(result)).not.toContain('runner@example.com');
  });
});

describe('AccountRecoveryService — 비밀번호 재설정(휴대폰)', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('이메일 신원의 passwordHash 를 새 비밀번호로 바꾼다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const svc = service(prismaMock(emailUser, update));

    await svc.resetPasswordByPhone({
      phone: PHONE,
      proofToken: issuePhoneProofToken(PHONE, 'password_reset'),
      newPassword: 'brand-new-password',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'identity-1' } }),
    );
    const saved = update.mock.calls[0][0].data.passwordHash;
    expect(saved).not.toBe('brand-new-password'); // 평문 저장 금지
    expect(await verifyPassword('brand-new-password', saved)).toBe(true);
  });

  // 여기서 비밀번호를 만들어 주면 소셜 전용 계정에 이메일 로그인 경로가 몰래 열린다.
  it('카카오 전용 계정은 비밀번호를 만들지 않고 안내로 되돌린다', async () => {
    const update = jest.fn();
    const svc = service(prismaMock(kakaoOnlyUser, update));

    await expect(
      svc.resetPasswordByPhone({
        phone: PHONE,
        proofToken: issuePhoneProofToken(PHONE, 'password_reset'),
        newPassword: 'brand-new-password',
      }),
    ).rejects.toMatchObject({ response: { code: 'PASSWORD_LOGIN_UNAVAILABLE' } });
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

  it('카카오 전용 계정은 비밀번호를 만들지 않고 안내로 되돌린다', async () => {
    const update = jest.fn();
    const svc = service(prismaByEmail({ 'kakao@example.com': kakaoOnlyUser }, update));

    await expect(
      svc.resetPasswordByEmail({
        email: 'kakao@example.com',
        proofToken: issueEmailProofToken('kakao@example.com'),
        newPassword: 'brand-new-password',
      }),
    ).rejects.toMatchObject({ response: { code: 'PASSWORD_LOGIN_UNAVAILABLE' } });
    expect(update).not.toHaveBeenCalled();
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
