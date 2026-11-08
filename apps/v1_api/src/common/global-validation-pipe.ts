import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { COMMON_PASSWORD_ERROR_CODE, COMMON_PASSWORD_MESSAGE } from '../auth/account-password-rules';
import { COMMON_PASSWORD_CONSTRAINT } from '../auth/dto/account-password.decorator';

/** True when the common-password rule is the only thing the request failed on. */
function failedOnlyOnCommonPassword(errors: ValidationError[]): boolean {
  return errors.length === 1 && Object.keys(errors[0].constraints ?? {}).join() === COMMON_PASSWORD_CONSTRAINT;
}

// The HTTP app's global pipe. Validation failures share one code and a Korean message instead of
// class-validator's raw English text; per-field constraints travel in `details`. A request whose only
// problem is a common password gets its own code and message, because the form can act on that one.
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => {
      const commonPasswordOnly = failedOnlyOnCommonPassword(errors);
      return new BadRequestException({
        code: commonPasswordOnly ? COMMON_PASSWORD_ERROR_CODE : 'VALIDATION_ERROR',
        message: commonPasswordOnly ? COMMON_PASSWORD_MESSAGE : '입력값을 다시 확인해 주세요.',
        details: errors.map((error) => ({
          field: error.property,
          messages: error.constraints ? Object.values(error.constraints) : [],
        })),
      });
    },
  });
}
