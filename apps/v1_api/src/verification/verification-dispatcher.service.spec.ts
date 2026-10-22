import { ServiceUnavailableException } from '@nestjs/common';
import type { SmsEventLogService } from './sms-event-log.service';
import type { EmailSender } from './email/email-sender';
import type { SmsSender } from './sms/sms-sender';
import { VerificationDispatcherService, isTestAddress } from './verification-dispatcher.service';

function emailMock(enabled = false, send = jest.fn().mockResolvedValue(undefined)): EmailSender {
  return { enabled, send };
}

function smsMock(enabled: boolean, send = jest.fn().mockResolvedValue(undefined)): SmsSender {
  return { enabled, send };
}

const smsEventLog = { record: jest.fn().mockResolvedValue(undefined) };
const eventLogStub = () => smsEventLog as unknown as SmsEventLogService;

/** Users found by address, and how many admin rows / live staff assignments each one has. */
function prismaStub(users: Record<string, { id: string; admins?: number; staff?: number }> = {}) {
  const byId = new Map(Object.values(users).map((user) => [user.id, user]));
  return {
    v1User: {
      findFirst: jest.fn(async ({ where }: { where: { email?: string; phone?: string } }) => {
        const found = users[where.email ?? where.phone ?? ''];
        return found ? { id: found.id } : null;
      }),
    },
    v1AdminUser: { count: jest.fn(async ({ where }: { where: { userId: string } }) => byId.get(where.userId)?.admins ?? 0) },
    v1TournamentStaffAssignment: {
      count: jest.fn(async ({ where }: { where: { userId: string; revokedAt: null } }) =>
        where.revokedAt === null ? byId.get(where.userId)?.staff ?? 0 : 0),
    },
  } as never;
}

