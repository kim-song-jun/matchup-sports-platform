import { hashPassword } from '../auth/password-hash';
import type { SmsEventLogService } from './sms-event-log.service';
import type { SmsSender } from './sms/sms-sender';
import { VerificationDispatcherService } from './verification-dispatcher.service';
import { VerificationService } from './verification.service';

const authUser = { id: 'u1', email: 'a@b.com', accountStatus: 'active', onboardingStatus: 'completed' } as never;

const smsStub: SmsSender = { enabled: false, send: jest.fn().mockResolvedValue(undefined) };
const smsEventLog = { record: jest.fn().mockResolvedValue(undefined) };
const eventLogStub = () => smsEventLog as unknown as SmsEventLogService;
const emailStub = { enabled: false, send: jest.fn().mockResolvedValue(undefined) };
const dispatcher = new VerificationDispatcherService(smsStub, emailStub, eventLogStub());

function buildPrismaMock() {
  const prisma: Record<string, unknown> = {};
  prisma.v1VerificationToken = {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({ id: 'tok' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    // 24시간 발송 상한(assertSendQuota)이 세는 값. 기본은 "아직 여유 있음".
    count: jest.fn().mockResolvedValue(0),
  };
  prisma.v1User = {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  prisma.v1AuthIdentity = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  // issue() 가 상한 확인과 토큰 생성을 한 트랜잭션에 묶으면서 대상 기준 advisory lock 을
  // 건다 — mock 에 없으면 그 줄에서 터진다.
  prisma.$executeRaw = jest.fn().mockResolvedValue(1);
  prisma.$transaction = jest.fn((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return prisma as never;
}

describe('VerificationService.confirm', () => {
  it('rejects when there is no pending token', async () => {
    const prisma = buildPrismaMock();
    (prisma as never as { v1VerificationToken: { findFirst: jest.Mock } }).v1VerificationToken.findFirst.mockResolvedValue(null);
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_NO_PENDING' },
    });
  });

  it('rejects a wrong code and records the attempt', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const token = prisma as never as { v1VerificationToken: { findFirst: jest.Mock; update: jest.Mock } };
    token.v1VerificationToken.findFirst.mockResolvedValue({ id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 0 });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

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
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

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
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

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

  it('verifies phone on the correct code and sets phoneVerifiedAt + phone', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const handle = prisma as never as {
      v1VerificationToken: { findFirst: jest.Mock };
      v1User: { findUnique: jest.Mock; update: jest.Mock };
    };
    handle.v1VerificationToken.findFirst.mockResolvedValue({ id: 't1', channel: 'phone', target: '01012345678', codeHash, attemptCount: 0 });
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: '01012345678', emailVerifiedAt: null, phoneVerifiedAt: new Date() });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    const result = await service.confirm(authUser, 'phone', '123456');

    expect(result).toMatchObject({ verified: true, channel: 'phone', verification: { phoneVerified: true } });
    expect(handle.v1User.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { phoneVerifiedAt: expect.any(Date), phone: '01012345678' },
    });
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
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.confirm(authUser, 'email', '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_TARGET_CHANGED' },
    });
    expect(handle.v1AuthIdentity.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when another confirmation already consumed the token', async () => {
    const prisma = buildPrismaMock();
    const codeHash = await hashPassword('123456');
    const handle = prisma as never as {
      v1VerificationToken: { findFirst: jest.Mock; updateMany: jest.Mock };
    };
    handle.v1VerificationToken.findFirst.mockResolvedValue({
      id: 't1', channel: 'email', target: 'a@b.com', codeHash, attemptCount: 0,
    });
    handle.v1VerificationToken.updateMany.mockResolvedValue({ count: 0 });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

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
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    const result = await service.requestEmail(authUser);

    expect(result).toMatchObject({ sent: false, alreadyVerified: true });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });
});

