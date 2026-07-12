import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const inquiryCategories = [
  'account',
  'match',
  'team',
  'tournament',
  'payment_refund',
  'report',
  'other',
] as const;

export const inquiryRelatedTypes = [
  'match',
  'team',
  'team_match',
  'tournament',
  'registration',
  'payment',
  'user',
] as const;

export class InquiriesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateInquiryDto {
  @IsIn(inquiryCategories)
  category!: (typeof inquiryCategories)[number];

  @IsString()
  @MaxLength(80)
  title!: string;

  @IsString()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @IsOptional()
  @IsIn(inquiryRelatedTypes)
  relatedType?: (typeof inquiryRelatedTypes)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  relatedId?: string;
}
