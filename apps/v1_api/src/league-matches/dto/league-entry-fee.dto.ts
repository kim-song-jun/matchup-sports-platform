import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// 전역 ValidationPipe 는 enableImplicitConversion 이라 `@Type` 이 없어도 number 속성은 Number(값)으로 바뀐다
// (`""`·`false`·`[]` → 0). 원본(obj)을 검증에 넘겨야 그런 값이 '무료 확정'으로 저장되지 않는다.
const rawValue = ({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => obj[key];

const trimmedString = ({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => {
  const value = obj[key];
  return typeof value === 'string' ? value.trim() : value;
};

const BANK_FIELD_PATTERN = /^[^\u0000-\u001f\u007f]+$/;

export class UpdateLeagueEntryFeeDto {
  @Transform(rawValue)
  @IsInt({ message: '참가비는 정수여야 해요.' })
  @Min(0, { message: '참가비는 0원 이상이어야 해요.' })
  @Max(100_000_000, { message: '참가비는 1억 원을 넘을 수 없어요.' })
  entryFee!: number;

  @IsOptional()
  @Transform(trimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(BANK_FIELD_PATTERN)
  bankName?: string;

  @IsOptional()
  @Transform(trimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(BANK_FIELD_PATTERN)
  bankAccount?: string;

  @IsOptional()
  @Transform(trimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(BANK_FIELD_PATTERN)
  bankHolder?: string;

  // 공백만 보낸 사유는 null — 활성 신청이 있을 때 "   " 로 사유 필수를 우회하지 못하게 한다.
  @IsOptional()
  @Transform(({ obj, key }) => {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value !== 'string') return value;
    return value.trim() === '' ? null : value.trim();
  })
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
