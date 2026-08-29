import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterPushDeviceDto } from './push-device.dto';

describe('RegisterPushDeviceDto', () => {
  const valid = {
    installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
    token: 'fcm-registration-token-with-safe-length',
    appVersion: '1.0.0',
    deviceModel: 'Pixel test device',
  };

  it('accepts an installation-scoped Android token payload', async () => {
    await expect(validate(plainToInstance(RegisterPushDeviceDto, valid))).resolves.toHaveLength(0);
  });

  it('rejects a non-UUID installation identifier', async () => {
    const errors = await validate(plainToInstance(RegisterPushDeviceDto, { ...valid, installationId: 'device-1' }));
    expect(errors.some((error) => error.property === 'installationId')).toBe(true);
  });

  it('rejects an implausibly short registration token', async () => {
    const errors = await validate(plainToInstance(RegisterPushDeviceDto, { ...valid, token: 'short' }));
    expect(errors.some((error) => error.property === 'token')).toBe(true);
  });

  it('rejects oversized optional device metadata', async () => {
    const errors = await validate(
      plainToInstance(RegisterPushDeviceDto, { ...valid, deviceModel: 'x'.repeat(129) }),
    );
    expect(errors.some((error) => error.property === 'deviceModel')).toBe(true);
  });
});
