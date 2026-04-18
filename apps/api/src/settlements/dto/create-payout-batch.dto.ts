import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreatePayoutBatchDto {
  @ApiPropertyOptional({
    description: '지급할 정산 ID 목록 (미지정 시 eligible 전체 처리)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  settlementIds?: string[];

  @ApiPropertyOptional({
    description: '단건 최대 지급 금액 (원, 미지정 시 무제한)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAmountPerPayout?: number;

  @ApiPropertyOptional({
    description: '배치 처리 건수 상한 (미지정 시 500)',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ description: '관리자 메모', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
