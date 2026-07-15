import { hashPassword } from '../auth/password-hash';
import { VerificationDispatcherService } from './verification-dispatcher.service';
import { VerificationService } from './verification.service';

const authUser = { id: 'u1', email: 'a@b.com', accountStatus: 'active', onboardingStatus: 'completed' } as never;
const dispatcher = new VerificationDispatcherService();

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
    const service = new VerificationService(prisma, dispatcher);

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_NO_PENDING' },
    });
  });

  it('rejects a wrong code and records the attempt', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const token = prisma as never as { v1VerificationToken: { findFirst: jest.Mock; update: jest.Mock } };
    token.v1VerificationToken.findFirst.mockResolvedValue({ id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 0 });
    const service = new VerificationService(prisma, dispatcher);

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
    const service = new VerificationService(prisma, dispatcher);

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
    const service = new VerificationService(prisma, dispatcher);

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
    const service = new VerificationService(prisma, dispatcher);

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
    const service = new VerificationService(prisma, dispatcher);

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
    const service = new VerificationService(prisma, dispatcher);

    const result = await service.requestEmail(authUser);

    expect(result).toMatchObject({ sent: false, alreadyVerified: true });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });
});
