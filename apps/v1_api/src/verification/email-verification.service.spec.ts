import { EmailVerificationService } from './email-verification.service';
import { verifyEmailProofToken } from './email-proof-token';
import { SmsEventLogService } from './sms-event-log.service';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const smsEventLog = { record: jest.fn().mockResolvedValue(undefined) };
const eventLogStub = () => smsEventLog as unknown as SmsEventLogService;

type ChallengeRow = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  verifiedAt: Date | null;
};

type Store = Map<string, ChallengeRow>;

function prismaMock() {
  const store: Store = new Map();
  return {
    v1EmailVerificationChallenge: {
      upsert: jest.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { email: string };
          update: Partial<ChallengeRow>;
          create: { email: string; codeHash: string; expiresAt: Date };
        }) => {
          const existing = store.get(where.email);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const row: ChallengeRow = {
            email: create.email,
            codeHash: create.codeHash,
            expiresAt: create.expiresAt,
            attemptCount: 0,
            verifiedAt: null,
          };
          store.set(where.email, row);
          return row;
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) => store.get(where.email) ?? null),
      update: jest.fn(
        async ({ where, data }: { where: { email: string }; data: Record<string, unknown> }) => {
          const row = store.get(where.email)!;
          if ((data.attemptCount as { increment?: number })?.increment) row.attemptCount += 1;
          if ('verifiedAt' in data) row.verifiedAt = data.verifiedAt as Date | null;
          return row;
        },
      ),
      deleteMany: jest.fn(async ({ where }: { where: { email: string } }) => {
        const existed = store.has(where.email);
        store.delete(where.email);
        return { count: existed ? 1 : 0 };
      }),
    },
    __store: store,
  } as never;
}

const storeOf = (prisma: unknown) => (prisma as { __store: Store }).__store;

