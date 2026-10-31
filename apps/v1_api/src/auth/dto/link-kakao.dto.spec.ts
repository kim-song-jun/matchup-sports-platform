import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LinkKakaoDto } from './link-kakao.dto';

async function invalidFields(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(LinkKakaoDto, input), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((error) => error.property).sort();
}

describe('LinkKakaoDto', () => {
  it('accepts the web form and the native form', async () => {
    expect(await invalidFields({ code: 'auth-code', redirectUri: 'https://teameet.co.kr/auth/kakao/callback' })).toEqual([]);
    expect(await invalidFields({ accessToken: 'native-sdk-token-0123456789' })).toEqual([]);
  });

  it('requires redirectUri with code, and code with redirectUri', async () => {
    expect(await invalidFields({ code: 'auth-code' })).toEqual(['redirectUri']);
    expect(await invalidFields({ redirectUri: 'https://teameet.co.kr/auth/kakao/callback' })).toEqual(['code']);
  });

  it('rejects a body with neither form', async () => {
    expect(await invalidFields({})).toEqual(['code', 'redirectUri']);
  });

  it('rejects a token too short to be a Kakao token and unknown fields', async () => {
    expect(await invalidFields({ accessToken: 'short' })).toEqual(['accessToken']);
    expect(await invalidFields({ accessToken: 'native-sdk-token-0123456789', userId: 'someone-else' })).toEqual(['userId']);
  });
});