describe('VerificationDispatcherService', () => {
  const OLD = process.env.V1_VERIFICATION_DEV_ECHO;
  afterEach(() => {
    if (OLD === undefined) delete process.env.V1_VERIFICATION_DEV_ECHO;
    else process.env.V1_VERIFICATION_DEV_ECHO = OLD;
  });

  it('phone + provider enabled → SmsSender.send 로 실제 발송한다', async () => {
    const sms = smsMock(true);
    const d = new VerificationDispatcherService(sms, emailMock(), eventLogStub(), prismaStub());
    await d.send('phone', '01012345678', '123456');
    expect(sms.send).toHaveBeenCalledWith('01012345678', expect.stringContaining('123456'));
  });

  it('phone 발송 실패는 ServiceUnavailableException(SMS_SEND_FAILED)로 감싼다', async () => {
    const sms = smsMock(true, jest.fn().mockRejectedValue(new Error('Solapi send failed: 400')));
    const d = new VerificationDispatcherService(sms, emailMock(), eventLogStub(), prismaStub());
    await expect(d.send('phone', '01012345678', '123456')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(d.send('phone', '01012345678', '123456')).rejects.toMatchObject({
      response: { code: 'SMS_SEND_FAILED' },
    });
  });

  it('phone + provider 미설정 + dev-echo on → 발송 없이 통과(devEchoActive)', async () => {
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const sms = smsMock(false);
    const d = new VerificationDispatcherService(sms, emailMock(), eventLogStub(), prismaStub());
    await expect(d.send('phone', '01012345678', '123456')).resolves.toBeUndefined();
    expect(sms.send).not.toHaveBeenCalled();
    expect(d.devEchoActive).toBe(true);
  });

  it('phone + provider 미설정 + dev-echo off → SMS_NOT_CONFIGURED로 설정오류를 표면화한다', async () => {
    delete process.env.V1_VERIFICATION_DEV_ECHO;
    const sms = smsMock(false);
    const d = new VerificationDispatcherService(sms, emailMock(), eventLogStub(), prismaStub());
    await expect(d.send('phone', '01012345678', '123456')).rejects.toMatchObject({
      response: { code: 'SMS_NOT_CONFIGURED' },
    });
    expect(d.devEchoActive).toBe(false);
  });

  it('provider 실발송 가능하면 dev-echo 가 켜져 있어도 devEchoActive=false (OTP 미노출)', () => {
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const d = new VerificationDispatcherService(smsMock(true), emailMock(), eventLogStub(), prismaStub());
    expect(d.devEchoActive).toBe(false);
  });

  it('email 채널은 SMS 를 타지 않고 로그 스텁으로만 처리한다', async () => {
    const sms = smsMock(true);
    const d = new VerificationDispatcherService(sms, emailMock(), eventLogStub(), prismaStub());
    await expect(d.send('email', 'a@b.com', '123456')).resolves.toBeUndefined();
    expect(sms.send).not.toHaveBeenCalled();
  });

  // 이메일 채널이 로그 스텁이던 시절엔 코드가 아무 데도 안 가면서 요청은 성공으로 보였다.
  it('email provider 가 설정되면 실제로 메일을 보낸다', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const d = new VerificationDispatcherService(smsMock(false), emailMock(true, send), eventLogStub(), prismaStub());

    await d.send('email', 'runner@example.com', '123456');

    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, text] = send.mock.calls[0];
    expect(to).toBe('runner@example.com');
    expect(subject).toContain('인증번호');
    expect(text).toContain('123456');
  });

  it('메일 발송이 실패하면 EMAIL_SEND_FAILED 로 표면화한다', async () => {
    const send = jest.fn().mockRejectedValue(new Error('MessageRejected'));
    const d = new VerificationDispatcherService(smsMock(false), emailMock(true, send), eventLogStub(), prismaStub());

    await expect(d.send('email', 'runner@example.com', '123456'))
      .rejects.toMatchObject({ response: { code: 'EMAIL_SEND_FAILED' } });
  });

  // 실제로 메일을 보내면서 응답에 코드까지 실어 보내면 OTP 를 그대로 노출하는 셈이다.
  it('email provider 가 살아 있으면 devEcho 가 켜져 있어도 devCode 를 노출하지 않는다', () => {
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const d = new VerificationDispatcherService(smsMock(false), emailMock(true), eventLogStub(), prismaStub());

    expect(d.devEchoActive).toBe(false);
  });

  describe('mayEchoCode', () => {
    function echoDispatcher(users?: Parameters<typeof prismaStub>[0]) {
      process.env.V1_VERIFICATION_DEV_ECHO = 'true';
      return new VerificationDispatcherService(smsMock(false), emailMock(false), eventLogStub(), prismaStub(users));
    }

    it('echoes only to addresses that cannot reach a real person', async () => {
      const d = echoDispatcher();
      expect(await d.mayEchoCode({ channel: 'phone', address: '01000001234' })).toBe(true);
      expect(await d.mayEchoCode({ channel: 'email', address: 'QA.Player@Teameet.Test' })).toBe(true);
      expect(await d.mayEchoCode({ channel: 'email', address: 'signup@example.com' })).toBe(true);
      expect(await d.mayEchoCode({ channel: 'phone', address: '01012345678' })).toBe(false);
      expect(await d.mayEchoCode({ channel: 'email', address: 'someone@gmail.com' })).toBe(false);
    });

    it('never echoes when a real sender is configured, even to a test address', async () => {
      process.env.V1_VERIFICATION_DEV_ECHO = 'true';
      const d = new VerificationDispatcherService(smsMock(false), emailMock(true), eventLogStub(), prismaStub());
      expect(await d.mayEchoCode({ channel: 'email', address: 'qa@teameet.test' })).toBe(false);
    });

    it('withholds the code from admin and tournament staff accounts, by user id or by the address they own', async () => {
      const d = echoDispatcher({
        'admin@teameet.test': { id: 'admin', admins: 1 },
        '01000000001': { id: 'staff', staff: 1 },
        'player@teameet.test': { id: 'player' },
      });
      expect(await d.mayEchoCode({ channel: 'email', address: 'Admin@teameet.test' })).toBe(false);
      expect(await d.mayEchoCode({ channel: 'phone', address: '01000000001' })).toBe(false);
      expect(await d.mayEchoCode({ channel: 'email', address: 'new@teameet.test', userId: 'staff' })).toBe(false);
      expect(await d.mayEchoCode({ channel: 'email', address: 'player@teameet.test' })).toBe(true);
      expect(await d.mayEchoCode({ channel: 'email', address: 'player@teameet.test', userId: 'player' })).toBe(true);
    });
  });

  it.each([
    ['phone', '01000009999', true],
    ['phone', '0100000123', false],
    ['phone', '01010000000', false],
    ['email', 'a@sub.example.org', true],
    ['email', 'a@test', true],
    ['email', 'a@mytest', false],
    ['email', 'a@example.com.evil.io', false],
    ['email', 'a@teameet.co.kr', false],
  ] as const)('isTestAddress(%s, %s) is %s', (channel, address, expected) => {
    expect(isTestAddress(channel, address)).toBe(expected);
  });
});
