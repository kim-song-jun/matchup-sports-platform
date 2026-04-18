import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Short tokens that map to Prisma DisputeStatus values in the service layer:
 *   'refund'  -> resolved_refund
 *   'release' -> resolved_release
 *   'partial' -> resolved_partial
 *   'dismiss' -> dismissed
 */
const RESOLVE_ACTIONS = ['refund', 'release', 'partial', 'dismiss'] as const;
export type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

export class ResolveDisputeDto {
  @ApiProperty({
    description: '처리 액션 (refund=환불, release=판매자 지급, partial=부분환불, dismiss=기각)',
    enum: RESOLVE_ACTIONS,
  })
  @IsIn(RESOLVE_ACTIONS)
  action!: ResolveAction;

  @ApiPropertyOptional({
    description: '관리자 처리 메모',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description: '부분환불 비율 (0–100, action=partial 시 필수)',
    minimum: 1,
    maximum: 99,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  refundPercent?: number;
}
