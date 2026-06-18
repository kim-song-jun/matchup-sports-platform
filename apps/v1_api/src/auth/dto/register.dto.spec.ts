import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto (slim signup contract)', () => {
  it('accepts a slim signup with only nickname/email/password/requiredTermsAccepted', async () => {
    const dto = plainToInstance(RegisterDto, {
      nickname: '테스트닉',
      email: 'slim@example.com',
      password: 'password123',
      requiredTermsAccepted: true,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('still rejects an invalid gender value when one is provided', async () => {
    const dto = plainToInstance(RegisterDto, {
      nickname: '테스트닉',
      email: 'slim@example.com',
      password: 'password123',
      requiredTermsAccepted: true,
      gender: 'other',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'gender')).toBe(true);
  });

  it('keeps nickname/email/password/requiredTermsAccepted required, but not gender', async () => {
    const dto = plainToInstance(RegisterDto, {});

    const errors = await validate(dto);
    const failedProps = errors.map((error) => error.property);

    expect(failedProps).toEqual(expect.arrayContaining(['nickname', 'email', 'password', 'requiredTermsAccepted']));
    expect(failedProps).not.toContain('gender');
  });
});
