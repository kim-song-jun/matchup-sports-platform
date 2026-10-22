import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { verifyPhoneProofToken } from './phone-proof-token';
import { PhoneVerificationService } from './phone-verification.service';
import { SmsEventLogService } from './sms-event-log.service';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const smsEventLog = { record: jest.fn().mockResolvedValue(undefined) };
const eventLogStub = () => smsEventLog as unknown as SmsEventLogService;

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
      // Same contract as the database: the attemptCount condition is checked and applied in one step.
      update: jest.fn(async ({ where, data }: { where: { phone: string; codeHash?: string; attemptCount?: { lt: number } }; data: { attemptCount: { increment: number } } }) => {
        const row = store.get(where.phone);
        if (!row || (where.codeHash !== undefined && row.codeHash !== where.codeHash) || (where.attemptCount && row.attemptCount >= where.attemptCount.lt)) {
          throw new Prisma.PrismaClientKnownRequestError('No record was found for an update.', { code: 'P2025', clientVersion: 'test' });
        }
        row.attemptCount += data.attemptCount.increment;
        return { attemptCount: row.attemptCount };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { phone: string; codeHash: string }; data: { attemptCount: { decrement: number }; verifiedAt: Date } }) => {
        const row = store.get(where.phone);
        if (!row || row.codeHash !== where.codeHash) return { count: 0 };
        row.attemptCount -= data.attemptCount.decrement;
        row.verifiedAt = data.verifiedAt;
        return { count: 1 };
      }),
      deleteMany: jest.fn(async ({ where }: { where: { phone: string } }) => {
        const existed = store.has(where.phone);
        store.delete(where.phone);
        return { count: existed ? 1 : 0 };
      }),
    },
    __store: store,
  } as never;
}

