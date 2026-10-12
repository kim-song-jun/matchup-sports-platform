import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KakaoTokenLoginDto } from './kakao-login.dto';

async function failedProperties(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(KakaoTokenLoginDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('KakaoTokenLoginDto', () => {
  it('accepts a plausible access token', async () => {
    expect(await failedProperties({ accessToken: 'a'.repeat(40) })).toEqual([]);
  });

  it.each([
    ['too short', { accessToken: 'short' }],
    ['too long', { accessToken: 'a'.repeat(4097) }],
    ['missing', {}],
    ['extra field', { accessToken: 'a'.repeat(40), code: 'x' }],
  ])('rejects %s', async (_label, input) => {
    expect((await failedProperties(input)).length).toBeGreaterThan(0);
  });
});
