import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';

export class ConfirmPaymentDto {
  @ApiProperty({ description: '주문 ID' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'Toss 결제 키' })
  @IsString()
  @IsNotEmpty()
  paymentKey: string;

  @ApiPropertyOptional({ description: '결제 금액 검증용' })
  @IsOptional()
  @IsNumber()
  amount?: number;
}
