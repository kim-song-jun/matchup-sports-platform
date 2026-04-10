import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TossWebhookDataDto {
  @ApiPropertyOptional({ description: '결제 키' })
  @IsOptional()
  @IsString()
  paymentKey?: string;

  @ApiPropertyOptional({ description: '주문 ID' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: '결제 상태' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class TossWebhookDto {
  @ApiPropertyOptional({ description: '웹훅 이벤트 타입' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ description: '웹훅 생성 일시' })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '이벤트 데이터', type: TossWebhookDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TossWebhookDataDto)
  data?: TossWebhookDataDto;
}
