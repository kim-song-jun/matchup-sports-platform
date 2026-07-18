import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const VALID_REGISTER_INPUT = {
  nickname: '테스트닉',
  email: 'signup@example.com',
  password: 'password123',
  displayName: '홍길동',
  phone: '01012345678',
  birthDate: '20000229',
  gender: 'male',
  profileImageUrl: 'data:image/png;base64,profile',
  requiredTermsAccepted: true,
} as const;

async function failedProperties(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(RegisterDto, input);
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('RegisterDto (required signup profile contract)', () => {
  it('keeps the account and terms fields required alongside the signup profile', async () => {
    // Given
    const dto = plainToInstance(RegisterDto, {});

    // When
    const errors = await validate(dto);
    const failures = errors.map((error) => error.property);

    // Then
    expect(failures).toEqual(
      expect.arrayContaining(['nickname', 'email', 'password', 'requiredTermsAccepted', 'gender']),
    );
  });

  it.each(['displayName', 'phone', 'birthDate', 'gender'] as const)(
    'rejects email signup when %s is missing',
    async (field) => {
      // Given
      const input: Record<string, unknown> = { ...VALID_REGISTER_INPUT };
      delete input[field];

      // When
      const failures = await failedProperties(input);

      // Then
      expect(failures).toContain(field);
    },
  );

  it('rejects a whitespace-only display name', async () => {
    // Given
    const input = { ...VALID_REGISTER_INPUT, displayName: '   ' };

    // When
    const failures = await failedProperties(input);

    // Then
    expect(failures).toContain('displayName');
  });

  it.each(['\u200B', '\u200C', '\u200D', '\uFEFF'])('rejects zero-width-only display name %p', async (displayName) => {
    // Given
    const input = { ...VALID_REGISTER_INPUT, displayName };

    // When
    const failures = await failedProperties(input);

    // Then
    expect(failures).toContain('displayName');
  });

  it.each(['0101234567', '010123456789', '0101234abcd'])(
    'rejects phone value %s because signup requires exactly 11 digits',
    async (phone) => {
      // Given
      const input = { ...VALID_REGISTER_INPUT, phone };

      // When
      const failures = await failedProperties(input);

      // Then
      expect(failures).toContain('phone');
    },
  );

  it.each(['20010229', '20261301', '20260431'])(
    'rejects non-calendar YYYYMMDD birth date %s',
    async (birthDate) => {
      // Given
      const input = { ...VALID_REGISTER_INPUT, birthDate };

      // When
      const failures = await failedProperties(input);

      // Then
      expect(failures).toContain('birthDate');
    },
  );

  it.each(['male', 'female'] as const)('accepts a complete email signup with gender %s', async (gender) => {
    // Given
    const dto = plainToInstance(RegisterDto, { ...VALID_REGISTER_INPUT, gender });

    // When
    const errors = await validate(dto);

    // Then
    expect(errors).toHaveLength(0);
  });

  it('accepts realName as the canonical signup name', async () => {
    const input: Record<string, unknown> = { ...VALID_REGISTER_INPUT, realName: '홍길동' };
    delete input.displayName;

    const failures = await failedProperties(input);

    expect(failures).not.toContain('displayName');
  });

  it('rejects a gender outside male or female', async () => {
    // Given
    const input = { ...VALID_REGISTER_INPUT, gender: 'other' };

    // When
    const failures = await failedProperties(input);

    // Then
    expect(failures).toContain('gender');
  });
});
