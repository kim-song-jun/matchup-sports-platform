import { hashPassword } from '../auth/password-hash';
import { VerificationDispatcherService } from './verification-dispatcher.service';
import { VerificationService } from './verification.service';

const authUser = { id: 'u1', email: 'a@b.com', accountStatus: 'active', onboardingStatus: 'completed' } as never;
const dispatcher = new VerificationDispatcherService();

function phoneVerificationMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    enabled: true,
    issueChallenge: jest.fn(),
    pollArrived: jest.fn(),
    issueProof: jest.fn(),
    ...overrides,
  } as never;
}

function buildPrismaMock() {
  const prisma: Record<string, unknown> = {};
  prisma.v1VerificationToken = {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({}),
  };
  prisma.v1User = {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  prisma.v1AuthIdentity = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  prisma.$transaction = jest.fn((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return prisma as never;
}

describe('VerificationService.confirm', () => {
  it('rejects when there is no pending token', async () => {
    const prisma = buildPrismaMock();
    (prisma as never as { v1VerificationToken: { findFirst: jest.Mock } }).v1VerificationToken.findFirst.mockResolvedValue(null);
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_NO_PENDING' },
    });
  });

  it('rejects a wrong code and records the attempt', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const token = prisma as never as { v1VerificationToken: { findFirst: jest.Mock; update: jest.Mock } };
    token.v1VerificationToken.findFirst.mockResolvedValue({ id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 0 });
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    await expect(service.confirm(authUser, 'email', '000000')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CODE_MISMATCH' },
    });
    expect(token.v1VerificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attemptCount: { increment: 1 } } }),
    );
  });

  it('rejects once the attempt cap is reached', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    (prisma as never as { v1VerificationToken: { findFirst: jest.Mock } }).v1VerificationToken.findFirst.mockResolvedValue({
      id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 5,
    });
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_TOO_MANY_ATTEMPTS' },
    });
  });

  it('verifies email on the correct code and reports verified state', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const handle = prisma as never as {
      v1VerificationToken: { findFirst: jest.Mock };
      v1User: { findUnique: jest.Mock; updateMany: jest.Mock };
      v1AuthIdentity: { updateMany: jest.Mock };
    };
    handle.v1VerificationToken.findFirst.mockResolvedValue({ id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 0 });
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: new Date(), phoneVerifiedAt: null });
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    const result = await service.confirm(authUser, 'email', '123456');

    expect(result).toMatchObject({ verified: true, channel: 'email', verification: { emailVerified: true, phoneVerified: false } });
    expect(handle.v1User.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', email: 'a@b.com' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(handle.v1AuthIdentity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: 'a@b.com', providerUserKey: 'a@b.com' } }),
    );
  });

  it('rejects an email code when the profile email changed after the code was issued', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const handle = prisma as never as {
      v1VerificationToken: { findFirst: jest.Mock; updateMany: jest.Mock };
      v1User: { updateMany: jest.Mock };
      v1AuthIdentity: { updateMany: jest.Mock };
    };
    handle.v1VerificationToken.findFirst.mockResolvedValue({
      id: 't1', channel: 'email', target: 'old-target@teameet.test', codeHash, attemptCount: 0,
    });
    handle.v1User.updateMany.mockResolvedValue({ count: 0 });
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_TARGET_CHANGED' },
    });
    expect(handle.v1AuthIdentity.updateMany).not.toHaveBeenCalled();
    expect(handle.v1VerificationToken.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 't1', consumedAt: null }) }),
    );
  });

  it('rejects when another confirmation already consumed the token', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const handle = prisma as never as {
      v1VerificationToken: { findFirst: jest.Mock; updateMany: jest.Mock };
      v1User: { updateMany: jest.Mock };
    };
    handle.v1VerificationToken.findFirst.mockResolvedValue({
      id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 0,
    });
    handle.v1VerificationToken.updateMany.mockResolvedValue({ count: 0 });
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'ALREADY_PROCESSED' },
    });
  });
});

