import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmTicketPaymentDto {
  @ApiPropertyOptional({ description: '토스페이먼츠 paymentKey' })
  @IsOptional()
  @IsString()
  paymentKey?: string;
}
