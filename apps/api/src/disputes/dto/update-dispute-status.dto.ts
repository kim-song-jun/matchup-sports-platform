import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const DISPUTE_STATUSES = ['pending', 'investigating', 'resolved', 'dismissed'] as const;

export class UpdateDisputeStatusDto {
  @ApiProperty({
    description: '변경할 분쟁 상태',
    enum: DISPUTE_STATUSES,
  })
  @IsIn(DISPUTE_STATUSES)
  status!: typeof DISPUTE_STATUSES[number];

  @ApiPropertyOptional({ description: '처리 결과 (resolved 시 필수)', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;

  @ApiPropertyOptional({ description: '관리자 메모', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
