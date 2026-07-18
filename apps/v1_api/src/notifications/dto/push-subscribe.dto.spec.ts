import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PushSubscribeDto, PushUnsubscribeDto } from './push-subscribe.dto';

describe('PushSubscribeDto', () => {
  it('accepts a known FCM push endpoint', async () => {
    const dto = plainToInstance(PushSubscribeDto, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'p', auth: 'a' },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts a known Mozilla push endpoint', async () => {
    const dto = plainToInstance(PushSubscribeDto, {
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc123',
      keys: { p256dh: 'p', auth: 'a' },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an internal/cloud-metadata endpoint (SSRF)', async () => {
    const dto = plainToInstance(PushSubscribeDto, {
      endpoint: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      keys: { p256dh: 'p', auth: 'a' },
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'endpoint')).toBe(true);
  });

  it('rejects an arbitrary attacker-controlled https host', async () => {
    const dto = plainToInstance(PushSubscribeDto, {
      endpoint: 'https://attacker.example/collect',
      keys: { p256dh: 'p', auth: 'a' },
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'endpoint')).toBe(true);
  });

  it('rejects a host that merely contains an allowed suffix as a substring', async () => {
    const dto = plainToInstance(PushSubscribeDto, {
      endpoint: 'https://fcm.googleapis.com.attacker.example/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'endpoint')).toBe(true);
  });
});

describe('PushUnsubscribeDto', () => {
  it('rejects a non-allowlisted endpoint', async () => {
    const dto = plainToInstance(PushUnsubscribeDto, { endpoint: 'https://attacker.example/collect' });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'endpoint')).toBe(true);
  });
});
