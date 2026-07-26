import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SocialProfileDto } from './social-profile.dto';

const VALID_SOCIAL_PROFILE_INPUT = {
  nickname: '카카오러너',
  displayName: '김러너',
  phone: '01087654321',
  birthDate: '20000229',
  gender: 'female',
} as const;

async function failedProperties(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SocialProfileDto, input);
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('SocialProfileDto (required signup profile contract)', () => {
  it.each(['displayName', 'phone', 'birthDate', 'gender'] as const)(
    'rejects social signup when %s is missing',
    async (field) => {
      // Given
      const input: Record<string, unknown> = { ...VALID_SOCIAL_PROFILE_INPUT };
      delete input[field];

      // When
      const failures = await failedProperties(input);

      // Then
      expect(failures).toContain(field);
    },
  );

  it('rejects a whitespace-only display name', async () => {
    // Given
    const input = { ...VALID_SOCIAL_PROFILE_INPUT, displayName: '   ' };

    // When
    const failures = await failedProperties(input);

    // Then
    expect(failures).toContain('displayName');
  });

  it.each(['\u200B', '\u200C', '\u200D', '\uFEFF'])('rejects zero-width-only display name %p', async (displayName) => {
    // Given
    const input = { ...VALID_SOCIAL_PROFILE_INPUT, displayName };

    // When
    const failures = await failedProperties(input);

    // Then
    expect(failures).toContain('displayName');
  });

  it.each(['0108765432', '010876543210', '0108765abcd'])(
    'rejects phone value %s because social signup requires exactly 11 digits',
    async (phone) => {
      // Given
      const input = { ...VALID_SOCIAL_PROFILE_INPUT, phone };

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
      const input = { ...VALID_SOCIAL_PROFILE_INPUT, birthDate };

      // When
      const failures = await failedProperties(input);

      // Then
      expect(failures).toContain('birthDate');
    },
  );

  it.each(['male', 'female'] as const)('accepts a complete social profile with gender %s', async (gender) => {
    // Given
    const dto = plainToInstance(SocialProfileDto, { ...VALID_SOCIAL_PROFILE_INPUT, gender });

    // When
    const errors = await validate(dto);

    // Then
    expect(errors).toHaveLength(0);
  });

  it('rejects a gender outside male or female', async () => {
    // Given
    const input = { ...VALID_SOCIAL_PROFILE_INPUT, gender: 'other' };

    // When
    const failures = await failedProperties(input);

    // Then
    expect(failures).toContain('gender');
  });
});
