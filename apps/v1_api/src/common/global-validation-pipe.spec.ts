import { BadRequestException } from '@nestjs/common';
import { LinkEmailCompleteDto } from '../auth/dto/link-email.dto';
import { ResetPasswordByEmailDto } from '../auth/dto/account-recovery.dto';
import { RegisterDto } from '../auth/dto/register.dto';
import { createGlobalValidationPipe } from './global-validation-pipe';

const SIGNUP = {
  nickname: '테스트닉',
  email: 'signup@example.com',
  password: 'Sunny-ride-4',
  displayName: '홍길동',
  phone: '01012345678',
  birthDate: '20000229',
  gender: 'male',
  profileImageUrl: 'data:image/png;base64,profile',
  requiredTermsAccepted: true,
  acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
};
const LINK = { emailLinkToken: 't'.repeat(40), password: 'Sunny-ride-4', passwordConfirm: 'Sunny-ride-4' };
const RESET = { email: 'runner@example.com', proofToken: 'proof', newPassword: 'Sunny-ride-4' };

describe('global validation pipe — common passwords', () => {
  const pipe = createGlobalValidationPipe();
  const rejection = async (body: object, metatype: new () => object) => {
    const error = await pipe.transform(body, { type: 'body', metatype }).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    if (!(error instanceof BadRequestException)) throw new Error('the request was accepted');
    return error.getResponse() as { code: string; message: string; details: { field: string }[] };
  };

  it.each([
    ['signup', SIGNUP, 'password', RegisterDto],
    ['adding an email login', LINK, 'password', LinkEmailCompleteDto],
    ['resetting by email', RESET, 'newPassword', ResetPasswordByEmailDto],
  ] as const)('answers a common password on %s with PASSWORD_TOO_COMMON', async (_route, body, field, metatype) => {
    const response = await rejection(
      { ...body, [field]: 'Password123', ...(field === 'password' && 'passwordConfirm' in body ? { passwordConfirm: 'Password123' } : {}) },
      metatype,
    );

    expect(response).toMatchObject({
      code: 'PASSWORD_TOO_COMMON',
      message: '너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.',
      details: [{ field }],
    });
  });

  it('accepts the same requests with a password that is not common', async () => {
    await expect(pipe.transform(SIGNUP, { type: 'body', metatype: RegisterDto })).resolves.toMatchObject({ password: 'Sunny-ride-4' });
    await expect(pipe.transform(LINK, { type: 'body', metatype: LinkEmailCompleteDto })).resolves.toMatchObject({ password: 'Sunny-ride-4' });
    await expect(pipe.transform(RESET, { type: 'body', metatype: ResetPasswordByEmailDto })).resolves.toMatchObject({ newPassword: 'Sunny-ride-4' });
  });

  // The specific code promises the password is the only problem; with anything else wrong the form must fix it all.
  it('keeps VALIDATION_ERROR when something besides the common password is also wrong', async () => {
    const response = await rejection({ ...SIGNUP, password: 'Password123', nickname: 'a' }, RegisterDto);

    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.message).toBe('입력값을 다시 확인해 주세요.');
    expect(response.details.map((detail) => detail.field).sort()).toEqual(['nickname', 'password']);
  });

  it('keeps VALIDATION_ERROR for a password that is simply too short', async () => {
    const response = await rejection({ ...RESET, newPassword: 'short12' }, ResetPasswordByEmailDto);

    expect(response).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field: 'newPassword' }] });
  });
});