describe('VerificationService 발송 총량 상한', () => {
  // 쿨다운은 간격만 벌릴 뿐 총량을 막지 못한다 — 30초마다 계속 부르면 하루 2,800건이
  // 나간다. requestPhone 은 대상 번호가 요청자 소유인지 확인하지 않으므로(소유 증명은
  // 코드 입력 단계에서만) 계정 하나로 임의의 제3자 번호에 유료 SMS 를 무제한 보낼 수
  // 있었다.
  function setup(counts: { target: number; user: number }) {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock; findFirst: jest.Mock };
      v1VerificationToken: { create: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue(null);
    handle.v1VerificationToken.findFirst.mockResolvedValue(null); // 재발송 쿨다운은 통과
    handle.v1VerificationToken.count.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve('target' in args.where ? counts.target : counts.user),
    );
    return { prisma, handle };
  }

  it('한 번호에 상한만큼 보냈으면 그 번호로는 더 못 보낸다', async () => {
    const { prisma, handle } = setup({ target: 5, user: 0 });
    smsEventLog.record.mockClear();
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestPhone(authUser, '01012345678')).rejects.toMatchObject({
      status: 429,
      response: { code: 'VERIFICATION_SEND_QUOTA_EXCEEDED' },
    });
    // 토큰을 만들지 않았다는 것이 곧 유료 SMS 가 나가지 않았다는 뜻이다.
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
    // 쿨다운("너무 빨리")과 상한("너무 많이")은 운영에서 다른 신호다 — 같은 타입으로
    // 남기면 알람에서 둘이 섞인다.
    expect(smsEventLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'VERIFICATION_SEND_QUOTA_EXCEEDED' }),
    );
  });

  it('요청자가 상한에 닿으면 번호를 바꿔도 막힌다', async () => {
    // 대상만 세면 번호를 갈아 가며 뿌리는 것을 못 막는다.
    const { prisma, handle } = setup({ target: 0, user: 10 });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestPhone(authUser, '01099998888')).rejects.toMatchObject({
      status: 429,
      response: { code: 'VERIFICATION_SEND_QUOTA_EXCEEDED' },
    });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });

  it('상한 확인과 토큰 생성이 같은 트랜잭션에서 잠금 아래 일어난다', async () => {
    // count 로 확인한 뒤 별도로 create 하면, 병렬 요청이 전부 "아직 여유 있음"을 읽고
    // 통과해 상한이 무의미해진다. 대상 기준 advisory lock 으로 직렬화한다.
    const { prisma, handle } = setup({ target: 0, user: 0 });
    const sendSpy = jest.spyOn(dispatcher, 'send').mockResolvedValue(undefined);
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await service.requestPhone(authUser, '01012345678');

    const raw = (prisma as never as { $executeRaw: jest.Mock }).$executeRaw;
    // 상한이 둘(대상/요청자)이므로 잠금도 둘이다 — 대상만 잠그면 같은 사용자가 서로
    // 다른 번호로 병렬 요청할 때 요청자 상한이 레이스로 뚫린다. 순서는 항상
    // 요청자 → 대상으로 고정한다(교착 방지).
    expect(raw).toHaveBeenCalledTimes(2);
    const scopes = raw.mock.calls.map((call: unknown[]) => JSON.stringify(call));
    expect(scopes[0]).toContain('verification-send-user');
    expect(scopes[1]).toContain('verification-send-target');
    // 잠금이 세는 것보다 먼저 잡혀야 의미가 있다.
    expect(raw.mock.invocationCallOrder[0]).toBeLessThan(handle.v1VerificationToken.count.mock.invocationCallOrder[0]);
    // 세는 것과 만드는 것이 같은 트랜잭션 안이어야 그 사이에 끼어들 수 없다.
    expect(handle.v1VerificationToken.count.mock.invocationCallOrder[0]).toBeLessThan(
      handle.v1VerificationToken.create.mock.invocationCallOrder[0],
    );
    expect((prisma as never as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
    sendSpy.mockRestore();
  });

  it('상한 아래면 평소대로 발송한다', async () => {
    const { prisma, handle } = setup({ target: 4, user: 9 });
    const sendSpy = jest.spyOn(dispatcher, 'send').mockResolvedValue(undefined);
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestPhone(authUser, '01012345678')).resolves.toMatchObject({ sent: true });
    expect(handle.v1VerificationToken.create).toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it('이메일 발송에도 같은 상한이 걸린다', async () => {
    const { prisma, handle } = setup({ target: 5, user: 0 });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestEmail(authUser)).rejects.toMatchObject({
      status: 429,
      response: { code: 'VERIFICATION_SEND_QUOTA_EXCEEDED' },
    });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });
});

describe('VerificationService.requestPhone (MT)', () => {
  it('issues a phone token and dispatches a 6-digit code', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock; findFirst: jest.Mock };
      v1VerificationToken: { create: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue(null);
    const sendSpy = jest.spyOn(dispatcher, 'send').mockResolvedValue(undefined);
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    const result = await service.requestPhone(authUser, '01012345678');

    expect(result).toMatchObject({ sent: true, channel: 'phone', expiresAt: expect.any(String) });
    expect(handle.v1VerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: 'phone', target: '01012345678' }) }),
    );
    expect(sendSpy).toHaveBeenCalledWith('phone', '01012345678', expect.stringMatching(/^\d{6}$/));
    sendSpy.mockRestore();
  });

  it('deletes the just-created token when SMS dispatch fails (즉시 재요청 가능)', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock; findFirst: jest.Mock };
      v1VerificationToken: { findFirst: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue(null);
    handle.v1VerificationToken.findFirst.mockResolvedValue(null);
    handle.v1VerificationToken.create.mockResolvedValue({ id: 'tok-new' });
    const sendSpy = jest.spyOn(dispatcher, 'send').mockRejectedValue(new Error('SMS_NOT_CONFIGURED'));
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestPhone(authUser, '01012345678')).rejects.toThrow();
    expect(handle.v1VerificationToken.deleteMany).toHaveBeenCalledWith({ where: { id: 'tok-new' } });
    sendSpy.mockRestore();
  });

  it('rejects when the phone is already owned by a different account', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock; findFirst: jest.Mock };
      v1VerificationToken: { create: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue({ id: 'other-user' });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestPhone(authUser, '01012345678')).rejects.toMatchObject({
      response: { code: 'PHONE_CONFLICT' },
    });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });

  it('rejects a phone resend within the cooldown window (paid-SMS abuse guard)', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock; findFirst: jest.Mock };
      v1VerificationToken: { findFirst: jest.Mock; create: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: null, emailVerifiedAt: null, phoneVerifiedAt: null });
    handle.v1User.findFirst.mockResolvedValue(null);
    handle.v1VerificationToken.findFirst.mockResolvedValue({ createdAt: new Date() });
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    await expect(service.requestPhone(authUser, '01012345678')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_RESEND_COOLDOWN' },
    });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });

  it('does not re-issue when the phone is already verified for this user', async () => {
    const prisma = buildPrismaMock();
    const handle = prisma as never as {
      v1User: { findUnique: jest.Mock; findFirst: jest.Mock };
      v1VerificationToken: { create: jest.Mock };
    };
    handle.v1User.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: '01012345678', emailVerifiedAt: null, phoneVerifiedAt: new Date() });
    handle.v1User.findFirst.mockResolvedValue(null);
    const service = new VerificationService(prisma, dispatcher, eventLogStub());

    const result = await service.requestPhone(authUser, '01012345678');

    expect(result).toMatchObject({ sent: false, alreadyVerified: true, channel: 'phone' });
    expect(handle.v1VerificationToken.create).not.toHaveBeenCalled();
  });
});