function dispatcherMock(devEcho = true) {
  // 테스트에선 SMS provider 가 비활성이라 devEchoActive === devEcho.
  return {
    devEcho,
    devEchoActive: devEcho,
    mayEchoCode: jest.fn().mockResolvedValue(devEcho),
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as VerificationDispatcherService;
}

const PHONE = '01012345678';

describe('PhoneVerificationService (MT SMS OTP)', () => {
  it('issueChallenge upserts a codeHash challenge and dispatches a 6-digit code via SMS', async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock(true);
    const svc = new PhoneVerificationService(prisma, dispatcher, eventLogStub());

    const res = await svc.issueChallenge(PHONE);

    expect(res.expiresAt).toBeDefined();
    expect(res.devCode).toMatch(/^\d{6}$/);
    expect(dispatcher.send).toHaveBeenCalledWith('phone', PHONE, res.devCode);
    const row = (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!;
    expect(row.codeHash).toBeTruthy();
    expect(row.codeHash).not.toBe(res.devCode); // 평문 저장 금지
  });

  it('asks the dispatcher whether this phone may see the code', async () => {
    const dispatcher = dispatcherMock(true);
    await new PhoneVerificationService(prismaMock(), dispatcher, eventLogStub()).issueChallenge(PHONE);
    expect(dispatcher.mayEchoCode).toHaveBeenCalledWith({ channel: 'phone', address: PHONE });
  });

  it('does not expose devCode when the dispatcher withholds it', async () => {
    const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(false), eventLogStub());
    const res = await svc.issueChallenge(PHONE);
    expect(res.devCode).toBeUndefined();
  });

  it('verifyCode returns true and sets verifiedAt on a correct code', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);

    expect(await svc.verifyCode(PHONE, devCode!)).toBe(true);
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.verifiedAt).toBeInstanceOf(Date);
  });

  it('verifyCode rejects a wrong code with CODE_MISMATCH and increments attemptCount', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';

    await expect(svc.verifyCode(PHONE, wrong)).rejects.toMatchObject({ response: { code: 'VERIFICATION_CODE_MISMATCH' } });
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount).toBe(1);
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.verifiedAt).toBeNull();
  });

  it('verifyCode throws NO_PENDING when there is no challenge', async () => {
    const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toMatchObject({ response: { code: 'VERIFICATION_NO_PENDING' } });
  });

  it('verifyCode throws NO_PENDING when the challenge is expired', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    await svc.issueChallenge(PHONE);
    (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verifyCode(PHONE, '123456')).rejects.toMatchObject({ response: { code: 'VERIFICATION_NO_PENDING' } });
  });

  it('verifyCode throws TOO_MANY_ATTEMPTS on a wrong code once attempts hit the cap', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';
    (prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount = 5;
    await expect(svc.verifyCode(PHONE, wrong)).rejects.toMatchObject({ response: { code: 'VERIFICATION_TOO_MANY_ATTEMPTS' } });
  });

  it('verifyCode rejects even the correct code after five wrong attempts — otherwise the cap does not cap guessing', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await expect(svc.verifyCode(PHONE, wrong)).rejects.toMatchObject({ response: { code: 'VERIFICATION_CODE_MISMATCH' } });
    }
    await expect(svc.verifyCode(PHONE, devCode!)).rejects.toMatchObject({ response: { code: 'VERIFICATION_TOO_MANY_ATTEMPTS' } });
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.verifiedAt).toBeNull();
  });

  it('verifyCode lets only five of many concurrent guesses be compared', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';

    const results = await Promise.allSettled(Array.from({ length: 12 }, () => svc.verifyCode(PHONE, wrong)));
    const codes = results.map((result) => (result as PromiseRejectedResult).reason.getResponse().code);
    expect(codes.filter((code) => code === 'VERIFICATION_CODE_MISMATCH')).toHaveLength(5);
    expect(codes.filter((code) => code === 'VERIFICATION_TOO_MANY_ATTEMPTS')).toHaveLength(7);
  });

  it('verifyCode does not spend an attempt on the correct code, so re-submitting it near the cap still succeeds', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i += 1) await svc.verifyCode(PHONE, wrong).catch(() => undefined);

    expect(await svc.verifyCode(PHONE, devCode!)).toBe(true);
    expect(await svc.verifyCode(PHONE, devCode!)).toBe(true);
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount).toBe(4);
  });

  it('verifyCode answers NO_PENDING for a code read before a re-issue, without spending the new code\'s attempts', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    const store = (prisma as never as { __store: Map<string, ChallengeRow> }).__store;
    const issued = { ...store.get(PHONE)! };
    (prisma as never as { v1PhoneVerificationChallenge: { findUnique: jest.Mock } }).v1PhoneVerificationChallenge.findUnique
      .mockResolvedValueOnce(issued);
    store.get(PHONE)!.codeHash = 'replaced-by-a-newer-issue';

    await expect(svc.verifyCode(PHONE, devCode!)).rejects.toMatchObject({ response: { code: 'VERIFICATION_NO_PENDING' } });
    expect(store.get(PHONE)!.verifiedAt).toBeNull();
    expect(store.get(PHONE)!.attemptCount).toBe(0);
  });

  it('verifyCode stays idempotent for the correct code but rejects a wrong code even after verification', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(PHONE);
    await svc.verifyCode(PHONE, devCode!); // 최초 정상 인증

    // 올바른 코드 재제출 → 멱등 성공
    expect(await svc.verifyCode(PHONE, devCode!)).toBe(true);

    // 잘못된 코드 → 이미 verified 라도 성공하지 않는다(인증 우회 방지: verifiedAt 만으로 단락 금지)
    const wrong = devCode === '000000' ? '111111' : '000000';
    await expect(svc.verifyCode(PHONE, wrong)).rejects.toMatchObject({ response: { code: 'VERIFICATION_CODE_MISMATCH' } });
  });

  it('issueChallenge enforces a resend cooldown for the same phone (paid-SMS abuse guard)', async () => {
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), eventLogStub());
    await svc.issueChallenge(PHONE);
    await expect(svc.issueChallenge(PHONE)).rejects.toMatchObject({ response: { code: 'VERIFICATION_RESEND_COOLDOWN' } });
  });

  it('issueChallenge cleans up the challenge when SMS dispatch fails (즉시 재요청 가능)', async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock(true);
    (dispatcher.send as unknown as jest.Mock).mockRejectedValueOnce(new Error('SMS_SEND_FAILED'));
    const svc = new PhoneVerificationService(prisma, dispatcher, eventLogStub());

    await expect(svc.issueChallenge(PHONE)).rejects.toThrow();
    // 챌린지가 삭제되어 다음 요청이 쿨다운에 걸리지 않는다.
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)).toBeUndefined();
  });

  it('issueProof returns a token bound to the phone', () => {
    const previous = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'test-proof-secret';
    try {
      const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
      expect(typeof svc.issueProof(PHONE)).toBe('string');
    } finally {
      if (previous === undefined) delete process.env.V1_SESSION_SECRET;
      else process.env.V1_SESSION_SECRET = previous;
    }
  });

  it('증명 시크릿이 없으면 발급이 예외로 드러나고 검증은 무조건 거부한다 (위조 방지 fail-closed)', () => {
    const saved = {
      session: process.env.V1_SESSION_SECRET,
      v1Jwt: process.env.V1_JWT_SECRET,
      jwt: process.env.JWT_SECRET,
    };
    delete process.env.V1_SESSION_SECRET;
    delete process.env.V1_JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
      expect(() => svc.issueProof(PHONE)).toThrow(/secret is not configured/i);
      // 빈 키로 서명한 위조 토큰을 만들어도 검증은 통과하지 못한다.
      const forgedPayload = `${PHONE}:${Date.now() + 60_000}`;
      const forged = `${Buffer.from(forgedPayload).toString('base64url')}.${createHmac('sha256', '')
        .update(forgedPayload)
        .digest('base64url')}`;
      expect(verifyPhoneProofToken(forged, PHONE)).toBe(false);
    } finally {
      if (saved.session === undefined) delete process.env.V1_SESSION_SECRET;
      else process.env.V1_SESSION_SECRET = saved.session;
      if (saved.v1Jwt === undefined) delete process.env.V1_JWT_SECRET;
      else process.env.V1_JWT_SECRET = saved.v1Jwt;
      if (saved.jwt === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = saved.jwt;
    }
  });

  // 실패 로깅 훅이 인증 본흐름을 막지 않는지 — 스텁이 아니라 실제 SmsEventLogService 에
  // 죽은 prisma 를 물려, 로그 insert 가 터져도 원래 도메인 에러가 그대로 나오는지 본다.
  it('로그 기록 DB가 죽어도 verifyCode 는 원래 CODE_MISMATCH 를 그대로 던진다', async () => {
    const failingEventLog = new SmsEventLogService({
      v1SmsEventLog: { create: jest.fn().mockRejectedValue(new Error('DB is down')) },
    } as never);
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, dispatcherMock(true), failingEventLog);
    const { devCode } = await svc.issueChallenge(PHONE);
    const wrong = devCode === '000000' ? '111111' : '000000';

    await expect(svc.verifyCode(PHONE, wrong)).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CODE_MISMATCH' },
    });
    // 로깅 실패가 시도 횟수 증가 같은 본흐름 부수효과까지 되돌리지는 않는다.
    expect((prisma as never as { __store: Map<string, ChallengeRow> }).__store.get(PHONE)!.attemptCount).toBe(1);
  });

  it('enabled is fail-closed: 기본 true, 명시적 opt-out 일 때만 false', () => {
    const svc = new PhoneVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
    const OLD = process.env.V1_PHONE_VERIFICATION_DISABLED;
    delete process.env.V1_PHONE_VERIFICATION_DISABLED;
    expect(svc.enabled).toBe(true);
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'true';
    expect(svc.enabled).toBe(false);
    if (OLD === undefined) delete process.env.V1_PHONE_VERIFICATION_DISABLED;
    else process.env.V1_PHONE_VERIFICATION_DISABLED = OLD;
  });
});
