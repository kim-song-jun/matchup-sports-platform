import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmOrderPaymentDto {
  @ApiProperty({ description: '토스페이먼츠 paymentKey' })
  @IsString()
  @IsNotEmpty()
  paymentKey!: string;
}