describe('VerificationService.requestEmail', () => {
  it('does not issue a new code when the email is already verified', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock };
      v1VerificationToken: { create: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: new Date(), phoneVerifiedAt: null });
    const service = new VerificationService(prisma, dispatcher, phoneVerificationMock());

    const result = await service.requestEmail(authUser);

    expect(result).toMatchObject({ sent: false, alreadyVerified: true });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });
});

describe('VerificationService.requestPhone (MO)', () => {
  it('delegates to phoneVerification.issueChallenge with the requested channel', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as { v1User: { findUnique: jest.Mock; findFirst: jest.Mock } };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue(null);
    const phoneVerification = phoneVerificationMock({
      issueChallenge: jest.fn().mockResolvedValue({ code: 'ABC123', destNumber: '16663538', expiresAt: 'x' }),
    });
    const service = new VerificationService(prisma, dispatcher, phoneVerification);

    const result = await service.requestPhone(authUser, '01012345678', 'desktop');

    expect((phoneVerification as never as { issueChallenge: jest.Mock }).issueChallenge).toHaveBeenCalledWith('01012345678', 'desktop');
    expect(result).toEqual({ code: 'ABC123', destNumber: '16663538', expiresAt: 'x' });
  });

  it('rejects when the phone is already owned by a different account', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as { v1User: { findUnique: jest.Mock; findFirst: jest.Mock } };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue({ id: 'other-user' });
    const phoneVerification = phoneVerificationMock();
    const service = new VerificationService(prisma, dispatcher, phoneVerification);

    await expect(service.requestPhone(authUser, '01012345678', 'mobile')).rejects.toMatchObject({
      response: { code: 'PHONE_CONFLICT' },
    });
    expect((phoneVerification as never as { issueChallenge: jest.Mock }).issueChallenge).not.toHaveBeenCalled();
  });
});

describe('VerificationService.confirmPhoneArrived', () => {
  it('returns verified:false without touching the DB when the code has not arrived', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as { v1User: { update: jest.Mock; findFirst: jest.Mock } };
    const phoneVerification = phoneVerificationMock({ pollArrived: jest.fn().mockResolvedValue(false) });
    const service = new VerificationService(prisma, dispatcher, phoneVerification);

    const result = await service.confirmPhoneArrived(authUser, '01012345678');

    expect(result).toEqual({ verified: false });
    expect(handle.v1User.findFirst).not.toHaveBeenCalled();
    expect(handle.v1User.update).not.toHaveBeenCalled();
  });

  it('sets phoneVerifiedAt + phone on the current user when the code arrived and no other account owns it', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as { v1User: { update: jest.Mock; findFirst: jest.Mock } };
    handle.v1User.findFirst.mockResolvedValue(null);
    const phoneVerification = phoneVerificationMock({ pollArrived: jest.fn().mockResolvedValue(true) });
    const service = new VerificationService(prisma, dispatcher, phoneVerification);

    const result = await service.confirmPhoneArrived(authUser, '01012345678');

    expect(result).toEqual({ verified: true, verification: { phoneVerified: true } });
    expect(handle.v1User.findFirst).toHaveBeenCalledWith({
      where: { phone: '01012345678', id: { not: 'u1' } },
      select: { id: true },
    });
    expect(handle.v1User.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { phoneVerifiedAt: expect.any(Date), phone: '01012345678' },
    });
  });

  it('rejects with PHONE_CONFLICT when another account already owns the arrived phone', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as { v1User: { update: jest.Mock; findFirst: jest.Mock } };
    handle.v1User.findFirst.mockResolvedValue({ id: 'other-user' });
    const phoneVerification = phoneVerificationMock({ pollArrived: jest.fn().mockResolvedValue(true) });
    const service = new VerificationService(prisma, dispatcher, phoneVerification);

    await expect(service.confirmPhoneArrived(authUser, '01012345678')).rejects.toMatchObject({
      response: { code: 'PHONE_CONFLICT' },
    });
    expect(handle.v1User.update).not.toHaveBeenCalled();
  });
});
