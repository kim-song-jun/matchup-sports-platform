import { IsIn, IsOptional, IsString, MaxLength, registerDecorator, ValidationOptions } from 'class-validator';

// JSON 필드에 Record<string, unknown> 사용 금지 컨벤션(CLAUDE.md) 준수 —
// context 는 캡처 지점마다 키가 달라 고정 nested DTO 를 강제하기 어려우므로,
// 대신 "얕은 원시값 레코드"만 허용해 임의 중첩 객체 주입을 막는다.
function IsShallowPrimitiveRecord(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isShallowPrimitiveRecord',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined) return true;
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.values(value).every(
            (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
          );
        },
        defaultMessage() {
          return 'context must be a flat object of string/number/boolean/null values';
        },
      },
    });
  };
}

export class ClientErrorLogDto {
  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsString()
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsIn(['error', 'warn'])
  level!: 'error' | 'warn';

  @IsOptional()
  @IsShallowPrimitiveRecord()
  context?: Record<string, string | number | boolean | null>;
}
