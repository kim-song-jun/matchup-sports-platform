import { Type } from 'class-transformer';
import {
  IsString,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

const ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com',
  'web.push.apple.com',
];

function isAllowedPushEndpointHost(hostname: string): boolean {
  return ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

/**
 * 표준 브라우저 푸시 서비스(FCM/Mozilla/Windows/Apple) 호스트만 허용한다.
 * endpoint는 서버가 이후 webpush.sendNotification()으로 그대로 POST하는 대상이라
 * 임의 URL을 받으면 내부망/클라우드 메타데이터 엔드포인트로의 SSRF가 가능해진다.
 */
function IsPushEndpointUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPushEndpointUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          let parsed: URL;
          try {
            parsed = new URL(value);
          } catch {
            return false;
          }
          return parsed.protocol === 'https:' && isAllowedPushEndpointHost(parsed.hostname);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property}는 FCM/Mozilla/Windows/Apple 푸시 서비스의 https URL이어야 해요.`;
        },
      },
    });
  };
}

class PushSubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class PushSubscribeDto {
  @IsPushEndpointUrl()
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushUnsubscribeDto {
  @IsPushEndpointUrl()
  endpoint!: string;
}
