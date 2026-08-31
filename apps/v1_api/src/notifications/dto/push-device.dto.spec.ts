import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterPushDeviceDto } from './push-device.dto';

describe('RegisterPushDeviceDto', () => {
  const valid = {
    installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
    token: 'fcm-registration-token-with-safe-length',
    platform: 'android',
    appVersion: '1.0.0',
    deviceModel: 'Pixel test device',
  };

  it('accepts an installation-scoped registration payload from either platform', async () => {
    await expect(validate(plainToInstance(RegisterPushDeviceDto, valid))).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(RegisterPushDeviceDto, {
        ...valid,
        platform: 'ios',
        token: 'a'.repeat(64),
      })),
    ).resolves.toHaveLength(0);
  });

  /**
   * Required, not defaulted. A default would let a client that omitted the field register
   * as the wrong platform, and the send path would then hand an APNs token to Firebase —
   * which does not error, it silently stops delivering.
   */
  it('rejects a registration that does not say which platform it is', async () => {
    const { platform, ...withoutPlatform } = valid;
    void platform;
    const errors = await validate(plainToInstance(RegisterPushDeviceDto, withoutPlatform));
    expect(errors.some((error) => error.property === 'platform')).toBe(true);
  });

  it('rejects a platform outside the enum', async () => {
    const errors = await validate(
      plainToInstance(RegisterPushDeviceDto, { ...valid, platform: 'web' }),
    );
    expect(errors.some((error) => error.property === 'platform')).toBe(true);
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
