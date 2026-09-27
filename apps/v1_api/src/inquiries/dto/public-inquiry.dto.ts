import { Transform, Type } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const publicInquiryCategories = ['tournament_hosting', 'partnership'] as const;
export type PublicInquiryCategory = (typeof publicInquiryCategories)[number];

export const publicInquirySportTypes = ['soccer', 'futsal', 'other'] as const;
export type PublicInquirySportType = (typeof publicInquirySportTypes)[number];

// HTML 폼은 비운 선택 칸을 '' 로 보낸다 — @IsOptional 은 null/undefined 만 건너뛰므로 여기서 맞춘다.
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreatePublicInquiryDto {
  @IsIn(publicInquiryCategories)
  category!: PublicInquiryCategory;

  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  organization?: string;

  @IsString()
  @MaxLength(40)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @Transform(blankToUndefined)
  @IsOptional()
  @IsIn(publicInquirySportTypes)
  sportType?: PublicInquirySportType;

  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  expectedSchedule?: string;

  // 전역 ValidationPipe 의 enableImplicitConversion 은 boolean 선언 필드의 "false" 문자열을 true 로
  // 바꾼다. 선언 타입을 unknown 으로 두어 변환을 막고, JSON true 만 동의로 인정한다.
  @Equals(true)
  consent!: unknown;

  /** Honeypot. 화면에서 숨긴 칸이라 사람은 비워 둔다. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  /** 폼을 연 시각(클라이언트 epoch ms). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  formStartedAt!: number;
}
