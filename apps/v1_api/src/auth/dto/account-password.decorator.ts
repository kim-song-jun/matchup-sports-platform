import { applyDecorators } from '@nestjs/common';
import { IsString, MinLength, ValidateBy, type ValidationArguments, type ValidationOptions } from 'class-validator';

/** The password rule every route that sets a login password shares (signup, adding an email login). */
export function IsAccountPassword() {
  return applyDecorators(IsString(), MinLength(8));
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
