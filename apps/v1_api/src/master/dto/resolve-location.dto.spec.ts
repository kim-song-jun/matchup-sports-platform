import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResolveLocationDto } from './resolve-location.dto';

describe('ResolveLocationDto', () => {
  it('rejects exact coordinates without explicit per-use consent', async () => {
    const dto = plainToInstance(ResolveLocationDto, {
      latitude: 37.5665,
      longitude: 126.978,
      locationConsentAccepted: false,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('locationConsentAccepted');
  });

  it('accepts exact coordinates with explicit per-use consent', async () => {
    const dto = plainToInstance(ResolveLocationDto, {
      latitude: 37.5665,
      longitude: 126.978,
      locationConsentAccepted: true,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
