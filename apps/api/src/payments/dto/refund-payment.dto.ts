import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RefundPaymentDto {
  @ApiPropertyOptional({ description: '환불 사유' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '추가 메모' })
  @IsOptional()
  @IsString()
  note?: string;
}
