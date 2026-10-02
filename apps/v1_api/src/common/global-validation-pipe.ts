import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

// The HTTP app's global pipe. Validation failures share one code and a Korean message instead of
// class-validator's raw English text; per-field constraints travel in `details`.
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '입력값을 다시 확인해 주세요.',
        details: errors.map((error) => ({
          field: error.property,
          messages: error.constraints ? Object.values(error.constraints) : [],
        })),
      }),
  });
}
