import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ArrayMaxSize,
} from 'class-validator';

const DISPUTE_TYPES = ['not_as_described', 'not_delivered', 'damaged', 'other'] as const;
export type MarketplaceDisputeType = (typeof DISPUTE_TYPES)[number];

export class FileDisputeDto {
  @ApiProperty({
    description: '분쟁 유형',
    enum: DISPUTE_TYPES,
  })
  @IsIn(DISPUTE_TYPES)
  type!: MarketplaceDisputeType;

  @ApiProperty({ description: '분쟁 상세 설명', minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({
    description: '첨부 파일 URL 목록 (최대 5개)',
    type: [String],
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  attachmentUrls?: string[];
}
