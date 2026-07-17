import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateBy } from 'class-validator';

const IsNonBlankDisplayName = ValidateBy({
  name: 'isNonBlankDisplayName',
  validator: {
    validate: (value: unknown) => typeof value === 'string' && normalizeSignupDisplayName(value).length > 0,
    defaultMessage: () => 'displayName must contain a non-whitespace character',
  },
});

const IsCalendarBirthDate = ValidateBy({
  name: 'isCalendarBirthDate',
  validator: {
    validate: (value: unknown) => typeof value === 'string' && isValidBirthDateDigits(value),
    defaultMessage: () => 'birthDate must be a real calendar date in YYYYMMDD format',
  },
});

export abstract class RequiredSignupProfileDto {
  @IsString()
  @MaxLength(40)
  @IsNonBlankDisplayName
  displayName!: string;

  @IsString()
  @Matches(/^\d{11}$/)
  phone!: string;

  @IsString()
  @IsCalendarBirthDate
  birthDate!: string;

  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}

export function isValidBirthDateDigits(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeSignupDisplayName(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/gu, '').trim();
}
