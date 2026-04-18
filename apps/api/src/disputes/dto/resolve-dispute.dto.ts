import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Short tokens that map to Prisma DisputeStatus values in the service layer:
 *   'refund'  -> resolved_refund
 *   'release' -> resolved_release
 *   'dismiss' -> dismissed
 *
 * 'partial' (resolved_partial) is NOT supported and will be rejected by the service.
 */
const RESOLVE_ACTIONS = ['refund', 'release', 'dismiss'] as const;
export type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

export class ResolveDisputeDto {
  @ApiProperty({
    description: '처리 액션 (refund=환불, release=판매자 지급, dismiss=기각)',
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
}
