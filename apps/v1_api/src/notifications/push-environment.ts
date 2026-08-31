import { ServiceUnavailableException } from '@nestjs/common';
import { V1PushEnvironment } from '@prisma/client';

export const PUSH_ENVIRONMENT_VARIABLE = 'V1_PUSH_ENVIRONMENT';

export function resolvePushEnvironment(value = process.env[PUSH_ENVIRONMENT_VARIABLE]): V1PushEnvironment {
  if (value === V1PushEnvironment.alpha || value === V1PushEnvironment.production) {
    return value;
  }

  throw new ServiceUnavailableException({
    code: 'PUSH_ENVIRONMENT_NOT_CONFIGURED',
    message: '앱 푸시 환경이 설정되지 않았어요.',
  });
}