function dispatcherMock(devEcho = true) {
  return {
    devEcho,
    devEchoActive: devEcho,
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as VerificationDispatcherService;
}

const EMAIL = 'runner@example.com';

describe('EmailVerificationService (공개 이메일 OTP)', () => {
  const OLD_SECRET = process.env.V1_SESSION_SECRET;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
  });
  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = OLD_SECRET;
  });

  it('비밀번호 재설정 문구로 메일을 보내고 코드는 해시로만 저장한다', async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock(true);
    const svc = new EmailVerificationService(prisma, dispatcher, eventLogStub());

    const res = await svc.issueChallenge(EMAIL, { deliver: true });

    expect(res.devCode).toMatch(/^\d{6}$/);
    // 메일 문구가 'verify'(이메일 인증)로 나가면 비밀번호를 바꾸려던 사용자가 엉뚱한 안내를 받는다.
    expect(dispatcher.send).toHaveBeenCalledWith('email', EMAIL, res.devCode, 'password_reset');
    const row = storeOf(prisma).get(EMAIL)!;
    expect(row.codeHash).toBeTruthy();
    expect(row.codeHash).not.toBe(res.devCode); // 평문 저장 금지
  });

  /**
   * 계정 열거 방어의 핵심. 가입 안 된 주소도 챌린지가 만들어져야 이후 대조 실패가
   * "코드를 틀린 것"과 같은 모습이 된다.
   */
  describe('가입되지 않은 주소(deliver: false)', () => {
    it('메일은 보내지 않지만 챌린지는 똑같이 만든다', async () => {
      const prisma = prismaMock();
      const dispatcher = dispatcherMock(true);
      const svc = new EmailVerificationService(prisma, dispatcher, eventLogStub());

      const res = await svc.issueChallenge(EMAIL, { deliver: false });

      expect(dispatcher.send).not.toHaveBeenCalled();
      expect(storeOf(prisma).get(EMAIL)).toBeDefined();
      expect(res.expiresAt).toBeDefined();
    });

    it('dev-echo 가 켜져 있어도 devCode 를 내리지 않는다 (그 값이 곧 가입 여부 신호)', async () => {
      const svc = new EmailVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
      const res = await svc.issueChallenge(EMAIL, { deliver: false });
      expect(res.devCode).toBeUndefined();
    });

    it('응답 키 구성이 발송한 경우(dev-echo 꺼짐)와 같다', async () => {
      const notDelivered = await new EmailVerificationService(
        prismaMock(),
        dispatcherMock(false),
        eventLogStub(),
      ).issueChallenge(EMAIL, { deliver: false });
      const delivered = await new EmailVerificationService(
        prismaMock(),
        dispatcherMock(false),
        eventLogStub(),
      ).issueChallenge(EMAIL, { deliver: true });

      expect(Object.keys(notDelivered).sort()).toEqual(Object.keys(delivered).sort());
    });
  });

  it('대소문자·공백이 달라도 같은 챌린지를 가리킨다', async () => {
    const prisma = prismaMock();
    const svc = new EmailVerificationService(prisma, dispatcherMock(true), eventLogStub());

    const { devCode } = await svc.issueChallenge('  Runner@Example.COM ', { deliver: true });

    expect(storeOf(prisma).has(EMAIL)).toBe(true);
    expect(await svc.verifyCode('RUNNER@EXAMPLE.COM', devCode!)).toBe(true);
  });

  it('올바른 코드는 통과하고 verifiedAt 을 남긴다', async () => {
    const prisma = prismaMock();
    const svc = new EmailVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(EMAIL, { deliver: true });

    expect(await svc.verifyCode(EMAIL, devCode!)).toBe(true);
    expect(storeOf(prisma).get(EMAIL)!.verifiedAt).toBeInstanceOf(Date);
  });

  it('틀린 코드는 CODE_MISMATCH 이고 시도 횟수를 올린다', async () => {
    const prisma = prismaMock();
    const svc = new EmailVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(EMAIL, { deliver: true });
    const wrong = devCode === '000000' ? '111111' : '000000';

    await expect(svc.verifyCode(EMAIL, wrong)).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CODE_MISMATCH' },
    });
    expect(storeOf(prisma).get(EMAIL)!.attemptCount).toBe(1);
  });

  it('시도 상한을 넘기면 TOO_MANY_ATTEMPTS — 단 올바른 코드는 그래도 통과한다(멱등)', async () => {
    const prisma = prismaMock();
    const svc = new EmailVerificationService(prisma, dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(EMAIL, { deliver: true });
    const wrong = devCode === '000000' ? '111111' : '000000';
    storeOf(prisma).get(EMAIL)!.attemptCount = 5;

    await expect(svc.verifyCode(EMAIL, wrong)).rejects.toMatchObject({
      response: { code: 'VERIFICATION_TOO_MANY_ATTEMPTS' },
    });
    expect(await svc.verifyCode(EMAIL, devCode!)).toBe(true);
  });

  // verifiedAt 만으로 단락하면 주소만 아는 쪽이 임의 코드로 증명을 가져갈 수 있다.
  it('이미 인증된 챌린지라도 틀린 코드는 절대 통과시키지 않는다', async () => {
    const svc = new EmailVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
    const { devCode } = await svc.issueChallenge(EMAIL, { deliver: true });
    await svc.verifyCode(EMAIL, devCode!);
    const wrong = devCode === '000000' ? '111111' : '000000';

    await expect(svc.verifyCode(EMAIL, wrong)).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CODE_MISMATCH' },
    });
  });

  it('챌린지가 없거나 만료됐으면 NO_PENDING', async () => {
    const prisma = prismaMock();
    const svc = new EmailVerificationService(prisma, dispatcherMock(true), eventLogStub());
    await expect(svc.verifyCode(EMAIL, '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_NO_PENDING' },
    });

    await svc.issueChallenge(EMAIL, { deliver: true });
    storeOf(prisma).get(EMAIL)!.expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verifyCode(EMAIL, '123456')).rejects.toMatchObject({
      response: { code: 'VERIFICATION_NO_PENDING' },
    });
  });

  it('같은 주소로 연달아 요청하면 재발송 쿨다운에 걸린다 (메일폭탄 방지)', async () => {
    const svc = new EmailVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
    await svc.issueChallenge(EMAIL, { deliver: true });
    await expect(svc.issueChallenge(EMAIL, { deliver: true })).rejects.toMatchObject({
      response: { code: 'VERIFICATION_RESEND_COOLDOWN' },
    });
  });

  it('발송이 실패하면 챌린지를 지워 바로 다시 요청할 수 있게 한다', async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock(true);
    (dispatcher.send as unknown as jest.Mock).mockRejectedValueOnce(new Error('EMAIL_SEND_FAILED'));
    const svc = new EmailVerificationService(prisma, dispatcher, eventLogStub());

    await expect(svc.issueChallenge(EMAIL, { deliver: true })).rejects.toThrow();
    expect(storeOf(prisma).get(EMAIL)).toBeUndefined();
  });

  it('issueProof 는 비밀번호 재설정 용도의 이메일 증명만 발급한다', () => {
    const svc = new EmailVerificationService(prismaMock(), dispatcherMock(true), eventLogStub());
    const token = svc.issueProof('  Runner@Example.COM ');
    expect(verifyEmailProofToken(token, EMAIL, 'password_reset')).toBe(true);
  });

  // 실패 로깅이 인증 본흐름을 막으면 안 된다 — 실제 서비스에 죽은 prisma 를 물려 확인한다.
  it('로그 기록 DB가 죽어도 원래 CODE_MISMATCH 를 그대로 던진다', async () => {
    const failingEventLog = new SmsEventLogService({
      v1SmsEventLog: { create: jest.fn().mockRejectedValue(new Error('DB is down')) },
    } as never);
    const prisma = prismaMock();
    const svc = new EmailVerificationService(prisma, dispatcherMock(true), failingEventLog);
    const { devCode } = await svc.issueChallenge(EMAIL, { deliver: true });
    const wrong = devCode === '000000' ? '111111' : '000000';

    await expect(svc.verifyCode(EMAIL, wrong)).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CODE_MISMATCH' },
    });
    expect(storeOf(prisma).get(EMAIL)!.attemptCount).toBe(1);
  });

  // phoneMasked 컬럼에 이메일 조각이 남으면 로그가 곧 계정 열거 표면이 된다.
  it('실패 로그에 이메일 주소를 남기지 않는다', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = new EmailVerificationService(
      prismaMock(),
      dispatcherMock(true),
      { record } as unknown as SmsEventLogService,
    );
    const { devCode } = await svc.issueChallenge(EMAIL, { deliver: true });
    const wrong = devCode === '000000' ? '111111' : '000000';
    await expect(svc.verifyCode(EMAIL, wrong)).rejects.toThrow();

    expect(JSON.stringify(record.mock.calls)).not.toContain('runner');
    expect(JSON.stringify(record.mock.calls)).not.toContain('example.com');
  });
});
