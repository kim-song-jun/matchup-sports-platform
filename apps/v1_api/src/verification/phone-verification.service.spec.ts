import { BadRequestException } from '@nestjs/common';
import { PhoneVerificationService } from './phone-verification.service';
import { VerificationDispatcherService } from './verification-dispatcher.service';

type ChallengeRow = { phone: string; codeHash: string; expiresAt: Date; attemptCount: number; verifiedAt: Date | null };

function prismaMock() {
  const store = new Map<string, ChallengeRow>();
  return {
    v1PhoneVerificationChallenge: {
      upsert: jest.fn(async ({ where, update, create }: { where: { phone: string }; update: Partial<ChallengeRow>; create: { phone: string; codeHash: string; expiresAt: Date } }) => {
        const existing = store.get(where.phone);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: ChallengeRow = { phone: create.phone, codeHash: create.codeHash, expiresAt: create.expiresAt, attemptCount: 0, verifiedAt: null };
        store.set(where.phone, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { phone: string } }) => store.get(where.phone) ?? null),
      update: jest.fn(async ({ where, data }: { where: { phone: string }; data: Record<string, unknown> }) => {
        const row = store.get(where.phone)!;
        if ((data.attemptCount as { increment?: number })?.increment) row.attemptCount += 1;
        if ('verifiedAt' in data) row.verifiedAt = data.verifiedAt as Date | null;
        return row;
      }),
    },
    __store: store,
  } as never;
}

function dispatcherMock(devEcho = true) {
  return { devEcho, send: jest.fn().mockResolvedValue(undefined) } as unknown as VerificationDispatcherService;
}

const PHONE = '01012345678';

describe('PhoneVerificationService (MT SMS OTP)', () => {
  it('issueChallenge upserts a codeHash challenge and dispatches a 6-digit code via SMS', async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock(true);
    const svc = new PhoneVerificationService(prisma, dispatcher);

    const res = await svc.issueChallenge(PHONE);

    expect(res.expiresAt).toBeDefined();
    expect(res.devCode).toMatch(/^\d{6}$/);
    expect(dispatcher.send).toHaveBeenCalledWith('phone', PHONE, res.devCode);
    const row = (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!;
    expect(row.codeHash).toBeTruthy();
    expect(row.codeHash).not.toBe(res.devCode); // 평문 저장 금지
  });

  it('does not expose devCode when dispatcher.devEcho is false', async () => {
    const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(false));
    const res = await svc.issueChallenge(PHONE);
    expect(res.devCode).toBeUndefined();
  });

  it('verifyCode returns true and sets verifiedAt on a correct code', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true));
    const { devCode } = await svc.issueChallenge(PHONE);

    expect(await svc.verifyCode(PHONE, devCode!)).toBe(true);
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.verifiedAt).toBeInstanceOf(Date);
  });

  it('verifyCode rejects a wrong code with CODE_MISMATCH and increments attemptCount', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true));
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';

    await expect(svc.verifyCode(PHONE, wrong)).rejects.toMatchObject({ response: { code: 'VERIFICATION_CODE_MISMATCH' } });
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount).toBe(1);
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.verifiedAt).toBeNull();
  });

  it('verifyCode throws NO_PENDING when there is no challenge', async () => {
    const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(true));
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toMatchObject({ response: { code: 'VERIFICATION_NO_PENDING' } });
  });

  it('verifyCode throws NO_PENDING when the challenge is expired', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true));
    await svc.issueChallenge(PHONE);
    (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toMatchObject({ response: { code: 'VERIFICATION_NO_PENDING' } });
  });

  it('verifyCode throws TOO_MANY_ATTEMPTS after 5 attempts', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true));
    await svc.issueChallenge(PHONE);
    (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount = 5;
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toMatchObject({ response: { code: 'VERIFICATION_TOO_MANY_ATTEMPTS' } });
  });

  it('verifyCode is idempotent once verified (returns true without another attempt)', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true));
    const { devCode } = await svc.issueChallenge(PHONE);
    await svc.verifyCode(PHONE, devCode!);
    const before = (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount;
    expect(await svc.verifyCode(PHONE, 'anything')).toBe(true);
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount).toBe(before);
  });

  it('issueProof returns a token bound to the phone', () => {
    const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(true));
    expect(typeof svc.issueProof(PHONE)).toBe('string');
  });
});
