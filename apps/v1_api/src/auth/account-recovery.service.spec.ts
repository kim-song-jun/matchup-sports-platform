import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { verifyPassword } from './password-hash';
import { AccountRecoveryService, maskEmail } from './account-recovery.service';

const PHONE = '01012345678';

function prismaMock(user: unknown, update = jest.fn().mockResolvedValue({})) {
  return {
    v1User: { findFirst: jest.fn().mockResolvedValue(user) },
    v1AuthIdentity: { update },
  } as unknown as PrismaService;
}

const emailUser = {
  id: 'u1',
  email: 'runner@example.com',
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
    const svc = new AccountRecoveryService(prismaMock(emailUser));
    const signupToken = issuePhoneProofToken(PHONE);

    await expect(svc.findAccountByPhone({ phone: PHONE, proofToken: signupToken }))
      .rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
    await expect(
      svc.resetPasswordByPhone({ phone: PHONE, proofToken: signupToken, newPassword: 'newpassword1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('다른 번호로 발급된 토큰은 통하지 않는다', async () => {
    const svc = new AccountRecoveryService(prismaMock(emailUser));
    const otherToken = issuePhoneProofToken('01099998888', 'password_reset');

    await expect(svc.findAccountByPhone({ phone: PHONE, proofToken: otherToken }))
      .rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
  });

  it('가입된 계정이 없으면 ACCOUNT_NOT_FOUND', async () => {
    const svc = new AccountRecoveryService(prismaMock(null));

    await expect(svc.findAccountByPhone({ phone: PHONE, proofToken: resetToken() }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AccountRecoveryService — 계정 찾기', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('마스킹된 이메일과 로그인 수단을 돌려준다', async () => {
    const svc = new AccountRecoveryService(prismaMock(emailUser));

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

describe('AccountRecoveryService — 비밀번호 재설정', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  it('이메일 신원의 passwordHash 를 새 비밀번호로 바꾼다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const svc = new AccountRecoveryService(prismaMock(emailUser, update));

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
    const svc = new AccountRecoveryService(prismaMock(kakaoOnlyUser, update));

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
