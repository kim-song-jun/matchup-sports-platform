import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, Min } from 'class-validator';

export class PreparePaymentDto {
  @ApiProperty({ description: '참가자 ID' })
  @IsString()
  @IsNotEmpty()
  participantId: string;

  @ApiProperty({ description: '결제 금액 (원)' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: '결제 수단 (card, virtual_account 등)' })
  @IsOptional()
  @IsString()
  method?: string;
}
