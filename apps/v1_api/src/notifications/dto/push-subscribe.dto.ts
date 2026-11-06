import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { normalizePushEndpoint } from '../push-endpoint';

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
          return typeof value === 'string' && normalizePushEndpoint(value) !== null;
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

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushUnsubscribeDto {
  // 해지는 이 사용자의 행을 문자열로 지울 뿐 어디에도 보내지 않는다. 등록 검사를 걸면 검사가 생기기 전에
  // 저장된 행을 해지할 수 없게 된다.
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint!: string;
}
