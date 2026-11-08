import { applyDecorators } from '@nestjs/common';
import { IsString, MinLength, ValidateBy, type ValidationArguments, type ValidationOptions } from 'class-validator';
import { ACCOUNT_PASSWORD_MIN_LENGTH, COMMON_PASSWORD_MESSAGE, isCommonPassword } from '../account-password-rules';

/** Name of the constraint `IsNotCommonPassword` reports; the global validation pipe maps it to `PASSWORD_TOO_COMMON`. */
export const COMMON_PASSWORD_CONSTRAINT = 'isNotCommonPassword';

/** Fails a string that is on the common-password list (case-insensitive). Other types are left to `IsString`. */
export function IsNotCommonPassword(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: COMMON_PASSWORD_CONSTRAINT,
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || !isCommonPassword(value),
        defaultMessage: () => COMMON_PASSWORD_MESSAGE,
      },
    },
    validationOptions,
  );
}

/**
 * The password rule every route that sets a login password shares (signup, adding an email login, resetting one):
 * at least 8 characters and not a common password. Login itself never applies it, so existing accounts keep working.
 */
export function IsAccountPassword() {
  return applyDecorators(
    IsString(),
    MinLength(ACCOUNT_PASSWORD_MIN_LENGTH, { message: `비밀번호는 ${ACCOUNT_PASSWORD_MIN_LENGTH}자 이상이에요.` }),
    IsNotCommonPassword(),
  );
}

/** The value must equal the sibling property `property` of the same object (a password typed twice). */
export function IsSameAs(property: string, validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isSameAs',
      constraints: [property],
      validator: {
        validate: (value: unknown, args?: ValidationArguments) =>
          typeof value === 'string' && value === (args?.object as Record<string, unknown>)[property],
        defaultMessage: (args?: ValidationArguments) => `${args?.property} must match ${property}`,
      },
    },
    validationOptions,
  );
}
