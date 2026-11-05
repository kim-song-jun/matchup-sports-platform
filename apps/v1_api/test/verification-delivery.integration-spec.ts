import { PrismaService } from '../src/prisma/prisma.service';
import { EmailVerificationService } from '../src/verification/email-verification.service';
import { PhoneVerificationService } from '../src/verification/phone-verification.service';
import { SmsEventLogService } from '../src/verification/sms-event-log.service';
import { VerificationDispatcherService } from '../src/verification/verification-dispatcher.service';

describe('verification delivery with a real database', () => {
  const oldEcho = process.env.V1_VERIFICATION_DEV_ECHO;
  let prisma: PrismaService;
  let phone: PhoneVerificationService;
  let email: EmailVerificationService;

  beforeAll(async () => {
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    prisma = new PrismaService();
    await prisma.$connect();
    const events = new SmsEventLogService(prisma);
    const dispatcher = new VerificationDispatcherService(
      { enabled: false, send: jest.fn() },
      { enabled: false, send: jest.fn() },
      events,
      prisma,
    );
    phone = new PhoneVerificationService(prisma, dispatcher, events);
    email = new EmailVerificationService(prisma, dispatcher, events);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (oldEcho === undefined) delete process.env.V1_VERIFICATION_DEV_ECHO;
    else process.env.V1_VERIFICATION_DEV_ECHO = oldEcho;
  });

  it('fails a real phone request without an SMS sender and deletes the newly created challenge', async () => {
    await expect(phone.issueChallenge('01012345678')).rejects.toMatchObject({ response: { code: 'SMS_NOT_CONFIGURED' } });
    expect(await prisma.v1PhoneVerificationChallenge.findUnique({ where: { phone: '01012345678' } })).toBeNull();
  });

  it.each([true, false])('fails a real email request equally when deliver=%s and creates no challenge', async (deliver) => {
    await expect(email.issueChallenge('real-address@gmail.com', { deliver })).rejects.toMatchObject({ response: { code: 'EMAIL_SEND_UNAVAILABLE' } });
    expect(await prisma.v1EmailVerificationChallenge.findUnique({ where: { email: 'real-address@gmail.com' } })).toBeNull();
  });

  it('still verifies a reserved test number against its actual stored challenge', async () => {
    const target = '01000001234';
    const { devCode } = await phone.issueChallenge(target);
    expect(devCode).toMatch(/^\d{6}$/);
    await expect(phone.verifyCode(target, devCode!)).resolves.toBe(true);
  });
});
