import { ServiceUnavailableException } from '@nestjs/common';
import type { SmsSender } from './sms/sms-sender';
import { VerificationDispatcherService } from './verification-dispatcher.service';

function smsMock(enabled: boolean, send = jest.fn().mockResolvedValue(undefined)): SmsSender {
  return { enabled, send };
}

describe('VerificationDispatcherService', () => {
  const OLD = process.env.V1_VERIFICATION_DEV_ECHO;
  afterEach(() => {
    if (OLD === undefined) delete process.env.V1_VERIFICATION_DEV_ECHO;
    else process.env.V1_VERIFICATION_DEV_ECHO = OLD;
  });

  it('phone + provider enabled → SmsSender.send 로 실제 발송한다', async () => {
    const sms = smsMock(true);
    const d = new VerificationDispatcherService(sms);
    await d.send('phone', '01012345678', '123456');
    expect(sms.send).toHaveBeenCalledWith('01012345678', expect.stringContaining('123456'));
  });

  it('phone 발송 실패는 ServiceUnavailableException(SMS_SEND_FAILED)로 감싼다', async () => {
    const sms = smsMock(true, jest.fn().mockRejectedValue(new Error('Solapi send failed: 400')));
    const d = new VerificationDispatcherService(sms);
    await expect(d.send('phone', '01012345678', '123456')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(d.send('phone', '01012345678', '123456')).rejects.toMatchObject({
      response: { code: 'SMS_SEND_FAILED' },
    });
  });

  it('phone + provider 미설정 + dev-echo on → 발송 없이 통과(devEchoActive)', async () => {
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const sms = smsMock(false);
    const d = new VerificationDispatcherService(sms);
    await expect(d.send('phone', '01012345678', '123456')).resolves.toBeUndefined();
    expect(sms.send).not.toHaveBeenCalled();
    expect(d.devEchoActive).toBe(true);
  });

  it('phone + provider 미설정 + dev-echo off → SMS_NOT_CONFIGURED로 설정오류를 표면화한다', async () => {
    delete process.env.V1_VERIFICATION_DEV_ECHO;
    const sms = smsMock(false);
    const d = new VerificationDispatcherService(sms);
    await expect(d.send('phone', '01012345678', '123456')).rejects.toMatchObject({
      response: { code: 'SMS_NOT_CONFIGURED' },
    });
    expect(d.devEchoActive).toBe(false);
  });

  it('provider 실발송 가능하면 dev-echo 가 켜져 있어도 devEchoActive=false (OTP 미노출)', () => {
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const d = new VerificationDispatcherService(smsMock(true));
    expect(d.devEchoActive).toBe(false);
  });

  it('email 채널은 SMS 를 타지 않고 로그 스텁으로만 처리한다', async () => {
    const sms = smsMock(true);
    const d = new VerificationDispatcherService(sms);
    await expect(d.send('email', 'a@b.com', '123456')).resolves.toBeUndefined();
    expect(sms.send).not.toHaveBeenCalled();
  });
});
