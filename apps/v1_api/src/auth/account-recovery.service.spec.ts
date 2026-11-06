import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
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

describe('AccountRecoveryService — 계정 찾기(휴대폰)', () => {
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  const smsProof = () => issuePhoneProofToken(PHONE, 'password_reset');

  // 번호는 다른 사람에게 재배정될 수 있다 — SMS 증명만으로는 이전 주인의 이메일 힌트가 나가면 안 된다.
  it('SMS 증명만 있으면 가입 수단만 돌려주고 이메일 힌트는 싣지 않는다', async () => {
    const svc = service(prismaMock(emailUser));

    const result = await svc.findAccountByPhone({ phone: PHONE, proofToken: smsProof() });

    expect(result).toEqual({
      providers: ['email'],
      hasPassword: true,
      withdrawalPending: false,
      maskedEmail: null,
      withdrawalPendingUntil: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/runner|ru\*\*\*|example\.com/);
  });

  it('같은 계정의 이메일 증명을 함께 보내면 마스킹된 이메일을 싣는다', async () => {
    const svc = service(prismaMock(emailUser));

    const result = await svc.findAccountByPhone({
      phone: PHONE,
      proofToken: smsProof(),
      email: '  Runner@Example.COM ',
      emailProofToken: issueEmailProofToken(EMAIL, 'password_reset'),
    });

    expect(result).toEqual({
      providers: ['email'],
      hasPassword: true,
      withdrawalPending: false,
      maskedEmail: 'ru***@example.com',
      withdrawalPendingUntil: null,
    });
    // 증명을 해도 전체 주소를 되돌려 주지는 않는다.
    expect(JSON.stringify(result)).not.toContain('runner@example.com');
  });

  // 메일함 증명이 유효해도 이 계정의 것이 아니면 값이 나가면 안 된다 — 이 테스트가 "같은 계정" 조건의 경계다.
  it('다른 계정의 이메일 증명이면 증명을 보내지 않은 것과 똑같이 답한다', async () => {
    const svc = service(prismaMock(emailUser));
    const withoutProof = await svc.findAccountByPhone({ phone: PHONE, proofToken: smsProof() });

    const withOtherMailbox = await svc.findAccountByPhone({
      phone: PHONE,
      proofToken: smsProof(),
      email: 'someone-else@example.com',
      emailProofToken: issueEmailProofToken('someone-else@example.com', 'password_reset'),
    });

    expect(withOtherMailbox).toEqual(withoutProof);
    expect(withOtherMailbox.maskedEmail).toBeNull();
  });

  it('계정에 이메일이 없으면 어떤 이메일 증명으로도 값을 싣지 않는다', async () => {
    const svc = service(prismaMock({ ...kakaoOnlyUser, email: null }));

    const result = await svc.findAccountByPhone({
      phone: PHONE,
      proofToken: smsProof(),
      email: EMAIL,
      emailProofToken: issueEmailProofToken(EMAIL, 'password_reset'),
    });

    expect(result).toMatchObject({ providers: ['kakao'], maskedEmail: null, withdrawalPendingUntil: null });
  });

  it.each([
    ['다른 주소로 발급된 증명', () => issueEmailProofToken('other@example.com', 'password_reset')],
    ['휴대폰 증명', () => issuePhoneProofToken(PHONE, 'password_reset')],
    ['서명이 깨진 값', () => 'v1.forged.proof'],
  ])('이메일 증명으로 %s 을 보내면 계정을 조회하기 전에 EMAIL_NOT_VERIFIED 로 거절한다', async (_label, token) => {
    const prisma = prismaMock(emailUser);

    await expect(
      service(prisma).findAccountByPhone({ phone: PHONE, proofToken: smsProof(), email: EMAIL, emailProofToken: token() }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
  });

  it('SMS 증명이 틀리면 이메일 증명이 있어도 계정을 조회하지 않는다', async () => {
    const prisma = prismaMock(emailUser);

    await expect(
      service(prisma).findAccountByPhone({
        phone: PHONE,
        proofToken: issuePhoneProofToken(PHONE),
        email: EMAIL,
        emailProofToken: issueEmailProofToken(EMAIL, 'password_reset'),
      }),
    ).rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
  });
});

describe('AccountRecoveryService — 이메일로 로그인 방법 찾기', () => {
  beforeEach(() => { process.env.V1_SESSION_SECRET = 'x'.repeat(48); });

  it('인증된 이메일로 소셜 로그인 방법을 찾고 비밀번호를 만들지 않는다', async () => {
    const prisma = prismaByEmail({ 'kakao@example.com': kakaoOnlyUser });
    const svc = service(prisma) as AccountRecoveryService & { findAccountByEmail(dto: { email: string; proofToken: string }): Promise<unknown> };
    await expect(svc.findAccountByEmail({ email: 'kakao@example.com', proofToken: issueEmailProofToken('kakao@example.com', 'password_reset') }))
      .resolves.toEqual({ maskedEmail: 'ka***@example.com', providers: ['kakao'], hasPassword: false, withdrawalPending: false, withdrawalPendingUntil: null });
    expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
  });

  it('다른 이메일이나 휴대폰용 증명으로는 계정을 조회하지 않는다', async () => {
    const prisma = prismaByEmail({ 'kakao@example.com': kakaoOnlyUser });
    const svc = service(prisma) as AccountRecoveryService & { findAccountByEmail(dto: { email: string; proofToken: string }): Promise<unknown> };
    for (const proofToken of [issueEmailProofToken('other@example.com', 'password_reset'), issuePhoneProofToken(PHONE, 'password_reset')]) {
      await expect(svc.findAccountByEmail({ email: 'kakao@example.com', proofToken })).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
    }
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
  });

  it('인증한 주소에 계정이 없으면 조회 결과를 찾을 수 없다고 알린다', async () => {
    const svc = service(prismaByEmail({})) as AccountRecoveryService & { findAccountByEmail(dto: { email: string; proofToken: string }): Promise<unknown> };
    await expect(svc.findAccountByEmail({ email: EMAIL, proofToken: issueEmailProofToken(EMAIL, 'password_reset') })).rejects.toMatchObject({ response: { code: 'ACCOUNT_NOT_FOUND', message: '이 이메일로 가입된 계정을 찾지 못했어요.' } });
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

  // 번호를 새로 받은 사람도 SMS 증명은 통과한다 — 이전 주인의 탈퇴 종료일까지 보여 주면 안 된다.
  it('SMS 증명만 있으면 탈퇴 대기라는 사실만 알리고 끝나는 날은 조회도 하지 않는다', async () => {
    const { prisma, statusLogFindFirst } = prismaWithHolders({ withdrawal_pending: withdrawingUser });

    const result = await service(prisma).findAccountByPhone({ phone: PHONE, proofToken: proof() });

    expect(result).toEqual({
      providers: ['kakao'],
      hasPassword: false,
      withdrawalPending: true,
      maskedEmail: null,
      withdrawalPendingUntil: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/moved|2026-10/);
    expect(statusLogFindFirst).not.toHaveBeenCalled();
  });

  it('같은 계정의 이메일 증명을 함께 보내면 유예가 끝나는 시각을 덧붙인다', async () => {
    const { prisma } = prismaWithHolders({ withdrawal_pending: withdrawingUser });

    const result = await service(prisma).findAccountByPhone({
      phone: PHONE,
      proofToken: proof(),
      email: 'moved@example.com',
      emailProofToken: issueEmailProofToken('moved@example.com', 'password_reset'),
    });

    expect(result).toEqual({
      providers: ['kakao'],
      hasPassword: false,
      withdrawalPending: true,
      maskedEmail: 'mo***@example.com',
      withdrawalPendingUntil: '2026-10-31T00:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('moved@example.com');
  });

  it('다른 계정의 이메일 증명으로는 끝나는 시각을 조회하지 않는다', async () => {
    const { prisma, statusLogFindFirst } = prismaWithHolders({ withdrawal_pending: withdrawingUser });

    const result = await service(prisma).findAccountByPhone({
      phone: PHONE,
      proofToken: proof(),
      email: EMAIL,
      emailProofToken: issueEmailProofToken(EMAIL, 'password_reset'),
    });

    expect(result).toMatchObject({ withdrawalPending: true, maskedEmail: null, withdrawalPendingUntil: null });
    expect(statusLogFindFirst).not.toHaveBeenCalled();
  });

  it('탈퇴 신청 기록이 없으면 이메일 증명이 있어도 끝나는 시각은 null 이다', async () => {
    const { prisma } = prismaWithHolders({ withdrawal_pending: withdrawingUser }, null);

    await expect(
      service(prisma).findAccountByPhone({
        phone: PHONE,
        proofToken: proof(),
        email: 'moved@example.com',
        emailProofToken: issueEmailProofToken('moved@example.com', 'password_reset'),
      }),
    ).resolves.toMatchObject({ providers: ['kakao'], withdrawalPending: true, withdrawalPendingUntil: null });
  });

  it('활성 계정과 탈퇴 유예 계정이 함께 걸리면 활성 계정을 보여 주고 유예는 말하지 않는다', async () => {
    const { prisma, statusLogFindFirst } = prismaWithHolders({
      active: emailUser,
      withdrawal_pending: withdrawingUser,
    });

    const result = await service(prisma).findAccountByPhone({
      phone: PHONE,
      proofToken: proof(),
      email: EMAIL,
      emailProofToken: issueEmailProofToken(EMAIL, 'password_reset'),
    });

    expect(result).toMatchObject({ maskedEmail: 'ru***@example.com', providers: ['email'], withdrawalPending: false, withdrawalPendingUntil: null });
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

describe('AccountRecoveryService — 탈퇴 유예 중인 계정의 이메일을 증명했을 때', () => {
  const REQUESTED_AT = new Date('2026-10-01T00:00:00.000Z');
  const PENDING_EMAIL = 'moved@example.com';
  const pendingUser = {
    id: 'u-withdrawing',
    email: PENDING_EMAIL,
    authIdentities: [{ id: 'identity-3', provider: 'email', passwordHash: 'old-hash' }],
  };

  beforeEach(() => {
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });

  /** 상태와 이메일로 계정을 돌려주고, 탈퇴 신청 기록은 사용자 id 로 찾아 주는 데이터베이스. */
  function prismaWithEmailHolders(
    holders: { active?: Record<string, unknown>; withdrawal_pending?: Record<string, unknown> },
    requestedAt: Date | null = REQUESTED_AT,
  ) {
    const findFirst = jest.fn(async ({ where }: { where: { email: string; accountStatus: 'active' | 'withdrawal_pending' } }) =>
      holders[where.accountStatus]?.[where.email] ?? null,
    );
    const statusLogFindFirst = jest.fn(async ({ where }: { where: { targetId: string } }) =>
      requestedAt && where.targetId === pendingUser.id ? { createdAt: requestedAt } : null,
    );
    const update = jest.fn();
    const prisma = {
      v1User: { findFirst, update },
      v1AuthIdentity: { update },
      v1StatusChangeLog: { findFirst: statusLogFindFirst },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    return { prisma, statusLogFindFirst, update };
  }

  const proofFor = (email: string) => issueEmailProofToken(email, 'password_reset');

  it('탈퇴 대기 계정도 찾아 유예가 끝나는 시각까지 알려 준다', async () => {
    const { prisma } = prismaWithEmailHolders({ withdrawal_pending: { [PENDING_EMAIL]: pendingUser } });

    await expect(service(prisma).findAccountByEmail({ email: PENDING_EMAIL, proofToken: proofFor(PENDING_EMAIL) })).resolves.toEqual({
      providers: ['email'],
      hasPassword: true,
      withdrawalPending: true,
      maskedEmail: 'mo***@example.com',
      withdrawalPendingUntil: '2026-10-31T00:00:00.000Z',
    });
  });

  it('탈퇴 신청 기록이 없으면 대기 중이라는 사실만 알리고 끝나는 시각은 null 이다', async () => {
    const { prisma } = prismaWithEmailHolders({ withdrawal_pending: { [PENDING_EMAIL]: pendingUser } }, null);

    await expect(service(prisma).findAccountByEmail({ email: PENDING_EMAIL, proofToken: proofFor(PENDING_EMAIL) })).resolves.toMatchObject({
      withdrawalPending: true,
      withdrawalPendingUntil: null,
    });
  });

  it('활성 계정이 있으면 그 계정을 보여 주고 탈퇴 기록은 조회하지 않는다', async () => {
    const { prisma, statusLogFindFirst } = prismaWithEmailHolders({
      active: { [EMAIL]: emailUser },
      withdrawal_pending: { [EMAIL]: pendingUser },
    });

    await expect(service(prisma).findAccountByEmail({ email: EMAIL, proofToken: proofFor(EMAIL) })).resolves.toMatchObject({
      providers: ['email'],
      withdrawalPending: false,
      withdrawalPendingUntil: null,
    });
    expect(statusLogFindFirst).not.toHaveBeenCalled();
  });

  // 증명 전에는 탈퇴 대기 여부가 어디에도 드러나지 않는다 — 활성 계정과 똑같이 메일을 보내고 같은 응답을 준다.
  it('인증번호 메일은 탈퇴 대기 계정에도 보내고, 응답은 가입되지 않은 주소와 같다', async () => {
    const pendingMail = emailVerificationMock();
    const unknownMail = emailVerificationMock();

    const hit = await service(prismaWithEmailHolders({ withdrawal_pending: { [PENDING_EMAIL]: pendingUser } }).prisma, pendingMail)
      .requestPasswordResetEmail({ email: PENDING_EMAIL });
    const miss = await service(prismaWithEmailHolders({}).prisma, unknownMail)
      .requestPasswordResetEmail({ email: 'nobody@example.com' });

    expect(pendingMail.issueChallenge).toHaveBeenCalledWith(PENDING_EMAIL, { deliver: true });
    expect(unknownMail.issueChallenge).toHaveBeenCalledWith('nobody@example.com', { deliver: false });
    expect(hit).toEqual(miss);
  });

  // 메일함 증명을 마쳤으니 날짜를 알려도 된다. 비밀번호는 바꾸지 않고, 화면이 탈퇴 안내로 갈 수 있게 알린다.
  it('비밀번호 재설정은 탈퇴 대기 계정에 403 ACCOUNT_WITHDRAWAL_PENDING 과 종료일로 답하고 아무것도 바꾸지 않는다', async () => {
    const { prisma, update } = prismaWithEmailHolders({ withdrawal_pending: { [PENDING_EMAIL]: pendingUser } });

    const failure = await service(prisma)
      .resetPasswordByEmail({ email: PENDING_EMAIL, proofToken: proofFor(PENDING_EMAIL), newPassword: 'brand-new-password' })
      .catch((error: unknown) => error as ForbiddenException);

    expect(failure).toBeInstanceOf(ForbiddenException);
    expect((failure as ForbiddenException).getResponse()).toMatchObject({
      code: 'ACCOUNT_WITHDRAWAL_PENDING',
      details: { withdrawalPendingUntil: '2026-10-31T00:00:00.000Z' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(realtimeGateway.forceDisconnectUser).not.toHaveBeenCalled();
    expect(loginSecurity.forgetEmail).not.toHaveBeenCalled();
  });

  it('탈퇴 신청 기록이 없는 탈퇴 대기 계정도 날짜만 null 로 같은 403 을 받는다', async () => {
    const { prisma } = prismaWithEmailHolders({ withdrawal_pending: { [PENDING_EMAIL]: pendingUser } }, null);

    await expect(
      service(prisma).resetPasswordByEmail({ email: PENDING_EMAIL, proofToken: proofFor(PENDING_EMAIL), newPassword: 'brand-new-password' }),
    ).rejects.toMatchObject({ status: 403, response: { code: 'ACCOUNT_WITHDRAWAL_PENDING', details: { withdrawalPendingUntil: null } } });
  });

  it('같은 주소에 활성 계정이 있으면 그 계정의 비밀번호를 바꾼다', async () => {
    const { prisma } = prismaWithEmailHolders({
      active: { [EMAIL]: emailUser },
      withdrawal_pending: { [EMAIL]: pendingUser },
    });

    await expect(
      service(prisma).resetPasswordByEmail({ email: EMAIL, proofToken: proofFor(EMAIL), newPassword: 'brand-new-password' }),
    ).resolves.toEqual({ ok: true });
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
